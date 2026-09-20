/**
 * The unattended stages between discovery and sending, shared by the
 * one-button pipeline and the scheduled run so both behave identically.
 */

import {
  buildEmailCounts,
  buildInitialSafetyIndex,
  getInitialApprovalIssue,
  leadId
} from './approval';
import { LEAD_HEADERS, STATUS } from './constants';
import { discoverBrands } from './discover';
import { enrichCompany } from './enrich';
import { newLeadId } from './request';
import { getLeadRows, getLeadsTable, leadValue, type LeadRecord } from './sheets';
import { appendLeadRows, appendLogRow, updateManyLeadCells, type CellUpdate, type RowUpdate } from './sheets-write';
import { normalizeStatus } from './templates';
import {
  isValidSingleEmail,
  normalizeEmail,
  safeDisplayText,
  safeSheetText,
  sanitizeUiMultilineText
} from './text';

export const autoApproveEnabled = (): boolean => process.env.CONSOLE_AUTO_APPROVE === 'true';

const hostOf = (value: unknown): string => {
  try {
    return new URL(String(value || '')).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
};

export type DiscoverSummary = { added: number; queriesRun: number; rejected: number };

export async function runDiscovery(accessToken: string, maxQueries: number): Promise<DiscoverSummary> {
  const table = await getLeadsTable(accessToken);
  const knownHosts = new Set<string>();
  table.records.forEach((record) => {
    const host = hostOf(leadValue(record, LEAD_HEADERS.WEBSITE));
    if (host) knownHosts.add(host);
  });

  const { candidates, queriesRun, rejected } = await discoverBrands([], knownHosts, maxQueries);

  const rows = candidates.map((candidate) => {
    const values = new Array(table.columnCount).fill('');
    const set = (header: string, value: unknown) => {
      const column = table.headerMap[header];
      if (column) values[column - 1] = value;
    };
    set(LEAD_HEADERS.COMPANY, safeSheetText(candidate.company));
    set(LEAD_HEADERS.CATEGORY, safeSheetText(candidate.category));
    set(LEAD_HEADERS.WEBSITE, safeSheetText(candidate.website));
    set(
      LEAD_HEADERS.NOTES,
      safeSheetText(
        sanitizeUiMultilineText(
          `Discovered by search — verify this is a real, relevant brand before approving.\n${candidate.snippet}`,
          2000
        )
      )
    );
    set(LEAD_HEADERS.STATUS, STATUS.NEW);
    set(LEAD_HEADERS.OPT_OUT, false);
    set(LEAD_HEADERS.LEAD_ID, newLeadId());
    set(LEAD_HEADERS.UPDATED_AT, new Date().toISOString());
    return values;
  });

  await appendLeadRows(accessToken, rows);
  if (rows.length) {
    await appendLogRow(accessToken, {
      action: 'DISCOVER',
      result: 'SUCCESS',
      message: `${rows.length} candidate brand(s) added as NEW from ${queriesRun} search(es); ${rejected} result(s) rejected.`
    });
  }
  return { added: rows.length, queriesRun, rejected };
}

const needsResearch = (record: LeadRecord): boolean =>
  normalizeStatus(leadValue(record, LEAD_HEADERS.STATUS)) === STATUS.NEW &&
  !isValidSingleEmail(normalizeEmail(leadValue(record, LEAD_HEADERS.EMAIL))) &&
  Boolean(safeDisplayText(leadValue(record, LEAD_HEADERS.COMPANY))) &&
  Boolean(safeDisplayText(leadValue(record, LEAD_HEADERS.WEBSITE)));

export type ResearchSummary = { researched: number; found: number; failureExample: string };

export async function runResearch(accessToken: string, maxRows: number): Promise<ResearchSummary> {
  const records = await getLeadRows(accessToken);
  const candidates = records.filter(needsResearch).slice(0, maxRows);
  let found = 0;
  let failureExample = '';
  const writes: RowUpdate[] = [];

  for (const record of candidates) {
    const company = safeDisplayText(leadValue(record, LEAD_HEADERS.COMPANY));
    const result = await enrichCompany(leadValue(record, LEAD_HEADERS.WEBSITE), company);

    const updates: CellUpdate[] = [{ header: LEAD_HEADERS.UPDATED_AT, value: new Date().toISOString() }];
    const notes = [safeDisplayText(leadValue(record, LEAD_HEADERS.NOTES))];

    if (result.email) {
      updates.push({ header: LEAD_HEADERS.EMAIL, value: result.email });
      updates.push({ header: LEAD_HEADERS.NORMALIZED_EMAIL, value: result.email });
      notes.push(`Address found automatically on ${result.sourceUrl} — verify before approving.`);
      found += 1;
    } else {
      notes.push(result.diagnosis || 'No published contact address found.');
      if (!failureExample) failureExample = result.diagnosis;
    }
    if (!safeDisplayText(leadValue(record, LEAD_HEADERS.CATEGORY)) && result.category) {
      updates.push({ header: LEAD_HEADERS.CATEGORY, value: result.category });
    }
    if (result.description) notes.push(`Site description: ${result.description}`);
    updates.push({
      header: LEAD_HEADERS.NOTES,
      value: sanitizeUiMultilineText(notes.filter(Boolean).join('\n'), 2000)
    });
    writes.push({ record, updates });
  }
  await updateManyLeadCells(accessToken, writes);

  if (candidates.length) {
    await appendLogRow(accessToken, {
      action: 'ENRICH',
      result: 'SUCCESS',
      message: `${candidates.length} row(s) researched; ${found} address(es) found. All rows remain NEW.`
    });
  }
  return { researched: candidates.length, found, failureExample };
}

export type ApproveSummary = { approved: number; refusals: string[] };

/**
 * Approves every NEW row with an address that clears the full gate set. This
 * removes the person from the step, not the checks: an opted-out, duplicated,
 * already-contacted or CC-matching address is refused exactly as by hand.
 */
export async function runAutoApprove(accessToken: string): Promise<ApproveSummary> {
  const records = await getLeadRows(accessToken);
  let safetyIndex = buildInitialSafetyIndex(records);
  const emailCounts = buildEmailCounts(records);
  let approved = 0;
  const refusals: string[] = [];
  const writes: RowUpdate[] = [];
  const stamp = new Date().toISOString();

  for (const record of records) {
    if (normalizeStatus(leadValue(record, LEAD_HEADERS.STATUS)) !== STATUS.NEW) continue;
    if (!isValidSingleEmail(normalizeEmail(leadValue(record, LEAD_HEADERS.EMAIL)))) continue;

    const candidate = { ...record, values: [...record.values] };
    const statusColumn = candidate.headerMap[LEAD_HEADERS.STATUS];
    if (statusColumn) candidate.values[statusColumn - 1] = STATUS.APPROVED;

    const issue = getInitialApprovalIssue(candidate, records, leadId(record), safetyIndex, emailCounts);
    if (issue) {
      if (!refusals.includes(issue) && refusals.length < 10) refusals.push(issue);
      continue;
    }

    writes.push({
      record,
      updates: [
        { header: LEAD_HEADERS.STATUS, value: STATUS.APPROVED },
        { header: LEAD_HEADERS.UPDATED_AT, value: stamp }
      ]
    });
    if (statusColumn) record.values[statusColumn - 1] = STATUS.APPROVED;
    safetyIndex = buildInitialSafetyIndex(records, safetyIndex);
    approved += 1;
  }
  await updateManyLeadCells(accessToken, writes);

  if (approved) {
    await appendLogRow(accessToken, {
      action: 'AUTO_APPROVE',
      result: 'RECORDED',
      message: `${approved} lead(s) approved without operator review.`
    });
  }
  return { approved, refusals };
}
