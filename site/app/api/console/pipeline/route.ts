import { isSystemDisabled } from '@/lib/killswitch';
import { dueFollowUpAction } from '@/lib/leads';
import { autoApproveEnabled, runAutoApprove } from '@/lib/pipeline';
import { campaignWindowOpen, runSendJob, sendsArmed } from '@/lib/send';
import { errorResponse, requireMailboxOwner } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * The approve-and-send half of "Run full pipeline". The console runs
 * discovery and research first through their own routes, each of which
 * fits the function limit on its own, then calls this as many times as the
 * send summary reports leads remaining. Every stage is bounded by the same
 * caps as its individual button.
 */
export async function POST() {
  try {
    const operator = await requireMailboxOwner();
    const started = new Date();

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

    const send = await runSendJob(operator.accessToken, 'INITIALS', dueFollowUpAction);

    return Response.json({
      ...send,
      job: 'PIPELINE',
      approved,
      refusals,
      message:
        `${approvalNote}, sent ${send.sent}. ${send.message}` +
        (refusals.length ? ` Refused approval: ${refusals.join('; ')}.` : '')
    });
  } catch (error) {
    return errorResponse(error);
  }
}
