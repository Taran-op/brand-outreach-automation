import { repliesWorkbook } from '@/lib/replies-export';
import { getReplyRows } from '@/lib/replies-sheet';
import { errorResponse, requireOperator } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Downloads everything recorded in the Replies tab as one .xlsx file. */
export async function GET() {
  try {
    const operator = await requireOperator();
    const { headers, rows } = await getReplyRows(operator.accessToken, 5000);
    const file = await repliesWorkbook(headers, rows);

    const stamp = new Date().toISOString().slice(0, 10);
    return new Response(new Uint8Array(file), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="asaiverse-replies-${stamp}.xlsx"`,
        'Cache-Control': 'no-store'
      }
    });
  } catch (error) {
    return errorResponse(error);
  }
}
