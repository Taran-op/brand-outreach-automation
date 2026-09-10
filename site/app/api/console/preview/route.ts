import { findLeadById, validateLeadId } from '@/lib/approval';
import { readArgs } from '@/lib/request';
import { getLeadRows } from '@/lib/sheets';
import { errorResponse, requireOperator } from '@/lib/session';
import { buildEmailForLead, determinePreviewAction, getPreviewWarnings } from '@/lib/templates';

export const dynamic = 'force-dynamic';

/** Renders exactly what would be sent. Composes only — nothing is delivered. */
export async function POST(request: Request) {
  try {
    const operator = await requireOperator();
    const [rawId] = await readArgs(request);
    const id = validateLeadId(rawId);

    const records = await getLeadRows(operator.accessToken);
    const record = findLeadById(records, id);
    if (!record) throw Object.assign(new Error('That lead no longer exists.'), { status: 404 });

    const action = determinePreviewAction(record);
    const message = buildEmailForLead(record, action);

    return Response.json({
      action,
      to: message.to,
      cc: message.cc,
      subject: message.subject,
      body: message.plainBody,
      warnings: getPreviewWarnings(record, action, message)
    });
  } catch (error) {
    return errorResponse(error);
  }
}
