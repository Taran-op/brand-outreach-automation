/**
 * Google Sheets adapter.
 *
 * The Sheet stays the source of truth and the approval ledger, exactly as in
 * ARCHITECTURE.md. Requests are made with the signed-in operator's own OAuth
 * token, which mirrors the Apps Script model where every action ran as the
 * owner — there is no service account and no second copy of the data.
 */

import { CONFIG, spreadsheetId } from './config';
import { LEAD_HEADERS } from './constants';
import { safeDisplayText } from './text';

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';

export type LeadRecord = {
  rowNumber: number;
  values: unknown[];
  headerMap: Record<string, number>;
};

export class SheetsError extends Error {
  readonly status: number;
  /** True when the tab itself is absent, which Google reports as a 400. */
  readonly missingRange: boolean;
  constructor(message: string, status: number, missingRange = false) {
    super(message);
    this.name = 'SheetsError';
    this.status = status;
    this.missingRange = missingRange;
  }
}

const quoteRange = (sheetName: string, span: string) => `'${sheetName.replace(/'/g, "''")}'!${span}`;

async function readValues(accessToken: string, range: string): Promise<unknown[][]> {
  const url =
    `${SHEETS_API}/${encodeURIComponent(spreadsheetId())}/values/${encodeURIComponent(range)}` +
    '?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING';

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store'
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    let googleMessage = '';
    let googleReason = '';
    try {
      const parsed = JSON.parse(detail) as {
        error?: { message?: string; details?: { reason?: string }[] };
      };
      googleMessage = safeDisplayText(parsed.error?.message);
      googleReason = String(parsed.error?.details?.find((item) => item.reason)?.reason || '');
    } catch {
      googleMessage = safeDisplayText(detail).slice(0, 300);
    }

    // A disabled API and a permission problem are both 403 but need opposite fixes,
    // so never collapse them into one "try signing in again".
    if (googleReason === 'SERVICE_DISABLED' || /has not been used in project/i.test(googleMessage)) {
      throw new SheetsError(
        'The Google Sheets API is not enabled in this Cloud project. Enable it, wait a minute, then reload. ' +
          `Google said: ${googleMessage}`,
        403
      );
    }
    if (response.status === 403) {
      throw new SheetsError(
        `Google denied access to the spreadsheet. Check the signed-in account can open it. Google said: ${googleMessage}`,
        403
      );
    }
    if (response.status === 401) {
      throw new SheetsError('Google access expired. Sign out and back in to refresh it.', 401);
    }
    // Sheets reports an absent tab as 400 "Unable to parse range", not 404.
    if (response.status === 400 && /unable to parse range/i.test(googleMessage)) {
      throw new SheetsError(`No tab matched ${range} in this spreadsheet.`, 400, true);
    }
    if (response.status === 404) {
      throw new SheetsError(
        `No spreadsheet matched SHEET_ID. Google said: ${googleMessage}`,
        404,
        true
      );
    }
    throw new SheetsError(`Sheets API error ${response.status}: ${googleMessage}`, response.status);
  }

  const body = (await response.json()) as { values?: unknown[][] };
  return body.values ?? [];
}

const buildHeaderMap = (headerRow: unknown[]): Record<string, number> => {
  const map: Record<string, number> = {};
  headerRow.forEach((header, index) => {
    const name = safeDisplayText(header);
    if (name && !(name in map)) map[name] = index + 1;
  });
  return map;
};

export const leadValue = (record: LeadRecord, header: string): unknown => {
  const column = record.headerMap[header];
  if (!column) return '';
  return record.values[column - 1] ?? '';
};

export async function getLeadRows(accessToken: string): Promise<LeadRecord[]> {
  let rows: unknown[][];
  try {
    rows = await readValues(accessToken, quoteRange(CONFIG.SHEETS.LEADS_NAME, 'A1:AZ100000'));
  } catch (error) {
    // Unlike the log, the leads tab is not optional — say precisely what is wrong.
    if (error instanceof SheetsError && error.missingRange) {
      throw new SheetsError(
        `This spreadsheet has no "${CONFIG.SHEETS.LEADS_NAME}" tab. Check SHEET_ID points at the campaign sheet, or run setupSheet from Apps Script to create it.`,
        409
      );
    }
    throw error;
  }
  if (!rows.length) return [];

  const headerMap = buildHeaderMap(rows[0]);
  if (!headerMap[LEAD_HEADERS.EMAIL] || !headerMap[LEAD_HEADERS.STATUS]) {
    throw new SheetsError(
      `The "${CONFIG.SHEETS.LEADS_NAME}" tab is missing required headers. Run setupSheet from Apps Script first.`,
      409
    );
  }

  return rows.slice(1).reduce<LeadRecord[]>((records, values, index) => {
    const hasContent = values.some((value) => safeDisplayText(value));
    if (hasContent) records.push({ rowNumber: index + 2, values, headerMap });
    return records;
  }, []);
}

export type LogEntry = {
  timestamp: string;
  company: string;
  email: string;
  action: string;
  result: string;
  message: string;
};

export async function getLogEntries(accessToken: string, limit: number): Promise<LogEntry[]> {
  let rows: unknown[][];
  try {
    rows = await readValues(accessToken, quoteRange(CONFIG.SHEETS.LOG_NAME, 'A1:Z5000'));
  } catch (error) {
    // The activity log is a nicety; a missing tab must not take the dashboard down.
    if (error instanceof SheetsError && error.missingRange) return [];
    throw error;
  }
  if (rows.length < 2) return [];

  const headerMap = buildHeaderMap(rows[0]);
  const at = (values: unknown[], header: string) => {
    const column = headerMap[header];
    return column ? safeDisplayText(values[column - 1]) : '';
  };

  return rows
    .slice(1)
    .filter((values) => values.some((value) => safeDisplayText(value)))
    .slice(-limit)
    .reverse()
    .map((values) => ({
      timestamp: at(values, 'Timestamp'),
      company: at(values, 'Company'),
      email: at(values, 'Email'),
      action: at(values, 'Action'),
      result: at(values, 'Result'),
      // Apps Script names this column "Message/Error"; accept the short form too.
      message: at(values, 'Message/Error') || at(values, 'Message')
    }));
}
