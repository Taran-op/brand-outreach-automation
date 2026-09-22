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
import { LEAD_HEADERS, REPLY_HEADERS, REPLY_TEXT_HEADER, RESPONSE_TYPE_LABELS } from './constants';
import { leadValue, SheetsError, type LeadRecord } from './sheets';
import { columnLetter } from './sheets-write';
import { normalizeEmail, safeDisplayText, safeSheetText, sanitizeUiMultilineText, truncate } from './text';

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';
const quoteSheet = (name: string) => `'${name.replace(/'/g, "''")}'`;
const TAB = () => CONFIG.SHEETS.REPLIES_NAME;

/**
 * A Sheets cell holds 50 000 characters. The detector already stops at 5 000
 * of unquoted text, which is far more than a brand's reply, so this is only a
 * backstop against a pathological message.
 */
const MAX_REPLY_TEXT = 5000;

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

/**
 * Creates the tab the first time a reply is recorded, and returns the column
 * order to write in — the tab's own, so a tab an earlier version created
 * keeps its rows and simply gains any column it is missing.
 */
async function ensureRepliesSheet(accessToken: string): Promise<string[]> {
  const meta = await api<{ sheets?: { properties?: { title?: string; sheetId?: number } }[] }>(
    '?fields=sheets.properties(title,sheetId)',
    { method: 'GET' },
    accessToken
  );
  if ((meta.sheets || []).some((sheet) => sheet.properties?.title === TAB())) {
    return reconcileHeaders(accessToken);
  }

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

  await writeHeaderRow(accessToken, [...REPLY_HEADERS]);

  const sheetId = created.replies?.[0]?.addSheet?.properties?.sheetId;
  if (sheetId === undefined) return [...REPLY_HEADERS];
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
  return [...REPLY_HEADERS];
}

/**
 * The existing tab's header row, extended with any column this version adds.
 * Extending rather than rewriting keeps every row already recorded readable,
 * and keeps a column an operator added by hand.
 */
async function reconcileHeaders(accessToken: string): Promise<string[]> {
  const body = await api<{ values?: unknown[][] }>(
    `/values/${encodeURIComponent(`${quoteSheet(TAB())}!1:1`)}`,
    { method: 'GET' },
    accessToken
  );
  const current = (body.values?.[0] || []).map((cell) => safeDisplayText(cell));
  if (!current.some(Boolean)) {
    await writeHeaderRow(accessToken, [...REPLY_HEADERS]);
    return [...REPLY_HEADERS];
  }

  const missing = REPLY_HEADERS.filter((header) => !current.includes(header));
  if (!missing.length) return current;

  const extended = [...current, ...missing];
  await writeHeaderRow(accessToken, extended);
  return extended;
}

