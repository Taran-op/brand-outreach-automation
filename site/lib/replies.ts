/**
 * Port of src/06_ReplyService.gs.
 *
 * This is the opt-out safety net, so it is deliberately conservative: it only
 * reads the top, unquoted portion of a reply, because our own footer contains
 * the words "opt out" and a quoted copy of it must never suppress a brand that
 * did not ask to be suppressed.
 */

import { CONFIG } from './config';
import {
  ACTION,
  ACTIVE_OUTREACH_STATUSES,
  AUTOMATION_STOP_STATUSES,
  LEAD_HEADERS,
  STATUS,
  type ActionValue
} from './constants';
import { GmailError } from './gmail';
import { findRepliesInMailbox, mailboxConfigured, type InboundMessage } from './hostinger';
import { getLeadRows, leadValue, type LeadRecord } from './sheets';
import { appendLogRow, updateLeadCells, type CellUpdate } from './sheets-write';
import { hasPendingAction, normalizeStatus } from './templates';
import { isTrue, normalizeEmail, safeDisplayText } from './text';

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';

type GmailHeader = { name: string; value: string };
type GmailPart = {
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: { data?: string; attachmentId?: string };
  parts?: GmailPart[];
};
type GmailMessage = {
  id: string;
  threadId?: string;
  labelIds?: string[];
  internalDate?: string;
  payload?: GmailPart;
};

