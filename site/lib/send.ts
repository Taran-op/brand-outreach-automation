/**
 * Send orchestration, ported from src/07_OutreachService.gs.
 *
 * Apps Script had LockService — a real mutex — plus single-threaded execution.
 * Vercel has neither, so the mutex is replaced by a write-then-verify
 * optimistic lock over the row's pending fields:
 *
 *   1. confirm no pending attempt exists
 *   2. write our attempt id into the pending fields
 *   3. read the row back and confirm the pending attempt id is still ours
 *
 * If two invocations race, both write and both read; the later write wins and
 * the loser sees an id that is not its own and aborts. Combined with creating
 * the draft *before* recording pending, an interrupted run is always
 * reconcilable: the draft either still exists (never sent) or the thread
 * carries a message stamped with the attempt id (sent exactly once).
 */

import { CONFIG } from './config';
import { ACTION, AUTOMATION_STOP_STATUSES, LEAD_HEADERS, STATUS, type ActionValue } from './constants';
import {
  buildEmailCounts,
  buildInitialSafetyIndex,
  getInitialApprovalIssue,
  hasInitialSuccessEvidence,
  leadId
} from './approval';
import {
  assertSendAsAuthorized,
  buildRawMime,
  buildReferencesHeader,
  createDraft,
  deleteDraft,
  draftStillExists,
  findSentMessageByAttempt,
  getThreadAnchor,
  sendDraft,
  type SentMessage
} from './gmail';
import { isSystemDisabled } from './killswitch';
import { getLeadRows, leadValue, type LeadRecord } from './sheets';
import { appendLogRow, updateLeadCells, type CellUpdate } from './sheets-write';
import { buildEmailForLead, hasPendingAction, isConfiguredCcEmail, normalizeStatus } from './templates';
import { isExactStatus, isTrue, isValidSingleEmail, normalizeEmail, safeDisplayText } from './text';

export const sendsArmed = (): boolean => process.env.CONSOLE_SENDS_ENABLED === 'true';

const text = (record: LeadRecord, header: string) => safeDisplayText(leadValue(record, header));

/** Calendar date in the campaign timezone. */
const campaignDate = (value: Date): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: CONFIG.TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(value);

/**
 * Today's send count, derived from the Sheet rather than a stored counter.
 * Derived state cannot drift from what actually happened, and it survives a
 * console that keeps no state of its own.
 */
export function countSentToday(records: LeadRecord[], now: Date): number {
  const today = campaignDate(now);
  const stamps = [
    LEAD_HEADERS.INITIAL_SENT_AT,
    LEAD_HEADERS.FOLLOW_UP_1_SENT_AT,
    LEAD_HEADERS.FOLLOW_UP_2_SENT_AT
  ];

  return records.reduce((count, record) => {
    return (
      count +
      stamps.filter((header) => {
        const raw = text(record, header);
        if (!raw) return false;
        const parsed = new Date(raw);
        return !Number.isNaN(parsed.getTime()) && campaignDate(parsed) === today;
      }).length
    );
  }, 0);
}

export function campaignWindowOpen(now: Date): boolean {
  const cutoff = String(CONFIG.CAMPAIGN_SEND_CUTOFF_ISO || '').trim();
  if (!cutoff) return false;
  return campaignDate(now) <= cutoff;
}

const clearPendingCells = (): CellUpdate[] => [
  { header: LEAD_HEADERS.PENDING_ACTION, value: '' },
  { header: LEAD_HEADERS.PENDING_ATTEMPT_ID, value: '' },
  { header: LEAD_HEADERS.PENDING_DRAFT_ID, value: '' },
  { header: LEAD_HEADERS.PENDING_RECIPIENT, value: '' },
  { header: LEAD_HEADERS.PENDING_SINCE, value: '' }
];

const statusAfterAction = (action: ActionValue): string => {
  if (action === ACTION.INITIAL) return STATUS.SENT;
  if (action === ACTION.FOLLOW_UP_1) return STATUS.FOLLOW_UP_1;
  return STATUS.FOLLOW_UP_2;
};

