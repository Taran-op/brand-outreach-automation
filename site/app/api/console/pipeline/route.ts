import { DiscoveryNotConfigured } from '@/lib/discover';
import { isSystemDisabled } from '@/lib/killswitch';
import { dueFollowUpAction } from '@/lib/leads';
import { autoApproveEnabled, runAutoApprove, runDiscovery, runResearch } from '@/lib/pipeline';
import { campaignWindowOpen, runSendJob, sendsArmed } from '@/lib/send';
import { errorResponse, requireMailboxOwner } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * Discover, research, approve and send in one press. Discovery is attempted
 * when the search API is configured and skipped with a note when it is not;
 * every other stage is bounded by the same caps as its individual button.
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

    const parts: string[] = [];

    try {
      const discovered = await runDiscovery(operator.accessToken, 17);
      parts.push(`discovered ${discovered.added}`);
    } catch (error) {
      parts.push(error instanceof DiscoveryNotConfigured ? 'discovery not configured' : 'discovery failed');
    }

    const research = await runResearch(operator.accessToken, 100);
    parts.push(`researched ${research.researched}, found ${research.found} address(es)`);

    let refusals: string[] = [];
    if (autoApproveEnabled()) {
      const approval = await runAutoApprove(operator.accessToken);
      parts.push(`approved ${approval.approved}`);
      refusals = approval.refusals;
    } else {
      parts.push('approval left to you (set CONSOLE_AUTO_APPROVE=true to skip it)');
    }

    const send = await runSendJob(operator.accessToken, 'INITIALS', dueFollowUpAction);
    parts.push(`sent ${send.sent}`);

    return Response.json({
      job: 'PIPELINE',
      mode: 'LIVE',
      processed: research.researched,
      sent: send.sent,
      dryRun: 0,
      testSent: 0,
      skipped: send.skipped,
      replies: 0,
      errors: send.errors,
      message:
        `${parts.join(', ')}. ${send.message}` +
        (refusals.length ? ` Refused approval: ${refusals.join('; ')}.` : '') +
        (research.found === 0 && research.failureExample ? ` Research example: ${research.failureExample}` : '')
    });
  } catch (error) {
    return errorResponse(error);
  }
}
