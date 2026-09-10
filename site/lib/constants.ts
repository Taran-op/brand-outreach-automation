/** Port of src/01_Constants.gs. Header strings must match the Sheet exactly. */

export const STATUS = {
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
} as const;

export type StatusValue = (typeof STATUS)[keyof typeof STATUS];

export const STATUS_VALUES: StatusValue[] = Object.values(STATUS);

export const ACTIVE_OUTREACH_STATUSES: StatusValue[] = [
  STATUS.SENT,
  STATUS.FOLLOW_UP_1,
  STATUS.FOLLOW_UP_2
];

export const AUTOMATION_STOP_STATUSES: StatusValue[] = [
  STATUS.REPLIED,
  STATUS.INTERESTED,
  STATUS.MEETING,
  STATUS.NEGOTIATING,
  STATUS.CLOSED,
  STATUS.NOT_INTERESTED,
  STATUS.DO_NOT_CONTACT,
  STATUS.REVIEW_REQUIRED
];

export const CATEGORY_VALUES = [
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
] as const;

export const LEAD_HEADERS = {
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
} as const;

export const VISIBLE_LEAD_HEADERS: string[] = [
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
];

export const ACTION = {
  INITIAL: 'INITIAL',
  FOLLOW_UP_1: 'FOLLOW_UP_1',
  FOLLOW_UP_2: 'FOLLOW_UP_2'
} as const;

export type ActionValue = (typeof ACTION)[keyof typeof ACTION];
