/**
 * Port of the import pipeline from src/10_WebApp.gs.
 *
 * The client parses a workbook locally and posts cell values; nothing here
 * trusts a client-supplied column mapping. The layout is detected server-side
 * and every limit is re-checked, because these rows become lead records that
 * later gate real email.
 */

import { CONFIG } from './config';
import { CATEGORY_VALUES, LEAD_HEADERS, STATUS } from './constants';
import { leadValue, type LeadRecord } from './sheets';
import {
  isValidSingleEmail,
  normalizeEmail,
  safeDisplayText,
  safeSheetText,
  sanitizeUiMultilineText,
  sanitizeUiText,
  truncate
} from './text';

const IMPORT_HEADER_ALIASES: Record<string, string[]> = {
  company: ['company', 'companyname', 'brand', 'brandname'],
  contactName: ['contactname', 'contactperson', 'contactpersonname', 'recipientname'],
  email: ['email', 'emailaddress', 'workemail', 'businessemail', 'contactemail'],
  category: ['category', 'brandcategory', 'productcategory', 'segment', 'industry'],
  website: ['website', 'websiteurl', 'companywebsite', 'brandwebsite', 'url', 'site'],
  personalization: ['personalization', 'personalisation', 'customline', 'openingline'],
  notes: ['notes', 'note', 'remarks', 'details', 'description', 'productnotes', 'focus'],
  contact: [
    'contact',
    'contactinfo',
    'contactdetails',
    'contactmethod',
    'contactleadsource',
    'leadsource',
    'outreachmethod'
  ],
  india: ['india', 'indiapresence', 'indiaavailability', 'availableinindia', 'availabilityinindia']
};

type ImportMap = Record<string, number>;
type ImportLayout = { map: ImportMap; headerRows: number; kind: 'HEADER' | 'RESEARCH_LIST' | 'BASIC' };

const normalizeImportHeader = (value: unknown): string =>
  safeDisplayText(value).toLowerCase().replace(/[^a-z0-9]+/g, '');

const findImportColumn = (headers: string[], aliases: string[]): number => {
  for (const alias of aliases) {
    const index = headers.indexOf(alias);
    if (index !== -1) return index;
  }
  return -1;
};

export function detectImportLayout(rows: unknown[][]): ImportLayout {
  const firstRow = rows.length ? rows[0] : [];
  const headers = firstRow.map(normalizeImportHeader);

  const map: ImportMap = {};
  Object.keys(IMPORT_HEADER_ALIASES).forEach((key) => {
    map[key] = findImportColumn(headers, IMPORT_HEADER_ALIASES[key]);
  });

  const recognized = Object.keys(map).filter((key) => map[key] >= 0).length;
  if (recognized >= 2 || map.email >= 0) return { map, headerRows: 1, kind: 'HEADER' };

  // The common research-list shape: #, Category, Company, Website,
  // Contact/Lead source, India, Notes — with no header row at all.
  if (
    firstRow.length >= 7 &&
    /^\d+$/.test(safeDisplayText(firstRow[0])) &&
    /\.[a-z]{2,}(?:\/|$)/i.test(safeDisplayText(firstRow[3]))
  ) {
    return {
      map: {
        company: 2,
        contactName: -1,
        email: -1,
        category: 1,
        website: 3,
        personalization: -1,
        notes: 6,
        contact: 4,
        india: 5
      },
      headerRows: 0,
      kind: 'RESEARCH_LIST'
    };
  }

  return {
    map: {
      company: 0,
      contactName: -1,
      email: 1,
      category: 2,
      website: -1,
      personalization: -1,
      notes: -1,
      contact: -1,
      india: -1
    },
    headerRows: 0,
    kind: 'BASIC'
  };
}

export function extractImportEmail(value: unknown): string {
  const candidates = String(value ?? '').match(/[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,63}/gi) || [];
  for (const candidate of candidates) {
    const email = normalizeEmail(candidate);
    if (isValidSingleEmail(email)) return email;
  }
  return '';
}

export function normalizeImportWebsite(value: unknown): string {
  const website = sanitizeUiText(value, 500);
  if (!website) return '';
  if (/^https?:\/\/[^\s]+$/i.test(website)) return website;
  if (/^(?:www\.)?[a-z0-9][a-z0-9.\-]*\.[a-z]{2,}(?:\/[^\s]*)?$/i.test(website)) return `https://${website}`;
  // Anything else is free text or an unsafe scheme; drop it rather than guess.
  return '';
}