const expectedPreSendStatus = (action: ActionValue): string => {
  if (action === ACTION.INITIAL) return STATUS.APPROVED;
  if (action === ACTION.FOLLOW_UP_1) return STATUS.SENT;
  return STATUS.FOLLOW_UP_1;
};

const evidenceHeaders = (action: ActionValue) =>
  action === ACTION.INITIAL
    ? { messageId: LEAD_HEADERS.INITIAL_MESSAGE_ID, sentAt: LEAD_HEADERS.INITIAL_SENT_AT }
    : action === ACTION.FOLLOW_UP_1
      ? { messageId: LEAD_HEADERS.FOLLOW_UP_1_MESSAGE_ID, sentAt: LEAD_HEADERS.FOLLOW_UP_1_SENT_AT }
      : { messageId: LEAD_HEADERS.FOLLOW_UP_2_MESSAGE_ID, sentAt: LEAD_HEADERS.FOLLOW_UP_2_SENT_AT };

/** Re-reads one row so decisions are never made on a stale snapshot. */
async function refreshLead(accessToken: string, id: string): Promise<LeadRecord> {
  const records = await getLeadRows(accessToken);
  const record = records.find((entry) => leadId(entry) === id);
  if (!record) throw new Error('The lead row disappeared mid-send.');
  return record;
}

/**
 * Writes evidence first, then status and pending clearance. A partial write
 * therefore leaves send evidence present, which fails closed on the next run
 * rather than inviting a resend.
 */
async function persistSendSuccess(
  accessToken: string,
  record: LeadRecord,
  action: ActionValue,
  sent: SentMessage,
  recipient: string
): Promise<string> {
  const headers = evidenceHeaders(action);
  const evidence: CellUpdate[] = [
    { header: LEAD_HEADERS.GMAIL_THREAD_ID, value: sent.threadId },
    { header: LEAD_HEADERS.CAMPAIGN_ID, value: CONFIG.CAMPAIGN_ID },
    // The Gmail API id, not the RFC Message-ID: this is what the Apps Script
    // project stores in the same column and what reply detection resolves a
    // thread from. Storing the RFC id here would break both.
    { header: headers.messageId, value: sent.messageId },
    { header: headers.sentAt, value: sent.sentAt.toISOString() },
    { header: LEAD_HEADERS.UPDATED_AT, value: new Date().toISOString() }
  ];
  if (action === ACTION.INITIAL) {
    evidence.push({ header: LEAD_HEADERS.SENT_TO_EMAIL, value: recipient });
    evidence.push({ header: LEAD_HEADERS.NORMALIZED_EMAIL, value: recipient });
  }
  await updateLeadCells(accessToken, record, evidence);

  const current = await refreshLead(accessToken, leadId(record));
  const currentStatusValue = leadValue(current, LEAD_HEADERS.STATUS);
  const currentStatus = normalizeStatus(currentStatusValue);

  let finalStatus = statusAfterAction(action);
  let concurrentChange = '';
  if (isTrue(leadValue(current, LEAD_HEADERS.OPT_OUT))) {
    finalStatus = STATUS.DO_NOT_CONTACT;
  } else if (AUTOMATION_STOP_STATUSES.includes(currentStatus as never)) {
    finalStatus = currentStatus;
  } else if (
    !isExactStatus(currentStatusValue, expectedPreSendStatus(action)) ||
    normalizeEmail(leadValue(current, LEAD_HEADERS.EMAIL)) !== normalizeEmail(recipient)
  ) {
    finalStatus = STATUS.REVIEW_REQUIRED;
    concurrentChange =
      'Lead status or email changed while Gmail was completing the send; delivery evidence was saved and automation was paused.';
  }

  await updateLeadCells(accessToken, current, [
    { header: LEAD_HEADERS.STATUS, value: finalStatus },
    ...clearPendingCells(),
    { header: LEAD_HEADERS.LAST_ERROR, value: concurrentChange },
    { header: LEAD_HEADERS.UPDATED_AT, value: new Date().toISOString() }
  ]);

  return finalStatus;
}

