import { setSystemDisabled } from '@/lib/killswitch';
import { appendLogRow } from '@/lib/sheets-write';
import { errorResponse, requireMailboxOwner } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Clears the kill switch.
 *
 * Anyone on the allowlist may stop outreach; only the account that owns the
 * campaign mailbox may start it again, because resuming is a decision about
 * mail leaving that mailbox. The flag itself stays a cell in the spreadsheet,
 * so the hand-edited route keeps working when this console does not.
 */
export async function POST() {
  try {
    const operator = await requireMailboxOwner();
    await setSystemDisabled(operator.accessToken, false);
    await appendLogRow(operator.accessToken, {
      action: 'RESUME_SENDING',
      result: 'RECORDED',
      message: `Kill switch cleared from the Vercel console by ${operator.email}.`
    });

    return Response.json({
      systemDisabled: false,
      message:
        'Kill switch cleared. Sending is armed again, subject to the daily cap, the campaign window and every per-lead gate.'
    });
  } catch (error) {
    return errorResponse(error);
  }
}
