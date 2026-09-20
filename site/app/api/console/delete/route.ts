import { findLeadById, hasInitialSuccessEvidence, validateLeadId } from '@/lib/approval';
import { LEAD_HEADERS, STATUS } from '@/lib/constants';
import { readArgs } from '@/lib/request';
import { getLeadRows, leadValue } from '@/lib/sheets';
import { appendLogRow, deleteLeadRows } from '@/lib/sheets-write';
import { errorResponse, requireOperator } from '@/lib/session';
import { hasPendingAction, normalizeStatus } from '@/lib/templates';
import { isTrue, normalizeEmail, safeDisplayText } from '@/lib/text';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Removes lead rows that never became outreach.
 *
 * Rows that were contacted, opted out, or are mid-send are refused. The Sheet
 * is the suppression ledger: an opted-out address only stays suppressed while
 * its row exists, and send evidence is what stops a re-imported address being
 * emailed twice. Deleting those rows would make the system forget exactly the
 * things it must not forget. Set such a lead to NOT_INTERESTED instead.
 */
export async function POST(request: Request) {
  try {
    const operator = await requireOperator();
    const [rawIds] = await readArgs(request);
    if (!Array.isArray(rawIds) || rawIds.length === 0) throw new Error('Select at least one lead.');
    if (rawIds.length > 200) throw new Error('Delete no more than 200 leads at once.');

    // Fresh read: row numbers are only trustworthy against the sheet as it is now.
    const records = await getLeadRows(operator.accessToken);
    const rowsToDelete: number[] = [];
    const deleted: string[] = [];
    const refused: { id: string; message: string }[] = [];

    for (const rawId of rawIds) {
      let id = '';
      try {
        id = validateLeadId(rawId);
        const record = findLeadById(records, id);
        if (!record) throw new Error('Already gone.');

        const status = normalizeStatus(leadValue(record, LEAD_HEADERS.STATUS));
        if (hasInitialSuccessEvidence(record)) {
          throw new Error('This lead was emailed; its row is the record of that. Set it to NOT_INTERESTED instead.');
        }
        if (isTrue(leadValue(record, LEAD_HEADERS.OPT_OUT)) || status === STATUS.DO_NOT_CONTACT) {
          throw new Error('This address opted out; the row is what keeps it suppressed. Leave it in place.');
        }
        if (hasPendingAction(record)) {
          throw new Error('A send is in progress for this lead. Let it reconcile first.');
        }

        rowsToDelete.push(record.rowNumber);
        deleted.push(id);
        await appendLogRow(operator.accessToken, {
          company: safeDisplayText(leadValue(record, LEAD_HEADERS.COMPANY)),
          email: normalizeEmail(leadValue(record, LEAD_HEADERS.EMAIL)),
          action: 'DELETE',
          result: 'RECORDED',
          message: `Lead removed from the Vercel console by ${operator.email} (status ${status || 'blank'}, never contacted).`
        });
      } catch (error) {
        refused.push({ id: id || String(rawId), message: error instanceof Error ? error.message : 'Refused.' });
      }
    }

    await deleteLeadRows(operator.accessToken, rowsToDelete);
    return Response.json({ deleted, refused });
  } catch (error) {
    return errorResponse(error);
  }
}