export type LeadSendResult =
  | { outcome: 'SENT'; status: string; recipient: string }
  | { outcome: 'RECONCILED'; status: string; recipient: string }
  | { outcome: 'SKIPPED'; reason: string }
  | { outcome: 'ERROR'; reason: string };

/**
 * Resolves a row that already carries a pending attempt, without sending.
 * Either the draft survives (never sent, so cancel it) or the thread holds the
 * stamped message (sent once, so record it).
 */
async function reconcilePending(
  accessToken: string,
  record: LeadRecord,
  id: string
): Promise<LeadSendResult> {
  const action = text(record, LEAD_HEADERS.PENDING_ACTION) as ActionValue;
  const attemptId = text(record, LEAD_HEADERS.PENDING_ATTEMPT_ID);
  const draftId = text(record, LEAD_HEADERS.PENDING_DRAFT_ID);
  const threadId = text(record, LEAD_HEADERS.GMAIL_THREAD_ID);
  const recipient = normalizeEmail(leadValue(record, LEAD_HEADERS.PENDING_RECIPIENT));

  if (!action || !attemptId || !draftId || !isValidSingleEmail(recipient)) {
    await updateLeadCells(accessToken, record, [
      { header: LEAD_HEADERS.STATUS, value: STATUS.REVIEW_REQUIRED },
      { header: LEAD_HEADERS.LAST_ERROR, value: 'Incomplete pending-send metadata; automatic retry refused.' }
    ]);
    return { outcome: 'SKIPPED', reason: 'Incomplete pending metadata; row marked REVIEW_REQUIRED.' };
  }

  const sent = await findSentMessageByAttempt(accessToken, threadId, attemptId, recipient);
  if (sent) {
    const status = await persistSendSuccess(accessToken, record, action, sent, recipient);
    return { outcome: 'RECONCILED', status, recipient };
  }

  if (await draftStillExists(accessToken, draftId)) {
    await deleteDraft(accessToken, draftId);
    await updateLeadCells(accessToken, record, [
      ...clearPendingCells(),
      { header: LEAD_HEADERS.LAST_ERROR, value: 'Previous attempt did not send; pending draft cancelled.' },
      { header: LEAD_HEADERS.UPDATED_AT, value: new Date().toISOString() }
    ]);
    return { outcome: 'SKIPPED', reason: 'Previous attempt never sent; pending cleared for a fresh run.' };
  }

  // Draft gone but no stamped message found — refuse to guess.
  await updateLeadCells(accessToken, record, [
    { header: LEAD_HEADERS.STATUS, value: STATUS.REVIEW_REQUIRED },
    { header: LEAD_HEADERS.LAST_ERROR, value: 'Pending draft vanished with no matching sent message; needs a human.' }
  ]);
  return { outcome: 'SKIPPED', reason: 'Unresolvable pending attempt; row marked REVIEW_REQUIRED.' };
}

