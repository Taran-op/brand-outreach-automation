import { leadId } from '@/lib/approval';
import { LEAD_HEADERS, STATUS } from '@/lib/constants';
import { enrichCompany } from '@/lib/enrich';
import { getLeadRows, leadValue, type LeadRecord } from '@/lib/sheets';
import { appendLogRow, updateLeadCells, type CellUpdate } from '@/lib/sheets-write';
import { errorResponse, requireOperator } from '@/lib/session';
import { normalizeStatus } from '@/lib/templates';
import {
  isValidSingleEmail,
  normalizeEmail,
  safeDisplayText,
  sanitizeUiMultilineText
} from '@/lib/text';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

const MAX_ROWS_PER_RUN = 25;

/** Rows worth researching: a company and a website, but no usable address. */
function needsEnrichment(record: LeadRecord): boolean {
  const status = normalizeStatus(leadValue(record, LEAD_HEADERS.STATUS));
  if (status !== STATUS.NEW) return false;
  if (isValidSingleEmail(normalizeEmail(leadValue(record, LEAD_HEADERS.EMAIL)))) return false;
  if (!safeDisplayText(leadValue(record, LEAD_HEADERS.COMPANY))) return false;
  return Boolean(safeDisplayText(leadValue(record, LEAD_HEADERS.WEBSITE)));
}

/**
 * Fills in what a company publishes about itself. Enriched rows stay NEW: a
 * machine-found address must be reviewed and approved by a person before it
 * can ever be emailed.
 */
export async function POST() {
  try {
    const operator = await requireOperator();
    const records = await getLeadRows(operator.accessToken);
    const candidates = records.filter(needsEnrichment).slice(0, MAX_ROWS_PER_RUN);

    let emailsFound = 0;
    let detailsFilled = 0;
    let noneFound = 0;

    for (const record of candidates) {
      const company = safeDisplayText(leadValue(record, LEAD_HEADERS.COMPANY));
      const website = leadValue(record, LEAD_HEADERS.WEBSITE);
      const result = await enrichCompany(website, company);

      const updates: CellUpdate[] = [
        { header: LEAD_HEADERS.UPDATED_AT, value: new Date().toISOString() }
      ];
      const noteParts: string[] = [];

      if (result.email) {
        updates.push({ header: LEAD_HEADERS.EMAIL, value: result.email });
        updates.push({ header: LEAD_HEADERS.NORMALIZED_EMAIL, value: result.email });
        // Provenance matters: whoever approves this should know the address
        // was found by a crawler, not given to us.
        noteParts.push(`Address found automatically on ${result.sourceUrl} — verify before approving.`);
        emailsFound += 1;
      } else {
        noneFound += 1;
        noteParts.push('No published contact address found on the company site.');
      }

      if (!safeDisplayText(leadValue(record, LEAD_HEADERS.CATEGORY)) && result.category) {
        updates.push({ header: LEAD_HEADERS.CATEGORY, value: result.category });
        detailsFilled += 1;
      }
      if (result.description) noteParts.push(`Site description: ${result.description}`);

      const existingNotes = safeDisplayText(leadValue(record, LEAD_HEADERS.NOTES));
      updates.push({
        header: LEAD_HEADERS.NOTES,
        value: sanitizeUiMultilineText([existingNotes, ...noteParts].filter(Boolean).join('\n'), 2000)
      });

      await updateLeadCells(operator.accessToken, record, updates);
    }

    if (candidates.length) {
      await appendLogRow(operator.accessToken, {
        action: 'ENRICH',
        result: 'SUCCESS',
        message:
          `${candidates.length} row(s) researched; ${emailsFound} address(es) found, ` +
          `${detailsFilled} category/categories filled, ${noneFound} with nothing published. ` +
          'All rows remain NEW and unapproved.'
      });
    }

    return Response.json({
      job: 'ENRICH',
      mode: 'RESEARCH',
      processed: candidates.length,
      sent: 0,
      dryRun: 0,
      testSent: 0,
      skipped: noneFound,
      replies: 0,
      errors: 0,
      message: candidates.length
        ? `${candidates.length} researched, ${emailsFound} address(es) found. Rows stay NEW — review and approve before anything is sent.`
        : 'No rows needed research. Enrichment looks at NEW rows that have a website but no email.',
      leadsRemaining: records.filter(needsEnrichment).length - candidates.length,
      leadIds: candidates.map(leadId)
    });
  } catch (error) {
    return errorResponse(error);
  }
}
