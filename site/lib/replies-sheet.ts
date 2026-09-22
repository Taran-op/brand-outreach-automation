/**
 * The Replies tab.
 *
 * Every brand that answers gets a row here: who they are, when they replied,
 * what they said and a link to the thread. It is written by the reply scan
 * and read by nothing that decides what to send — the Leads tab remains the
 * source of truth, so a hand-edit here can never cause or suppress an email.
 *
 * The tab is created on first use, and a row is written once: the message id
 * is the key, so re-scanning a thread does not duplicate it.
 */

import { CONFIG, spreadsheetId } from './config';
import { LEAD_HEADERS, REPLY_HEADERS, RESPONSE_TYPE_LABELS } from './constants';
import { leadValue, SheetsError, type LeadRecord } from './sheets';
import { columnLetter } from './sheets-write';
import { normalizeEmail, safeDisplayText, safeSheetText, truncate } from './text';

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';
const quoteSheet = (name: string) => `'${name.replace(/'/g, "''")}'`;
const TAB = () => CONFIG.SHEETS.REPLIES_NAME;

/** The reply text kept for the report; the full message stays in the mailbox. */
const MAX_SNIPPET = 900;

async function api<T>(path: string, init: RequestInit, accessToken: string): Promise<T> {
  const response = await fetch(`${SHEETS_API}/${encodeURIComponent(spreadsheetId())}${path}`, {
    ...init,
    headers: {
      ...(init.headers || {}),
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    cache: 'no-store'
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    let message = safeDisplayText(detail).slice(0, 300);
    try {
      message = safeDisplayText((JSON.parse(detail) as { error?: { message?: string } }).error?.message) || message;
    } catch {
      // Keep the raw text.
    }
    throw new SheetsError(`Replies tab access failed (${response.status}): ${message}`, response.status);
  }
  return (await response.json()) as T;
}

/** Creates the tab with its header row the first time a reply is recorded. */
async function ensureRepliesSheet(accessToken: string): Promise<void> {
  const meta = await api<{ sheets?: { properties?: { title?: string; sheetId?: number } }[] }>(
    '?fields=sheets.properties(title,sheetId)',
    { method: 'GET' },
    accessToken
  );
  if ((meta.sheets || []).some((sheet) => sheet.properties?.title === TAB())) return;

  const created = await api<{ replies?: { addSheet?: { properties?: { sheetId?: number } } }[] }>(
    ':batchUpdate',
    {
      method: 'POST',
      body: JSON.stringify({
        requests: [
          {
            addSheet: {
              properties: {
                title: TAB(),
                gridProperties: { frozenRowCount: 1, columnCount: REPLY_HEADERS.length }
              }
            }
          }
        ]
      })
    },
    accessToken
  );

  await api(
    `/values/${encodeURIComponent(`${quoteSheet(TAB())}!A1`)}?valueInputOption=RAW`,
    { method: 'PUT', body: JSON.stringify({ values: [[...REPLY_HEADERS]] }) },
    accessToken
  );

  const sheetId = created.replies?.[0]?.addSheet?.properties?.sheetId;
  if (sheetId === undefined) return;
  // Cosmetic only, and never worth failing a reply record over.
  try {
    await api(
      ':batchUpdate',
      {
        method: 'POST',
        body: JSON.stringify({
          requests: [
            {
              repeatCell: {
                range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
                cell: { userEnteredFormat: { textFormat: { bold: true } } },
                fields: 'userEnteredFormat.textFormat.bold'
              }
            },
            {
              updateDimensionProperties: {
                range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: REPLY_HEADERS.length },
                properties: { pixelSize: 170 },
                fields: 'pixelSize'
              }
            }
          ]
        })
      },
      accessToken
    );
  } catch {
    // Formatting is decoration; the data is what matters.
  }
}

export type RecordedKeys = {
  /** One row per message: a thread scanned twice is recorded once. */
  messageIds: Set<string>;
  /** Which leads appear at all, so a backfill cannot duplicate a live record. */
  leadIds: Set<string>;
};

/**
 * What the tab already holds. A missing tab simply means nothing has been
 * recorded yet.
 */
export async function recordedReplyKeys(accessToken: string): Promise<RecordedKeys> {
  const first = columnLetter(REPLY_HEADERS.indexOf('Lead ID') + 1);
  const last = columnLetter(REPLY_HEADERS.indexOf('Message ID') + 1);
  const empty: RecordedKeys = { messageIds: new Set(), leadIds: new Set() };
  try {
    const body = await api<{ values?: unknown[][] }>(
      `/values/${encodeURIComponent(`${quoteSheet(TAB())}!${first}2:${last}`)}`,
      { method: 'GET' },
      accessToken
    );
    const keys: RecordedKeys = { messageIds: new Set(), leadIds: new Set() };
    for (const row of body.values || []) {
      const leadId = safeDisplayText(row[0]);
      const messageId = safeDisplayText(row[1]);
      if (leadId) keys.leadIds.add(leadId);
      if (messageId) keys.messageIds.add(messageId);
    }
    return keys;
  } catch (error) {
    if (error instanceof SheetsError && (error.status === 400 || error.status === 404)) return empty;
    throw error;
  }
}

export type ReplyRecord = {
  repliedAt: Date;
  company: string;
  contactName: string;
  repliedFrom: string;
  leadEmail: string;
  category: string;
  website: string;
  responseType: string;
  subject: string;
  snippet: string;
  initialSentAt: string;
  leadStatus: string;
  threadId: string;
  leadId: string;
  messageId: string;
};

const dayGap = (from: string, to: Date): string => {
  const start = Date.parse(safeDisplayText(from));
  if (!Number.isFinite(start)) return '';
  const days = Math.round((to.getTime() - start) / 86_400_000);
  return days >= 0 ? String(days) : '';
};

const replyRow = (entry: ReplyRecord): unknown[] => [
  entry.repliedAt.toISOString(),
  safeSheetText(safeDisplayText(entry.company)),
  safeSheetText(safeDisplayText(entry.contactName)),
  safeSheetText(normalizeEmail(entry.repliedFrom)),
  safeSheetText(normalizeEmail(entry.leadEmail)),
  safeSheetText(safeDisplayText(entry.category)),
  safeSheetText(safeDisplayText(entry.website)),
  RESPONSE_TYPE_LABELS[entry.responseType] || safeDisplayText(entry.responseType),
  safeSheetText(truncate(safeDisplayText(entry.subject), 300)),
  safeSheetText(truncate(safeDisplayText(entry.snippet), MAX_SNIPPET)),
  safeDisplayText(entry.initialSentAt),
  dayGap(entry.initialSentAt, entry.repliedAt),
  safeDisplayText(entry.leadStatus),
  entry.threadId ? `https://mail.google.com/mail/u/0/#all/${encodeURIComponent(entry.threadId)}` : '',
  safeSheetText(safeDisplayText(entry.leadId)),
  safeSheetText(safeDisplayText(entry.messageId))
];

/**
 * Appends reply rows in one request. A failure here is reported to the
 * caller rather than swallowed: unlike an audit line, a missing reply row is
 * the whole point of the feature, and the operator should know it is absent.
 */
export async function appendReplyRows(accessToken: string, entries: ReplyRecord[]): Promise<number> {
  if (!entries.length) return 0;
  await ensureRepliesSheet(accessToken);
  await api(
    `/values/${encodeURIComponent(`${quoteSheet(TAB())}!A1`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    { method: 'POST', body: JSON.stringify({ values: entries.map(replyRow) }) },
    accessToken
  );
  return entries.length;
}

/** Everything recorded so far, newest first, for the console and the export. */
export async function getReplyRows(
  accessToken: string,
  limit = 500
): Promise<{ headers: string[]; rows: string[][] }> {
  const lastColumn = columnLetter(REPLY_HEADERS.length);
  try {
    const body = await api<{ values?: unknown[][] }>(
      `/values/${encodeURIComponent(`${quoteSheet(TAB())}!A1:${lastColumn}5000`)}`,
      { method: 'GET' },
      accessToken
    );
    const values = body.values || [];
    if (!values.length) return { headers: [...REPLY_HEADERS], rows: [] };

    const headers = values[0].map((cell) => safeDisplayText(cell));
    const rows = values
      .slice(1)
      .filter((row) => row.some((cell) => safeDisplayText(cell)))
      .map((row) => Array.from({ length: headers.length }, (_, index) => String(row[index] ?? '')));
    rows.reverse(); // Newest first: the tab itself stays chronological.
    return { headers, rows: rows.slice(0, limit) };
  } catch (error) {
    if (error instanceof SheetsError && (error.status === 400 || error.status === 404)) {
      return { headers: [...REPLY_HEADERS], rows: [] };
    }
    throw error;
  }
}

/** Builds a row from the lead and what was detected in its thread. */
export function buildReplyRecord(
  record: LeadRecord,
  detected: {
    type: string;
    from: string;
    receivedAt: Date;
    subject: string;
    snippet: string;
    threadId: string;
    messageId: string;
  },
  leadStatus: string
): ReplyRecord {
  const value = (header: string) => safeDisplayText(leadValue(record, header));
  return {
    repliedAt: detected.receivedAt,
    company: value(LEAD_HEADERS.COMPANY),
    contactName: value(LEAD_HEADERS.CONTACT_NAME),
    repliedFrom: detected.from,
    leadEmail: value(LEAD_HEADERS.EMAIL),
    category: value(LEAD_HEADERS.CATEGORY),
    website: value(LEAD_HEADERS.WEBSITE),
    responseType: detected.type,
    subject: detected.subject,
    snippet: detected.snippet,
    initialSentAt: value(LEAD_HEADERS.INITIAL_SENT_AT),
    leadStatus,
    threadId: detected.threadId,
    leadId: value(LEAD_HEADERS.LEAD_ID),
    messageId: detected.messageId
  };
}
