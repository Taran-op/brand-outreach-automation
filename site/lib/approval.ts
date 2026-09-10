/**
 * Port of the approval gates from src/10_WebApp.gs.
 *
 * These decide whether a row may ever become an initial send, and they are the
 * reason a mistyped or duplicated address does not reach a brand. Behaviour is
 * kept identical to the Apps Script original; where the original consulted the
 * Outreach Log for prior-send evidence, this build passes that index in so the
 * caller controls how it is sourced.
 */

import { ACTION, LEAD_HEADERS, STATUS } from './constants';
import { leadValue, type LeadRecord } from './sheets';
import { normalizeStatus, isConfiguredCcEmail, hasPendingAction } from './templates';
import { isExactStatus, isTrue, isValidSingleEmail, normalizeEmail, safeDisplayText } from './text';

const hasValue = (value: unknown): boolean => safeDisplayText(value).length > 0;

export const hasInitialSuccessEvidence = (record: LeadRecord): boolean =>
  hasValue(leadValue(record, LEAD_HEADERS.INITIAL_SENT_AT)) ||
  hasValue(leadValue(record, LEAD_HEADERS.INITIAL_MESSAGE_ID)) ||
  hasValue(leadValue(record, LEAD_HEADERS.SENT_TO_EMAIL));

export function buildEmailCounts(rows: LeadRecord[]): Record<string, number> {
  const counts: Record<string, number> = {};
  rows.forEach((record) => {
    const email = normalizeEmail(leadValue(record, LEAD_HEADERS.EMAIL));
    if (email) counts[email] = (counts[email] || 0) + 1;
  });
  return counts;
}

/**
 * Addresses that must not receive an initial send, and why. Suppression is
 * carried across rows: if any row for an address is opted out or already has
 * send evidence, every row sharing that address is blocked.
 */
export function buildInitialSafetyIndex(
  rows: LeadRecord[],
  seed: Record<string, string> = {}
): Record<string, string> {
  const blocked: Record<string, string> = { ...seed };

  rows.forEach((record) => {
    const currentEmail = normalizeEmail(leadValue(record, LEAD_HEADERS.EMAIL));
    const sentTo = normalizeEmail(leadValue(record, LEAD_HEADERS.SENT_TO_EMAIL));
    const status = normalizeStatus(leadValue(record, LEAD_HEADERS.STATUS));

    let reason = '';
    if (
      isTrue(leadValue(record, LEAD_HEADERS.OPT_OUT)) ||
      status === STATUS.DO_NOT_CONTACT ||
      status === STATUS.NOT_INTERESTED
    ) {
      reason = 'suppressed by another sheet row';
    } else if (hasInitialSuccessEvidence(record)) {
      reason = 'initial-send evidence on another sheet row';
    } else if (String(leadValue(record, LEAD_HEADERS.PENDING_ACTION) || '') === ACTION.INITIAL) {
      reason = 'uncertain initial attempt on another sheet row';
    }

    if (reason && currentEmail) blocked[currentEmail] = reason;
    if (reason && sentTo) blocked[sentTo] = reason;
  });

  return blocked;
}

export const leadId = (record: LeadRecord): string =>
  safeDisplayText(leadValue(record, LEAD_HEADERS.LEAD_ID));

/**
 * Returns '' when the row is genuinely ready for an initial send, otherwise a
 * plain-language reason. Every branch here is a deliberate refusal — none of
 * them should be relaxed to make a bulk approve tidier.
 */
export function getInitialApprovalIssue(
  record: LeadRecord,
  allRows: LeadRecord[],
  currentId: string,
  safetyIndex: Record<string, string>,
  emailCounts: Record<string, number>
): string {
  if (!isExactStatus(leadValue(record, LEAD_HEADERS.STATUS), STATUS.APPROVED)) return 'Status is not APPROVED.';
  if (isTrue(leadValue(record, LEAD_HEADERS.OPT_OUT))) return 'Opt Out is TRUE.';
  if (!safeDisplayText(leadValue(record, LEAD_HEADERS.COMPANY))) return 'Company is required.';

  const email = normalizeEmail(leadValue(record, LEAD_HEADERS.EMAIL));
  if (!isValidSingleEmail(email)) return 'A valid single email is required.';
  if (isConfiguredCcEmail(email)) return 'Lead email matches an internal CC address.';
  if (hasInitialSuccessEvidence(record)) return 'Initial-send evidence already exists.';
  if (hasPendingAction(record)) return 'A pending/uncertain send action exists.';

  const id = currentId || leadId(record);
  let duplicate = Number(emailCounts[email] || 0) > 1;
  if (!duplicate) {
    duplicate = allRows.some(
      (other) => leadId(other) !== id && normalizeEmail(leadValue(other, LEAD_HEADERS.EMAIL)) === email
    );
  }
  if (duplicate) return 'Another lead row already uses this email address.';

  if (safetyIndex[email]) return 'Suppression or prior-send evidence exists for this email.';
  return '';
}

/** Lead ids are used to re-find rows; keep them to the shape Sheets writes. */
export function validateLeadId(value: unknown): string {
  const id = safeDisplayText(value);
  if (!id || id.length > 120 || !/^[A-Za-z0-9_-]+$/.test(id)) {
    throw new Error('Invalid lead identifier.');
  }
  return id;
}

export const findLeadById = (rows: LeadRecord[], id: string): LeadRecord | undefined =>
  rows.find((record) => leadId(record) === id);
