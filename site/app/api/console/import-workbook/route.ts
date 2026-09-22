import { buildImportRows, validateWorkbookImportPayload } from '@/lib/import';
import { newLeadId, readArgs } from '@/lib/request';
import { getLeadsTable } from '@/lib/sheets';
import { appendLeadRows, appendLogRow } from '@/lib/sheets-write';
import { errorResponse, requireOperator } from '@/lib/session';

export const dynamic = 'force-dynamic';

/**
 * Receives rows the browser parsed from an .xlsx. The workbook itself never
 * reaches the server, and the client's view of the columns is not trusted —
 * the layout is detected here, from the values.
 */
export async function POST(request: Request) {
  try {
    const operator = await requireOperator();
    const [payload] = await readArgs(request);
    const workbook = validateWorkbookImportPayload(payload);

    const table = await getLeadsTable(operator.accessToken);
    const outcome = buildImportRows(
      workbook.rows,
      table.records,
      table.columnCount,
      table.headerMap,
      newLeadId
    );

    await appendLeadRows(operator.accessToken, outcome.rows);
    await appendLogRow(operator.accessToken, {
      action: 'IMPORT_XLSX',
      result: 'SUCCESS',
      message:
        `${outcome.imported} NEW lead(s) imported from ${workbook.fileName} / ${workbook.sheetName}; ` +
        `${outcome.withoutEmail} require email research; ${outcome.skipped.length} row(s) skipped. ` +
        'No lead was approved or emailed.'
    });

    return Response.json({
      imported: outcome.imported,
      withoutEmail: outcome.withoutEmail,
      skipped: outcome.skipped
    });
  } catch (error) {
    return errorResponse(error);
  }
}
