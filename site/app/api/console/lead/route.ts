import {
  buildEmailCounts,
  buildInitialSafetyIndex,
  findLeadById,
  getInitialApprovalIssue,
  hasInitialSuccessEvidence,
  validateLeadId
} from '@/lib/approval';
import { ACTIVE_OUTREACH_STATUSES, LEAD_HEADERS, STATUS, STATUS_VALUES } from '@/lib/constants';
import { toLead } from '@/lib/leads';
import { readArgs } from '@/lib/request';
import { getLeadRows, leadValue, type LeadRecord } from '@/lib/sheets';
import { appendLogRow, updateLeadCells, type CellUpdate } from '@/lib/sheets-write';
import { errorResponse, requireOperator } from '@/lib/session';
import { normalizeStatus } from '@/lib/templates';
import {
  isValidSingleEmail,
  normalizeEmail,
  sanitizeUiMultilineText,
  sanitizeUiText
} from '@/lib/text';

export const dynamic = 'force-dynamic';

/** Applies pending updates to a copy so approval can be judged post-edit. */
function withUpdates(record: LeadRecord, updates: Record<string, unknown>): LeadRecord {
  const values = [...record.values];
  Object.entries(updates).forEach(([header, value]) => {
    const column = record.headerMap[header];
    if (column) values[column - 1] = value;
  });
  return { ...record, values };
}

export async function POST(request: Request) {
  try {
    const operator = await requireOperator();
    const [payload] = await readArgs(request);
    const lead = payload as Record<string, unknown> | null;
    if (!lead || typeof lead !== 'object') throw new Error('Lead data is required.');

    const id = validateLeadId(lead.id);
    const records = await getLeadRows(operator.accessToken);
    const record = findLeadById(records, id);
    if (!record) throw Object.assign(new Error('That lead no longer exists.'), { status: 404 });

    const currentStatus = normalizeStatus(leadValue(record, LEAD_HEADERS.STATUS));
    const company = sanitizeUiText(lead.company, 200);
    const contactName = sanitizeUiText(lead.contactName, 160);
    const email = normalizeEmail(lead.email);
    const category = sanitizeUiText(lead.category, 160);
    const website = sanitizeUiText(lead.website, 500);
    const personalization = sanitizeUiMultilineText(lead.personalization, 1200);
    const notes = sanitizeUiMultilineText(lead.notes, 2000);
    const requestedStatus = normalizeStatus(lead.status || currentStatus || STATUS.NEW);
    const optOut = lead.optOut === true;

    if (!STATUS_VALUES.includes(requestedStatus as never)) throw new Error('Choose a valid status.');
    if (email && !isValidSingleEmail(email)) {
      throw new Error('Email must be blank or contain exactly one valid address.');
    }
    if (website && !/^https?:\/\//i.test(website)) {
      throw new Error('Website must begin with http:// or https://.');
    }

    const updates: Record<string, unknown> = {
      [LEAD_HEADERS.COMPANY]: company,
      [LEAD_HEADERS.CONTACT_NAME]: contactName,
      [LEAD_HEADERS.EMAIL]: email,
      [LEAD_HEADERS.NORMALIZED_EMAIL]: email,
      [LEAD_HEADERS.CATEGORY]: category,
      [LEAD_HEADERS.WEBSITE]: website,
      [LEAD_HEADERS.PERSONALIZATION]: personalization,
      [LEAD_HEADERS.NOTES]: notes,
      [LEAD_HEADERS.OPT_OUT]: optOut,
      [LEAD_HEADERS.STATUS]: requestedStatus,
      [LEAD_HEADERS.UPDATED_AT]: new Date().toISOString()
    };

    if (optOut) {
      updates[LEAD_HEADERS.STATUS] = STATUS.DO_NOT_CONTACT;
      updates[LEAD_HEADERS.REPLY_STATUS] = 'OPTED_OUT';
    }

    // Editing the address after a send would silently redirect follow-ups, so
    // the row is quarantined for a human instead.
    const sentTo = normalizeEmail(leadValue(record, LEAD_HEADERS.SENT_TO_EMAIL));
    if (sentTo && email !== sentTo && ACTIVE_OUTREACH_STATUSES.includes(currentStatus as never)) {
      updates[LEAD_HEADERS.STATUS] = STATUS.REVIEW_REQUIRED;
      updates[LEAD_HEADERS.LAST_ERROR] = 'Email changed after initial send; follow-ups paused.';
    }

    if (updates[LEAD_HEADERS.STATUS] === STATUS.APPROVED) {
      const candidate = withUpdates(record, updates);
      const issue = getInitialApprovalIssue(
        candidate,
        records,
        id,
        buildInitialSafetyIndex(records),
        buildEmailCounts(records)
      );
      if (issue) throw new Error(`Approval refused: ${issue}`);
    }

    if (
      hasInitialSuccessEvidence(record) &&
      [STATUS.NEW, STATUS.APPROVED].includes(updates[LEAD_HEADERS.STATUS] as never)
    ) {
      throw new Error('A contacted lead cannot be moved back to NEW or APPROVED.');
    }

    const cells: CellUpdate[] = Object.entries(updates).map(([header, value]) => ({
      header,
      value: value as CellUpdate['value']
    }));
    await updateLeadCells(operator.accessToken, record, cells);

    await appendLogRow(operator.accessToken, {
      company,
      email,
      action: optOut ? 'OPT_OUT' : 'UI_EDIT',
      result: optOut ? 'RECORDED' : 'SUCCESS',
      message: optOut
        ? 'Opt Out set in the Vercel operator console.'
        : 'Operator updated lead fields/status in the Vercel console.'
    });

    return Response.json(toLead(withUpdates(record, updates), new Date()));
  } catch (error) {
    return errorResponse(error);
  }
}
