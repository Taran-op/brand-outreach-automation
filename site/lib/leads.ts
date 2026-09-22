import { CONFIG } from './config';
import { ACTIVE_OUTREACH_STATUSES, LEAD_HEADERS, STATUS, type StatusValue } from './constants';
import { leadValue, type LeadRecord } from './sheets';
import { isTrue, normalizeEmail, safeDisplayText } from './text';

export type Lead = {
  id: string;
  rowNumber: number;
  company: string;
  contactName: string;
  email: string;
  category: string;
  website: string;
  personalization: string;
  status: string;
  initialSentAt: string;
  followUp1SentAt: string;
  followUp2SentAt: string;
  replyStatus: string;
  notes: string;
  optOut: boolean;
  lastError: string;
  updatedAt: string;
  previewAction: string;
  dueAction: string;
  hasSendEvidence: boolean;
  hasPendingAction: boolean;
};

const text = (record: LeadRecord, header: string) => safeDisplayText(leadValue(record, header));

/** Sheet timestamps arrive as formatted strings; keep them as-is when unparseable. */
const timestamp = (record: LeadRecord, header: string): string => {
  const raw = text(record, header);
  if (!raw) return '';
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? raw : parsed.toISOString();
};

/** Calendar day in the campaign timezone, so "day 4" matches the Apps Script rule. */
const calendarDay = (value: string): number | null => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  const iso = new Intl.DateTimeFormat('en-CA', {
    timeZone: CONFIG.TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(parsed);
  return Math.floor(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);
};

const daysBetween = (from: string, to: Date): number | null => {
  const start = calendarDay(from);
  const end = calendarDay(to.toISOString());
  if (start === null || end === null) return null;
  return end - start;
};

export const hasSendEvidence = (record: LeadRecord): boolean =>
  Boolean(
    text(record, LEAD_HEADERS.INITIAL_MESSAGE_ID) ||
      text(record, LEAD_HEADERS.FOLLOW_UP_1_MESSAGE_ID) ||
      text(record, LEAD_HEADERS.FOLLOW_UP_2_MESSAGE_ID)
  );

export const hasPendingAction = (record: LeadRecord): boolean =>
  Boolean(
    text(record, LEAD_HEADERS.PENDING_ACTION) ||
      text(record, LEAD_HEADERS.PENDING_ATTEMPT_ID) ||
      text(record, LEAD_HEADERS.PENDING_DRAFT_ID) ||
      text(record, LEAD_HEADERS.PENDING_RECIPIENT)
  );

/**
 * Which follow-up, if any, this row is eligible for on read. This mirrors the
 * spacing rules in CONFIG.FOLLOW_UP; it is display-only. The Apps Script
 * worker remains the sole authority on whether anything is actually sent.
 */
export function dueFollowUpAction(record: LeadRecord, now: Date): string {
  const status = text(record, LEAD_HEADERS.STATUS);
  if (!ACTIVE_OUTREACH_STATUSES.includes(status as StatusValue)) return '';
  if (isTrue(leadValue(record, LEAD_HEADERS.OPT_OUT))) return '';
  if (hasPendingAction(record)) return '';

  const initial = timestamp(record, LEAD_HEADERS.INITIAL_SENT_AT);
  const first = timestamp(record, LEAD_HEADERS.FOLLOW_UP_1_SENT_AT);
  const second = timestamp(record, LEAD_HEADERS.FOLLOW_UP_2_SENT_AT);
  if (!initial || second) return '';

  const sinceInitial = daysBetween(initial, now);
  if (sinceInitial === null) return '';

  if (!first) {
    return sinceInitial >= CONFIG.FOLLOW_UP.FIRST_AFTER_DAYS_FROM_INITIAL ? 'FOLLOW_UP_1' : '';
  }

  const sinceFirst = daysBetween(first, now);
  if (sinceFirst === null) return '';
  const spacedFromInitial = sinceInitial >= CONFIG.FOLLOW_UP.SECOND_AFTER_DAYS_FROM_INITIAL;
  const spacedFromFirst = sinceFirst >= CONFIG.FOLLOW_UP.SECOND_MIN_DAYS_AFTER_FIRST;
  return spacedFromInitial && spacedFromFirst ? 'FOLLOW_UP_2' : '';
}

const previewAction = (record: LeadRecord): string => {
  if (!text(record, LEAD_HEADERS.INITIAL_SENT_AT)) return 'INITIAL';
  if (!text(record, LEAD_HEADERS.FOLLOW_UP_1_SENT_AT)) return 'FOLLOW_UP_1';
  if (!text(record, LEAD_HEADERS.FOLLOW_UP_2_SENT_AT)) return 'FOLLOW_UP_2';
  return '';
};

export function toLead(record: LeadRecord, now: Date): Lead {
  return {
    id: text(record, LEAD_HEADERS.LEAD_ID) || `row-${record.rowNumber}`,
    rowNumber: record.rowNumber,
    company: text(record, LEAD_HEADERS.COMPANY),
    contactName: text(record, LEAD_HEADERS.CONTACT_NAME),
    email: normalizeEmail(leadValue(record, LEAD_HEADERS.EMAIL)),
    category: text(record, LEAD_HEADERS.CATEGORY),
    website: text(record, LEAD_HEADERS.WEBSITE),
    personalization: text(record, LEAD_HEADERS.PERSONALIZATION),
    status: text(record, LEAD_HEADERS.STATUS) || STATUS.NEW,
    initialSentAt: timestamp(record, LEAD_HEADERS.INITIAL_SENT_AT),
    followUp1SentAt: timestamp(record, LEAD_HEADERS.FOLLOW_UP_1_SENT_AT),
    followUp2SentAt: timestamp(record, LEAD_HEADERS.FOLLOW_UP_2_SENT_AT),
    replyStatus: text(record, LEAD_HEADERS.REPLY_STATUS),
    notes: text(record, LEAD_HEADERS.NOTES),
    optOut: isTrue(leadValue(record, LEAD_HEADERS.OPT_OUT)),
    lastError: text(record, LEAD_HEADERS.LAST_ERROR),
    updatedAt: timestamp(record, LEAD_HEADERS.UPDATED_AT),
    previewAction: previewAction(record),
    dueAction: dueFollowUpAction(record, now),
    hasSendEvidence: hasSendEvidence(record),
    hasPendingAction: hasPendingAction(record)
  };
}

export function summarize(leads: Lead[]) {
  const statusCounts: Record<string, number> = {};
  leads.forEach((lead) => {
    statusCounts[lead.status] = (statusCounts[lead.status] || 0) + 1;
  });

  return {
    statusCounts,
    metrics: {
      total: leads.length,
      approved: statusCounts[STATUS.APPROVED] || 0,
      approvedReady: leads.filter(
        (lead) =>
          lead.status === STATUS.APPROVED &&
          !lead.optOut &&
          !lead.hasPendingAction &&
          !lead.hasSendEvidence &&
          Boolean(lead.email) &&
          Boolean(lead.company)
      ).length,
      dueFollowUps: leads.filter((lead) => Boolean(lead.dueAction)).length,
      replied: statusCounts[STATUS.REPLIED] || 0,
      interested: statusCounts[STATUS.INTERESTED] || 0
    }
  };
}
