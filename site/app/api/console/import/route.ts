import { CONFIG } from '@/lib/config';
import { buildImportRows, parseCsv } from '@/lib/import';
import { newLeadId, readArgs } from '@/lib/request';
import { getLeadsTable } from '@/lib/sheets';
import { appendLeadRows, appendLogRow } from '@/lib/sheets-write';
import { errorResponse, requireOperator } from '@/lib/session';

export const dynamic = 'force-dynamic';

/** Paste path: one email per line, or CSV. Every row lands as NEW. */
export async function POST(request: Request) {
  try {
    const operator = await requireOperator();
    const [rawText] = await readArgs(request);

    const text = String(rawText ?? '').trim();
    if (!text) throw new Error('Paste at least one email or CSV row.');
    if (text.length > CONFIG.UI.MAX_IMPORT_CHARACTERS) throw new Error('Import text is too large.');

    const table = await getLeadsTable(operator.accessToken);
    const outcome = buildImportRows(
      parseCsv(text),
      table.records,
      table.columnCount,
      table.headerMap,
      newLeadId
    );

    await appendLeadRows(operator.accessToken, outcome.rows);
    await appendLogRow(operator.accessToken, {
      action: 'IMPORT_PASTE',
      result: 'SUCCESS',
      message:
        `${outcome.imported} NEW lead(s) imported; ${outcome.withoutEmail} require email research; ` +
        `${outcome.skipped.length} row(s) skipped. No lead was approved or emailed.`
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
