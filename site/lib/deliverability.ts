/**
 * Checks that replies can actually be read by this console.
 *
 * Sending and receiving are separate paths. Gmail sends as
 * taran@asaiverse.com through a Send-As alias, but a reply follows the
 * domain's MX record to Hostinger, where Gmail cannot see it. The console
 * therefore reads that mailbox over IMAP — and this check confirms it is
 * configured and has been proven to work, because a silent failure here means
 * opt-outs go unnoticed while follow-ups keep going out.
 */

import { CONFIG } from './config';
import { describeMailbox, mailboxConfigured } from './hostinger';
import { normalizeEmail, safeDisplayText } from './text';

type MxAnswer = { data?: string };

const GOOGLE_MX = /(^|\.)(google\.com|googlemail\.com|aspmx\.l\.google\.com)\.?$/i;

/** A loopback proof older than this is stale — passwords change, mailboxes move. */
const VERIFICATION_VALID_DAYS = 14;

let mxCache: { checkedAt: number; deliveredElsewhere: boolean; host: string } | null = null;
const CACHE_MS = 10 * 60 * 1000;

async function lookupMx(domain: string): Promise<string[]> {
  const response = await fetch(
    `https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=MX`,
    { headers: { Accept: 'application/dns-json' }, cache: 'no-store' }
  );
  if (!response.ok) throw new Error(`DNS lookup failed (${response.status}).`);

  const body = (await response.json()) as { Answer?: MxAnswer[] };
  return (body.Answer || [])
    .map((answer) => safeDisplayText(answer.data))
    .map((value) => value.split(/\s+/).pop() || '')
    .filter(Boolean);
}

/** Where a reply to the reply-to address is actually delivered. */
async function replyDelivery(): Promise<{ deliveredElsewhere: boolean; host: string }> {
  if (mxCache && Date.now() - mxCache.checkedAt < CACHE_MS) return mxCache;

  let deliveredElsewhere = false;
  let host = '';
  try {
    const domain = normalizeEmail(CONFIG.SENDER.REPLY_TO_EMAIL).split('@')[1];
    if (domain) {
      const hosts = await lookupMx(domain);
      deliveredElsewhere = hosts.length > 0 && !hosts.some((entry) => GOOGLE_MX.test(entry));
      host = (hosts[0] || '').replace(/\.$/, '');
    }
  } catch {
    // An unreachable resolver is not evidence of a problem.
  }

  mxCache = { checkedAt: Date.now(), deliveredElsewhere, host };
  return mxCache;
}

/**
 * Returns a warning when the console could not see a reply, or '' when it
 * can. Never throws — the dashboard must render regardless.
 */
export async function replyRoutingWarning(verifiedAt: Date | null): Promise<string> {
  const replyTo = normalizeEmail(CONFIG.SENDER.REPLY_TO_EMAIL);
  const { deliveredElsewhere, host } = await replyDelivery();

  // Replies land in Gmail itself; the thread scan sees them without help.
  if (!deliveredElsewhere) return '';

  if (!mailboxConfigured()) {
    return (
      `Replies to ${replyTo} are delivered to ${host}, which this console is not yet reading. ` +
      'Set HOSTINGER_IMAP_USER and HOSTINGER_IMAP_PASSWORD in Vercel, redeploy, then run "Verify reply routing". ' +
      'Until then, opt-outs will go unnoticed and follow-ups will keep sending to brands that have already replied.'
    );
  }

  const ageDays = verifiedAt ? (Date.now() - verifiedAt.getTime()) / 86_400_000 : Infinity;
  if (ageDays <= VERIFICATION_VALID_DAYS) return '';

  return verifiedAt
    ? `Reading ${describeMailbox()} over IMAP, last proven ${Math.floor(ageDays)} days ago. Run "Verify reply routing" to confirm it still works.`
    : `Reading ${describeMailbox()} over IMAP, but that has not been proven yet. Run "Verify reply routing" once to confirm replies are visible and clear this.`;
}
