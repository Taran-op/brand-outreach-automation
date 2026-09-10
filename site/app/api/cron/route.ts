import { assertCronAuthorized, getAutomationAccessToken } from '@/lib/automation';
import { CONFIG } from '@/lib/config';
import { isSystemDisabled } from '@/lib/killswitch';
import { dueFollowUpAction } from '@/lib/leads';
import { runReplyScan } from '@/lib/replies';
import { campaignWindowOpen, runSendJob, sendsArmed } from '@/lib/send';
import { appendLogRow } from '@/lib/sheets-write';
import { errorResponse } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * The unattended run.
 *
 * Order matters and is not arbitrary: replies are scanned *first* so that an
 * opt-out or bounce received since the last run suppresses a lead before this
 * same invocation could email it again.
 *
 * It deliberately does not send initials. First contact with a new brand stays
 * behind a human approving the row; once approved, follow-ups continue on
 * their own. Set AUTOMATION_SEND_INITIALS=true to include approved initials.
 */
export async function GET(request: Request) {
  try {
    assertCronAuthorized(request);
    const accessToken = await getAutomationAccessToken();
    const startedAt = new Date();

    const replies = await runReplyScan(accessToken, CONFIG.SAFETY.MAX_REPLY_CHECKS_PER_RUN);

    const armed = sendsArmed() && campaignWindowOpen(startedAt) && !(await isSystemDisabled(accessToken));
    const results: Record<string, unknown> = { replies };

    if (armed) {
      results.followUps = await runSendJob(accessToken, 'FOLLOW_UPS', dueFollowUpAction);
      if (process.env.AUTOMATION_SEND_INITIALS === 'true') {
        results.initials = await runSendJob(accessToken, 'INITIALS', dueFollowUpAction);
      }
    } else {
      results.sending = 'skipped — not armed, outside the campaign window, or emergency disable is set';
    }

    await appendLogRow(accessToken, {
      action: 'CRON',
      result: 'SUCCESS',
      message: `Scheduled run: ${replies.message} Sending ${armed ? 'ran' : 'skipped'}.`
    });

    return Response.json({ ok: true, startedAt: startedAt.toISOString(), ...results });
  } catch (error) {
    return errorResponse(error);
  }
}