async function writeHeaderRow(accessToken: string, headers: string[]): Promise<void> {
  await api(
    `/values/${encodeURIComponent(`${quoteSheet(TAB())}!A1`)}?valueInputOption=RAW`,
    { method: 'PUT', body: JSON.stringify({ values: [headers] }) },
    accessToken
  );
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
  const empty: RecordedKeys = { messageIds: new Set(), leadIds: new Set() };
  try {
    const body = await api<{ values?: unknown[][] }>(
      `/values/${encodeURIComponent(`${quoteSheet(TAB())}!A1:${columnLetter(REPLY_HEADERS.length + 10)}`)}`,
      { method: 'GET' },
      accessToken
    );
    const values = body.values || [];
    if (!values.length) return empty;

    const headers = values[0].map((cell) => safeDisplayText(cell));
    const leadColumn = headers.indexOf('Lead ID');
    const messageColumn = headers.indexOf('Message ID');

    const keys: RecordedKeys = { messageIds: new Set(), leadIds: new Set() };
    for (const row of values.slice(1)) {
      const leadId = leadColumn >= 0 ? safeDisplayText(row[leadColumn]) : '';
      const messageId = messageColumn >= 0 ? safeDisplayText(row[messageColumn]) : '';
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
  replyNumber: number;
  subject: string;
  text: string;
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

/**
 * The reply as the tab's columns want it. The reply text keeps its line
 * breaks — it is what a person came here to read — while every other field
 * is flattened to a single line.
 */
const replyFields = (entry: ReplyRecord): Record<string, unknown> => ({
  'Replied At': entry.repliedAt.toISOString(),
  Company: safeSheetText(safeDisplayText(entry.company)),
  'Contact Name': safeSheetText(safeDisplayText(entry.contactName)),
  'Replied From': safeSheetText(normalizeEmail(entry.repliedFrom)),
  'Lead Email': safeSheetText(normalizeEmail(entry.leadEmail)),
  Category: safeSheetText(safeDisplayText(entry.category)),
  Website: safeSheetText(safeDisplayText(entry.website)),
  'Response Type': RESPONSE_TYPE_LABELS[entry.responseType] || safeDisplayText(entry.responseType),
  'Reply #': entry.replyNumber || '',
  Subject: safeSheetText(truncate(safeDisplayText(entry.subject), 300)),
  [REPLY_TEXT_HEADER]: safeSheetText(truncate(sanitizeUiMultilineText(entry.text, MAX_REPLY_TEXT), MAX_REPLY_TEXT)),
  'Initial Sent At': safeDisplayText(entry.initialSentAt),
  'Days To Reply': dayGap(entry.initialSentAt, entry.repliedAt),
  'Lead Status': safeDisplayText(entry.leadStatus),
  Thread: entry.threadId ? `https://mail.google.com/mail/u/0/#all/${encodeURIComponent(entry.threadId)}` : '',
  'Lead ID': safeSheetText(safeDisplayText(entry.leadId)),
  'Message ID': safeSheetText(safeDisplayText(entry.messageId))
});

const replyRow = (entry: ReplyRecord, headers: string[]): unknown[] => {
  const fields = replyFields(entry);
  return headers.map((header) => (header in fields ? fields[header] : ''));
};

/**
 * Appends reply rows in one request. A failure here is reported to the
 * caller rather than swallowed: unlike an audit line, a missing reply row is
 * the whole point of the feature, and the operator should know it is absent.
 */
export async function appendReplyRows(accessToken: string, entries: ReplyRecord[]): Promise<number> {
  if (!entries.length) return 0;
  const headers = await ensureRepliesSheet(accessToken);
  await api(
    `/values/${encodeURIComponent(`${quoteSheet(TAB())}!A1`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    { method: 'POST', body: JSON.stringify({ values: entries.map((entry) => replyRow(entry, headers)) }) },
    accessToken
  );
  return entries.length;
}

/**
 * Removes rows an earlier version wrote from the lead history alone: a
 * company, a date and a response type, but not a word of what the brand
 * actually said. Worse than useless, because such a row holds the real
 * message's key and so keeps the real message out of the report. Deleting
 * them lets the scan re-read those threads and record what was written.
 */
export async function purgePlaceholderRows(accessToken: string, prefix: string): Promise<number> {
  let values: unknown[][];
  let sheetId: number | undefined;
  try {
    const body = await api<{ values?: unknown[][] }>(
      `/values/${encodeURIComponent(`${quoteSheet(TAB())}!A1:${columnLetter(REPLY_HEADERS.length + 10)}`)}`,
      { method: 'GET' },
      accessToken
    );
    values = body.values || [];
    if (values.length < 2) return 0;

    const meta = await api<{ sheets?: { properties?: { title?: string; sheetId?: number } }[] }>(
      '?fields=sheets.properties(title,sheetId)',
      { method: 'GET' },
      accessToken
    );
    sheetId = (meta.sheets || []).find((sheet) => sheet.properties?.title === TAB())?.properties?.sheetId;
  } catch (error) {
    if (error instanceof SheetsError && (error.status === 400 || error.status === 404)) return 0;
    throw error;
  }
  if (sheetId === undefined) return 0;

  const headers = values[0].map((cell) => safeDisplayText(cell));
  // The column was called Reply Snippet before it held the whole message.
  const textColumn = [REPLY_TEXT_HEADER, 'Reply Snippet'].map((name) => headers.indexOf(name)).find((index) => index >= 0);
  if (textColumn === undefined || textColumn < 0) return 0;

  const rowNumbers: number[] = [];
  values.slice(1).forEach((row, index) => {
    if (safeDisplayText(row[textColumn]).startsWith(prefix)) rowNumbers.push(index + 2);
  });
  if (!rowNumbers.length) return 0;

  // Highest first, so each earlier index is still valid when its turn comes.
  await api(
    ':batchUpdate',
    {
      method: 'POST',
      body: JSON.stringify({
        requests: rowNumbers
          .sort((a, b) => b - a)
          .map((row) => ({
            deleteDimension: { range: { sheetId, dimension: 'ROWS', startIndex: row - 1, endIndex: row } }
          }))
      })
    },
    accessToken
  );
  return rowNumbers.length;
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
    text: string;
    replyNumber?: number;
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
    replyNumber: detected.replyNumber || 0,
    subject: detected.subject,
    text: detected.text,
    initialSentAt: value(LEAD_HEADERS.INITIAL_SENT_AT),
    leadStatus,
    threadId: detected.threadId,
    leadId: value(LEAD_HEADERS.LEAD_ID),
    messageId: detected.messageId
  };
}
