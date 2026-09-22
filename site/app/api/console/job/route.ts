import { CONFIG } from '@/lib/config';
import { dueFollowUpAction } from '@/lib/leads';
import { readArgs } from '@/lib/request';
import { runReplyScan } from '@/lib/replies';
import { runSendJob } from '@/lib/send';
import { errorResponse, requireMailboxOwner } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// Sending is sequential and talks to two Google APIs per lead.
export const maxDuration = 300;

const CONFIRMATION: Record<string, string> = {
  INITIALS: 'SEND APPROVED',
  FOLLOW_UPS: 'SEND FOLLOW UPS'
};

/**
 * Runs one outreach job. The typed confirmation is re-checked here, not just
 * in the browser, so a stray API call cannot start a send.
 */
export async function POST(request: Request) {
  try {
    const operator = await requireMailboxOwner();
    const [rawJob, rawConfirmation] = await readArgs(request);
    const job = String(rawJob || '').toUpperCase();

    // Reply checking reads the mailbox and can only ever suppress sending, so
    // it needs no typed confirmation and no send arming.
    if (job === 'REPLIES') {
      const scan = await runReplyScan(operator.accessToken, CONFIG.SAFETY.MAX_REPLY_CHECKS_PER_RUN);
      return Response.json({
        job,
        mode: 'READ_MAILBOX',
        processed: scan.processed,
        sent: 0,
        dryRun: 0,
        testSent: 0,
        skipped: 0,
        replies: scan.replies + scan.optOuts,
        errors: scan.errors,
        recorded: scan.recorded,
        message: scan.message
      });
    }
    if (job !== 'INITIALS' && job !== 'FOLLOW_UPS') throw new Error('Unknown job.');

    const phrase = CONFIRMATION[job];
    if (String(rawConfirmation || '').trim().toUpperCase() !== phrase) {
      throw new Error(`Type ${phrase} to confirm this job.`);
    }

    const summary = await runSendJob(operator.accessToken, job, dueFollowUpAction);
    return Response.json({ ...summary, dailyLimit: CONFIG.SAFETY.DAILY_SEND_LIMIT });
  } catch (error) {
    return errorResponse(error);
  }
}