export function canonicalizeImportedCategory(value: unknown): string {
  const original = safeDisplayText(value);
  const exact = CATEGORY_VALUES.find((category) => category.toLowerCase() === original.toLowerCase());
  if (exact) return exact;

  const text = original.toLowerCase();
  if (/creator|streamer|entertainment|comic|anime|media|music/.test(text)) return 'Creator / Entertainment';
  if (/communit/.test(text)) return 'Gaming Community';
  if (/mouse|mice|mousepad|deskmat|keyboard|chair|desk|controller|gaming access|peripheral/.test(text)) {
    return 'Gaming Accessories';
  }
  if (/\bpc\b|hardware|processor|graphics|gpu|motherboard|memory|storage/.test(text)) return 'PC Hardware';
  if (/laptop|notebook/.test(text)) return 'Laptops';
  if (/smartphone|mobile phone/.test(text)) return 'Smartphones';
  if (/audio|headphone|headset|speaker|microphone/.test(text)) return 'Audio';
  if (/consumer electronic/.test(text)) return 'Consumer Electronics';
  if (/saas|\bai\b|artificial intelligence|software/.test(text)) return 'SaaS / AI';
  if (/telecom|internet|\bisp\b/.test(text)) return 'Telecom / Internet';
  if (/startup|technology|\btech\b/.test(text)) return 'Technology Startup';
  if (/beverage|drink/.test(text)) return 'Beverage';
  if (/food|fmcg|snack|nutrition/.test(text)) return 'Food / FMCG';
  if (/fashion|streetwear|lifestyle|apparel|beauty/.test(text)) return 'Fashion / Streetwear';
  if (/automotive|automobile|mobility|vehicle|motorcycle|\bev\b/.test(text)) return 'Automotive';
  if (/education|edtech|learning|career|upskill/.test(text)) return 'Education / EdTech';
  return original ? 'Other' : '';
}

export function importDuplicateKey(company: unknown, email: unknown, website: unknown): string {
  if (email) return `EMAIL:${normalizeEmail(email)}`;
  const normalizedCompany = safeDisplayText(company).toLowerCase();
  if (!normalizedCompany) return '';
  return `RESEARCH:${normalizedCompany}|${safeDisplayText(website).toLowerCase()}`;
}

export function buildImportedNotes(
  rawCategory: string,
  category: string,
  rawWebsite: unknown,
  website: string,
  rawEmail: unknown,
  contact: unknown,
  india: unknown,
  sourceNotes: unknown
): string {
  const parts: string[] = [];
  if (rawCategory && category && rawCategory.toLowerCase() !== category.toLowerCase()) {
    parts.push(`Source category: ${rawCategory}`);
  }
  const rawContact = safeDisplayText(contact || rawEmail);
  if (rawContact && rawContact.toLowerCase() !== extractImportEmail(rawContact)) {
    parts.push(`Contact: ${rawContact}`);
  }
  if (safeDisplayText(india)) parts.push(`India availability: ${safeDisplayText(india)}`);
  if (safeDisplayText(rawWebsite) && !website) parts.push(`Website: ${safeDisplayText(rawWebsite)}`);
  if (String(sourceNotes ?? '').trim()) parts.push(String(sourceNotes).trim());
  return sanitizeUiMultilineText(parts.join('\n'), 2000);
}

export type WorkbookPayload = { fileName: string; sheetName: string; rows: unknown[][] };

export function validateWorkbookImportPayload(payload: unknown): WorkbookPayload {
  const input = payload as Partial<WorkbookPayload> | null;
  if (!input || typeof input !== 'object') throw new Error('Choose an .xlsx file first.');

  const fileName = sanitizeUiText(input.fileName, 180);
  const sheetName = sanitizeUiText(input.sheetName, 120);
  if (!/\.xlsx$/i.test(fileName)) throw new Error('Only .xlsx files are accepted.');
  if (!sheetName) throw new Error('Choose a worksheet to import.');
  if (!Array.isArray(input.rows) || input.rows.length === 0) throw new Error('The selected worksheet is empty.');
  if (input.rows.length > CONFIG.UI.MAX_IMPORT_ROWS + 1) {
    throw new Error(`Import exceeds the configured row limit of ${CONFIG.UI.MAX_IMPORT_ROWS}.`);
  }

  let characterCount = 0;
  const rows = input.rows.map((row, rowIndex) => {
    if (!Array.isArray(row)) throw new Error(`Workbook row ${rowIndex + 1} is invalid.`);
    if (row.length > CONFIG.UI.MAX_IMPORT_COLUMNS) {
      throw new Error(`Workbook row ${rowIndex + 1} exceeds the configured column limit.`);
    }
    return row.map((cell) => {
      if (cell !== null && !['string', 'number', 'boolean'].includes(typeof cell)) {
        throw new Error('Workbook contains an unsupported cell value.');
      }
      const value = cell === null ? '' : String(cell);
      characterCount += value.length;
      return truncate(value, 4000);
    });
  });

  if (characterCount > CONFIG.UI.MAX_IMPORT_CHARACTERS) {
    throw new Error('The selected worksheet contains too much text to import safely.');
  }
  return { fileName, sheetName, rows };
}