export async function sendOneLead(
  accessToken: string,
  allRecords: LeadRecord[],
  record: LeadRecord,
  action: ActionValue
): Promise<LeadSendResult> {
  const id = leadId(record);
  const company = text(record, LEAD_HEADERS.COMPANY);

  if (hasPendingAction(record)) return reconcilePending(accessToken, record, id);

  // Eligibility is judged on the row as it is now, not as it was listed.
  if (action === ACTION.INITIAL) {
    const issue = getInitialApprovalIssue(
      record,
      allRecords,
      id,
      buildInitialSafetyIndex(allRecords),
      buildEmailCounts(allRecords)
    );
    if (issue) return { outcome: 'SKIPPED', reason: issue };
  } else {
    if (!isExactStatus(leadValue(record, LEAD_HEADERS.STATUS), expectedPreSendStatus(action))) {
      return { outcome: 'SKIPPED', reason: `Status is not ${expectedPreSendStatus(action)}.` };
    }
    if (isTrue(leadValue(record, LEAD_HEADERS.OPT_OUT))) return { outcome: 'SKIPPED', reason: 'Opt Out is TRUE.' };
    if (!hasInitialSuccessEvidence(record)) {
      return { outcome: 'SKIPPED', reason: 'No initial-send evidence to follow up on.' };
    }
  }

  const message = buildEmailForLead(record, action);
  const recipient = normalizeEmail(message.to);
  if (!isValidSingleEmail(recipient)) return { outcome: 'SKIPPED', reason: 'Recipient address is invalid.' };
  if (isConfiguredCcEmail(recipient)) {
    return { outcome: 'SKIPPED', reason: 'Recipient matches an internal CC address.' };
  }

  const attemptId = crypto.randomUUID();
  let threadId = '';
  let subject = message.subject;
  let inReplyTo: string | undefined;
  let references: string | undefined;

  if (action !== ACTION.INITIAL) {
    // Gmail threads on the anchor's RFC Message-ID and its exact Subject, and
    // both live in Gmail rather than the Sheet, so they are read at send time.
    const anchorId =
      action === ACTION.FOLLOW_UP_1
        ? text(record, LEAD_HEADERS.INITIAL_MESSAGE_ID)
        : text(record, LEAD_HEADERS.FOLLOW_UP_1_MESSAGE_ID) || text(record, LEAD_HEADERS.INITIAL_MESSAGE_ID);
    if (!anchorId) return { outcome: 'SKIPPED', reason: 'No Gmail anchor to thread this follow-up onto.' };

    const anchor = await getThreadAnchor(accessToken, anchorId);
    threadId = anchor.threadId;
    subject = anchor.subject;
    inReplyTo = anchor.rfcMessageId;
    references = buildReferencesHeader(anchor.references, anchor.rfcMessageId);
  }

  const raw = buildRawMime({
    to: recipient,
    cc: message.cc,
    subject,
    plainBody: message.plainBody,
    htmlBody: message.htmlBody,
    leadId: id,
    action,
    attemptId,
    inReplyTo,
    references
  });

  // Draft first: this is what makes an interrupted send recoverable.
  const draft = await createDraft(accessToken, raw, threadId || undefined);

  await updateLeadCells(accessToken, record, [
    { header: LEAD_HEADERS.NORMALIZED_EMAIL, value: recipient },
    { header: LEAD_HEADERS.CAMPAIGN_ID, value: CONFIG.CAMPAIGN_ID },
    { header: LEAD_HEADERS.GMAIL_THREAD_ID, value: draft.threadId },
    { header: LEAD_HEADERS.PENDING_ACTION, value: action },
    { header: LEAD_HEADERS.PENDING_ATTEMPT_ID, value: attemptId },
    { header: LEAD_HEADERS.PENDING_DRAFT_ID, value: draft.draftId },
    { header: LEAD_HEADERS.PENDING_RECIPIENT, value: recipient },
    { header: LEAD_HEADERS.PENDING_SINCE, value: new Date().toISOString() },
    { header: LEAD_HEADERS.LAST_ERROR, value: '' },
    { header: LEAD_HEADERS.UPDATED_AT, value: new Date().toISOString() }
  ]);

  // The optimistic lock: if a concurrent run claimed this row, its attempt id
  // is the one that survived and we must not send.
  const confirmed = await refreshLead(accessToken, id);
  if (text(confirmed, LEAD_HEADERS.PENDING_ATTEMPT_ID) !== attemptId) {
    await deleteDraft(accessToken, draft.draftId);
    return { outcome: 'SKIPPED', reason: 'Another run claimed this lead; this attempt stood down.' };
  }

  try {
    const sent = await sendDraft(accessToken, draft.draftId);
    const status = await persistSendSuccess(accessToken, confirmed, action, sent, recipient);
    await appendLogRow(accessToken, {
      company,
      email: recipient,
      action,
      result: 'SENT',
      message: `Sent from the Vercel console. Attempt ${attemptId}.`
    });
    return { outcome: 'SENT', status, recipient };
  } catch (error) {
    // Leave pending in place. The next run reconciles it against Gmail rather
    // than guessing, which is the whole point of recording it beforehand.
    const reason = error instanceof Error ? error.message : 'Send failed.';
    await updateLeadCells(accessToken, confirmed, [
      { header: LEAD_HEADERS.LAST_ERROR, value: `Send failed; pending attempt retained for reconciliation. ${reason}` },
      { header: LEAD_HEADERS.UPDATED_AT, value: new Date().toISOString() }
    ]);
    await appendLogRow(accessToken, {
      company,
      email: recipient,
      action,
      result: 'ERROR',
      message: reason
    });
    return { outcome: 'ERROR', reason };
  }
}

