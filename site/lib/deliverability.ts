/**
 * Checks that replies can actually reach the mailbox this console reads.
 *
 * Sending and receiving are separate paths here. Gmail sends as
 * taran@asaiverse.com through a Send-As alias, but a reply follows the
 * domain's MX record — and if that points somewhere other than Google, the
 * reply lands in a mailbox the Gmail API cannot see. Reply detection then
 * reports "no replies" indefinitely while opt-outs go unnoticed and follow-ups
 * keep going out. Nothing errors, which is what makes it worth checking for.
 */

import { CONFIG } from './config';
import { normalizeEmail, safeDisplayText } from './text';

type MxAnswer = { data?: string };

const GOOGLE_MX = /(^|\.)(google\.com|googlemail\.com|aspmx\.l\.google\.com)\.?$/i;

let cached: { checkedAt: number; warning: string; verifiedKey: string } | null = null;
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

/** A loopback proof older than this is treated as stale — forwarding rules get removed. */
const VERIFICATION_VALID_DAYS = 14;

/**
 * Returns a warning when replies would land outside Gmail, or '' when the
 * routing is fine or undeterminable. Never throws — a DNS hiccup must not
 * take the dashboard down.
 *
 * DNS can only say where mail is delivered, not whether that mailbox forwards
 * on. So when the MX points away from Google, the verdict comes from the last
 * successful loopback test instead: a recent proof clears the warning, no
 * proof or a stale one raises it and says how to clear it.
 */
export async function replyRoutingWarning(verifiedAt: Date | null): Promise<string> {
  if (cached && Date.now() - cached.checkedAt < CACHE_MS && cached.verifiedKey === String(verifiedAt)) {
    return cached.warning;
  }

  let warning = '';
  try {
    const replyTo = normalizeEmail(CONFIG.SENDER.REPLY_TO_EMAIL);
    const domain = replyTo.split('@')[1];
    if (domain) {
      const hosts = await lookupMx(domain);
      const deliveredElsewhere = hosts.length && !hosts.some((host) => GOOGLE_MX.test(host));

      if (deliveredElsewhere) {
        const ageDays = verifiedAt ? (Date.now() - verifiedAt.getTime()) / 86_400_000 : Infinity;
        if (ageDays > VERIFICATION_VALID_DAYS) {
          const host = hosts[0].replace(/\.$/, '');
          warning = verifiedAt
            ? `Reply routing was last proven ${Math.floor(ageDays)} days ago. Replies to ${replyTo} are delivered to ${host}; ` +
              'run "Verify reply routing" to confirm forwarding into Gmail still works.'
            : `Replies to ${replyTo} are delivered to ${host}, not Gmail, so reply detection cannot see them unless that mailbox forwards into Gmail. ` +
              'Set up forwarding, then run "Verify reply routing" to prove it and clear this. ' +
              'Until then, opt-outs will go unnoticed and follow-ups will keep sending to brands that have already replied.';
        }
      }
    }
  } catch {
    // An unreachable resolver is not evidence of a problem.
  }

  cached = { checkedAt: Date.now(), warning, verifiedKey: String(verifiedAt) };
  return warning;
}
