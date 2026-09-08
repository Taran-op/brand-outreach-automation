const STATUS = Object.freeze({
  NEW: 'NEW',
  APPROVED: 'APPROVED',
  SENT: 'SENT',
  FOLLOW_UP_1: 'FOLLOW_UP_1',
  FOLLOW_UP_2: 'FOLLOW_UP_2',
  REPLIED: 'REPLIED',
  INTERESTED: 'INTERESTED',
  MEETING: 'MEETING',
  NEGOTIATING: 'NEGOTIATING',
  CLOSED: 'CLOSED',
  NOT_INTERESTED: 'NOT_INTERESTED',
  DO_NOT_CONTACT: 'DO_NOT_CONTACT',
  REVIEW_REQUIRED: 'REVIEW_REQUIRED'
});

const STATUS_VALUES = Object.freeze(Object.keys(STATUS).map(function (key) {
  return STATUS[key];
}));

const ACTIVE_OUTREACH_STATUSES = Object.freeze([
  STATUS.SENT,
  STATUS.FOLLOW_UP_1,
  STATUS.FOLLOW_UP_2
]);

const AUTOMATION_STOP_STATUSES = Object.freeze([
  STATUS.REPLIED,
  STATUS.INTERESTED,
  STATUS.MEETING,
  STATUS.NEGOTIATING,
  STATUS.CLOSED,
  STATUS.NOT_INTERESTED,
  STATUS.DO_NOT_CONTACT,
  STATUS.REVIEW_REQUIRED
]);

const REPLY_STATUS_VALUES = Object.freeze([
  'REPLY_DETECTED',
  'OPTED_OUT',
  'AUTO_REPLY',
  'BOUNCE',
  'MANUAL_REVIEW'
]);

const CATEGORY_VALUES = Object.freeze([
  'Gaming Peripherals',
  'PC Hardware',
  'Laptops',
  'Smartphones',
  'Consumer Electronics',
  'Gaming Accessories',
  'Audio',
  'Technology Startup',
  'SaaS / AI',
  'Telecom / Internet',
  'Food / FMCG',
  'Beverage',
  'Fashion / Streetwear',
  'Automotive',
  'Education / EdTech',
  'Gaming Community',
  'Creator / Entertainment',
  'Other'
]);

const LEAD_HEADERS = Object.freeze({
  COMPANY: 'Company',
  CONTACT_NAME: 'Contact Name',
  EMAIL: 'Email',
  CATEGORY: 'Category',
  WEBSITE: 'Website',
  PERSONALIZATION: 'Personalization',
  STATUS: 'Status',
  INITIAL_SENT_AT: 'Initial Sent At',
  FOLLOW_UP_1_SENT_AT: 'Follow-up 1 Sent At',
  FOLLOW_UP_2_SENT_AT: 'Follow-up 2 Sent At',
  REPLY_STATUS: 'Reply Status',
  NOTES: 'Notes',
  OPT_OUT: 'Opt Out',

  // Internal columns are hidden by setupSheet(), but intentionally remain in
  // the spreadsheet so operators can inspect them during troubleshooting.
  LEAD_ID: 'Lead ID',
  NORMALIZED_EMAIL: 'Normalized Email',
  SENT_TO_EMAIL: 'Sent To Email',
  CAMPAIGN_ID: 'Campaign ID',
  GMAIL_THREAD_ID: 'Gmail Thread ID',
  INITIAL_MESSAGE_ID: 'Initial Message ID',
  FOLLOW_UP_1_MESSAGE_ID: 'Follow-up 1 Message ID',
  FOLLOW_UP_2_MESSAGE_ID: 'Follow-up 2 Message ID',
  PENDING_ACTION: 'Pending Action',
  PENDING_ATTEMPT_ID: 'Pending Attempt ID',
  PENDING_DRAFT_ID: 'Pending Draft ID',
  PENDING_RECIPIENT: 'Pending Recipient',
  PENDING_SINCE: 'Pending Since',
  LAST_RESPONSE_MESSAGE_ID: 'Last Response Message ID',
  LAST_REPLY_AT: 'Last Reply At',
  LAST_REPLY_CHECK_AT: 'Last Reply Check At',
  LAST_ERROR: 'Last Error',
  UPDATED_AT: 'Updated At'
});

