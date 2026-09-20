import { CONFIG } from '@/lib/config';
import { assertSendAsAuthorized, createDraft, deleteDraft, sendDraft } from '@/lib/gmail';
import { setRoutingVerifiedAt } from '@/lib/killswitch';
import { appendLogRow } from '@/lib/sheets-write';
import { errorResponse, requireMailboxOwner } from '@/lib/session';
import { normalizeEmail } from '@/lib/text';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 90;

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';
const POLL_EVERY_MS = 5000;
const POLL_FOR_MS = 60000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Proves, rather than infers, that a reply to the reply-to address reaches the
 * Gmail inbox this console reads.
 *
 * A marker message is sent as the campaign identity to the reply-to address —
 * the exact path a brand's reply takes: out through Gmail, in through the
 * domain's MX (Hostinger), and back into Gmail only if that mailbox forwards.
 * The inbox is then polled for the marker. Arrival is recorded in the control
 * tab; the dashboard warning reads that instead of guessing from DNS.
 */
export async function POST() {
  try {
    const operator = await requireMailboxOwner();
    await assertSendAsAuthorized(operator.accessToken);

    const replyTo = normalizeEmail(CONFIG.SENDER.REPLY_TO_EMAIL);
    const from = normalizeEmail(CONFIG.SENDER.FROM_EMAIL);
    const marker = `routing-check-${crypto.randomUUID().slice(0, 8)}`;
    const subject = `[Asaiverse console] Reply routing check ${marker}`;

    // Minimal, self-addressed, no CC — this must never look like outreach.
    const raw = Buffer.from(
      [
        `To: ${replyTo}`,
        `From: ${from}`,
        `Subject: ${subject}`,
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset="UTF-8"',
        '',
        `Automated loopback test ${marker}. If this is in the Gmail inbox, replies from brands will be too. Safe to delete.`,
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
      // in:inbox excludes the copy in Sent; the forwarded arrival lands in Inbox.
      const query = encodeURIComponent(`in:inbox subject:"${marker}"`);
      const response = await fetch(`${GMAIL_API}/messages?q=${query}&maxResults=1`, {
        headers: { Authorization: `Bearer ${operator.accessToken}` },
        cache: 'no-store'
      });
      if (response.ok) {
        const body = (await response.json()) as { messages?: { id: string }[] };
        if (body.messages?.length) {
          arrived = true;
          break;
        }
      }
    }

    if (arrived) {
      const when = new Date();
      await setRoutingVerifiedAt(operator.accessToken, when);
      await appendLogRow(operator.accessToken, {
        action: 'ROUTING_CHECK',
        result: 'VERIFIED',
        message: `A message to ${replyTo} reached the Gmail inbox in ${Math.round((Date.now() - sentAt) / 1000)}s. Reply detection can see replies.`
      });
      return Response.json({
        ok: true,
        message: `Verified — a message to ${replyTo} reached your Gmail inbox in ${Math.round((Date.now() - sentAt) / 1000)}s. Reply detection will work. You can delete the "${subject}" email.`
      });
    }

    await appendLogRow(operator.accessToken, {
      action: 'ROUTING_CHECK',
      result: 'FAILED',
      message: `A message to ${replyTo} did not reach the Gmail inbox within ${POLL_FOR_MS / 1000}s. It is sitting in the Hostinger mailbox.`
    });
    return Response.json(
      {
        error:
          `Not verified. A message to ${replyTo} did not reach your Gmail inbox within ${POLL_FOR_MS / 1000}s — ` +
          'it is sitting in the Hostinger mailbox. Set up forwarding from Hostinger to Gmail, or a POP fetch in Gmail, then run this again. ' +
          'If you only just enabled forwarding, give it a few minutes and retry.'
      },
      { status: 409 }
    );
  } catch (error) {
    return errorResponse(error);
  }
}
