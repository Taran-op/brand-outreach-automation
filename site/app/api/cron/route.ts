import { assertCronAuthorized, getAutomationAccessToken } from '@/lib/automation';
import { CONFIG } from '@/lib/config';
import { DiscoveryNotConfigured } from '@/lib/discover';
import { isSystemDisabled } from '@/lib/killswitch';
import { dueFollowUpAction } from '@/lib/leads';
import { autoApproveEnabled, runAutoApprove, runDiscovery, runResearch } from '@/lib/pipeline';
import { runReplyScan } from '@/lib/replies';
import { campaignWindowOpen, runSendJob, sendsArmed } from '@/lib/send';
import { appendLogRow } from '@/lib/sheets-write';
import { errorResponse } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

const discoveryEnabled = () => process.env.AUTOMATION_DISCOVER === 'true';
const researchEnabled = () => process.env.AUTOMATION_RESEARCH === 'true';

/**
 * The whole run must finish inside the 300 s function limit, so each stage
 * is handed a deadline and the later stages get whatever is left. Sending
 * is the stage that matters most, so research is given a fixed slice.
 */
const RUN_BUDGET_MS = 270_000;
const RESEARCH_SLICE_MS = 45_000;

/**
 * The unattended daily run, in this order for a reason:
 *
 *   1. replies    — an opt-out received overnight must suppress its lead
 *                   before this same run could email it again
 *   2. discover   — add candidate brands (AUTOMATION_DISCOVER)
 *   3. research   — find their addresses (AUTOMATION_RESEARCH)
 *   4. approve    — clear the gates without a person (CONSOLE_AUTO_APPROVE)
 *   5. follow-ups — continue conversations already started
 *   6. initials   — first contact (AUTOMATION_SEND_INITIALS)
 *
 * Every stage is bounded by the same caps as the buttons, and a failure in an
 * optional stage is recorded and skipped rather than halting the run. What a
 * stage cannot finish today waits for tomorrow's run.
 */
export async function GET(request: Request) {
  try {
    assertCronAuthorized(request);
    const accessToken = await getAutomationAccessToken();
    const startedAt = new Date();
    const deadline = startedAt.getTime() + RUN_BUDGET_MS;
    const results: Record<string, unknown> = {};

    // Replies may take at most a third of the run: an opt-out must be seen
    // before sending, but a slow mailbox must not starve the send stages.
    results.replies = await runReplyScan(accessToken, CONFIG.SAFETY.MAX_REPLY_CHECKS_PER_RUN, {
      deadline: startedAt.getTime() + RUN_BUDGET_MS / 3
    });

    if (discoveryEnabled()) {
      try {
        results.discover = await runDiscovery(accessToken, 17);
      } catch (error) {
        results.discover = error instanceof DiscoveryNotConfigured ? error.message : String(error);
      }
    }

    if (researchEnabled()) {
      results.research = await runResearch(accessToken, 100, { deadline: Date.now() + RESEARCH_SLICE_MS });
    }

    const armed = sendsArmed() && campaignWindowOpen(startedAt) && !(await isSystemDisabled(accessToken));

    if (armed) {
      if (autoApproveEnabled()) results.approve = await runAutoApprove(accessToken);
      results.followUps = await runSendJob(accessToken, 'FOLLOW_UPS', dueFollowUpAction, { deadline });
      if (process.env.AUTOMATION_SEND_INITIALS === 'true') {
        results.initials = await runSendJob(accessToken, 'INITIALS', dueFollowUpAction, { deadline });
      }
    } else {
      results.sending = 'skipped — not armed, outside the campaign window, or emergency disable is set';
    }

    await appendLogRow(accessToken, {
      action: 'CRON',
      result: 'SUCCESS',
      message:
        `Scheduled run: ${(results.replies as { message: string }).message} ` +
        `Discovery ${discoveryEnabled() ? 'ran' : 'off'}, research ${researchEnabled() ? 'ran' : 'off'}, ` +
        `sending ${armed ? 'ran' : 'skipped'}.`
    });

    return Response.json({ ok: true, startedAt: startedAt.toISOString(), ...results });
  } catch (error) {
    return errorResponse(error);
  }
}
