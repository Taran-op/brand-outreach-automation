/**
 * Reads the Hostinger mailbox over IMAP.
 *
 * Outbound mail leaves through Gmail as taran@asaiverse.com, but a reply
 * follows the domain's MX record to Hostinger. Gmail never sees it. Rather
 * than depend on forwarding rules the operator cannot set, or on Gmail's POP
 * fetching, which Google is retiring, the console reads replies from the
 * mailbox they actually arrive in.
 */

import { ImapFlow } from 'imapflow';
import { safeDisplayText } from './text';

export class MailboxNotConfigured extends Error {
  readonly status = 409;
  constructor(message: string) {
    super(message);
    this.name = 'MailboxNotConfigured';
  }
}

export const mailboxConfigured = (): boolean =>
  Boolean(process.env.HOSTINGER_IMAP_USER && process.env.HOSTINGER_IMAP_PASSWORD);

function connection(): ImapFlow {
  const user = process.env.HOSTINGER_IMAP_USER;
  const pass = process.env.HOSTINGER_IMAP_PASSWORD;
  if (!user || !pass) {
    throw new MailboxNotConfigured(
      'HOSTINGER_IMAP_USER and HOSTINGER_IMAP_PASSWORD are not set, so replies in the Hostinger mailbox cannot be read.'
    );
  }
  return new ImapFlow({
    host: process.env.HOSTINGER_IMAP_HOST || 'imap.hostinger.com',
    port: Number(process.env.HOSTINGER_IMAP_PORT || 993),
    secure: true,
    auth: { user, pass },
    logger: false,
    // A serverless function must not hang on a slow mailbox.
    connectionTimeout: 15000,
    greetingTimeout: 10000,
    socketTimeout: 30000
  });
}

/** Shape shared with Gmail messages so one classifier handles both sources. */
export type InboundMessage = {
  id: string;
  source: 'HOSTINGER';
  headers: Record<string, string>;
  plainText: string;
  receivedAt: Date;
};

async function withMailbox<T>(work: (client: ImapFlow) => Promise<T>): Promise<T> {
  const client = connection();
  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    try {
      return await work(client);
    } finally {
      lock.release();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/auth|login|credentials|AUTHENTICATIONFAILED/i.test(message)) {
      throw new MailboxNotConfigured(
        `Hostinger rejected the IMAP login for ${process.env.HOSTINGER_IMAP_USER}. Check HOSTINGER_IMAP_PASSWORD.`
      );
    }
    throw error;
  } finally {
    await client.logout().catch(() => undefined);
  }
}

const headerMap = (raw: Map<string, string[]> | undefined): Record<string, string> => {
  const out: Record<string, string> = {};
  raw?.forEach((values, name) => {
    out[name.toLowerCase()] = values.join(' ');
  });
  return out;
};

/**
 * Finds messages that answer any of the given RFC Message-IDs, plus anything
 * from the lead's address on the same subject in case a client dropped the
 * threading headers.
 */
export async function findRepliesInMailbox(
  rfcMessageIds: string[],
  leadEmail: string,
  subject: string
): Promise<InboundMessage[]> {
  const ids = rfcMessageIds.map((id) => id.trim()).filter(Boolean);
  if (!ids.length && !leadEmail) return [];

  return withMailbox(async (client) => {
    const seen = new Set<number>();
    const uids: number[] = [];

    const collect = async (criteria: Parameters<ImapFlow['search']>[0]) => {
      const found = await client.search(criteria, { uid: true });
      if (Array.isArray(found)) {
        for (const uid of found) {
          if (!seen.has(uid)) {
            seen.add(uid);
            uids.push(uid);
          }
        }
      }
    };

    for (const id of ids) {
      await collect({ header: { 'in-reply-to': id } });
      await collect({ header: { references: id } });
    }
    if (leadEmail && subject) {
      // Subject match is deliberately loose: replies prefix "Re:" and some
      // clients re-wrap it.
      const core = subject.replace(/^\s*(re|fwd?|aw|sv)\s*:\s*/i, '').slice(0, 60);
      await collect({ from: leadEmail, subject: core });
    }

    const messages: InboundMessage[] = [];
    for (const uid of uids.slice(0, 20)) {
      const fetched = await client.fetchOne(
        String(uid),
        { uid: true, envelope: true, headers: true, internalDate: true, source: true },
        { uid: true }
      );
      if (!fetched) continue;

      const headers = headerMap(parseHeaderBlock(fetched.headers));
      const plainText = extractPlainText(fetched.source ? fetched.source.toString('utf8') : '');
      messages.push({
        id: `hostinger-${uid}`,
        source: 'HOSTINGER',
        headers,
        plainText,
        receivedAt: fetched.internalDate ? new Date(fetched.internalDate) : new Date()
      });
    }
    return messages;
  });
}

/** Parses a raw RFC 5322 header block into name → values. */
function parseHeaderBlock(block: Buffer | undefined): Map<string, string[]> {
  const map = new Map<string, string[]>();
  if (!block) return map;
  const text = block.toString('utf8').replace(/\r\n[ \t]+/g, ' ');
  for (const line of text.split(/\r?\n/)) {
    const at = line.indexOf(':');
    if (at <= 0) continue;
    const name = line.slice(0, at).trim();
    const value = line.slice(at + 1).trim();
    const list = map.get(name) || [];
    list.push(value);
    map.set(name, list);
  }
  return map;
}

/**
 * Pulls the text/plain part out of a raw message, falling back to a stripped
 * text/html part. Good enough for opt-out detection, which only needs the
 * sender's own top lines.
 */
function extractPlainText(source: string): string {
  if (!source) return '';
  const split = source.indexOf('\r\n\r\n');
  const body = split >= 0 ? source.slice(split + 4) : source;

  const boundary = /boundary="?([^";\r\n]+)"?/i.exec(source.slice(0, split >= 0 ? split : 4000))?.[1];
  const parts = boundary ? body.split(`--${boundary}`) : [body];

  let plain = '';
  let html = '';
  for (const part of parts) {
    const headerEnd = part.indexOf('\r\n\r\n');
    const partHeaders = (headerEnd >= 0 ? part.slice(0, headerEnd) : '').toLowerCase();
    const content = headerEnd >= 0 ? part.slice(headerEnd + 4) : part;
    const decoded = decodeTransfer(content, partHeaders);
    if (/content-type:\s*text\/plain/.test(partHeaders) && !plain) plain = decoded;
    else if (/content-type:\s*text\/html/.test(partHeaders) && !html) html = decoded;
    else if (!boundary && !plain) plain = decoded;
  }

  if (plain) return plain;
  return html
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&');
}

function decodeTransfer(content: string, partHeaders: string): string {
  if (/content-transfer-encoding:\s*base64/.test(partHeaders)) {
    try {
      return Buffer.from(content.replace(/\s+/g, ''), 'base64').toString('utf8');
    } catch {
      return '';
    }
  }
  if (/content-transfer-encoding:\s*quoted-printable/.test(partHeaders)) {
    return content
      .replace(/=\r?\n/g, '')
      .replace(/=([0-9A-F]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  }
  return content;
}

/** Logs in and looks for one marker subject — the loopback proof. */
export async function markerPresent(marker: string): Promise<boolean> {
  return withMailbox(async (client) => {
    const found = await client.search({ subject: marker }, { uid: true });
    return Array.isArray(found) && found.length > 0;
  });
}

export const describeMailbox = (): string =>
  safeDisplayText(process.env.HOSTINGER_IMAP_USER) || '(not configured)';
