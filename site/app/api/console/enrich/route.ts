import { LEAD_HEADERS, STATUS } from '@/lib/constants';
import { runResearch } from '@/lib/pipeline';
import { getLeadRows, leadValue } from '@/lib/sheets';
import { errorResponse, requireOperator } from '@/lib/session';
import { normalizeStatus } from '@/lib/templates';
import { isValidSingleEmail, normalizeEmail, safeDisplayText } from '@/lib/text';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

const MAX_ROWS_PER_RUN = 25;

const summary = (fields: Record<string, unknown>) => ({
  job: 'ENRICH',
  mode: 'RESEARCH',
  processed: 0,
  sent: 0,
  dryRun: 0,
  testSent: 0,
  skipped: 0,
  replies: 0,
  errors: 0,
  ...fields
});

/**
 * Fills in what a company publishes about itself. Enriched rows stay NEW: a
 * machine-found address must be reviewed and approved by a person before it
 * can ever be emailed. The work itself is the same batched implementation the
 * pipeline and the scheduled run use.
 */
export async function POST() {
  try {
    const operator = await requireOperator();
    const result = await runResearch(operator.accessToken, MAX_ROWS_PER_RUN);

    if (result.researched > 0) {
      return Response.json(
        summary({
          processed: result.researched,
          skipped: result.researched - result.found,
          message:
            `${result.researched} researched, ${result.found} address(es) found. Rows stay NEW — review and approve before anything is sent.` +
            (result.found === 0 && result.failureExample ? ` Example: ${result.failureExample}` : '')
        })
      );
    }

    // "Nothing happened" is the most confusing outcome, so say which condition
    // excluded every row rather than staying silent.
    const records = await getLeadRows(operator.accessToken);
    const newRows = records.filter((r) => normalizeStatus(leadValue(r, LEAD_HEADERS.STATUS)) === STATUS.NEW);
    const withEmail = newRows.filter((r) => isValidSingleEmail(normalizeEmail(leadValue(r, LEAD_HEADERS.EMAIL)))).length;
    const withoutWebsite = newRows.filter((r) => !safeDisplayText(leadValue(r, LEAD_HEADERS.WEBSITE))).length;
    const withoutCompany = newRows.filter((r) => !safeDisplayText(leadValue(r, LEAD_HEADERS.COMPANY))).length;

    return Response.json(
      summary({
        message:
          `Nothing to research. Of ${records.length} lead(s), ${newRows.length} are NEW; ` +
          `${withEmail} already have an email, ${withoutWebsite} have no Website, ${withoutCompany} have no Company. ` +
          'Research needs a NEW row with a Company and a Website but no email yet.'
      })
    );
  } catch (error) {
    return errorResponse(error);
  }
}
