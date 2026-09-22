/**
 * The Replies tab as a real workbook, so a reply list can go to someone who
 * does not have access to the Sheet. It is a snapshot for reading, not a
 * second source of truth: nothing reads it back.
 */

import writeXlsxFile from 'write-excel-file/node';

import { CONFIG } from './config';

/** Timestamps are stored as UTC and read by people working in IST. */
const IST_OFFSET_MINUTES = 5.5 * 60;
const DATE_COLUMNS = new Set(['Replied At', 'Initial Sent At']);

/** Wide enough for a company or an address; the snippet column gets more. */
const columnWidth = (header: string): number => {
  if (header === 'Reply Snippet') return 70;
  if (header === 'Subject' || header === 'Thread') return 40;
  if (header.endsWith('Email') || header === 'Replied From' || header === 'Website') return 30;
  return 20;
};

/**
 * A stored ISO timestamp as a real date cell, shifted so the wall-clock time
 * Excel shows is the IST one the operator recognises. Anything unparseable
 * stays as it was written rather than becoming a wrong date.
 */
const dateCell = (value: string) => {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return { value };
  return {
    value: new Date(parsed + IST_OFFSET_MINUTES * 60_000),
    type: Date,
    format: 'dd mmm yyyy hh:mm'
  };
};

export async function repliesWorkbook(headers: string[], rows: string[][]): Promise<Buffer> {
  const data = [
    headers.map((header) => ({
      value: DATE_COLUMNS.has(header) ? `${header} (IST)` : header,
      fontWeight: 'bold' as const,
      backgroundColor: '#eef2ff'
    })),
    ...rows.map((row) =>
      row.map((cell, index) => {
        const header = headers[index];
        if (DATE_COLUMNS.has(header) && cell) return dateCell(cell);
        if (header === 'Days To Reply' && /^\d+$/.test(cell)) return { value: Number(cell), type: Number };
        return { value: cell, wrap: header === 'Reply Snippet' };
      })
    )
  ];

  return writeXlsxFile(data, {
    buffer: true,
    sheet: CONFIG.SHEETS.REPLIES_NAME,
    stickyRowsCount: 1,
    columns: headers.map((header) => ({ width: columnWidth(header) }))
  });
}
