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
import { enrichCompany, searchForEmail } from './enrich';
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

export type ResearchSummary = { researched: number; found: number; remaining: number; failureExample: string };

/**
 * One burst of research. The function limit is 300 s, so a burst stops
 * taking new rows well inside it and leaves the rest queued: the console
 * presses again while the summary reports rows remaining.
 */
const RESEARCH_TIME_BUDGET_MS = 45_000;
/** A slow site is abandoned rather than allowed to hold a worker. */
const RESEARCH_ROW_CAP_MS = 20_000;
const RESEARCH_CONCURRENCY = 8;
/** A row researched without result is left alone this long before a retry. */
const RESEARCH_RETRY_DAYS = 14;

/**
 * Research stamps the Notes cell when it finds nothing, so the queue shrinks
 * instead of re-crawling the same dead ends on every press. The stamp leads
 * the cell and is replaced, not accumulated, on a retry.
 */
const RESEARCH_STAMP = /^\[auto-research (\d{4}-\d{2}-\d{2})[^\]]*\]\s*/;

export const researchedRecently = (record: LeadRecord, now = Date.now()): boolean => {
  const match = RESEARCH_STAMP.exec(safeDisplayText(leadValue(record, LEAD_HEADERS.NOTES)));
  if (!match) return false;
  const at = Date.parse(match[1]);
  return Number.isFinite(at) && now - at < RESEARCH_RETRY_DAYS * 86_400_000;
};

/** The operator's own notes, without anything an earlier research pass appended. */
const operatorNotes = (record: LeadRecord): string =>
  safeDisplayText(leadValue(record, LEAD_HEADERS.NOTES))
    .replace(RESEARCH_STAMP, '')
    .replace(/\s*Site description:.*$/, '')
    .replace(/\s*Address found automatically via .*?— verify before approving\./, '')
    .trim();

const stampText = (stamp: string, reason: string) =>
  `[auto-research ${stamp}: ${safeDisplayText(reason).replace(/[\[\]]/g, ' ').trim()}]`;

const withTimeout = <T,>(work: Promise<T>, ms: number): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });

/**
 * Finds addresses for rows that lack one. Two sources per company: its own
 * site first, then a web search for addresses on its domain when the site
 * publishes none. Rows are worked several at a time inside a fixed time
 * budget, so a call clears as many as it safely can, and the summary says
 * how many are still waiting.
 */
export async function runResearch(
  accessToken: string,
  maxRows: number,
  options: { deadline?: number } = {}
): Promise<ResearchSummary> {
  const started = Date.now();
  const deadline = Math.min(options.deadline ?? Infinity, started + RESEARCH_TIME_BUDGET_MS);
  const stamp = new Date(started).toISOString().slice(0, 10);

  const records = await getLeadRows(accessToken);
  const pending = records.filter((record) => needsResearch(record) && !researchedRecently(record, started));
  const queue = pending.slice(0, maxRows);
  let found = 0;
  let failureExample = '';
  const writes: RowUpdate[] = [];

  const researchOne = async (record: LeadRecord): Promise<{ write: RowUpdate; found: boolean; diagnosis: string }> => {
    const company = safeDisplayText(leadValue(record, LEAD_HEADERS.COMPANY));
    const website = leadValue(record, LEAD_HEADERS.WEBSITE);
    const result = await enrichCompany(website, company);

    let email = result.email;
    let source = result.sourceUrl;
    if (!email) {
      const searched = await searchForEmail(company, String(website || ''));
      if (searched.email) {
        email = searched.email;
        source = searched.source;
      }
    }

    const updates: CellUpdate[] = [{ header: LEAD_HEADERS.UPDATED_AT, value: new Date().toISOString() }];
    const notes: string[] = [];

    if (email) {
      updates.push({ header: LEAD_HEADERS.EMAIL, value: email });
      updates.push({ header: LEAD_HEADERS.NORMALIZED_EMAIL, value: email });
      notes.push(`Address found automatically via ${source} — verify before approving.`);
    } else {
      notes.push(stampText(stamp, result.diagnosis || 'No published contact address found on the site or in search.'));
    }
    notes.push(operatorNotes(record));
    if (!safeDisplayText(leadValue(record, LEAD_HEADERS.CATEGORY)) && result.category) {
      updates.push({ header: LEAD_HEADERS.CATEGORY, value: result.category });
    }
    if (result.description) notes.push(`Site description: ${result.description}`);
    updates.push({
      header: LEAD_HEADERS.NOTES,
      value: sanitizeUiMultilineText(notes.filter(Boolean).join('\n'), 2000)
    });
    return { write: { record, updates }, found: Boolean(email), diagnosis: result.diagnosis };
  };

  // A small worker pool: each worker takes the next row until the queue is
  // empty or the time budget is spent. A row that overruns its cap is
  // stamped and left for a later retry, so it cannot stall the burst.
  let index = 0;
  const worker = async () => {
    while (index < queue.length && Date.now() < deadline) {
      const record = queue[index];
      index += 1;
      try {
        const outcome = await withTimeout(researchOne(record), RESEARCH_ROW_CAP_MS);
        writes.push(outcome.write);
        if (outcome.found) found += 1;
        else if (!failureExample) failureExample = outcome.diagnosis;
      } catch (error) {
        const reason =
          error instanceof Error && error.message === 'timeout'
            ? `The site did not answer within ${RESEARCH_ROW_CAP_MS / 1000} s.`
            : 'Research failed for this site.';
        writes.push({
          record,
          updates: [
            { header: LEAD_HEADERS.UPDATED_AT, value: new Date().toISOString() },
            {
              header: LEAD_HEADERS.NOTES,
              value: sanitizeUiMultilineText([stampText(stamp, reason), operatorNotes(record)].filter(Boolean).join('\n'), 2000)
            }
          ]
        });
        if (!failureExample) failureExample = reason;
      }
    }
  };
  await Promise.all(Array.from({ length: RESEARCH_CONCURRENCY }, worker));

  await updateManyLeadCells(accessToken, writes);

  const researched = writes.length;
  if (researched) {
    await appendLogRow(accessToken, {
      action: 'ENRICH',
      result: 'SUCCESS',
      message: `${researched} row(s) researched; ${found} address(es) found. All rows remain NEW.`
    });
  }
  return { researched, found, remaining: pending.length - researched, failureExample };
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