async function gmailGet<T>(path: string, accessToken: string): Promise<T> {
  const response = await fetch(`${GMAIL_API}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store'
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new GmailError(`Gmail API error ${response.status}: ${safeDisplayText(detail).slice(0, 200)}`, response.status);
  }
  return (await response.json()) as T;
}

const headerOf = (message: GmailMessage, name: string): string => {
  const target = name.toLowerCase();
  return (message.payload?.headers || []).find((h) => h.name.toLowerCase() === target)?.value || '';
};

const partHeader = (part: GmailPart, name: string): string => {
  const target = name.toLowerCase();
  return (part.headers || []).find((h) => h.name.toLowerCase() === target)?.value || '';
};

const extractEmailAddresses = (value: unknown): string[] =>
  (String(value ?? '').match(/[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,63}/gi) || []).map(normalizeEmail);

const decodeGmailBody = (data: string): string => {
  try {
    return Buffer.from(String(data || ''), 'base64url').toString('utf8');
  } catch {
    return '';
  }
};

export function stripHtml(html: unknown): string {
  let source = String(html ?? '');

  // Cut at the first quoted block so a quoted copy of our own footer is never
  // read as the sender's words.
  const quoteMarkers = [
    /<blockquote\b/i,
    /<(?:div|span|table)\b[^>]*(?:class|id)\s*=\s*["'][^"']*(?:gmail_quote|yahoo_quoted|divRplyFwdMsg)[^"']*["'][^>]*>/i
  ];
  let quoteIndex = -1;
  quoteMarkers.forEach((pattern) => {
    const index = source.search(pattern);
    if (index >= 0 && (quoteIndex < 0 || index < quoteIndex)) quoteIndex = index;
  });
  if (quoteIndex >= 0) source = source.slice(0, quoteIndex);

  return source
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

const OWN_FOOTER = 'if you would prefer not to receive further messages about this event';

export function getTopUnquotedText(body: unknown): string {
  let source = String(body ?? '').replace(/\r/g, '');

  // Some clients wrap our footer across lines with quote characters; stop at
  // it however it is broken up.
  const wrapped = /if you would prefer not to receive[\s>|]+further[\s>|]+messages[\s>|]+about[\s>|]+this[\s>|]+event/i.exec(
    source
  );
  if (wrapped) source = source.slice(0, wrapped.index);

  const lines = source.split('\n');
  const kept: string[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();

    const ownFooterIndex = trimmed.toLowerCase().indexOf(OWN_FOOTER);
    if (ownFooterIndex >= 0) {
      const prefix = trimmed.slice(0, ownFooterIndex).trim();
      if (prefix) kept.push(prefix);
      break;
    }
    if (/^>/.test(trimmed)) break;
    if (/^on\s/i.test(trimmed)) {
      const window = lines.slice(i, Math.min(lines.length, i + 4)).join(' ').replace(/\s+/g, ' ');
      if (/\bwrote:/i.test(window)) break;
    }
    if (/^-{2,}\s*original message\s*-{2,}$/i.test(trimmed)) break;
    if (/^-{2,}\s*forwarded message\s*-{2,}$/i.test(trimmed) || /^begin forwarded message:?$/i.test(trimmed)) break;
    if (/^from:/i.test(trimmed)) {
      const window = lines.slice(i, Math.min(lines.length, i + 7)).join('\n');
      if ((window.match(/^(?:sent|date|to|subject):/gim) || []).length >= 2) break;
    }

    kept.push(line);
    if (kept.join('\n').length >= 5000) break;
  }

  return kept.join('\n').slice(0, 5000).trim();
}

export function containsStrongOptOut(text: unknown): boolean {
  const normalized = String(text ?? '').toLowerCase().replace(/[’]/g, "'");
  return /\bunsubscribe\b|\bopt[\s-]?out\b|\bremove (?:me|my email)\b|\btake me off\b|\bdo not (?:contact|email) me\b|\bdon't (?:contact|email) me\b|\bstop (?:emailing|mailing|contacting) me\b|\bno more emails\b/.test(
    normalized
  );
}

type HeaderGetter = (name: string) => string;

const isBounce = (header: HeaderGetter): boolean => {
  const from = header('From').toLowerCase();
  const subject = header('Subject').toLowerCase();
  const contentType = header('Content-Type').toLowerCase();
  return (
    /mailer-daemon|postmaster/.test(from) ||
    /delivery status notification|undeliverable|delivery failure|failure notice|returned mail/.test(subject) ||
    /delivery-status|multipart\/report/.test(contentType)
  );
};

const isAutomated = (header: HeaderGetter): boolean => {
  const autoSubmitted = header('Auto-Submitted').toLowerCase();
  const precedence = header('Precedence').toLowerCase();
  const subject = header('Subject').toLowerCase();
  const autoReply = header('X-Autoreply') || header('X-Auto-Response-Suppress') || header('X-Autorespond');

  if (autoSubmitted && autoSubmitted !== 'no') return true;
  if (autoReply) return true;
  if (/bulk|junk|list/.test(precedence)) return true;
  return /automatic reply|auto.?reply|out of office|away from the office|vacation response/.test(subject);
};

function collectParts(part: GmailPart | undefined, plain: string[], html: string[]): void {
  if (!part) return;
  const mimeType = String(part.mimeType || '').toLowerCase();
  const disposition = partHeader(part, 'Content-Disposition').toLowerCase();
  // Attachments and embedded messages are not the sender's reply text.
  if (mimeType === 'message/rfc822' || part.filename || /attachment/.test(disposition)) return;

  const data = part.body?.data || '';
  if (data && mimeType === 'text/plain') plain.push(decodeGmailBody(data));
  if (data && mimeType === 'text/html') html.push(decodeGmailBody(data));
  (part.parts || []).forEach((child) => collectParts(child, plain, html));
}

const gmailPlainText = (message: GmailMessage): string => {
  const plain: string[] = [];
  const html: string[] = [];
  collectParts(message.payload, plain, html);
  if (plain.length) return plain.join('\n');
  return html.length ? stripHtml(html.join('\n')) : '';
};

export type DetectedResponse = {
  type: 'OPT_OUT' | 'REPLY' | 'MANUAL_OUTBOUND' | 'BOUNCE' | 'AUTO_REPLY';
  messageId: string;
  threadId: string;
  from: string;
  receivedAt: Date;
};

/**
 * One shape for a message from either mailbox, so the classifier below does
 * not care where it came from.
 */
type Inbound = {
  id: string;
  threadId: string;
  header: HeaderGetter;
  plainText: () => string;
  receivedAt: Date;
  /** Sent by us — only Gmail can know this, via the SENT label. */
  isOurs: boolean;
  isDraft: boolean;
};

const fromGmail = (message: GmailMessage, fallbackThread: string): Inbound => ({
  id: message.id,
  threadId: message.threadId || fallbackThread,
  header: (name) => headerOf(message, name),
  plainText: () => gmailPlainText(message),
  receivedAt: message.internalDate ? new Date(Number(message.internalDate)) : new Date(),
  isOurs: (message.labelIds || []).includes('SENT'),
  isDraft: (message.labelIds || []).includes('DRAFT')
});

const fromHostinger = (message: InboundMessage, threadId: string): Inbound => ({
  id: message.id,
  threadId,
  header: (name) => message.headers[name.toLowerCase()] || '',
  plainText: () => message.plainText,
  receivedAt: message.receivedAt,
  isOurs: false,
  isDraft: false
});

/**
 * Inspects everything that answered our outreach — the Gmail thread, which
 * holds what we sent, and the Hostinger mailbox, which holds what came back —
 * and returns the single most important thing that happened. Opt-out outranks
 * everything, because suppression must never lose to a friendlier signal.
 */
export async function detectThreadResponse(
  accessToken: string,
  record: LeadRecord,
  ownAddresses: Set<string>
): Promise<DetectedResponse | null> {
  const campaignId = safeDisplayText(leadValue(record, LEAD_HEADERS.CAMPAIGN_ID));
  if (campaignId !== CONFIG.CAMPAIGN_ID) {
    throw new Error('Stored Campaign ID does not match CONFIG.CAMPAIGN_ID; reply scan refused.');
  }

  const initialMessageId = safeDisplayText(leadValue(record, LEAD_HEADERS.INITIAL_MESSAGE_ID));
  if (!initialMessageId) throw new Error('Cannot check replies without Initial Message ID.');

  const initial = await gmailGet<GmailMessage>(
    `/messages/${encodeURIComponent(initialMessageId)}?format=minimal`,
    accessToken
  );
  if (!initial.threadId) throw new Error('The stored initial Gmail message could not be resolved to a thread.');

  const thread = await gmailGet<{ messages?: GmailMessage[] }>(
    `/threads/${encodeURIComponent(initial.threadId)}?format=full`,
    accessToken
  );
  const gmailMessages = thread.messages || [];
  if (!gmailMessages.some((message) => message.id === initialMessageId)) {
    throw new Error('Initial Message ID is not present in its resolved Gmail thread.');
  }

  const knownSent = new Set<string>([initialMessageId]);
  const followUp1 = safeDisplayText(leadValue(record, LEAD_HEADERS.FOLLOW_UP_1_MESSAGE_ID));
  const followUp2 = safeDisplayText(leadValue(record, LEAD_HEADERS.FOLLOW_UP_2_MESSAGE_ID));
  if (followUp1) knownSent.add(followUp1);
  if (followUp2) knownSent.add(followUp2);

  // The RFC Message-IDs of what we sent are what a reply's In-Reply-To and
  // References headers point at; they live in Gmail, so read them there.
  const ourRfcIds = gmailMessages
    .filter((message) => knownSent.has(message.id))
    .map((message) => headerOf(message, 'Message-ID'))
    .filter(Boolean);
  const sentTo = normalizeEmail(leadValue(record, LEAD_HEADERS.SENT_TO_EMAIL));
  const initialSubject = headerOf(gmailMessages.find((m) => m.id === initialMessageId)!, 'Subject');

  const inbound: Inbound[] = gmailMessages.map((message) => fromGmail(message, initial.threadId!));

  if (mailboxConfigured()) {
    const external = await findRepliesInMailbox(ourRfcIds, sentTo, initialSubject);
    // A message forwarded into Gmail as well would appear twice; the RFC id
    // de-duplicates it.
    const seenRfc = new Set(inbound.map((m) => m.header('Message-ID')).filter(Boolean));
    for (const message of external) {
      const rfc = message.headers['message-id'] || '';
      if (rfc && seenRfc.has(rfc)) continue;
      inbound.push(fromHostinger(message, initial.threadId!));
    }
  }

  inbound.sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime());
  const initialAt = inbound.find((m) => m.id === initialMessageId)?.receivedAt.getTime() ?? 0;

  let humanReply: DetectedResponse | null = null;
  let optOut: DetectedResponse | null = null;
  let bounce: DetectedResponse | null = null;
  let autoReply: DetectedResponse | null = null;
  let manualOutbound: DetectedResponse | null = null;

  for (const message of inbound) {
    if (message.id === initialMessageId || message.isDraft) continue;
    // Only what happened after our initial can be a response to it.
    if (message.receivedAt.getTime() < initialAt) continue;

    const fromAddresses = extractEmailAddresses(message.header('From'));
    const base = {
      messageId: message.id,
      threadId: message.threadId,
      from: fromAddresses[0] || '',
      receivedAt: message.receivedAt
    };

    if (message.isOurs) {
      // Something we sent that is not a recorded automated send means a human
      // has stepped into the thread and automation should stand down.
      if (!knownSent.has(message.id) && !manualOutbound) manualOutbound = { type: 'MANUAL_OUTBOUND', ...base };
      continue;
    }

    // Internal CC colleagues replying-all are not the brand.
    if (!fromAddresses.length || fromAddresses.every((email) => ownAddresses.has(email))) continue;

    if (isBounce(message.header)) {
      if (!bounce) bounce = { type: 'BOUNCE', ...base };
      continue;
    }
    if (isAutomated(message.header)) {
      if (!autoReply) autoReply = { type: 'AUTO_REPLY', ...base };
      continue;
    }

    const topText = getTopUnquotedText(message.plainText());
    if (containsStrongOptOut(topText)) {
      if (!optOut) optOut = { type: 'OPT_OUT', ...base };
      continue;
    }
    if (!humanReply) humanReply = { type: 'REPLY', ...base };
  }

  return optOut || humanReply || manualOutbound || bounce || autoReply || null;
}

/** Rows worth scanning. Pending sends are excluded so an unrecorded automated
 *  follow-up is never mistaken for a human stepping in. */
export function shouldCheckReplies(record: LeadRecord): boolean {
  if (!safeDisplayText(leadValue(record, LEAD_HEADERS.INITIAL_MESSAGE_ID))) return false;
  if (hasPendingAction(record)) return false;

  const status = normalizeStatus(leadValue(record, LEAD_HEADERS.STATUS));
  if (isTrue(leadValue(record, LEAD_HEADERS.OPT_OUT)) || status === STATUS.DO_NOT_CONTACT) return false;
  if (ACTIVE_OUTREACH_STATUSES.includes(status as never)) return true;

  if (status === STATUS.REVIEW_REQUIRED) {
    const replyStatus = safeDisplayText(leadValue(record, LEAD_HEADERS.REPLY_STATUS)).toUpperCase();
    return ['AUTO_REPLY', 'BOUNCE', 'MANUAL_REVIEW'].includes(replyStatus);
  }

  // Keep monitoring qualified rows for a later opt-out, without moving them
  // backwards through the sales lifecycle.
  return [
    STATUS.REPLIED,
    STATUS.INTERESTED,
    STATUS.MEETING,
    STATUS.NEGOTIATING,
    STATUS.CLOSED,
    STATUS.NOT_INTERESTED
  ].includes(status as never);
}

export async function applyDetectedResponse(
  accessToken: string,
  record: LeadRecord,
  response: DetectedResponse
): Promise<string> {
  const now = new Date();
  const currentStatus = normalizeStatus(leadValue(record, LEAD_HEADERS.STATUS));
  const alreadyStopped = isTrue(leadValue(record, LEAD_HEADERS.OPT_OUT));

  const updates: CellUpdate[] = [
    { header: LEAD_HEADERS.LAST_REPLY_CHECK_AT, value: now.toISOString() },
    { header: LEAD_HEADERS.LAST_RESPONSE_MESSAGE_ID, value: response.messageId },
    { header: LEAD_HEADERS.GMAIL_THREAD_ID, value: response.threadId },
    { header: LEAD_HEADERS.UPDATED_AT, value: now.toISOString() },
    { header: LEAD_HEADERS.LAST_ERROR, value: '' }
  ];
  if (response.type !== 'MANUAL_OUTBOUND') {
    updates.push({ header: LEAD_HEADERS.LAST_REPLY_AT, value: (response.receivedAt || now).toISOString() });
  }

  let action = 'REPLY';
  let logMessage = 'External reply detected in the stored Gmail thread; automated follow-ups stopped.';
  let status: string;
  let replyStatus: string;
  let lastError = '';

  if (response.type === 'OPT_OUT') {
    action = 'OPT_OUT';
    replyStatus = 'OPTED_OUT';
    status = STATUS.DO_NOT_CONTACT;
    updates.push({ header: LEAD_HEADERS.OPT_OUT, value: true });
    logMessage = 'Explicit opt-out wording detected in the top, unquoted reply text.';
  } else if (response.type === 'BOUNCE') {
    action = 'BOUNCE';
    replyStatus = 'BOUNCE';
    status = STATUS.REVIEW_REQUIRED;
    lastError = 'Delivery failure detected; verify or replace the email before re-approval.';
    logMessage = 'Likely delivery failure detected; row quarantined for review.';
  } else if (response.type === 'AUTO_REPLY') {
    action = 'AUTO_REPLY';
    replyStatus = 'AUTO_REPLY';
    status = STATUS.REVIEW_REQUIRED;
    lastError = 'Automated response detected; review before resuming follow-ups.';
    logMessage = 'Likely automated response detected; row quarantined to avoid unwanted follow-ups.';
  } else if (response.type === 'MANUAL_OUTBOUND') {
    action = 'MANUAL_OUTBOUND';
    replyStatus = 'MANUAL_REVIEW';
    status = STATUS.REVIEW_REQUIRED;
    lastError = 'A manual outbound message exists in this thread; automated follow-ups are paused.';
    logMessage = 'Manual outbound activity detected after the automated initial email; automation paused.';
  } else {
    replyStatus = 'REPLY_DETECTED';
    status = STATUS.REPLIED;
  }

  if (response.type !== 'OPT_OUT') {
    if (alreadyStopped || currentStatus === STATUS.DO_NOT_CONTACT) {
      status = STATUS.DO_NOT_CONTACT;
    } else if (
      AUTOMATION_STOP_STATUSES.includes(currentStatus as never) &&
      currentStatus !== STATUS.REVIEW_REQUIRED
    ) {
      // Never drag an operator-qualified lead back down the funnel. A later
      // explicit opt-out still wins, because it is handled above.
      status = currentStatus;
      logMessage += ' Existing terminal/commercial status was preserved.';
    }
  }

  updates.push({ header: LEAD_HEADERS.REPLY_STATUS, value: replyStatus });
  updates.push({ header: LEAD_HEADERS.STATUS, value: status });
  if (lastError) updates.push({ header: LEAD_HEADERS.LAST_ERROR, value: lastError });

  await updateLeadCells(accessToken, record, updates);
  await appendLogRow(accessToken, {
    company: safeDisplayText(leadValue(record, LEAD_HEADERS.COMPANY)),
    email: normalizeEmail(leadValue(record, LEAD_HEADERS.EMAIL)),
    action,
    result: 'DETECTED',
    message: logMessage
  });

  return action;
}

/** Addresses that are us, so a reply-all from a colleague is not a brand reply. */
export async function getOwnAddresses(accessToken: string): Promise<Set<string>> {
  const addresses = new Set<string>();
  CONFIG.SENDER.CC_EMAILS.forEach((email) => addresses.add(normalizeEmail(email)));
  addresses.add(normalizeEmail(CONFIG.SENDER.FROM_EMAIL));
  addresses.add(normalizeEmail(CONFIG.SENDER.REPLY_TO_EMAIL));

  try {
    const list = await gmailGet<{ sendAs?: { sendAsEmail: string }[] }>('/settings/sendAs', accessToken);
    (list.sendAs || []).forEach((entry) => addresses.add(normalizeEmail(entry.sendAsEmail)));
  } catch {
    // Configured addresses alone are a safe fallback.
  }
  return addresses;
}

export type ReplyScanSummary = {
  processed: number;
  replies: number;
  optOuts: number;
  errors: number;
  message: string;
};

export async function runReplyScan(accessToken: string, maxRows: number): Promise<ReplyScanSummary> {
  const records = await getLeadRows(accessToken);
  const ownAddresses = await getOwnAddresses(accessToken);

  const candidates = records
    .filter(shouldCheckReplies)
    .sort((a, b) => {
      const at = new Date(safeDisplayText(leadValue(a, LEAD_HEADERS.LAST_REPLY_CHECK_AT))).getTime() || 0;
      const bt = new Date(safeDisplayText(leadValue(b, LEAD_HEADERS.LAST_REPLY_CHECK_AT))).getTime() || 0;
      return at === bt ? a.rowNumber - b.rowNumber : at - bt;
    })
    .slice(0, maxRows);

  const summary: ReplyScanSummary = { processed: 0, replies: 0, optOuts: 0, errors: 0, message: '' };

  for (const record of candidates) {
    summary.processed += 1;
    try {
      const response = await detectThreadResponse(accessToken, record, ownAddresses);
      if (!response) {
        await updateLeadCells(accessToken, record, [
          { header: LEAD_HEADERS.LAST_REPLY_CHECK_AT, value: new Date().toISOString() }
        ]);
        continue;
      }
      const action = await applyDetectedResponse(accessToken, record, response);
      if (action === 'OPT_OUT') summary.optOuts += 1;
      else summary.replies += 1;
    } catch (error) {
      summary.errors += 1;
      await appendLogRow(accessToken, {
        company: safeDisplayText(leadValue(record, LEAD_HEADERS.COMPANY)),
        email: normalizeEmail(leadValue(record, LEAD_HEADERS.EMAIL)),
        action: 'REPLY_CHECK',
        result: 'ERROR',
        message: error instanceof Error ? error.message : 'Reply scan failed.'
      });
    }
  }

  summary.message =
    `${summary.processed} thread(s) checked, ${summary.replies} reply/replies recorded, ` +
    `${summary.optOuts} opt-out(s) suppressed, ${summary.errors} error(s).`;
  return summary;
}
