import { LEAD_HEADERS, STATUS } from '@/lib/constants';
import { discoverBrands } from '@/lib/discover';
import { newLeadId, readArgs } from '@/lib/request';
import { getLeadsTable, leadValue } from '@/lib/sheets';
import { appendLeadRows, appendLogRow } from '@/lib/sheets-write';
import { errorResponse, requireOperator } from '@/lib/session';
import { safeDisplayText, safeSheetText, sanitizeUiMultilineText } from '@/lib/text';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

/** Free tier is 100 queries a day; one run must not spend it all. */
const MAX_QUERIES_PER_RUN = 17;

const hostOf = (value: unknown): string => {
  try {
    return new URL(String(value || '')).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
};

/**
 * Finds candidate companies and adds them as NEW rows with no email. From
 * there they follow the same path as any imported list: research finds an
 * address, the approval gates decide, and only then can anything send.
 */
export async function POST(request: Request) {
  try {
    const operator = await requireOperator();
    const [rawCategories] = await readArgs(request).catch(() => [[]]);
    const categories = Array.isArray(rawCategories)
      ? rawCategories.map((value) => safeDisplayText(value)).filter(Boolean)
      : [];

    const table = await getLeadsTable(operator.accessToken);
    const knownHosts = new Set<string>();
    table.records.forEach((record) => {
      const host = hostOf(leadValue(record, LEAD_HEADERS.WEBSITE));
      if (host) knownHosts.add(host);
    });

    const { candidates, queriesRun, rejected } = await discoverBrands(
      categories,
      knownHosts,
      MAX_QUERIES_PER_RUN
    );

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

    await appendLeadRows(operator.accessToken, rows);

    if (rows.length) {
      await appendLogRow(operator.accessToken, {
        action: 'DISCOVER',
        result: 'SUCCESS',
        message:
          `${rows.length} candidate brand(s) added as NEW from ${queriesRun} search quer${queriesRun === 1 ? 'y' : 'ies'}; ` +
          `${rejected} result(s) rejected as marketplaces, publishers or roundups. No email found yet, nothing approved.`
      });
    }

    return Response.json({
      job: 'DISCOVER',
      mode: 'RESEARCH',
      processed: queriesRun,
      sent: 0,
      dryRun: 0,
      testSent: 0,
      skipped: rejected,
      replies: 0,
      errors: 0,
      added: rows.length,
      message: rows.length
        ? `${rows.length} new brand(s) added from ${queriesRun} search(es).`
        : `${queriesRun} search(es) ran but every result was already in the Sheet or was rejected (${rejected} marketplaces, publishers or roundups).`
    });
  } catch (error) {
    return errorResponse(error);
  }
}