export type JobSummary = {
  job: string;
  mode: string;
  processed: number;
  sent: number;
  dryRun: number;
  testSent: number;
  skipped: number;
  replies: number;
  errors: number;
  message: string;
  stoppedForLimit?: boolean;
};

export async function runSendJob(
  accessToken: string,
  job: 'INITIALS' | 'FOLLOW_UPS',
  dueAction: (record: LeadRecord, now: Date) => string
): Promise<JobSummary> {
  const now = new Date();
  const summary: JobSummary = {
    job,
    mode: 'LIVE',
    processed: 0,
    sent: 0,
    dryRun: 0,
    testSent: 0,
    skipped: 0,
    replies: 0,
    errors: 0,
    message: ''
  };

  if (!sendsArmed()) {
    throw Object.assign(
      new Error('Sending is not armed on this deployment. Set CONSOLE_SENDS_ENABLED=true to enable it.'),
      { status: 409 }
    );
  }
  if (await isSystemDisabled(accessToken)) {
    throw Object.assign(
      new Error('Emergency disable is active. Clear it in the Console Control tab to resume sending.'),
      { status: 409 }
    );
  }
  if (!campaignWindowOpen(now)) {
    throw Object.assign(new Error('The campaign send cutoff has passed; sending is refused.'), { status: 409 });
  }

  await assertSendAsAuthorized(accessToken);

  const records = await getLeadRows(accessToken);
  const alreadySent = countSentToday(records, now);
  let budget = Math.max(0, CONFIG.SAFETY.DAILY_SEND_LIMIT - alreadySent);
  if (budget === 0) {
    summary.message = `Daily send limit of ${CONFIG.SAFETY.DAILY_SEND_LIMIT} already reached today.`;
    summary.stoppedForLimit = true;
    return summary;
  }

  const perRun =
    job === 'INITIALS' ? CONFIG.SAFETY.MAX_INITIALS_PER_RUN : CONFIG.SAFETY.MAX_FOLLOW_UPS_PER_RUN;
  budget = Math.min(budget, perRun);

  const candidates = records.filter((record) => {
    if (job === 'INITIALS') return isExactStatus(leadValue(record, LEAD_HEADERS.STATUS), STATUS.APPROVED);
    return Boolean(dueAction(record, now));
  });

  for (const record of candidates) {
    if (budget <= 0) {
      summary.stoppedForLimit = true;
      break;
    }
    summary.processed += 1;

    const action = (job === 'INITIALS' ? ACTION.INITIAL : dueAction(record, now)) as ActionValue;
    const fresh = await refreshLead(accessToken, leadId(record));
    const result = await sendOneLead(accessToken, records, fresh, action);

    if (result.outcome === 'SENT') {
      summary.sent += 1;
      budget -= 1;
    } else if (result.outcome === 'RECONCILED') {
      summary.sent += 1;
    } else if (result.outcome === 'ERROR') {
      summary.errors += 1;
    } else {
      summary.skipped += 1;
    }
  }

  summary.message =
    `${summary.sent} sent, ${summary.skipped} skipped, ${summary.errors} error(s). ` +
    `Daily cap ${CONFIG.SAFETY.DAILY_SEND_LIMIT}, ${alreadySent + summary.sent} used today.`;
  return summary;
}