const VISIBLE_LEAD_HEADERS = Object.freeze([
  LEAD_HEADERS.COMPANY,
  LEAD_HEADERS.CONTACT_NAME,
  LEAD_HEADERS.EMAIL,
  LEAD_HEADERS.CATEGORY,
  LEAD_HEADERS.WEBSITE,
  LEAD_HEADERS.PERSONALIZATION,
  LEAD_HEADERS.STATUS,
  LEAD_HEADERS.INITIAL_SENT_AT,
  LEAD_HEADERS.FOLLOW_UP_1_SENT_AT,
  LEAD_HEADERS.FOLLOW_UP_2_SENT_AT,
  LEAD_HEADERS.REPLY_STATUS,
  LEAD_HEADERS.NOTES,
  LEAD_HEADERS.OPT_OUT
]);

const INTERNAL_LEAD_HEADERS = Object.freeze([
  LEAD_HEADERS.LEAD_ID,
  LEAD_HEADERS.NORMALIZED_EMAIL,
  LEAD_HEADERS.SENT_TO_EMAIL,
  LEAD_HEADERS.CAMPAIGN_ID,
  LEAD_HEADERS.GMAIL_THREAD_ID,
  LEAD_HEADERS.INITIAL_MESSAGE_ID,
  LEAD_HEADERS.FOLLOW_UP_1_MESSAGE_ID,
  LEAD_HEADERS.FOLLOW_UP_2_MESSAGE_ID,
  LEAD_HEADERS.PENDING_ACTION,
  LEAD_HEADERS.PENDING_ATTEMPT_ID,
  LEAD_HEADERS.PENDING_DRAFT_ID,
  LEAD_HEADERS.PENDING_RECIPIENT,
  LEAD_HEADERS.PENDING_SINCE,
  LEAD_HEADERS.LAST_RESPONSE_MESSAGE_ID,
  LEAD_HEADERS.LAST_REPLY_AT,
  LEAD_HEADERS.LAST_REPLY_CHECK_AT,
  LEAD_HEADERS.LAST_ERROR,
  LEAD_HEADERS.UPDATED_AT
]);

const ALL_LEAD_HEADERS = Object.freeze(
  VISIBLE_LEAD_HEADERS.concat(INTERNAL_LEAD_HEADERS)
);

const LOG_HEADERS = Object.freeze([
  'Timestamp',
  'Company',
  'Email',
  'Action',
  'Result',
  'Message/Error'
]);

const ACTION = Object.freeze({
  INITIAL: 'INITIAL',
  FOLLOW_UP_1: 'FOLLOW_UP_1',
  FOLLOW_UP_2: 'FOLLOW_UP_2'
});

const SCHEDULED_TRIGGER_HANDLERS = Object.freeze([
  'scheduledSendApprovedLeads',
  'scheduledProcessFollowUps',
  'scheduledCheckReplies'
]);

const OWNED_TRIGGER_HANDLERS = Object.freeze([
  'scheduledSendApprovedLeads',
  'scheduledProcessFollowUps',
  'scheduledCheckReplies',
  // Legacy/direct worker targets are owned too. They are never valid
  // scheduled entry points, but including them lets install/disable remove
  // any old trigger that would otherwise bypass the guarded wrappers.
  'sendApprovedLeads',
  'processFollowUps',
  'checkReplies',
  // Interactive proxies are not valid time-trigger targets either. Including
  // them closes the path where a menu function could discard triggerUid before
  // invoking a worker.
  'menuSendApprovedLeads',
  'menuProcessFollowUps',
  'menuCheckReplies'
]);

const SCRIPT_PROPERTY_KEYS = Object.freeze({
  SPREADSHEET_ID: 'BRAND_OUTREACH_SPREADSHEET_ID',
  SYSTEM_DISABLED: 'BRAND_OUTREACH_SYSTEM_DISABLED',
  DISABLE_NONCE: 'BRAND_OUTREACH_DISABLE_NONCE',
  ENABLED_FOR_DISABLE_NONCE: 'BRAND_OUTREACH_ENABLED_FOR_DISABLE_NONCE',
  DAILY_SEND_STATE: 'BRAND_OUTREACH_DAILY_SEND_STATE',
  TRIGGER_OWNER_EMAIL: 'BRAND_OUTREACH_TRIGGER_OWNER_EMAIL',
  AUTHORIZED_TRIGGER_MAP: 'BRAND_OUTREACH_AUTHORIZED_TRIGGER_MAP'
});

const MILLIS_PER_DAY = 24 * 60 * 60 * 1000;
