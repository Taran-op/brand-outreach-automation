import { isSystemDisabled } from '@/lib/killswitch';
import { dueFollowUpAction } from '@/lib/leads';
import { autoApproveEnabled, runAutoApprove } from '@/lib/pipeline';
import { campaignWindowOpen, runSendJob, sendsArmed } from '@/lib/send';
import { errorResponse, requireMailboxOwner } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

/** The whole burst must return inside the function limit, with margin. */
const BURST_BUDGET_MS = 240_000;
/**
 * Follow-ups come first — a conversation already started is worth more than
 * a new one — but they must not be able to spend the whole burst, or a long
 * follow-up queue would mean first contact never goes out.
 */
const FOLLOW_UP_SLICE_MS = 80_000;

/**
 * The sending half of "Run full pipeline": approve what qualifies, continue
 * the conversations that are due, then make first contact. Discovery and
 * research run before this through their own routes, each bounded by its own
 * function limit; the console calls this as many times as the summary says
 * leads remain, so one press works the queue down to the daily cap.
 */
export async function POST() {
  try {
    const operator = await requireMailboxOwner();
    const started = new Date();
    const deadline = started.getTime() + BURST_BUDGET_MS;

    if (!sendsArmed()) throw Object.assign(new Error('Sending is not armed on this deployment.'), { status: 409 });
    if (!campaignWindowOpen(started)) {
      throw Object.assign(new Error('The campaign send cutoff has passed.'), { status: 409 });
    }
    if (await isSystemDisabled(operator.accessToken)) {
      throw Object.assign(new Error('Emergency disable is active.'), { status: 409 });
    }

    let approved = 0;
    let refusals: string[] = [];
    let approvalNote = 'approval left to you (set CONSOLE_AUTO_APPROVE=true to skip it)';
    if (autoApproveEnabled()) {
      const approval = await runAutoApprove(operator.accessToken);
      approved = approval.approved;
      refusals = approval.refusals;
      approvalNote = `approved ${approved}`;
    }

    const followUps = await runSendJob(operator.accessToken, 'FOLLOW_UPS', dueFollowUpAction, {
      deadline: Math.min(deadline, started.getTime() + FOLLOW_UP_SLICE_MS)
    });
    const initials = followUps.dailyCapReached
      ? null
      : await runSendJob(operator.accessToken, 'INITIALS', dueFollowUpAction, { deadline });

    const sent = followUps.sent + (initials?.sent || 0);
    const remaining = (followUps.remaining || 0) + (initials?.remaining || 0);

    return Response.json({
      job: 'PIPELINE',
      mode: 'LIVE',
      processed: followUps.processed + (initials?.processed || 0),
      sent,
      dryRun: 0,
      testSent: 0,
      skipped: followUps.skipped + (initials?.skipped || 0),
      replies: 0,
      errors: followUps.errors + (initials?.errors || 0),
      approved,
      refusals,
      remaining,
      // Another burst is worth running while either job stopped short with
      // leads still eligible and the day's allowance is not spent.
      stoppedForTime: Boolean(followUps.stoppedForTime || initials?.stoppedForTime),
      stoppedForLimit: Boolean(followUps.stoppedForLimit || initials?.stoppedForLimit),
      dailyCapReached: Boolean(initials ? initials.dailyCapReached : followUps.dailyCapReached),
      message:
        `${approvalNote}; follow-ups: ${followUps.sent} sent; first contact: ${initials?.sent ?? 0} sent. ` +
        `${initials?.message || followUps.message}` +
        (refusals.length ? ` Refused approval: ${refusals.join('; ')}.` : '')
    });
  } catch (error) {
    return errorResponse(error);
  }
}
