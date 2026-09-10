import { findLeadById, validateLeadId } from '@/lib/approval';
import { loadBrochure } from '@/lib/brochure';
import { ACTION, LEAD_HEADERS } from '@/lib/constants';
import { assertSendAsAuthorized, buildRawMime, createDraft, deleteDraft, sendDraft } from '@/lib/gmail';
import { isSystemDisabled } from '@/lib/killswitch';
import { readArgs } from '@/lib/request';
import { campaignWindowOpen, sendsArmed } from '@/lib/send';
import { getLeadRows, leadValue } from '@/lib/sheets';
import { appendLogRow } from '@/lib/sheets-write';
import { errorResponse, requireMailboxOwner } from '@/lib/session';
import { buildEmailForLead, buildTestEnvelope, determinePreviewAction } from '@/lib/templates';
import { normalizeEmail, safeDisplayText } from '@/lib/text';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * Sends one redirected smoke test to the signed-in operator's own mailbox.
 *
 * The destination is taken from the Google session, never from the request, so
 * a test can only ever reach the person who triggered it. No lead evidence is
 * written, no status advances, and the daily send budget is untouched — this
 * exercises Send-As, MIME, CC and delivery without spending a real send or
 * touching a brand.
 */
export async function POST(request: Request) {
  try {
    const operator = await requireMailboxOwner();
    const [rawId] = await readArgs(request).catch(() => [undefined]);

    if (!sendsArmed()) throw Object.assign(new Error('Sending is not armed on this deployment.'), { status: 409 });
    if (!campaignWindowOpen(new Date())) {
      throw Object.assign(new Error('The campaign send cutoff has passed.'), { status: 409 });
    }
    if (await isSystemDisabled(operator.accessToken)) {
      throw Object.assign(new Error('Emergency disable is active.'), { status: 409 });
    }

    // Proves FROM_EMAIL is a verified Send-As before composing anything —
    // the single check most likely to fail on a first real send.
    await assertSendAsAuthorized(operator.accessToken);

    const records = await getLeadRows(operator.accessToken);
    if (!records.length) throw new Error('There are no leads to build a test message from.');

    const record = rawId ? findLeadById(records, validateLeadId(rawId)) : records[0];
    if (!record) throw Object.assign(new Error('That lead no longer exists.'), { status: 404 });

    const action = determinePreviewAction(record);
    const brochure = action === ACTION.INITIAL ? await loadBrochure() : null;
    const real = buildEmailForLead(record, action, { inlineImageCid: brochure?.contentId });
    const intended = normalizeEmail(leadValue(record, LEAD_HEADERS.EMAIL));
    const test = buildTestEnvelope(real, operator.email, intended);

    const raw = buildRawMime({
      to: test.to,
      cc: test.cc,
      subject: test.subject,
      plainBody: test.plainBody,
      htmlBody: test.htmlBody,
      leadId: 'TEST',
      action: `TEST_${action}`,
      attemptId: crypto.randomUUID(),
      inlineImage: brochure ?? undefined
    });

    const draft = await createDraft(operator.accessToken, raw);
    try {
      const sent = await sendDraft(operator.accessToken, draft.draftId);
      await appendLogRow(operator.accessToken, {
        company: safeDisplayText(leadValue(record, LEAD_HEADERS.COMPANY)),
        email: test.to,
        action: `TEST_${action}`,
        result: 'SENT',
        message: `Redirected test sent to ${test.to}. No lead state changed.`
      });

      return Response.json({
        ok: true,
        to: test.to,
        cc: test.cc,
        subject: test.subject,
        threadId: sent.threadId,
        message: `Test sent to ${test.to} with ${test.cc.length} CC. No lead was contacted and no lead state changed.`
      });
    } catch (error) {
      // A test that failed to send must not leave a stray draft behind.
      await deleteDraft(operator.accessToken, draft.draftId);
      throw error;
    }
  } catch (error) {
    return errorResponse(error);
  }
}
