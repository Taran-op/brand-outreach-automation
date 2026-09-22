import { CONFIG } from '@/lib/config';
import { assertSendAsAuthorized, createDraft, deleteDraft, sendDraft } from '@/lib/gmail';
import { MailboxNotConfigured, mailboxConfigured, markerPresent } from '@/lib/hostinger';
import { setRoutingVerifiedAt } from '@/lib/killswitch';
import { appendLogRow } from '@/lib/sheets-write';
import { errorResponse, requireMailboxOwner } from '@/lib/session';
import { normalizeEmail } from '@/lib/text';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 90;

const POLL_EVERY_MS = 5000;
const POLL_FOR_MS = 60000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Proves the reply path end to end: a marker leaves through Gmail as the
 * campaign identity, is delivered to the reply-to address by the domain's MX,
 * and must then be readable from the Hostinger mailbox over IMAP — the same
 * three hops a brand's reply takes before the console can see it.
 */
export async function POST() {
  try {
    const operator = await requireMailboxOwner();

    if (!mailboxConfigured()) {
      throw new MailboxNotConfigured(
        'Set HOSTINGER_IMAP_USER (the full address) and HOSTINGER_IMAP_PASSWORD in Vercel, redeploy, then run this again.'
      );
    }

    // Fail fast on a bad password before sending anything.
    await markerPresent('__login_check__');
    await assertSendAsAuthorized(operator.accessToken);

    const replyTo = normalizeEmail(CONFIG.SENDER.REPLY_TO_EMAIL);
    const from = normalizeEmail(CONFIG.SENDER.FROM_EMAIL);
    const marker = `routing-check-${crypto.randomUUID().slice(0, 8)}`;
    const subject = `[Asaiverse console] Reply routing check ${marker}`;

    const raw = Buffer.from(
      [
        `To: ${replyTo}`,
        `From: ${from}`,
        `Subject: ${subject}`,
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset="UTF-8"',
        '',
        `Automated loopback test ${marker}. If the console found this, brand replies are visible too. Safe to delete.`,
        ''
      ].join('\r\n'),
      'utf8'
    )
      .toString('base64url')
      .replace(/=+$/g, '');

    const draft = await createDraft(operator.accessToken, raw);
    try {
      await sendDraft(operator.accessToken, draft.draftId);
    } catch (error) {
      await deleteDraft(operator.accessToken, draft.draftId);
      throw error;
    }

    const sentAt = Date.now();
    let arrived = false;
    while (Date.now() - sentAt < POLL_FOR_MS) {
      await sleep(POLL_EVERY_MS);
      if (await markerPresent(marker)) {
        arrived = true;
        break;
      }
    }

    const seconds = Math.round((Date.now() - sentAt) / 1000);
    if (arrived) {
      await setRoutingVerifiedAt(operator.accessToken, new Date());
      await appendLogRow(operator.accessToken, {
        action: 'ROUTING_CHECK',
        result: 'VERIFIED',
        message: `A message to ${replyTo} was readable from the Hostinger mailbox in ${seconds}s. Reply detection can see replies.`
      });
      return Response.json({
        ok: true,
        message: `Verified — a message to ${replyTo} was readable from the Hostinger mailbox in ${seconds}s. Reply detection will work. You can delete the "${subject}" email.`
      });
    }

    await appendLogRow(operator.accessToken, {
      action: 'ROUTING_CHECK',
      result: 'FAILED',
      message: `A message to ${replyTo} was not found in the Hostinger inbox within ${POLL_FOR_MS / 1000}s.`
    });
    return Response.json(
      {
        error:
          `Not verified. The IMAP login worked, but a message to ${replyTo} did not appear in the Hostinger inbox within ${POLL_FOR_MS / 1000}s. ` +
          'Check the address actually receives mail at mail.hostinger.com, and that the console is reading the right mailbox.'
      },
      { status: 409 }
    );
  } catch (error) {
    return errorResponse(error);
  }
}
