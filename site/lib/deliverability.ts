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

let cached: { checkedAt: number; warning: string } | null = null;
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

/**
 * Returns a warning when replies would land outside Gmail, or '' when the
 * routing is fine or undeterminable. Never throws — a DNS hiccup must not
 * take the dashboard down.
 */
export async function replyRoutingWarning(): Promise<string> {
  if (cached && Date.now() - cached.checkedAt < CACHE_MS) return cached.warning;

  let warning = '';
  try {
    const replyTo = normalizeEmail(CONFIG.SENDER.REPLY_TO_EMAIL);
    const domain = replyTo.split('@')[1];
    if (domain) {
      const hosts = await lookupMx(domain);
      if (hosts.length && !hosts.some((host) => GOOGLE_MX.test(host))) {
        warning =
          `Replies to ${replyTo} are delivered to ${hosts[0].replace(/\.$/, '')}, not Gmail, ` +
          'so reply detection cannot see them unless that mailbox forwards into Gmail. ' +
          'Until it does, opt-outs will go unnoticed and follow-ups will keep sending to brands that have already replied.';
      }
    }
  } catch {
    // An unreachable resolver is not evidence of a problem.
  }

  cached = { checkedAt: Date.now(), warning };
  return warning;
}
