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

async function sheetsRequest<T>(path: string, init: RequestInit, accessToken: string): Promise<T> {
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

/**
 * Appends one audit line. Logging must never be the reason an operation is
 * reported as failed, so a missing log tab is swallowed here.
 */
export async function appendLogRow(accessToken: string, entry: LogInput): Promise<void> {
  const range = `${quoteSheet(CONFIG.SHEETS.LOG_NAME)}!A1`;
  const row = [
    new Date().toISOString(),
    safeSheetText(safeDisplayText(entry.company)),
    safeSheetText(safeDisplayText(entry.email)),
    safeDisplayText(entry.action),
    safeDisplayText(entry.result),
    safeSheetText(truncate(safeDisplayText(entry.message), CONFIG.SAFETY.MAX_LOG_MESSAGE_LENGTH))
  ];

  try {
    await sheetsRequest(
      `/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      { method: 'POST', body: JSON.stringify({ values: [row] }) },
      accessToken
    );
  } catch {
    // The Outreach Log tab is optional; never fail the caller over an audit line.
  }
}

/** Marks a row as touched, mirroring what the Apps Script edit helpers do. */
export const updatedAtCell = (): CellUpdate => ({
  header: LEAD_HEADERS.UPDATED_AT,
  value: new Date().toISOString()
});
