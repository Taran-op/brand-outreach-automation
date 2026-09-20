/**
 * Writes back to the campaign spreadsheet.
 *
 * Everything here targets cells by header name rather than a fixed column
 * index, because the Apps Script project and this console both write to the
 * same tab and a column inserted by hand must not silently shift one of them
 * onto the wrong field.
 */

import { CONFIG, spreadsheetId } from './config';
import { LEAD_HEADERS } from './constants';
import { SheetsError, type LeadRecord } from './sheets';
import { safeDisplayText, safeSheetText, truncate } from './text';

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';

/** 1-based column index to A1 letters: 1 -> A, 27 -> AA. */
export function columnLetter(index: number): string {
  let letters = '';
  let n = index;
  while (n > 0) {
    const remainder = (n - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

const quoteSheet = (name: string) => `'${name.replace(/'/g, "''")}'`;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Sheets allows 60 write requests per minute per user. Writes here are batched
 * so a run rarely approaches that, and a 429 that still slips through is
 * retried with backoff rather than stranding a run half-applied.
 */
async function sheetsRequest<T>(path: string, init: RequestInit, accessToken: string, attempt = 0): Promise<T> {
  const response = await fetch(`${SHEETS_API}/${encodeURIComponent(spreadsheetId())}${path}`, {
    ...init,
    headers: {
      ...(init.headers || {}),
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    cache: 'no-store'
  });

  if (response.status === 429 && attempt < 4) {
    await sleep(3000 * 2 ** attempt);
    return sheetsRequest<T>(path, init, accessToken, attempt + 1);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    let message = safeDisplayText(detail).slice(0, 300);
    try {
      message = safeDisplayText((JSON.parse(detail) as { error?: { message?: string } }).error?.message) || message;
    } catch {
      // Keep the raw text.
    }
    throw new SheetsError(`Sheets write failed (${response.status}): ${message}`, response.status);
  }

  return (await response.json()) as T;
}

export type CellUpdate = { header: string; value: string | number | boolean | null };

/**
 * Writes named fields of one lead row. Values are passed through
 * safeSheetText so an imported or operator-typed value beginning with =, +, -
 * or @ can never be stored as a live formula.
 */
export async function updateLeadCells(
  accessToken: string,
  record: LeadRecord,
  updates: CellUpdate[]
): Promise<void> {
  const data = updates
    .map(({ header, value }) => {
      const column = record.headerMap[header];
      if (!column) return null;
      const cell = `${quoteSheet(CONFIG.SHEETS.LEADS_NAME)}!${columnLetter(column)}${record.rowNumber}`;
      const stored = typeof value === 'string' ? safeSheetText(value) : value;
      return { range: cell, values: [[stored]] };
    })
    .filter((entry) => entry !== null);

  if (!data.length) return;

  await sheetsRequest(
    '/values:batchUpdate',
    { method: 'POST', body: JSON.stringify({ valueInputOption: 'RAW', data }) },
    accessToken
  );
}

export type RowUpdate = { record: LeadRecord; updates: CellUpdate[] };

/**
 * Writes fields on many rows in one request. This is the shape every bulk
 * operation must use: per-row writes at 44 rows blew straight through the
 * per-minute quota and left a run half-applied.
 */
export async function updateManyLeadCells(accessToken: string, rows: RowUpdate[]): Promise<void> {
  const data = rows.flatMap(({ record, updates }) =>
    updates
      .map(({ header, value }) => {
        const column = record.headerMap[header];
        if (!column) return null;
        const cell = `${quoteSheet(CONFIG.SHEETS.LEADS_NAME)}!${columnLetter(column)}${record.rowNumber}`;
        const stored = typeof value === 'string' ? safeSheetText(value) : value;
        return { range: cell, values: [[stored]] };
      })
      .filter((entry) => entry !== null)
  );
  if (!data.length) return;

  await sheetsRequest(
    '/values:batchUpdate',
    { method: 'POST', body: JSON.stringify({ valueInputOption: 'RAW', data }) },
    accessToken
  );
}

/** Appends lead rows built in the sheet's own column order. */
export async function appendLeadRows(accessToken: string, rows: unknown[][]): Promise<number> {
  if (!rows.length) return 0;
  const range = `${quoteSheet(CONFIG.SHEETS.LEADS_NAME)}!A1`;
  await sheetsRequest(
    `/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    { method: 'POST', body: JSON.stringify({ values: rows }) },
    accessToken
  );
  return rows.length;
}

export type LogInput = {
  company?: string;
  email?: string;
  action: string;
  result: string;
  message: string;
};

const logRow = (entry: LogInput): unknown[] => [
  new Date().toISOString(),
  safeSheetText(safeDisplayText(entry.company)),
  safeSheetText(safeDisplayText(entry.email)),
  safeDisplayText(entry.action),
  safeDisplayText(entry.result),
  safeSheetText(truncate(safeDisplayText(entry.message), CONFIG.SAFETY.MAX_LOG_MESSAGE_LENGTH))
];

/**
 * Appends audit lines in one request. Logging must never be the reason an
 * operation is reported as failed, so a missing log tab is swallowed here.
 */
export async function appendLogRows(accessToken: string, entries: LogInput[]): Promise<void> {
  if (!entries.length) return;
  const range = `${quoteSheet(CONFIG.SHEETS.LOG_NAME)}!A1`;
  try {
    await sheetsRequest(
      `/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      { method: 'POST', body: JSON.stringify({ values: entries.map(logRow) }) },
      accessToken
    );
  } catch {
    // The Outreach Log tab is optional; never fail the caller over an audit line.
  }
}

export const appendLogRow = (accessToken: string, entry: LogInput): Promise<void> =>
  appendLogRows(accessToken, [entry]);

/** Marks a row as touched, mirroring what the Apps Script edit helpers do. */
export const updatedAtCell = (): CellUpdate => ({
  header: LEAD_HEADERS.UPDATED_AT,
  value: new Date().toISOString()
});

/** Numeric id of the Leads tab, needed for structural (row) operations. */
async function leadsSheetId(accessToken: string): Promise<number> {
  const meta = await sheetsRequest<{ sheets?: { properties?: { sheetId?: number; title?: string } }[] }>(
    '?fields=sheets.properties(sheetId,title)',
    { method: 'GET' },
    accessToken
  );
  const match = (meta.sheets || []).find((sheet) => sheet.properties?.title === CONFIG.SHEETS.LEADS_NAME);
  if (match?.properties?.sheetId === undefined) {
    throw new SheetsError(`The "${CONFIG.SHEETS.LEADS_NAME}" tab could not be found for deletion.`, 409);
  }
  return match.properties.sheetId;
}

/**
 * Removes whole rows. Deletions are issued highest row first so that each
 * earlier index in the same batch is still valid when its turn comes.
 */
export async function deleteLeadRows(accessToken: string, rowNumbers: number[]): Promise<number> {
  const rows = [...new Set(rowNumbers.filter((n) => Number.isInteger(n) && n >= 2))].sort((a, b) => b - a);
  if (!rows.length) return 0;

  const sheetId = await leadsSheetId(accessToken);
  await sheetsRequest(
    ':batchUpdate',
    {
      method: 'POST',
      body: JSON.stringify({
        requests: rows.map((row) => ({
          deleteDimension: {
            range: { sheetId, dimension: 'ROWS', startIndex: row - 1, endIndex: row }
          }
        }))
      })
    },
    accessToken
  );
  return rows.length;
}
