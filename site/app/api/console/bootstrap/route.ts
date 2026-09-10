import { CONFIG, isMailboxOwner, mailboxOwner, spreadsheetUrl } from '@/lib/config';
import { CATEGORY_VALUES, STATUS_VALUES } from '@/lib/constants';
import { summarize, toLead } from '@/lib/leads';
import { getLeadRows, getLogEntries } from '@/lib/sheets';
import { isSystemDisabled } from '@/lib/killswitch';
import { campaignWindowOpen, countSentToday, sendsArmed } from '@/lib/send';
import { errorResponse, requireOperator } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const operator = await requireOperator();
    const now = new Date();

    const [records, logs] = await Promise.all([
      getLeadRows(operator.accessToken),
      getLogEntries(operator.accessToken, CONFIG.UI.MAX_LOG_ROWS)
    ]);

    const allLeads = records.map((record) => toLead(record, now));
    const { statusCounts, metrics } = summarize(allLeads);
    const leads = allLeads.slice(0, CONFIG.UI.MAX_LEADS_RETURNED);
    const disabled = await isSystemDisabled(operator.accessToken);
    const armed = sendsArmed() && campaignWindowOpen(now) && !disabled;
    const sentToday = countSentToday(records, now);
    const ownsMailbox = isMailboxOwner(operator.email);

    return Response.json({
      generatedAt: now.toISOString(),
      ownerEmail: operator.email,
      title: CONFIG.UI.TITLE,
      event: {
        name: CONFIG.EVENT.NAME,
        date: CONFIG.EVENT.DATE_DISPLAY,
        location: CONFIG.EVENT.LOCATION_DISPLAY,
        organization: CONFIG.EVENT.ORGANIZATION
      },
      sender: {
        from: CONFIG.SENDER.FROM_EMAIL,
        replyTo: CONFIG.SENDER.REPLY_TO_EMAIL,
        cc: [...CONFIG.SENDER.CC_EMAILS]
      },
      imports: {
        maxRows: CONFIG.UI.MAX_IMPORT_ROWS,
        maxFileBytes: CONFIG.UI.MAX_IMPORT_FILE_BYTES
      },
      safety: {
        // Sending is armed by an explicit environment flag, so a deploy alone
        // can never make this console capable of delivery.
        mode: armed ? 'LIVE' : 'MANAGE_ONLY',
        sendsEnabled: armed && ownsMailbox,
        mailboxOwner: mailboxOwner(),
        ownsMailbox,
        dryRun: false,
        testMode: false,
        systemDisabled: disabled,
        dailyLimit: CONFIG.SAFETY.DAILY_SEND_LIMIT,
        sentToday,
        remainingToday: armed ? Math.max(0, CONFIG.SAFETY.DAILY_SEND_LIMIT - sentToday) : 0,
        triggerCount: 0,
        // Reserved for genuine problems that would block a live send. Being
        // read-only is not one — the banner above the dashboard already says
        // so, and surfacing it here reads as a fault that needs fixing.
        configurationErrors: [],
        configurationWarnings: []
      },
      metrics,
      statuses: STATUS_VALUES,
      categories: [...CATEGORY_VALUES],
      statusCounts,
      leads,
      truncated: allLeads.length > leads.length,
      logs,
      spreadsheetUrl: spreadsheetUrl()
    });
  } catch (error) {
    return errorResponse(error);
  }
}
