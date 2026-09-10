import {
  buildEmailCounts,
  buildInitialSafetyIndex,
  getInitialApprovalIssue,
  leadId
} from '@/lib/approval';
import { LEAD_HEADERS, STATUS } from '@/lib/constants';
import { enrichCompany } from '@/lib/enrich';
import { isSystemDisabled } from '@/lib/killswitch';
import { dueFollowUpAction } from '@/lib/leads';
import { campaignWindowOpen, runSendJob, sendsArmed } from '@/lib/send';
import { getLeadRows, leadValue, type LeadRecord } from '@/lib/sheets';
import { appendLogRow, updateLeadCells, type CellUpdate } from '@/lib/sheets-write';
import { errorResponse, requireMailboxOwner } from '@/lib/session';
import { normalizeStatus } from '@/lib/templates';
import {
  isValidSingleEmail,
  normalizeEmail,
  safeDisplayText,
  sanitizeUiMultilineText
} from '@/lib/text';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

const MAX_RESEARCH_PER_RUN = 25;

/** Whether the human approval step may be skipped. Off unless explicitly set. */
const autoApproveEnabled = (): boolean => process.env.CONSOLE_AUTO_APPROVE === 'true';

const needsResearch = (record: LeadRecord): boolean =>
  normalizeStatus(leadValue(record, LEAD_HEADERS.STATUS)) === STATUS.NEW &&
  !isValidSingleEmail(normalizeEmail(leadValue(record, LEAD_HEADERS.EMAIL))) &&
  Boolean(safeDisplayText(leadValue(record, LEAD_HEADERS.COMPANY))) &&
  Boolean(safeDisplayText(leadValue(record, LEAD_HEADERS.WEBSITE)));

/**
 * Research, approve and send in one pass over the leads already in the Sheet.
 *
 * Auto-approval skips the operator, not the checks: every row still goes
 * through the same gates a manual approval runs, so an opted-out, duplicated,
 * already-contacted or CC-matching address is refused exactly as before. Which
 * companies to contact is still decided by whoever built the list — nothing
 * here discovers new ones.
 */
export async function POST() {
  try {
    const operator = await requireMailboxOwner();
    const started = new Date();

    if (!sendsArmed()) throw Object.assign(new Error('Sending is not armed on this deployment.'), { status: 409 });
    if (!campaignWindowOpen(started)) {
      throw Object.assign(new Error('The campaign send cutoff has passed.'), { status: 409 });
    }
    if (await isSystemDisabled(operator.accessToken)) {
      throw Object.assign(new Error('Emergency disable is active.'), { status: 409 });
    }

    // Stage 1 — research rows that lack an address.
    const records = await getLeadRows(operator.accessToken);
    const toResearch = records.filter(needsResearch).slice(0, MAX_RESEARCH_PER_RUN);
    let found = 0;

    for (const record of toResearch) {
      const company = safeDisplayText(leadValue(record, LEAD_HEADERS.COMPANY));
      const result = await enrichCompany(leadValue(record, LEAD_HEADERS.WEBSITE), company);

      const updates: CellUpdate[] = [{ header: LEAD_HEADERS.UPDATED_AT, value: started.toISOString() }];
      const notes = [safeDisplayText(leadValue(record, LEAD_HEADERS.NOTES))];

      if (result.email) {
        updates.push({ header: LEAD_HEADERS.EMAIL, value: result.email });
        updates.push({ header: LEAD_HEADERS.NORMALIZED_EMAIL, value: result.email });
        notes.push(`Address found automatically on ${result.sourceUrl}.`);
        found += 1;
      } else {
        notes.push(result.diagnosis || 'No published contact address found.');
      }
      if (!safeDisplayText(leadValue(record, LEAD_HEADERS.CATEGORY)) && result.category) {
        updates.push({ header: LEAD_HEADERS.CATEGORY, value: result.category });
      }
      updates.push({
        header: LEAD_HEADERS.NOTES,
        value: sanitizeUiMultilineText(notes.filter(Boolean).join('\n'), 2000)
      });
      await updateLeadCells(operator.accessToken, record, updates);
    }

    // Stage 2 — approve, if the operator has switched that on.
    let approved = 0;
    const refusals: string[] = [];

    if (autoApproveEnabled()) {
      const refreshed = await getLeadRows(operator.accessToken);
      let safetyIndex = buildInitialSafetyIndex(refreshed);
      const emailCounts = buildEmailCounts(refreshed);

      for (const record of refreshed) {
        if (normalizeStatus(leadValue(record, LEAD_HEADERS.STATUS)) !== STATUS.NEW) continue;
        if (!isValidSingleEmail(normalizeEmail(leadValue(record, LEAD_HEADERS.EMAIL)))) continue;

        const candidate = { ...record, values: [...record.values] };
        const statusColumn = candidate.headerMap[LEAD_HEADERS.STATUS];
        if (statusColumn) candidate.values[statusColumn - 1] = STATUS.APPROVED;

        const issue = getInitialApprovalIssue(
          candidate,
          refreshed,
          leadId(record),
          safetyIndex,
          emailCounts
        );
        if (issue) {
          if (refusals.length < 10) refusals.push(issue);
          continue;
        }

        await updateLeadCells(operator.accessToken, record, [
          { header: LEAD_HEADERS.STATUS, value: STATUS.APPROVED },
          { header: LEAD_HEADERS.UPDATED_AT, value: new Date().toISOString() }
        ]);
        if (statusColumn) record.values[statusColumn - 1] = STATUS.APPROVED;
        safetyIndex = buildInitialSafetyIndex(refreshed, safetyIndex);
        approved += 1;
      }

      if (approved) {
        await appendLogRow(operator.accessToken, {
          action: 'AUTO_APPROVE',
          result: 'RECORDED',
          message: `${approved} lead(s) approved without operator review via the one-button pipeline.`
        });
      }
    }

    // Stage 3 — send, still bounded by the daily cap.
    const send = await runSendJob(operator.accessToken, 'INITIALS', dueFollowUpAction);

    return Response.json({
      job: 'PIPELINE',
      mode: 'LIVE',
      processed: toResearch.length,
      sent: send.sent,
      dryRun: 0,
      testSent: 0,
      skipped: send.skipped,
      replies: 0,
      errors: send.errors,
      message:
        `Researched ${toResearch.length}, found ${found} address(es), ` +
        `${autoApproveEnabled() ? `approved ${approved}` : 'approval left to you (set CONSOLE_AUTO_APPROVE=true to skip it)'}, ` +
        `sent ${send.sent}. ${send.message}` +
        (refusals.length ? ` Refused approval: ${[...new Set(refusals)].join('; ')}.` : '')
    });
  } catch (error) {
    return errorResponse(error);
  }
}
