import { appendLogRow } from '@/lib/sheets-write';
import { setSystemDisabled } from '@/lib/killswitch';
import { errorResponse, requireOperator } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Stops this console sending, immediately and durably. The flag lives in the
 * spreadsheet, so it survives redeploys and can be cleared by hand if the
 * console itself is unreachable.
 *
 * It does not touch the Apps Script deployment. That system has its own kill
 * switch and its own triggers, and the response says so rather than implying
 * one button stopped everything.
 */
export async function POST() {
  try {
    const operator = await requireOperator();
    await setSystemDisabled(operator.accessToken, true);
    await appendLogRow(operator.accessToken, {
      action: 'EMERGENCY_DISABLE',
      result: 'RECORDED',
      message: `Sending disabled from the Vercel console by ${operator.email}.`
    });

    return Response.json({
      systemDisabled: true,
      deletedTriggers: 0,
      requestId: crypto.randomUUID(),
      warning:
        'This console can no longer send. The Apps Script deployment is separate — disable it there too if it is still armed.'
    });
  } catch (error) {
    return errorResponse(error);
  }
}
