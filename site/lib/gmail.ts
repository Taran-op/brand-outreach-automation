/**
 * Port of src/05_GmailService.gs.
 *
 * Mail is composed as a draft first, then sent. That indirection is the whole
 * safety story: creating a draft yields a draft id and thread id that can be
 * recorded *before* anything leaves the mailbox, so a crash mid-send leaves
 * evidence to reconcile against instead of an unanswerable "did it send?".
 */

import { CONFIG } from './config';
import { isValidSingleEmail, normalizeEmail, safeDisplayText } from './text';
import { configuredCcEmails } from './templates';

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';

export class GmailError extends Error {
  readonly status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.name = 'GmailError';
    this.status = status;
  }
}

async function gmailRequest<T>(path: string, init: RequestInit, accessToken: string): Promise<T> {
  const response = await fetch(`${GMAIL_API}${path}`, {
    ...init,
    headers: {
      ...(init.headers || {}),
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    cache: 'no-store'
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    let message = safeDisplayText(detail).slice(0, 300);
    try {
      message = safeDisplayText((JSON.parse(detail) as { error?: { message?: string } }).error?.message) || message;
    } catch {
      // Keep the raw text.
    }
    if (response.status === 401 || response.status === 403) {
      throw new GmailError(
        `Gmail refused the request. The session may lack mail scopes — sign out and back in. Google said: ${message}`,
        response.status
      );
    }
    throw new GmailError(`Gmail API error ${response.status}: ${message}`, response.status);
  }

  return (await response.json()) as T;
}

const sanitizeHeaderValue = (value: unknown): string =>
  String(value ?? '').replace(/[\r\n]+/g, ' ').trim();

const sanitizeReferenceHeader = (value: unknown): string =>
  String(value ?? '').replace(/[\r\n]+/g, ' ').trim();

const base64Utf8 = (value: string) => Buffer.from(value, 'utf8').toString('base64');

const foldBase64 = (value: string): string => (value.match(/.{1,76}/g) || []).join('\r\n');

/** RFC 2047 encoded-words, folded so no single word exceeds 75 characters. */
export function encodeHeaderWord(value: unknown): string {
  const text = sanitizeHeaderValue(value);
  if (!text) return '=?UTF-8?B??=';

  const chunks: string[] = [];
  let current = '';
  for (const character of Array.from(text)) {
    const candidate = current + character;
    // The =?UTF-8?B?...?= wrapper costs 12 characters of the 75 budget.
    if (base64Utf8(candidate).length > 60 && current) {
      chunks.push(current);
      current = character;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);

  return chunks.map((chunk) => `=?UTF-8?B?${base64Utf8(chunk)}?=`).join('\r\n ');
}

const sameEmailSet = (a: string[], b: string[]): boolean => {
  const left = [...new Set(a.map(normalizeEmail))].sort();
  const right = [...new Set(b.map(normalizeEmail))].sort();
  return left.length === right.length && left.every((value, index) => value === right[index]);
};

export type MimeParams = {
  to: string;
  cc: string[];
  subject: string;
  plainBody: string;
  htmlBody: string;
  leadId: string;
  action: string;
  attemptId: string;
  inReplyTo?: string;
  references?: string;
};

/**
 * Builds the exact bytes that will be sent. The CC list is re-verified against
 * CONFIG here rather than trusted from the caller, so an internal address can
 * never be dropped and the lead can never be one of them.
 */
export function buildRawMime(params: MimeParams): string {
  const to = normalizeEmail(params.to);
  const configuredCc = configuredCcEmails();
  const cc = (params.cc || []).map(normalizeEmail);
  const fromEmail = normalizeEmail(CONFIG.SENDER.FROM_EMAIL);
  const replyTo = normalizeEmail(CONFIG.SENDER.REPLY_TO_EMAIL);

  if (!isValidSingleEmail(to)) throw new GmailError('Cannot build MIME for an invalid recipient.', 400);
  if (!isValidSingleEmail(fromEmail)) throw new GmailError('CONFIG.SENDER.FROM_EMAIL is invalid.', 500);
  if (!isValidSingleEmail(replyTo)) throw new GmailError('CONFIG.SENDER.REPLY_TO_EMAIL is invalid.', 500);
  if (!sameEmailSet(cc, configuredCc)) {
    throw new GmailError('Email CC list does not exactly match CONFIG.SENDER.CC_EMAILS.', 500);
  }
  if (configuredCc.includes(to)) {
    throw new GmailError('The lead To address cannot also be a configured internal CC.', 400);
  }

  const boundary = `brand_outreach_${crypto.randomUUID().replace(/-/g, '')}`;
  const headers = [
    `To: ${to}`,
    `Cc: ${configuredCc.join(', ')}`,
    `From: ${encodeHeaderWord(safeDisplayText(CONFIG.SENDER.NAME))} <${fromEmail}>`,
    `Reply-To: ${replyTo}`,
    `Subject: ${encodeHeaderWord(sanitizeHeaderValue(params.subject))}`,
    `X-Brand-Outreach-Campaign-ID: ${sanitizeHeaderValue(CONFIG.CAMPAIGN_ID)}`,
    `X-Brand-Outreach-Lead-ID: ${sanitizeHeaderValue(params.leadId)}`,
    `X-Brand-Outreach-Action: ${sanitizeHeaderValue(params.action)}`,
    `X-Brand-Outreach-Attempt-ID: ${sanitizeHeaderValue(params.attemptId)}`
  ];
  if (params.inReplyTo) headers.push(`In-Reply-To: ${sanitizeReferenceHeader(params.inReplyTo)}`);
  if (params.references) headers.push(`References: ${sanitizeReferenceHeader(params.references)}`);
  headers.push('MIME-Version: 1.0');
  headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);

  const raw = headers
    .concat([
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      'Content-Transfer-Encoding: base64',
      '',
      foldBase64(base64Utf8(String(params.plainBody || ''))),
      `--${boundary}`,
      'Content-Type: text/html; charset="UTF-8"',
      'Content-Transfer-Encoding: base64',
      '',
      foldBase64(base64Utf8(String(params.htmlBody || ''))),
      `--${boundary}--`,
      ''
    ])
    .join('\r\n');

  return Buffer.from(raw, 'utf8').toString('base64url').replace(/=+$/g, '');
}

export type DraftHandle = { draftId: string; messageId: string; threadId: string };

export async function createDraft(
  accessToken: string,
  raw: string,
  threadId?: string
): Promise<DraftHandle> {
  const message: Record<string, unknown> = { raw };
  if (threadId) message.threadId = threadId;

  const draft = await gmailRequest<{ id: string; message: { id: string; threadId: string } }>(
    '/drafts',
    { method: 'POST', body: JSON.stringify({ message }) },
    accessToken
  );

  return { draftId: draft.id, messageId: draft.message.id, threadId: draft.message.threadId };
}

export type SentMessage = { messageId: string; threadId: string; rfcMessageId: string; sentAt: Date };

export async function sendDraft(accessToken: string, draftId: string): Promise<SentMessage> {
  const sent = await gmailRequest<{ id: string; threadId: string }>(
    '/drafts/send',
    { method: 'POST', body: JSON.stringify({ id: draftId }) },
    accessToken
  );
  const detail = await getMessageHeaders(accessToken, sent.id);
  return {
    messageId: sent.id,
    threadId: sent.threadId,
    rfcMessageId: detail['message-id'] || '',
    sentAt: new Date()
  };
}

export async function getMessageHeaders(
  accessToken: string,
  messageId: string
): Promise<Record<string, string>> {
  const message = await gmailRequest<{ payload?: { headers?: { name: string; value: string }[] } }>(
    `/messages/${encodeURIComponent(messageId)}?format=metadata`,
    { method: 'GET' },
    accessToken
  );
  const headers: Record<string, string> = {};
  (message.payload?.headers || []).forEach((header) => {
    headers[header.name.toLowerCase()] = header.value;
  });
  return headers;
}

/** True when the draft still exists, i.e. it was never sent. */
export async function draftStillExists(accessToken: string, draftId: string): Promise<boolean> {
  try {
    await gmailRequest(`/drafts/${encodeURIComponent(draftId)}?format=minimal`, { method: 'GET' }, accessToken);
    return true;
  } catch (error) {
    if (error instanceof GmailError && error.status === 404) return false;
    throw error;
  }
}

/**
 * Looks through a thread for a message carrying our attempt id. This is how an
 * interrupted send is resolved without ever sending a second copy.
 */
export async function findSentMessageByAttempt(
  accessToken: string,
  threadId: string,
  attemptId: string,
  expectedRecipient: string
): Promise<SentMessage | null> {
  if (!threadId || !attemptId) return null;

  const thread = await gmailRequest<{ messages?: { id: string }[] }>(
    `/threads/${encodeURIComponent(threadId)}?format=metadata`,
    { method: 'GET' },
    accessToken
  );

  for (const message of thread.messages || []) {
    const headers = await getMessageHeaders(accessToken, message.id);
    if (headers['x-brand-outreach-attempt-id'] !== attemptId) continue;
    if (headers['x-brand-outreach-campaign-id'] !== CONFIG.CAMPAIGN_ID) continue;
    if (normalizeEmail(headers.to) !== normalizeEmail(expectedRecipient)) continue;

    return {
      messageId: message.id,
      threadId,
      rfcMessageId: headers['message-id'] || '',
      sentAt: headers.date ? new Date(headers.date) : new Date()
    };
  }
  return null;
}

export async function deleteDraft(accessToken: string, draftId: string): Promise<void> {
  try {
    await gmailRequest(`/drafts/${encodeURIComponent(draftId)}`, { method: 'DELETE' }, accessToken);
  } catch {
    // A draft that is already gone is the desired state.
  }
}

/** Confirms FROM_EMAIL is a real send-as identity before anything is composed. */
export async function assertSendAsAuthorized(accessToken: string): Promise<void> {
  const from = normalizeEmail(CONFIG.SENDER.FROM_EMAIL);
  const list = await gmailRequest<{ sendAs?: { sendAsEmail: string; verificationStatus?: string }[] }>(
    '/settings/sendAs',
    { method: 'GET' },
    accessToken
  );

  const match = (list.sendAs || []).find((entry) => normalizeEmail(entry.sendAsEmail) === from);
  if (!match) {
    throw new GmailError(
      `${from} is not a Send-As identity on this mailbox, so Gmail would rewrite the sender. Add and verify it in Gmail settings first.`,
      409
    );
  }
  if (match.verificationStatus && match.verificationStatus !== 'accepted') {
    throw new GmailError(`Send-As ${from} is not verified (${match.verificationStatus}).`, 409);
  }
}

/** Decodes RFC 2047 encoded-words so a Subject can be re-encoded exactly once. */
export function decodeRfc2047Header(value: unknown): string {
  const text = String(value ?? '');
  const pattern = /=\?([^?\s]+)\?([bq])\?([^?]*)\?=/gi;
  let output = '';
  let lastIndex = 0;
  let previousWasEncoded = false;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    const between = text.slice(lastIndex, match.index);
    if (!(previousWasEncoded && /^\s*$/.test(between))) output += between;

    let decoded = match[0];
    try {
      const charset = match[1];
      if (match[2].toLowerCase() === 'b') {
        decoded = Buffer.from(match[3], 'base64').toString(charset as BufferEncoding);
      } else {
        const qValue = match[3].replace(/_/g, ' ');
        const bytes: number[] = [];
        for (let i = 0; i < qValue.length; i += 1) {
          if (qValue[i] === '=' && /^[0-9a-f]{2}$/i.test(qValue.slice(i + 1, i + 3))) {
            bytes.push(parseInt(qValue.slice(i + 1, i + 3), 16));
            i += 2;
          } else {
            bytes.push(qValue.charCodeAt(i) & 0xff);
          }
        }
        decoded = Buffer.from(bytes).toString(charset as BufferEncoding);
      }
    } catch {
      // Keep the raw encoded word; draft validation still fails closed.
      decoded = match[0];
    }

    output += decoded;
    lastIndex = pattern.lastIndex;
    previousWasEncoded = true;
  }
  return output + text.slice(lastIndex);
}

export function buildReferencesHeader(existing: unknown, parentMessageId: unknown): string {
  const values: string[] = [];
  const collect = (source: unknown) => {
    (String(source ?? '').match(/<[^<>\r\n]+>/g) || []).forEach((item) => {
      if (!values.includes(item)) values.push(item);
    });
  };
  collect(existing);
  collect(parentMessageId);
  return values.join(' ');
}

export type ThreadAnchor = {
  threadId: string;
  rfcMessageId: string;
  references: string;
  subject: string;
};

/**
 * Reads the anchor message a follow-up must reply to. The RFC Message-ID and
 * the original Subject both come from Gmail at send time rather than from the
 * Sheet, because Gmail threads on those exact values.
 */
export async function getThreadAnchor(accessToken: string, messageId: string): Promise<ThreadAnchor> {
  const message = await gmailRequest<{
    threadId?: string;
    payload?: { headers?: { name: string; value: string }[] };
  }>(
    `/messages/${encodeURIComponent(messageId)}?format=metadata` +
      '&metadataHeaders=Message-ID&metadataHeaders=References&metadataHeaders=Subject',
    { method: 'GET' },
    accessToken
  );

  const headers: Record<string, string> = {};
  (message.payload?.headers || []).forEach((header) => {
    headers[header.name.toLowerCase()] = header.value;
  });

  const rfcMessageId = headers['message-id'] || '';
  const subject = decodeRfc2047Header(headers.subject || '');
  if (!message.threadId) throw new GmailError('The stored Gmail message has no thread.', 409);
  if (!rfcMessageId) throw new GmailError('The follow-up anchor has no RFC Message-ID header.', 409);
  if (!subject) throw new GmailError('The initial Gmail message has no Subject header.', 409);

  return { threadId: message.threadId, rfcMessageId, references: headers.references || '', subject };
}
