import {
  buildEmailCounts,
  buildInitialSafetyIndex,
  findLeadById,
  getInitialApprovalIssue,
  validateLeadId
} from '@/lib/approval';
import { LEAD_HEADERS, STATUS } from '@/lib/constants';
import { readArgs } from '@/lib/request';
import { getLeadRows, leadValue } from '@/lib/sheets';
import { appendLogRow, updateLeadCells } from '@/lib/sheets-write';
import { errorResponse, requireOperator } from '@/lib/session';
import { normalizeEmail, safeDisplayText } from '@/lib/text';

export const dynamic = 'force-dynamic';

/**
 * Approving only sets Status to APPROVED. It never sends. Each row is judged
 * against the full gate set, and one refusal does not block the rest.
 */
export async function POST(request: Request) {
  try {
    const operator = await requireOperator();
    const [rawIds] = await readArgs(request);
    if (!Array.isArray(rawIds) || rawIds.length === 0) throw new Error('Select at least one lead.');
    if (rawIds.length > 100) throw new Error('Approve no more than 100 leads at once.');

    const records = await getLeadRows(operator.accessToken);
    const approved: string[] = [];
    const rejected: { id: string; message: string }[] = [];

    // Recomputed as we go: approving one row can suppress a later duplicate.
    let safetyIndex = buildInitialSafetyIndex(records);
    const emailCounts = buildEmailCounts(records);

    for (const rawId of rawIds) {
      let id = '';
      try {
        id = validateLeadId(rawId);
        const record = findLeadById(records, id);
        if (!record) throw new Error('That lead no longer exists.');

        // Judge the row as it would be once APPROVED, not as it is now.
        const candidate = { ...record, values: [...record.values] };
        const statusColumn = candidate.headerMap[LEAD_HEADERS.STATUS];
        if (statusColumn) candidate.values[statusColumn - 1] = STATUS.APPROVED;

        const issue = getInitialApprovalIssue(candidate, records, id, safetyIndex, emailCounts);
        if (issue) throw new Error(issue);

        await updateLeadCells(operator.accessToken, record, [
          { header: LEAD_HEADERS.STATUS, value: STATUS.APPROVED },
          { header: LEAD_HEADERS.UPDATED_AT, value: new Date().toISOString() }
        ]);

        if (statusColumn) record.values[statusColumn - 1] = STATUS.APPROVED;
        safetyIndex = buildInitialSafetyIndex(records, safetyIndex);
        approved.push(id);

        await appendLogRow(operator.accessToken, {
          company: safeDisplayText(leadValue(record, LEAD_HEADERS.COMPANY)),
          email: normalizeEmail(leadValue(record, LEAD_HEADERS.EMAIL)),
          action: 'APPROVE',
          result: 'SUCCESS',
          message: 'Approved in the Vercel console. No message was sent.'
        });
      } catch (error) {
        rejected.push({
          id: id || String(rawId),
          message: error instanceof Error ? error.message : 'Approval failed.'
        });
      }
    }

    return Response.json({ approved, rejected });
  } catch (error) {
    return errorResponse(error);
  }
}