/** Minimal CSV reader for the paste path, matching Utilities.parseCsv closely enough. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export type ImportOutcome = {
  rows: unknown[][];
  imported: number;
  withoutEmail: number;
  skipped: { row: number; value: string; reason: string }[];
};

/**
 * Maps parsed cells onto sheet rows. Returns the rows to append rather than
 * writing them, so the caller owns the single write and the audit line.
 */
export function buildImportRows(
  parsed: unknown[][],
  existing: LeadRecord[],
  columnCount: number,
  headerMap: Record<string, number>,
  newId: () => string
): ImportOutcome {
  if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('The import contains no rows.');
  if (parsed.length > CONFIG.UI.MAX_IMPORT_ROWS + 1) {
    throw new Error(`Import exceeds the configured row limit of ${CONFIG.UI.MAX_IMPORT_ROWS}.`);
  }

  const seen: Record<string, boolean> = {};
  existing.forEach((record) => {
    const key = importDuplicateKey(
      safeDisplayText(leadValue(record, LEAD_HEADERS.COMPANY)),
      normalizeEmail(leadValue(record, LEAD_HEADERS.EMAIL)),
      safeDisplayText(leadValue(record, LEAD_HEADERS.WEBSITE))
    );
    if (key) seen[key] = true;
  });

  const layout = detectImportLayout(parsed);
  const sourceRows = parsed.slice(layout.headerRows);
  const output: unknown[][] = [];
  const skipped: ImportOutcome['skipped'] = [];
  let withoutEmail = 0;

  sourceRows.forEach((row, index) => {
    if (!Array.isArray(row) || !row.some((value) => safeDisplayText(value))) return;

    const valueAt = (key: string): unknown => {
      const column = layout.map[key];
      return column >= 0 && column < row.length ? row[column] : '';
    };

    const oneColumn = layout.kind === 'BASIC' && row.length === 1;
    const rawEmail = oneColumn ? row[0] : valueAt('email');
    const contact = valueAt('contact');
    const company = oneColumn ? '' : sanitizeUiText(valueAt('company'), 200);
    const email = extractImportEmail(rawEmail) || extractImportEmail(contact);
    const rawWebsite = valueAt('website');
    const website = normalizeImportWebsite(rawWebsite);
    const rawCategory = sanitizeUiText(valueAt('category'), 160);
    const category = canonicalizeImportedCategory(rawCategory);
    const sourceRowNumber = index + layout.headerRows + 1;

    if (!company && !email) {
      skipped.push({
        row: sourceRowNumber,
        value: truncate(safeDisplayText(rawEmail || contact), 120),
        reason: 'Missing company and valid email'
      });
      return;
    }

    const duplicateKey = importDuplicateKey(company, email, website);
    if (duplicateKey && seen[duplicateKey]) {
      skipped.push({
        row: sourceRowNumber,
        value: email || company,
        reason: email ? 'Duplicate email' : 'Duplicate company/website'
      });
      return;
    }
    if (duplicateKey) seen[duplicateKey] = true;
    if (!email) withoutEmail += 1;

    const notes = buildImportedNotes(
      rawCategory,
      category,
      rawWebsite,
      website,
      rawEmail,
      contact,
      valueAt('india'),
      valueAt('notes')
    );

    const values = new Array(columnCount).fill('');
    const set = (header: string, value: unknown) => {
      const column = headerMap[header];
      if (column) values[column - 1] = value;
    };

    set(LEAD_HEADERS.COMPANY, safeSheetText(company));
    set(LEAD_HEADERS.CONTACT_NAME, safeSheetText(sanitizeUiText(valueAt('contactName'), 160)));
    set(LEAD_HEADERS.EMAIL, email);
    set(LEAD_HEADERS.NORMALIZED_EMAIL, email);
    set(LEAD_HEADERS.CATEGORY, safeSheetText(category));
    set(LEAD_HEADERS.WEBSITE, safeSheetText(website));
    set(LEAD_HEADERS.PERSONALIZATION, safeSheetText(sanitizeUiMultilineText(valueAt('personalization'), 1200)));
    set(LEAD_HEADERS.NOTES, safeSheetText(notes));
    set(LEAD_HEADERS.STATUS, STATUS.NEW);
    set(LEAD_HEADERS.OPT_OUT, false);
    set(LEAD_HEADERS.LEAD_ID, newId());
    set(LEAD_HEADERS.UPDATED_AT, new Date().toISOString());

    output.push(values);
  });

  return { rows: output, imported: output.length, withoutEmail, skipped: skipped.slice(0, 100) };
}
