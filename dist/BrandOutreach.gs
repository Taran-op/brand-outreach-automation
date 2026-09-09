/**
 * GENERATED FILE — edit the numeric modules under src/, then run npm run build.
 * Paste this file into Code.gs and add appsscript/Index.html as an HTML file.
 */
/**
 * Brand Outreach V1 configuration.
 *
 * Production profile for AsaiVerse 2027:
 *   - Live delivery is enabled, but only through an explicit manual action.
 *   - Initials and follow-ups are capped at one message per run/day.
 *   - No scheduled triggers are installed by deployment.
 *
 * Change event, organization, sender, timing, and limit values here. The main
 * logic should not need editing for normal operation.
 */
const CONFIG = Object.freeze({
  CAMPAIGN_ID: 'ASAIVERSE_2027_BRAND_OUTREACH_V1',
  TIME_ZONE: 'Asia/Kolkata',

  EVENT: Object.freeze({
    NAME: 'AsaiVerse',
    ONE_LINE_DESCRIPTION: 'a two-day esports, gaming, technology, creator and entertainment event',
    DATE_PREPOSITION: 'in',
    DATE_DISPLAY: 'January 2027',
    LOCATION_DISPLAY: 'India',
    ORGANIZATION: ''
  }),

  // Final date on which outreach may be sent, in YYYY-MM-DD form. It may stay
  // blank for setup/dry-run, but configuration validation blocks actual sends
  // until the event year and cutoff are explicitly confirmed. Uses TIME_ZONE.
  CAMPAIGN_SEND_CUTOFF_ISO: '2027-01-31',

  SENDER: Object.freeze({
    NAME: 'Taran',
    PHONE: '',
    BUSINESS_EMAIL: 'taran@asaiverse.com',

    // Must be the Gmail account running this script or a verified Gmail
    // "Send mail as" address on that account.
    FROM_EMAIL: 'taran@asaiverse.com',

    // Keep this in the same authorized Gmail mailbox if automatic reply
    // detection is required. Replies routed elsewhere cannot be inspected.
    REPLY_TO_EMAIL: 'taran@asaiverse.com',

    // Every initial, follow-up, and redirected test message includes every
    // address in this list. Keep these as internal team addresses only.
    CC_EMAILS: Object.freeze([
      'ashish@asaiverse.com',
      'gaurav@asaiverse.com'
    ])
  }),

  SHEETS: Object.freeze({
    // Leave blank for a container-bound script. setupSheet() stores the bound
    // spreadsheet ID for reliable trigger executions.
    SPREADSHEET_ID: '',
    LEADS_NAME: 'Leads',
    LOG_NAME: 'Outreach Log'
  }),

  UI: Object.freeze({
    TITLE: 'Brand Outreach Console',

    // Deploy the web app as "User accessing the web app" and restrict access
    // to yourself. Every server method also requires one of these Google
    // account emails, so browser-side controls are never the authorization
    // boundary.
    ALLOWED_EMAILS: Object.freeze([
      'taran.devx@gmail.com'
    ]),
    MAX_LEADS_RETURNED: 500,
    MAX_LOG_ROWS: 80,
    MAX_IMPORT_ROWS: 500,
    MAX_IMPORT_CHARACTERS: 50000
  }),

  FOLLOW_UP: Object.freeze({
    FIRST_AFTER_DAYS_FROM_INITIAL: 4,
    SECOND_AFTER_DAYS_FROM_INITIAL: 9,

    // Avoids back-to-back mail if follow-up 1 ran late.
    SECOND_MIN_DAYS_AFTER_FIRST: 3
  }),

  SAFETY: Object.freeze({
    // Actual Gmail sends require SENDS_ENABLED=true and DRY_RUN=false.
    SENDS_ENABLED: true,

    // DRY_RUN takes precedence over TEST_MODE. It performs validation and
    // logging, but creates no Gmail draft and changes no lead lifecycle data.
    DRY_RUN: false,

    // When true (and DRY_RUN=false), every manual message is redirected to the
    // owned inbox below; scheduled workers refuse TEST mode. The recipient must
    // be this mailbox's primary/accepted Send-As address and must differ from
    // the lead. Production lead status/timestamps are not advanced.
    TEST_MODE: false,
    TEST_RECIPIENT: '',
    TEST_SUBJECT_PREFIX: '[TEST – DO NOT FORWARD]',

    // Shared by initial mail, follow-ups, and redirected test sends. This is
    // a message-attempt cap; Gmail quota is checked in recipient units (To + CC).
    DAILY_SEND_LIMIT: 1,
    GMAIL_QUOTA_RESERVE: 5,
    MAX_INITIALS_PER_RUN: 1,
    MAX_FOLLOW_UPS_PER_RUN: 1,
    MAX_TEST_SENDS_PER_RUN: 3,
    MAX_REPLY_CHECKS_PER_RUN: 50,

    // Sends are sequential. This small pause avoids burst-like behavior.
    SEND_DELAY_MS: 2500,
    LOCK_TIMEOUT_MS: 5000,
    MAX_RUNTIME_MS: 270000,
    MAX_LOG_MESSAGE_LENGTH: 500
  }),

  TRIGGERS: Object.freeze({
    // Apps Script time triggers run approximately within the selected hour.
    FOLLOW_UP_HOUR: 10,
    INITIAL_SEND_HOUR: 11,
    REPLY_CHECK_EVERY_HOURS: 4
  })
});


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


function normalizeEmail_(value) {
  return String(value || '').trim().toLowerCase();
}

function isValidSingleEmail_(value) {
  const email = normalizeEmail_(value);
  if (!email || email.length > 254) return false;
  if (/[\r\n,;\s]/.test(email)) return false;
  if ((email.match(/@/g) || []).length !== 1) return false;

  const parts = email.split('@');
  const local = parts[0];
  const domain = parts[1];
  if (!local || local.length > 64 || !domain || domain.length > 253) return false;
  if (local.charAt(0) === '.' || local.charAt(local.length - 1) === '.' || local.indexOf('..') !== -1) {
    return false;
  }
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/i.test(local)) return false;

  const labels = domain.split('.');
  if (labels.length < 2) return false;
  for (let i = 0; i < labels.length; i += 1) {
    const label = labels[i];
    if (!label || label.length > 63) return false;
    if (!/^[a-z0-9-]+$/i.test(label)) return false;
    if (label.charAt(0) === '-' || label.charAt(label.length - 1) === '-') return false;
  }
  return /^[a-z]{2,63}$/i.test(labels[labels.length - 1]) || /^xn--[a-z0-9-]+$/i.test(labels[labels.length - 1]);
}

function extractEmailAddresses_(headerValue) {
  const text = String(headerValue || '');
  const matches = text.match(/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,63}/gi) || [];
  const unique = {};
  matches.forEach(function (item) {
    const normalized = normalizeEmail_(item);
    if (normalized) unique[normalized] = true;
  });
  return Object.keys(unique);
}

function getConfiguredCcEmails_() {
  const configured = CONFIG.SENDER.CC_EMAILS;
  assertCondition_(Array.isArray(configured), 'CONFIG.SENDER.CC_EMAILS must be an array.');
  assertCondition_(configured.length > 0, 'At least one internal CC address is required.');
  const normalized = configured.map(normalizeEmail_);
  const seen = {};
  normalized.forEach(function (email) {
    assertCondition_(isValidSingleEmail_(email), 'Every configured CC must be one valid email address.');
    assertCondition_(!seen[email], 'Configured CC addresses must be unique.');
    seen[email] = true;
  });
  const from = normalizeEmail_(CONFIG.SENDER.FROM_EMAIL);
  const replyTo = normalizeEmail_(CONFIG.SENDER.REPLY_TO_EMAIL);
  normalized.forEach(function (email) {
    assertCondition_(email !== from && email !== replyTo,
      'A configured CC address must differ from From and Reply-To.');
  });
  return normalized;
}

function emailListsMatchAsSets_(first, second) {
  const left = (first || []).map(normalizeEmail_).slice().sort();
  const right = (second || []).map(normalizeEmail_).slice().sort();
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) {
    if (left[i] !== right[i]) return false;
  }
  return true;
}

function isConfiguredCcEmail_(email) {
  return getConfiguredCcEmails_().indexOf(normalizeEmail_(email)) !== -1;
}

function recipientUnitsPerMessage_() {
  return 1 + getConfiguredCcEmails_().length;
}

function normalizeStatus_(value) {
  return String(value || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
}

function isExactStatus_(value, expected) {
  // Sending gates deliberately do not normalize. Only an exact dropdown value
  // can authorize a message; e.g. "approved" or " APPROVED " fails closed.
  return String(value || '') === String(expected || '');
}

function isDirectInstallableTriggerEvent_(event) {
  return !!(event && Object.prototype.hasOwnProperty.call(event, 'triggerUid'));
}

function rejectDirectWorkerTrigger_(event, jobName) {
  if (!isDirectInstallableTriggerEvent_(event)) return null;
  const summary = newRunSummary_(jobName);
  summary.skipped = 1;
  summary.message = 'Direct installable-trigger invocation refused. Scheduled automation must use the owner-verifying wrapper.';
  try {
    safeLogEvent_('', '', 'DIRECT_TRIGGER_BLOCKED', 'SKIPPED', jobName + ': ' + summary.message);
  } catch (error) {
    console.error('Could not persist the direct-trigger refusal: ' + errorMessage_(error));
  }
  return summary;
}

function getAuthorizedTriggerMap_() {
  const raw = PropertiesService.getScriptProperties().getProperty(SCRIPT_PROPERTY_KEYS.AUTHORIZED_TRIGGER_MAP);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (error) {
    // A corrupt/missing authorization map must disable schedules, never widen
    // them. The installer can recreate it from new trigger IDs.
    return {};
  }
}

function isAuthorizedTriggerIdentity_(triggerMap, triggerUid, handlerName) {
  const uid = String(triggerUid || '');
  const handler = String(handlerName || '');
  return !!uid && SCHEDULED_TRIGGER_HANDLERS.indexOf(handler) !== -1 &&
    Object.prototype.hasOwnProperty.call(triggerMap || {}, uid) &&
    String(triggerMap[uid]) === handler;
}

function authorizeScheduledTriggers_(triggers) {
  const triggerMap = {};
  (triggers || []).forEach(function (trigger) {
    const uid = String(trigger.getUniqueId() || '');
    const handler = String(trigger.getHandlerFunction() || '');
    assertCondition_(uid, 'A created trigger did not expose a unique ID; schedules remain disabled.');
    assertCondition_(SCHEDULED_TRIGGER_HANDLERS.indexOf(handler) !== -1,
      'Refused to authorize unexpected trigger handler: ' + handler);
    assertCondition_(!Object.prototype.hasOwnProperty.call(triggerMap, uid),
      'Duplicate trigger unique ID returned during installation.');
    triggerMap[uid] = handler;
  });
  assertCondition_(Object.keys(triggerMap).length === SCHEDULED_TRIGGER_HANDLERS.length,
    'Expected exactly one authorized trigger per scheduled wrapper.');
  PropertiesService.getScriptProperties().setProperty(
    SCRIPT_PROPERTY_KEYS.AUTHORIZED_TRIGGER_MAP,
    JSON.stringify(triggerMap)
  );
  return triggerMap;
}

function clearAuthorizedTriggers_() {
  PropertiesService.getScriptProperties().deleteProperty(SCRIPT_PROPERTY_KEYS.AUTHORIZED_TRIGGER_MAP);
}

function getScheduledWorkerAuthorizationIssue_(context) {
  if (!context || context.source !== 'SCHEDULED_WRAPPER') return '';
  if (!isAuthorizedTriggerIdentity_(
    getAuthorizedTriggerMap_(),
    context.authorizedTriggerUid,
    context.handlerName
  )) {
    return 'Scheduled execution refused: its trigger ID/handler is not in the current authorized generation.';
  }
  const mode = getExecutionMode_();
  if (mode === 'TEST') return 'Scheduled execution refused: redirected TEST_MODE is manual-only.';
  if (mode !== 'DRY_RUN') {
    const owner = normalizeEmail_(
      PropertiesService.getScriptProperties().getProperty(SCRIPT_PROPERTY_KEYS.TRIGGER_OWNER_EMAIL)
    );
    let mailbox = '';
    try {
      mailbox = getCurrentMailboxEmail_();
    } catch (error) {
      return 'Scheduled execution refused: Gmail mailbox identity could not be verified (' + errorMessage_(error) + ').';
    }
    if (!owner || mailbox !== owner) {
      return 'Scheduled execution refused: executing Gmail mailbox is not the designated trigger owner.';
    }
  }
  return '';
}

function applyScheduledWorkerGuard_(context, summary, actionName) {
  const issue = getScheduledWorkerAuthorizationIssue_(context);
  if (!issue) return false;
  summary.skipped += 1;
  summary.message = issue;
  try {
    safeLogEvent_('', '', actionName, 'SKIPPED', issue);
  } catch (error) {
    console.error(actionName + ': ' + issue + ' Logging also failed: ' + errorMessage_(error));
  }
  return true;
}

function isTrue_(value) {
  if (value === true) return true;
  const text = String(value || '').trim().toLowerCase();
  return text === 'true' || text === 'yes' || text === '1' || text === 'y';
}

function asDate_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) return value;
  if (value === '' || value === null || typeof value === 'undefined') return null;
  const parsed = new Date(value);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function hasValue_(value) {
  return !(value === '' || value === null || typeof value === 'undefined');
}

function safeDisplayText_(value) {
  return String(value || '').replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

function sanitizeHeaderValue_(value) {
  return safeDisplayText_(value).replace(/[\u0000-\u001F\u007F]/g, '');
}

function htmlEscape_(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function paragraphToHtml_(value) {
  return htmlEscape_(String(value || '')).replace(/\r?\n/g, '<br>');
}

function ensureTerminalPunctuation_(value) {
  const text = safeDisplayText_(value);
  if (!text) return '';
  return /[.!?]$/.test(text) ? text : text + '.';
}

function truncate_(value, maxLength) {
  const text = String(value || '');
  if (text.length <= maxLength) return text;
  return text.slice(0, Math.max(0, maxLength - 1)) + '…';
}

function safeLogCell_(value) {
  let text = truncate_(safeDisplayText_(value), CONFIG.SAFETY.MAX_LOG_MESSAGE_LENGTH);
  if (/^[=+\-@]/.test(text)) text = "'" + text;
  return text;
}

function makeAttemptId_(leadId, action) {
  const compactUuid = Utilities.getUuid().replace(/-/g, '');
  return [sanitizeHeaderValue_(CONFIG.CAMPAIGN_ID), sanitizeHeaderValue_(leadId), action, compactUuid].join(':');
}

function getExecutionMode_() {
  if (CONFIG.SAFETY.DRY_RUN) return 'DRY_RUN';
  if (!CONFIG.SAFETY.SENDS_ENABLED) return 'BLOCKED';
  if (CONFIG.SAFETY.TEST_MODE) return 'TEST';
  return 'LIVE';
}

function isSystemDisabled_() {
  const properties = PropertiesService.getScriptProperties();
  if (properties.getProperty(SCRIPT_PROPERTY_KEYS.SYSTEM_DISABLED) === 'true') return true;

  // The nonce comparison prevents an install/re-enable that started earlier
  // from clearing a newer emergency-disable request. This remains safe even if
  // the individual property writes interleave across two users.
  const disableNonce = properties.getProperty(SCRIPT_PROPERTY_KEYS.DISABLE_NONCE) || '';
  const enabledForNonce = properties.getProperty(SCRIPT_PROPERTY_KEYS.ENABLED_FOR_DISABLE_NONCE) || '';
  return !!disableNonce && disableNonce !== enabledForNonce;
}

function setSystemDisabled_(disabled) {
  PropertiesService.getScriptProperties().setProperty(
    SCRIPT_PROPERTY_KEYS.SYSTEM_DISABLED,
    disabled ? 'true' : 'false'
  );
}

function requestSystemDisable_() {
  const properties = PropertiesService.getScriptProperties();
  const nonce = Utilities.getUuid();
  // Write the new request before the compatibility latch. Either value is
  // sufficient to fail closed while another control operation is in flight.
  properties.setProperty(SCRIPT_PROPERTY_KEYS.DISABLE_NONCE, nonce);
  properties.setProperty(SCRIPT_PROPERTY_KEYS.SYSTEM_DISABLED, 'true');
  return nonce;
}

function getCurrentDisableNonce_() {
  return PropertiesService.getScriptProperties().getProperty(SCRIPT_PROPERTY_KEYS.DISABLE_NONCE) || '';
}

function enableSystemForDisableNonce_(disableNonce) {
  const properties = PropertiesService.getScriptProperties();
  properties.setProperty(SCRIPT_PROPERTY_KEYS.ENABLED_FOR_DISABLE_NONCE, String(disableNonce || ''));
  properties.setProperty(SCRIPT_PROPERTY_KEYS.SYSTEM_DISABLED, 'false');
  // A different nonce means Emergency Disable happened after this enable
  // operation began. In that case the system deliberately remains disabled.
  return !isSystemDisabled_();
}

function withScriptLock_(jobName, callback) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(CONFIG.SAFETY.LOCK_TIMEOUT_MS)) {
    return {
      job: jobName,
      mode: getExecutionMode_(),
      processed: 0,
      sent: 0,
      skipped: 0,
      errors: 0,
      lockedOut: true,
      message: 'Another outreach job is already running.'
    };
  }

  try {
    return callback();
  } finally {
    lock.releaseLock();
  }
}

function newRunSummary_(jobName) {
  return {
    job: jobName,
    mode: getExecutionMode_(),
    processed: 0,
    sent: 0,
    dryRun: 0,
    testSent: 0,
    skipped: 0,
    replies: 0,
    errors: 0,
    stoppedForLimit: false,
    stoppedForRuntime: false,
    message: ''
  };
}

function formatRunSummary_(summary) {
  const lines = [
    summary.job + ' (' + summary.mode + ')',
    'Processed: ' + (summary.processed || 0),
    'Live sent: ' + (summary.sent || 0),
    'Test sent: ' + (summary.testSent || 0),
    'Dry-run candidates: ' + (summary.dryRun || 0),
    'Replies/actions detected: ' + (summary.replies || 0),
    'Skipped: ' + (summary.skipped || 0),
    'Errors: ' + (summary.errors || 0)
  ];
  if (summary.stoppedForLimit) lines.push('Stopped: daily/Gmail/per-run limit reached.');
  if (summary.stoppedForRuntime) lines.push('Stopped: execution time safety threshold reached.');
  if (summary.lockedOut) lines.push('Stopped: another job holds the script lock.');
  if (summary.message) lines.push(summary.message);
  return lines.join('\n');
}

function isRuntimeNearlyExhausted_(startedAt) {
  return Date.now() - startedAt >= CONFIG.SAFETY.MAX_RUNTIME_MS;
}

function daysElapsed_(earlier, later) {
  const start = asDate_(earlier);
  const end = asDate_(later) || new Date();
  if (!start) return -1;
  return (end.getTime() - start.getTime()) / MILLIS_PER_DAY;
}

function calendarDaysElapsed_(earlier, later) {
  const start = asDate_(earlier);
  const end = asDate_(later) || new Date();
  if (!start) return -1;
  const startParts = Utilities.formatDate(start, CONFIG.TIME_ZONE, 'yyyy-MM-dd').split('-').map(Number);
  const endParts = Utilities.formatDate(end, CONFIG.TIME_ZONE, 'yyyy-MM-dd').split('-').map(Number);
  const startUtc = Date.UTC(startParts[0], startParts[1] - 1, startParts[2]);
  const endUtc = Date.UTC(endParts[0], endParts[1] - 1, endParts[2]);
  return Math.floor((endUtc - startUtc) / MILLIS_PER_DAY);
}

function isPlaceholder_(value) {
  const text = String(value || '').trim().toUpperCase();
  return !text || text.indexOf('REPLACE WITH') === 0 || text.indexOf('YOUR ') === 0;
}

function isValidIsoCalendarDate_(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || '').trim());
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function errorMessage_(error) {
  if (!error) return 'Unknown error';
  return truncate_(error.message || String(error), CONFIG.SAFETY.MAX_LOG_MESSAGE_LENGTH);
}

function assertCondition_(condition, message) {
  if (!condition) throw new Error(message);
}


function getSpreadsheet_() {
  const configuredId = String(CONFIG.SHEETS.SPREADSHEET_ID || '').trim();
  const properties = PropertiesService.getScriptProperties();
  const storedId = properties.getProperty(SCRIPT_PROPERTY_KEYS.SPREADSHEET_ID);

  if (configuredId) return SpreadsheetApp.openById(configuredId);
  if (storedId) return SpreadsheetApp.openById(storedId);

  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (!active) {
    throw new Error('No spreadsheet is bound. Run setupSheet() from the target Google Sheet or set CONFIG.SHEETS.SPREADSHEET_ID.');
  }
  properties.setProperty(SCRIPT_PROPERTY_KEYS.SPREADSHEET_ID, active.getId());
  return active;
}

function setupSheet() {
  return withScriptLock_('Setup Sheet', function () {
    const configuredId = String(CONFIG.SHEETS.SPREADSHEET_ID || '').trim();
    const spreadsheet = configuredId
      ? SpreadsheetApp.openById(configuredId)
      : (SpreadsheetApp.getActiveSpreadsheet() || getSpreadsheet_());
    spreadsheet.setSpreadsheetTimeZone(CONFIG.TIME_ZONE);
    PropertiesService.getScriptProperties().setProperty(
      SCRIPT_PROPERTY_KEYS.SPREADSHEET_ID,
      spreadsheet.getId()
    );

    const leadsSheet = getOrCreateLeadsSheet_(spreadsheet);
    const logSheet = getOrCreateSheet_(spreadsheet, CONFIG.SHEETS.LOG_NAME);

    ensureHeaders_(leadsSheet, ALL_LEAD_HEADERS);
    ensureHeaders_(logSheet, LOG_HEADERS);
    formatLeadsSheet_(leadsSheet);
    formatLogSheet_(logSheet);
    initializeExistingLeadRows_(leadsSheet);

    logEvent_('', '', 'SETUP', 'SUCCESS', 'Sheet structure verified; existing data was preserved.');
    toast_('Brand Outreach sheet is ready. Safe defaults still prevent email sending.', 'Setup complete');
    return newRunSummary_('Setup Sheet');
  });
}

function getOrCreateLeadsSheet_(spreadsheet) {
  let sheet = spreadsheet.getSheetByName(CONFIG.SHEETS.LEADS_NAME);
  if (sheet) return sheet;

  const sheets = spreadsheet.getSheets();
  if (sheets.length === 1 && isSheetBlank_(sheets[0])) {
    sheet = sheets[0];
    sheet.setName(CONFIG.SHEETS.LEADS_NAME);
    return sheet;
  }
  return spreadsheet.insertSheet(CONFIG.SHEETS.LEADS_NAME);
}

function getOrCreateSheet_(spreadsheet, name) {
  return spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name);
}

function isSheetBlank_(sheet) {
  if (sheet.getLastRow() > 1 || sheet.getLastColumn() > 1) return false;
  return String(sheet.getRange(1, 1).getValue() || '').trim() === '';
}

function ensureHeaders_(sheet, requiredHeaders) {
  ensureGridSize_(sheet, 1, requiredHeaders.length);
  const currentLastColumn = Math.max(1, sheet.getLastColumn());
  const row = sheet.getRange(1, 1, 1, currentLastColumn).getValues()[0];
  const existing = {};
  let lastNonEmpty = 0;

  row.forEach(function (value, index) {
    const header = String(value || '').trim();
    if (header) {
      existing[header] = index + 1;
      lastNonEmpty = index + 1;
    }
  });

  if (lastNonEmpty === 0) {
    sheet.getRange(1, 1, 1, requiredHeaders.length).setValues([requiredHeaders.slice()]);
    return;
  }

  const missing = requiredHeaders.filter(function (header) {
    return !existing[header];
  });
  if (missing.length) {
    ensureGridSize_(sheet, 1, lastNonEmpty + missing.length);
    sheet.getRange(1, lastNonEmpty + 1, 1, missing.length).setValues([missing]);
  }
}

function ensureGridSize_(sheet, minimumRows, minimumColumns) {
  if (sheet.getMaxRows() < minimumRows) {
    sheet.insertRowsAfter(sheet.getMaxRows(), minimumRows - sheet.getMaxRows());
  }
  if (sheet.getMaxColumns() < minimumColumns) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), minimumColumns - sheet.getMaxColumns());
  }
}

function getHeaderMap_(sheet, requiredHeaders) {
  const lastColumn = Math.max(1, sheet.getLastColumn());
  const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
  const map = {};
  headers.forEach(function (value, index) {
    const header = String(value || '').trim();
    if (!header) return;
    if (map[header]) throw new Error('Duplicate header found: ' + header);
    map[header] = index + 1;
  });

  (requiredHeaders || []).forEach(function (required) {
    if (!map[required]) throw new Error('Missing required header: ' + required);
  });
  return map;
}

function formatLeadsSheet_(sheet) {
  const headerMap = getHeaderMap_(sheet, ALL_LEAD_HEADERS);
  const lastColumn = sheet.getLastColumn();
  const dataRowCount = Math.max(1, sheet.getMaxRows() - 1);

  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, lastColumn)
    .setBackground('#172554')
    .setFontColor('#ffffff')
    .setFontWeight('bold')
    .setWrap(true)
    .setVerticalAlignment('middle');
  sheet.setRowHeight(1, 38);

  const statusValidation = SpreadsheetApp.newDataValidation()
    .requireValueInList(STATUS_VALUES.slice(), true)
    .setAllowInvalid(false)
    .setHelpText('Initial outreach requires APPROVED. Use terminal statuses to stop automation.')
    .build();
  sheet.getRange(2, headerMap[LEAD_HEADERS.STATUS], dataRowCount, 1).setDataValidation(statusValidation);

  const replyValidation = SpreadsheetApp.newDataValidation()
    .requireValueInList(REPLY_STATUS_VALUES.slice(), true)
    .setAllowInvalid(true)
    .build();
  sheet.getRange(2, headerMap[LEAD_HEADERS.REPLY_STATUS], dataRowCount, 1).setDataValidation(replyValidation);

  const categoryValidation = SpreadsheetApp.newDataValidation()
    .requireValueInList(CATEGORY_VALUES.slice(), true)
    .setAllowInvalid(true)
    .build();
  sheet.getRange(2, headerMap[LEAD_HEADERS.CATEGORY], dataRowCount, 1).setDataValidation(categoryValidation);

  const checkboxValidation = SpreadsheetApp.newDataValidation().requireCheckbox().build();
  sheet.getRange(2, headerMap[LEAD_HEADERS.OPT_OUT], dataRowCount, 1).setDataValidation(checkboxValidation);

  [
    LEAD_HEADERS.INITIAL_SENT_AT,
    LEAD_HEADERS.FOLLOW_UP_1_SENT_AT,
    LEAD_HEADERS.FOLLOW_UP_2_SENT_AT,
    LEAD_HEADERS.PENDING_SINCE,
    LEAD_HEADERS.LAST_REPLY_AT,
    LEAD_HEADERS.LAST_REPLY_CHECK_AT,
    LEAD_HEADERS.UPDATED_AT
  ].forEach(function (header) {
    sheet.getRange(2, headerMap[header], dataRowCount, 1).setNumberFormat('yyyy-mm-dd hh:mm');
  });

  const widths = {};
  widths[LEAD_HEADERS.COMPANY] = 180;
  widths[LEAD_HEADERS.CONTACT_NAME] = 150;
  widths[LEAD_HEADERS.EMAIL] = 220;
  widths[LEAD_HEADERS.CATEGORY] = 170;
  widths[LEAD_HEADERS.WEBSITE] = 190;
  widths[LEAD_HEADERS.PERSONALIZATION] = 320;
  widths[LEAD_HEADERS.STATUS] = 150;
  widths[LEAD_HEADERS.REPLY_STATUS] = 145;
  widths[LEAD_HEADERS.NOTES] = 280;
  widths[LEAD_HEADERS.OPT_OUT] = 80;
  Object.keys(widths).forEach(function (header) {
    sheet.setColumnWidth(headerMap[header], widths[header]);
  });

  ensureFullWidthFilter_(sheet, lastColumn);

  INTERNAL_LEAD_HEADERS.forEach(function (header) {
    sheet.hideColumns(headerMap[header]);
  });
}

function ensureFullWidthFilter_(sheet, lastColumn) {
  const existing = sheet.getFilter();
  if (!existing) {
    sheet.getRange(1, 1, sheet.getMaxRows(), lastColumn).createFilter();
    return;
  }

  const range = existing.getRange();
  const alreadySafe = range.getRow() === 1 && range.getColumn() === 1 &&
    range.getNumRows() === sheet.getMaxRows() && range.getNumColumns() === lastColumn;
  if (alreadySafe) return;

  // A filter that covers only the visible columns can sort A:M without the
  // hidden evidence columns. Preserve its criteria while expanding the range.
  const criteria = {};
  const oldLastColumn = range.getLastColumn();
  for (let column = range.getColumn(); column <= oldLastColumn; column += 1) {
    const criterion = existing.getColumnFilterCriteria(column);
    if (criterion) criteria[column] = criterion;
  }
  existing.remove();
  const replacement = sheet.getRange(1, 1, sheet.getMaxRows(), lastColumn).createFilter();
  Object.keys(criteria).forEach(function (column) {
    if (Number(column) <= lastColumn) replacement.setColumnFilterCriteria(Number(column), criteria[column]);
  });
}

function formatLogSheet_(sheet) {
  const lastColumn = sheet.getLastColumn();
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, lastColumn)
    .setBackground('#334155')
    .setFontColor('#ffffff')
    .setFontWeight('bold');
  sheet.getRange(2, 1, Math.max(1, sheet.getMaxRows() - 1), 1).setNumberFormat('yyyy-mm-dd hh:mm');
  [150, 180, 220, 150, 120, 420].forEach(function (width, index) {
    if (index + 1 <= lastColumn) sheet.setColumnWidth(index + 1, width);
  });
  ensureFullWidthFilter_(sheet, lastColumn);
}

function initializeExistingLeadRows_(sheet) {
  const headerMap = getHeaderMap_(sheet, ALL_LEAD_HEADERS);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  const seenLeadIds = {};
  const durableSuppressions = getSuccessfulInitialEmailsFromLog_();
  for (let rowNumber = 2; rowNumber <= lastRow; rowNumber += 1) {
    const record = getLeadAtRow_(sheet, rowNumber, headerMap);
    if (isLeadRowBlank_(record)) continue;

    const updates = {};
    const existingId = String(leadValue_(record, LEAD_HEADERS.LEAD_ID) || '').trim();
    if (!existingId || seenLeadIds[existingId]) {
      updates[LEAD_HEADERS.LEAD_ID] = Utilities.getUuid();
      if (existingId && seenLeadIds[existingId]) {
        const hasDeliveryEvidence = hasInitialSuccessEvidence_(record) ||
          followUpAlreadySent_(record, ACTION.FOLLOW_UP_1) ||
          followUpAlreadySent_(record, ACTION.FOLLOW_UP_2) ||
          hasPendingAction_(record);
        updates[LEAD_HEADERS.LAST_ERROR] = hasDeliveryEvidence
          ? 'Copied Lead ID contains delivery evidence. A new ID was assigned and the row was quarantined; inspect it before any manual correction.'
          : 'Copied Lead ID was regenerated during setup; review this row before approval.';
        if (hasDeliveryEvidence) {
          const existingStatus = normalizeStatus_(leadValue_(record, LEAD_HEADERS.STATUS));
          if (isTrue_(leadValue_(record, LEAD_HEADERS.OPT_OUT))) {
            updates[LEAD_HEADERS.STATUS] = STATUS.DO_NOT_CONTACT;
          } else if (AUTOMATION_STOP_STATUSES.indexOf(existingStatus) !== -1) {
            updates[LEAD_HEADERS.STATUS] = existingStatus;
          } else {
            updates[LEAD_HEADERS.STATUS] = STATUS.REVIEW_REQUIRED;
          }
        }
      }
      seenLeadIds[updates[LEAD_HEADERS.LEAD_ID]] = true;
    } else {
      seenLeadIds[existingId] = true;
    }
    if (!hasValue_(leadValue_(record, LEAD_HEADERS.STATUS)) && !hasValue_(updates[LEAD_HEADERS.STATUS])) {
      updates[LEAD_HEADERS.STATUS] = STATUS.NEW;
    }
    updates[LEAD_HEADERS.NORMALIZED_EMAIL] = normalizeEmail_(leadValue_(record, LEAD_HEADERS.EMAIL));
    if (!hasValue_(leadValue_(record, LEAD_HEADERS.UPDATED_AT))) {
      updates[LEAD_HEADERS.UPDATED_AT] = new Date();
    }
    updateLeadFieldsAtRow_(sheet, rowNumber, headerMap, updates);

    const normalizedEmail = updates[LEAD_HEADERS.NORMALIZED_EMAIL];
    const statusAfterSetup = normalizeStatus_(updates[LEAD_HEADERS.STATUS] || leadValue_(record, LEAD_HEADERS.STATUS));
    if (isValidSingleEmail_(normalizedEmail) && !durableSuppressions[normalizedEmail] &&
        (isTrue_(leadValue_(record, LEAD_HEADERS.OPT_OUT)) ||
         statusAfterSetup === STATUS.DO_NOT_CONTACT || statusAfterSetup === STATUS.NOT_INTERESTED)) {
      safeLogEvent_(
        leadValue_(record, LEAD_HEADERS.COMPANY),
        normalizedEmail,
        isTrue_(leadValue_(record, LEAD_HEADERS.OPT_OUT))
          ? 'OPT_OUT'
          : (statusAfterSetup === STATUS.NOT_INTERESTED ? 'NOT_INTERESTED' : 'DO_NOT_CONTACT'),
        'RECORDED',
        'Existing suppression state recorded during sheet setup.'
      );
      durableSuppressions[normalizedEmail] = 'suppression recorded during setup';
    }
  }
}

function assertUniqueLeadIds_(rows) {
  const seen = {};
  rows.forEach(function (record) {
    const id = leadId_(record);
    if (!id) return;
    if (seen[id]) {
      throw new Error('Duplicate Lead ID found on rows ' + seen[id] + ' and ' + record.rowNumber + '. Run Setup Sheet to regenerate copied IDs before processing.');
    }
    seen[id] = record.rowNumber;
  });
}

function getLeadsSheet_() {
  const sheet = getSpreadsheet_().getSheetByName(CONFIG.SHEETS.LEADS_NAME);
  if (!sheet) throw new Error('Leads sheet not found. Run Setup Sheet first.');
  getHeaderMap_(sheet, ALL_LEAD_HEADERS);
  return sheet;
}

function getLogSheet_() {
  const sheet = getSpreadsheet_().getSheetByName(CONFIG.SHEETS.LOG_NAME);
  if (!sheet) throw new Error('Outreach Log sheet not found. Run Setup Sheet first.');
  getHeaderMap_(sheet, LOG_HEADERS);
  return sheet;
}

function getLeadRows_(sheet) {
  const headerMap = getHeaderMap_(sheet, ALL_LEAD_HEADERS);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const lastColumn = sheet.getLastColumn();
  const values = sheet.getRange(2, 1, lastRow - 1, lastColumn).getValues();
  return values.map(function (row, index) {
    return { rowNumber: index + 2, values: row, headerMap: headerMap };
  }).filter(function (record) {
    return !isLeadRowBlank_(record);
  });
}

function getLeadAtRow_(sheet, rowNumber, headerMap) {
  const map = headerMap || getHeaderMap_(sheet, ALL_LEAD_HEADERS);
  const values = sheet.getRange(rowNumber, 1, 1, sheet.getLastColumn()).getValues()[0];
  return { rowNumber: rowNumber, values: values, headerMap: map };
}

function isLeadRowBlank_(record) {
  return !hasValue_(leadValue_(record, LEAD_HEADERS.COMPANY)) &&
    !hasValue_(leadValue_(record, LEAD_HEADERS.EMAIL)) &&
    !hasValue_(leadValue_(record, LEAD_HEADERS.STATUS));
}

function leadValue_(record, header) {
  const column = record.headerMap[header];
  if (!column) throw new Error('Unknown lead header: ' + header);
  return record.values[column - 1];
}

function leadId_(record) {
  return String(leadValue_(record, LEAD_HEADERS.LEAD_ID) || '').trim();
}

function ensureLeadIdAtRow_(sheet, record) {
  let id = leadId_(record);
  if (id) return id;
  id = Utilities.getUuid();
  updateLeadFieldsAtRow_(sheet, record.rowNumber, record.headerMap, {
    [LEAD_HEADERS.LEAD_ID]: id,
    [LEAD_HEADERS.UPDATED_AT]: new Date()
  });
  return id;
}

function findRowByLeadId_(sheet, leadId, headerMap) {
  if (!leadId) return 0;
  const map = headerMap || getHeaderMap_(sheet, ALL_LEAD_HEADERS);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  const values = sheet.getRange(2, map[LEAD_HEADERS.LEAD_ID], lastRow - 1, 1).getValues();
  for (let i = 0; i < values.length; i += 1) {
    if (String(values[i][0] || '').trim() === String(leadId)) return i + 2;
  }
  return 0;
}

function refreshLeadById_(sheet, id) {
  const headerMap = getHeaderMap_(sheet, ALL_LEAD_HEADERS);
  const rowNumber = findRowByLeadId_(sheet, id, headerMap);
  if (!rowNumber) throw new Error('Lead row no longer exists for Lead ID ' + id + '.');
  return getLeadAtRow_(sheet, rowNumber, headerMap);
}

function updateLeadFieldsAtRow_(sheet, rowNumber, headerMap, updates) {
  Object.keys(updates).forEach(function (header) {
    const column = headerMap[header];
    if (!column) throw new Error('Cannot update missing header: ' + header);
    sheet.getRange(rowNumber, column).setValue(updates[header]);
  });
}

function updateLeadFieldsById_(sheet, id, updates, shouldFlush) {
  const headerMap = getHeaderMap_(sheet, ALL_LEAD_HEADERS);
  const rowNumber = findRowByLeadId_(sheet, id, headerMap);
  if (!rowNumber) throw new Error('Lead row no longer exists for Lead ID ' + id + '.');
  updateLeadFieldsAtRow_(sheet, rowNumber, headerMap, updates);
  if (shouldFlush) SpreadsheetApp.flush();
  return rowNumber;
}

function markLeadForReview_(sheet, id, message) {
  const current = refreshLeadById_(sheet, id);
  const currentStatus = normalizeStatus_(leadValue_(current, LEAD_HEADERS.STATUS));
  let finalStatus = STATUS.REVIEW_REQUIRED;
  if (isTrue_(leadValue_(current, LEAD_HEADERS.OPT_OUT))) {
    finalStatus = STATUS.DO_NOT_CONTACT;
  } else if (AUTOMATION_STOP_STATUSES.indexOf(currentStatus) !== -1) {
    // Never downgrade a reply, commercial outcome, opt-out, or an existing
    // quarantine because an asynchronous validation/recovery path failed.
    finalStatus = currentStatus;
  }
  updateLeadFieldsById_(sheet, id, {
    [LEAD_HEADERS.STATUS]: finalStatus,
    [LEAD_HEADERS.LAST_ERROR]: truncate_(message, CONFIG.SAFETY.MAX_LOG_MESSAGE_LENGTH),
    [LEAD_HEADERS.UPDATED_AT]: new Date()
  }, true);
}

function logEvent_(company, email, action, result, message) {
  appendOutreachLogRow_(getLogSheet_(), company, email, action, result, message);
}

function appendOutreachLogRow_(sheet, company, email, action, result, message) {
  sheet.appendRow([
    new Date(),
    safeLogCell_(company),
    safeLogCell_(normalizeEmail_(email)),
    safeLogCell_(action),
    safeLogCell_(result),
    safeLogCell_(message)
  ]);
}

function safeLogEvent_(company, email, action, result, message) {
  try {
    logEvent_(company, email, action, result, message);
    return true;
  } catch (error) {
    console.error('Outreach Log write failed: ' + errorMessage_(error));
    return false;
  }
}

function appendBoundLogEvent_(spreadsheet, company, email, action, result, message) {
  try {
    const sheet = spreadsheet && spreadsheet.getSheetByName(CONFIG.SHEETS.LOG_NAME);
    if (!sheet) throw new Error('Outreach Log sheet is missing.');
    appendOutreachLogRow_(sheet, company, email, action, result, message);
    return true;
  } catch (error) {
    console.error('Bound Outreach Log write failed: ' + errorMessage_(error));
    return false;
  }
}

function getSuccessfulInitialEmailsFromLog_() {
  const sheet = getLogSheet_();
  const lastRow = sheet.getLastRow();
  const blocked = {};
  if (lastRow < 2) return blocked;

  const map = getHeaderMap_(sheet, LOG_HEADERS);
  const rows = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  rows.forEach(function (row) {
    const action = String(row[map['Action'] - 1] || '').trim().toUpperCase();
    const result = String(row[map['Result'] - 1] || '').trim().toUpperCase();
    const email = normalizeEmail_(row[map['Email'] - 1]);
    if (!email) return;
    if (action === ACTION.INITIAL && (result === 'SENT' || result === 'RECOVERED')) {
      blocked[email] = 'successful initial-send log';
    }
    if (action === 'OPT_OUT' && (result === 'DETECTED' || result === 'RECORDED' || result === 'SKIPPED')) {
      blocked[email] = 'opt-out log';
    }
    if (action === 'DO_NOT_CONTACT' && result === 'RECORDED') blocked[email] = 'do-not-contact log';
    if (action === 'NOT_INTERESTED' && result === 'RECORDED') blocked[email] = 'not-interested log';
  });
  return blocked;
}

function getSelectedLead_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) throw new Error('Open the bound Google Sheet first.');
  const configuredSpreadsheet = getSpreadsheet_();
  if (spreadsheet.getId() !== configuredSpreadsheet.getId()) {
    throw new Error('The open spreadsheet does not match the configured Brand Outreach spreadsheet.');
  }
  const sheet = spreadsheet.getActiveSheet();
  if (!sheet || sheet.getName() !== CONFIG.SHEETS.LEADS_NAME) {
    throw new Error('Select a lead row on the ' + CONFIG.SHEETS.LEADS_NAME + ' sheet.');
  }
  const range = sheet.getActiveRange();
  if (!range || range.getRow() < 2) throw new Error('Select any cell in a populated lead row.');
  const record = getLeadAtRow_(sheet, range.getRow(), getHeaderMap_(sheet, ALL_LEAD_HEADERS));
  if (isLeadRowBlank_(record)) throw new Error('The selected row is blank.');
  return { sheet: sheet, record: record };
}

function toast_(message, title) {
  try {
    getSpreadsheet_().toast(message, title || 'Brand Outreach', 8);
  } catch (ignored) {
    // Scheduled executions have no visible spreadsheet UI.
  }
}


/**
 * Runtime personalization is deterministic. Category matching and the custom
 * Personalization cell select/insert approved copy; no AI service is used.
 */
const CATEGORY_TEMPLATES = Object.freeze({
  GAMING_HARDWARE: Object.freeze({
    initial: 'The event brings together gamers and esports audiences in an environment designed for hands-on product demos, trials and playable brand experiences—making it a strong setting for gaming and hardware brands.',
    followUp: 'It could be a practical setting for hands-on demos, product trials or a gaming-led activation.'
  }),
  TECHNOLOGY: Object.freeze({
    initial: 'With developers, technology enthusiasts, creators and early adopters attending, the event offers a practical setting for product demonstrations, interactive showcases and conversations with a technology-focused audience.',
    followUp: 'The developer and technology audience could make a product demonstration or interactive showcase especially relevant.'
  }),
  FMCG_BEVERAGE: Object.freeze({
    initial: 'The mix of gaming, creators, live entertainment and community experiences is designed to attract a young, engaged audience, creating opportunities for sampling, high-visibility stalls and memorable physical activations.',
    followUp: 'Sampling, a high-visibility stall or an experiential activation could fit the audience well.'
  }),
  FASHION_LIFESTYLE: Object.freeze({
    initial: 'The event sits at the intersection of youth culture, gaming, creators, music and fandom, creating a relevant space for physical displays, limited drops, retail-led experiences and lifestyle activations.',
    followUp: 'The overlap between youth culture, creators, gaming and live entertainment could support a strong physical display or activation.'
  }),
  AUTOMOTIVE: Object.freeze({
    initial: 'The event combines technology, entertainment and youth culture, offering automotive and mobility brands room for vehicle displays, technology showcases and interactive audience experiences.',
    followUp: 'A vehicle display, technology showcase or interactive mobility experience could be a natural fit.'
  }),
  EDUCATION: Object.freeze({
    initial: 'The audience includes students, developers, creators and technology enthusiasts, creating a relevant environment for career, learning, upskilling and education-led experiences.',
    followUp: 'The student, developer and creator audience could make a learning, careers or upskilling activation relevant.'
  }),
  CREATOR_COMMUNITY: Object.freeze({
    initial: 'Creator meetups, gaming communities, fandom experiences and live entertainment are central to the event, giving community and entertainment brands space to host interactions, showcases and audience-led experiences.',
    followUp: 'A creator, community or fandom-led experience could sit naturally within the event programme.'
  }),
  GENERAL: Object.freeze({
    initial: 'The event brings gamers, creators, developers, technology enthusiasts and youth communities together under one roof, creating room for interactive product showcases and relevant physical brand experiences.',
    followUp: 'The cross-section of gaming, technology, creators and youth culture could support a relevant physical brand experience.'
  })
});

function resolveCategoryTemplate_(category) {
  const text = safeDisplayText_(category).toLowerCase();
  // Community/creator categories are checked before the broad word "gaming"
  // so "Gaming Community" does not receive a hardware-demo template.
  if (/creator|streamer|community|entertainment|comic|anime|media|music/.test(text)) {
    return CATEGORY_TEMPLATES.CREATOR_COMMUNITY;
  }
  if (/gaming|esports|peripheral|\bpc\b|hardware|laptop|smartphone|consumer electronics|accessor|audio/.test(text)) {
    return CATEGORY_TEMPLATES.GAMING_HARDWARE;
  }
  if (/technology|tech startup|startup|saas|\bai\b|software|developer|telecom|internet|\bisp\b|cloud/.test(text)) {
    return CATEGORY_TEMPLATES.TECHNOLOGY;
  }
  if (/fmcg|food|beverage|drink|snack|nutrition/.test(text)) {
    return CATEGORY_TEMPLATES.FMCG_BEVERAGE;
  }
  if (/fashion|streetwear|lifestyle|apparel|beauty|retail/.test(text)) {
    return CATEGORY_TEMPLATES.FASHION_LIFESTYLE;
  }
  if (/automotive|automobile|mobility|motorcycle|\bev\b|vehicle/.test(text)) {
    return CATEGORY_TEMPLATES.AUTOMOTIVE;
  }
  if (/education|edtech|university|college|upskill|learning|career/.test(text)) {
    return CATEGORY_TEMPLATES.EDUCATION;
  }
  return CATEGORY_TEMPLATES.GENERAL;
}

function buildEmailForLead_(record, action) {
  const company = safeDisplayText_(leadValue_(record, LEAD_HEADERS.COMPANY));
  const contactName = safeDisplayText_(leadValue_(record, LEAD_HEADERS.CONTACT_NAME));
  const category = safeDisplayText_(leadValue_(record, LEAD_HEADERS.CATEGORY));
  const personalization = safeDisplayText_(leadValue_(record, LEAD_HEADERS.PERSONALIZATION));
  const currentEmail = normalizeEmail_(leadValue_(record, LEAD_HEADERS.EMAIL));
  const sentToEmail = normalizeEmail_(leadValue_(record, LEAD_HEADERS.SENT_TO_EMAIL));
  const to = action === ACTION.INITIAL ? currentEmail : (sentToEmail || currentEmail);
  const subject = buildInitialSubject_(company);
  const greeting = contactName || (company ? company + ' team' : 'team');
  const template = resolveCategoryTemplate_(category);

  if (action === ACTION.FOLLOW_UP_1) {
    return buildFollowUpOne_(to, subject, greeting, company, template);
  }
  if (action === ACTION.FOLLOW_UP_2) {
    return buildFollowUpTwo_(to, subject, greeting, company, template);
  }
  return buildInitialEmail_(to, subject, greeting, company, personalization, template);
}

function buildInitialSubject_(company) {
  const companyName = safeDisplayText_(company) || 'Your team';
  return truncate_(
    companyName + ' × ' + safeDisplayText_(CONFIG.EVENT.NAME) + ' — Brand Activation Opportunity',
    180
  );
}

function eventOpeningLine_() {
  const location = safeDisplayText_(CONFIG.EVENT.LOCATION_DISPLAY);
  const datePreposition = safeDisplayText_(CONFIG.EVENT.DATE_PREPOSITION) || 'on';
  return "I'm reaching out regarding " + safeDisplayText_(CONFIG.EVENT.NAME) +
    ', ' + safeDisplayText_(CONFIG.EVENT.ONE_LINE_DESCRIPTION) + ' taking place ' + datePreposition + ' ' +
    safeDisplayText_(CONFIG.EVENT.DATE_DISPLAY) + (location ? ' in ' + location : '') + '.';
}

function customPersonalizationLine_(company, personalization) {
  if (!personalization) return '';
  return 'One reason I thought ' + (company || 'your team') + ' could be a strong fit: ' +
    ensureTerminalPunctuation_(personalization);
}

function buildInitialEmail_(to, subject, greeting, company, personalization, template) {
  const paragraphs = [
    'Hi ' + greeting + ',',
    eventOpeningLine_(),
    template.initial,
    customPersonalizationLine_(company, personalization),
    "We're currently opening exhibition and brand activation spaces for selected brands interested in reaching this audience.",
    "I'd be glad to share our stall options, audience plan and collaboration opportunities if this is relevant for " + (company || 'your team') + '.',
    'Would you be open to a quick conversation?'
  ].filter(Boolean);
  return finishEmail_(to, subject, ACTION.INITIAL, paragraphs);
}

function buildFollowUpOne_(to, subject, greeting, company, template) {
  const paragraphs = [
    'Hi ' + greeting + ',',
    'Just following up on my note about exhibition and brand activation opportunities at ' + safeDisplayText_(CONFIG.EVENT.NAME) + '.',
    template.followUp,
    'Would it be useful if I sent over the stall options, audience plan and possible collaboration formats for ' + (company || 'your team') + '?'
  ];
  return finishEmail_(to, subject, ACTION.FOLLOW_UP_1, paragraphs);
}

function buildFollowUpTwo_(to, subject, greeting, company, template) {
  const paragraphs = [
    'Hi ' + greeting + ',',
    'One final follow-up regarding ' + safeDisplayText_(CONFIG.EVENT.NAME) + ' ' +
      (safeDisplayText_(CONFIG.EVENT.DATE_PREPOSITION) || 'on') + ' ' + safeDisplayText_(CONFIG.EVENT.DATE_DISPLAY) + '.',
    template.followUp,
    'If brand partnerships or physical activations are being planned, I would be happy to share the available options. If it is not relevant right now, no problem at all.'
  ];
  return finishEmail_(to, subject, ACTION.FOLLOW_UP_2, paragraphs);
}

function finishEmail_(to, subject, action, paragraphs) {
  const signatureLines = [
    'Best,',
    safeDisplayText_(CONFIG.SENDER.NAME),
    safeDisplayText_(CONFIG.EVENT.ORGANIZATION),
    safeDisplayText_(CONFIG.SENDER.PHONE),
    safeDisplayText_(CONFIG.SENDER.BUSINESS_EMAIL)
  ].filter(Boolean);
  const optOut = 'If you would prefer not to receive further messages about this event, reply “opt out” and we will update our list.';
  const plainBody = paragraphs.join('\n\n') + '\n\n' + signatureLines.join('\n') + '\n\n' + optOut;

  const htmlParagraphs = paragraphs.map(function (paragraph) {
    return '<p style="margin:0 0 14px 0">' + paragraphToHtml_(paragraph) + '</p>';
  }).join('');
  const htmlSignature = '<p style="margin:0 0 14px 0">' + signatureLines.map(htmlEscape_).join('<br>') + '</p>';
  const htmlOptOut = '<p style="margin:20px 0 0 0;color:#64748b;font-size:12px">' + htmlEscape_(optOut) + '</p>';
  const htmlBody = '<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.55;color:#1f2937">' +
    htmlParagraphs + htmlSignature + htmlOptOut + '</div>';

  return {
    action: action,
    to: to,
    cc: getConfiguredCcEmails_(),
    subject: subject,
    plainBody: plainBody,
    htmlBody: htmlBody
  };
}

function buildTestEnvelope_(message, intendedRecipient) {
  const testRecipient = normalizeEmail_(CONFIG.SAFETY.TEST_RECIPIENT);
  assertCondition_(isValidSingleEmail_(testRecipient), 'TEST_RECIPIENT is invalid.');
  assertCondition_(testRecipient !== normalizeEmail_(intendedRecipient),
    'TEST_RECIPIENT matches the production recipient; redirected test send refused.');
  const notice = 'TEST MODE — Intended production recipient: ' + normalizeEmail_(intendedRecipient) +
    '. No production lead state will be changed.';
  return {
    action: message.action,
    to: testRecipient,
    cc: getConfiguredCcEmails_(),
    subject: sanitizeHeaderValue_(CONFIG.SAFETY.TEST_SUBJECT_PREFIX) + ' [' + message.action + '] ' + message.subject,
    plainBody: notice + '\n\n' + message.plainBody,
    htmlBody: '<div style="padding:10px;margin-bottom:16px;background:#fef3c7;border:1px solid #f59e0b">' +
      htmlEscape_(notice) + '</div>' + message.htmlBody
  };
}

function determinePreviewAction_(record) {
  const status = normalizeStatus_(leadValue_(record, LEAD_HEADERS.STATUS));
  if (status === STATUS.FOLLOW_UP_2 || followUpAlreadySent_(record, ACTION.FOLLOW_UP_2)) return ACTION.FOLLOW_UP_2;
  if (status === STATUS.FOLLOW_UP_1 || followUpAlreadySent_(record, ACTION.FOLLOW_UP_1)) return ACTION.FOLLOW_UP_2;
  if (status === STATUS.SENT || hasInitialSuccessEvidence_(record)) return ACTION.FOLLOW_UP_1;
  return ACTION.INITIAL;
}

function getPreviewWarnings_(record, action, message) {
  const warnings = [];
  const statusValue = leadValue_(record, LEAD_HEADERS.STATUS);
  const status = normalizeStatus_(statusValue);
  if (!isValidSingleEmail_(message.to)) warnings.push('The current TO address is invalid; sending would be refused.');
  if (isValidSingleEmail_(message.to) && isConfiguredCcEmail_(message.to)) {
    warnings.push('The current TO address is also an internal CC; sending would be refused.');
  }
  if (isTrue_(leadValue_(record, LEAD_HEADERS.OPT_OUT))) warnings.push('Opt Out is TRUE; automation will not send.');
  if (AUTOMATION_STOP_STATUSES.indexOf(status) !== -1 || status === STATUS.FOLLOW_UP_2) {
    warnings.push('Status ' + status + ' is not eligible for another automated email.');
  } else if (action === ACTION.INITIAL && !isExactStatus_(statusValue, STATUS.APPROVED)) {
    warnings.push('Initial email requires exact Status APPROVED; current value is ' + (String(statusValue || '') || '(blank)') + '.');
  } else if (action === ACTION.FOLLOW_UP_1 && !isExactStatus_(statusValue, STATUS.SENT)) {
    warnings.push('Follow-up 1 requires exact Status SENT; current value is ' + (String(statusValue || '') || '(blank)') + '.');
  } else if (action === ACTION.FOLLOW_UP_2 && !isExactStatus_(statusValue, STATUS.FOLLOW_UP_1)) {
    warnings.push('Follow-up 2 requires exact Status FOLLOW_UP_1; current value is ' + (String(statusValue || '') || '(blank)') + '.');
  }
  if (hasPendingAction_(record)) warnings.push('A pending send guard exists; automatic sending is paused.');
  return warnings;
}

function previewSelectedEmail() {
  const selected = getSelectedLead_();
  const action = determinePreviewAction_(selected.record);
  const message = buildEmailForLead_(selected.record, action);
  const warnings = getPreviewWarnings_(selected.record, action, message);
  const warning = warnings.length ? '⚠ ' + warnings.join('\n⚠ ') + '\n\n' : '';

  const content = '<div style="font-family:Arial,sans-serif;padding:16px">' +
    '<p><strong>STAGE</strong><br>' + htmlEscape_(action) + '</p>' +
    '<p><strong>TO</strong><br>' + htmlEscape_(message.to || '(blank)') + '</p>' +
    '<p><strong>CC</strong><br>' + htmlEscape_((message.cc || []).join(', ')) + '</p>' +
    '<p><strong>SUBJECT</strong><br>' + htmlEscape_(message.subject) + '</p>' +
    '<p><strong>BODY</strong></p>' +
    '<pre style="white-space:pre-wrap;font-family:Arial,sans-serif;border:1px solid #cbd5e1;padding:12px;background:#f8fafc">' +
    htmlEscape_(warning + message.plainBody) + '</pre></div>';
  SpreadsheetApp.getUi().showModalDialog(
    HtmlService.createHtmlOutput(content).setWidth(720).setHeight(620),
    'Email preview — no message was sent'
  );
}


let AUTHORIZED_SEND_AS_CACHE_ = null;

function assertAdvancedGmailAvailable_() {
  if (typeof Gmail === 'undefined' || !Gmail.Users || !Gmail.Users.Messages) {
    throw new Error('Advanced Gmail service is not enabled. In Apps Script, open Services (+), add Gmail API, and try again.');
  }
}

function getAuthorizedSendAsAddresses_() {
  if (AUTHORIZED_SEND_AS_CACHE_) return AUTHORIZED_SEND_AS_CACHE_.slice();
  assertAdvancedGmailAvailable_();

  const addresses = {};
  const profile = Gmail.Users.getProfile('me');
  if (profile && profile.emailAddress) addresses[normalizeEmail_(profile.emailAddress)] = true;

  const response = Gmail.Users.Settings.SendAs.list('me');
  (response.sendAs || []).forEach(function (item) {
    const email = normalizeEmail_(item.sendAsEmail);
    const accepted = item.isPrimary || String(item.verificationStatus || '').toLowerCase() === 'accepted';
    if (email && accepted) addresses[email] = true;
  });

  AUTHORIZED_SEND_AS_CACHE_ = Object.keys(addresses);
  return AUTHORIZED_SEND_AS_CACHE_.slice();
}

function getOwnEmailSet_() {
  const own = {};
  getAuthorizedSendAsAddresses_().forEach(function (email) {
    own[email] = true;
  });
  return own;
}

function getIgnoredReplySenderSet_() {
  const ignored = getOwnEmailSet_();
  getConfiguredCcEmails_().forEach(function (email) {
    ignored[email] = true;
  });
  return ignored;
}

function getCurrentMailboxEmail_() {
  assertAdvancedGmailAvailable_();
  const profile = Gmail.Users.getProfile('me');
  const email = profile && profile.emailAddress ? normalizeEmail_(profile.emailAddress) : '';
  assertCondition_(isValidSingleEmail_(email), 'Could not determine the authorized Gmail mailbox address.');
  return email;
}

function createInitialDraft_(message, leadId, attemptId) {
  assertAdvancedGmailAvailable_();
  const raw = buildRawMime_({
    to: message.to,
    cc: message.cc,
    subject: message.subject,
    plainBody: message.plainBody,
    htmlBody: message.htmlBody,
    leadId: leadId,
    action: message.action || ACTION.INITIAL,
    attemptId: attemptId
  });
  const draft = Gmail.Users.Drafts.create({ message: { raw: raw } }, 'me');
  assertCondition_(draft && draft.id && draft.message, 'Gmail created no identifiable initial draft.');
  try {
    validateDraftRecipient_(draft, message.to);
  } catch (error) {
    try { removeDraft_(draft.id); } catch (ignored) {}
    throw error;
  }
  return {
    draftId: String(draft.id),
    draftMessageId: String(draft.message.id || ''),
    threadId: String(draft.message.threadId || ''),
    subject: message.subject
  };
}

function createThreadedFollowUpDraft_(message, leadId, attemptId, initialMessageId, anchorMessageId) {
  assertAdvancedGmailAvailable_();
  const headerNames = [
    'Message-ID', 'References', 'Subject', 'From', 'To', 'Cc', 'Bcc',
    'X-Brand-Outreach-Campaign-ID', 'X-Brand-Outreach-Lead-ID',
    'X-Brand-Outreach-Action', 'X-Brand-Outreach-Attempt-ID'
  ];
  const initial = Gmail.Users.Messages.get('me', String(initialMessageId), {
    format: 'metadata',
    metadataHeaders: headerNames
  });
  const anchor = Gmail.Users.Messages.get('me', String(anchorMessageId), {
    format: 'metadata',
    metadataHeaders: headerNames
  });
  assertCondition_(initial && anchor, 'Stored Gmail message anchor was not found.');
  assertCondition_(initial.threadId && anchor.threadId && initial.threadId === anchor.threadId,
    'Initial and follow-up anchor messages are no longer in the same Gmail thread.');
  validateAutomatedSentMessage_(initial, {
    campaignId: CONFIG.CAMPAIGN_ID,
    leadId: leadId,
    action: ACTION.INITIAL,
    recipient: message.to,
    description: 'initial Gmail anchor'
  });
  validateAutomatedSentMessage_(anchor, {
    campaignId: CONFIG.CAMPAIGN_ID,
    leadId: leadId,
    action: message.action === ACTION.FOLLOW_UP_1 ? ACTION.INITIAL : ACTION.FOLLOW_UP_1,
    recipient: message.to,
    description: 'latest Gmail anchor'
  });

  // Gmail metadata may expose RFC 2047 encoded words or already-decoded text.
  // Normalize either form and then let buildRawMime_ encode it once, avoiding
  // a double-encoded Subject that would fail Gmail's thread-match rule.
  const originalSubject = decodeRfc2047Header_(getApiHeader_(initial, 'Subject'));
  const parentRfcMessageId = getApiHeader_(anchor, 'Message-ID');
  assertCondition_(originalSubject, 'The initial Gmail message has no Subject header.');
  assertCondition_(parentRfcMessageId, 'The follow-up anchor has no RFC Message-ID header.');

  const references = buildReferencesHeader_(
    getApiHeader_(anchor, 'References'),
    parentRfcMessageId
  );
  const raw = buildRawMime_({
    to: message.to,
    cc: message.cc,
    subject: originalSubject,
    plainBody: message.plainBody,
    htmlBody: message.htmlBody,
    inReplyTo: parentRfcMessageId,
    references: references,
    leadId: leadId,
    action: message.action,
    attemptId: attemptId
  });
  const draft = Gmail.Users.Drafts.create({
    message: {
      raw: raw,
      threadId: String(anchor.threadId)
    }
  }, 'me');
  assertCondition_(draft && draft.id && draft.message, 'Gmail created no identifiable follow-up draft.');
  try {
    validateDraftRecipient_(draft, message.to);
    assertCondition_(String(draft.message.threadId || '') === String(anchor.threadId),
      'Gmail did not attach the follow-up draft to the expected thread.');
  } catch (error) {
    try { removeDraft_(draft.id); } catch (ignored) {}
    throw error;
  }
  return {
    draftId: String(draft.id),
    draftMessageId: String(draft.message.id || ''),
    threadId: String(draft.message.threadId || ''),
    subject: originalSubject
  };
}

function validateDraftRecipient_(draft, intendedRecipient) {
  const draftMessage = Gmail.Users.Messages.get('me', String(draft.message.id), {
    format: 'metadata',
    metadataHeaders: ['To', 'Cc', 'Bcc']
  });
  const to = extractEmailAddresses_(getApiHeader_(draftMessage, 'To'));
  const cc = extractEmailAddresses_(getApiHeader_(draftMessage, 'Cc'));
  const bcc = extractEmailAddresses_(getApiHeader_(draftMessage, 'Bcc'));
  const expected = normalizeEmail_(intendedRecipient);
  const expectedCc = getConfiguredCcEmails_();
  assertCondition_(to.length === 1 && to[0] === expected,
    'Draft recipient validation failed; expected exactly ' + expected + '.');
  assertCondition_(emailListsMatchAsSets_(cc, expectedCc),
    'Draft CC recipients do not exactly match CONFIG.SENDER.CC_EMAILS.');
  assertCondition_(bcc.length === 0, 'Draft unexpectedly contains a BCC recipient.');
}

function sendPreparedDraft_(draftId, requiredMode, expected, finalEligibilityCheck) {
  assertAdvancedGmailAvailable_();
  assertCondition_(!isSystemDisabled_(), 'Runtime kill switch activated before Gmail send; draft was left unsent.');
  const mode = getExecutionMode_();
  assertCondition_((requiredMode === 'LIVE' || requiredMode === 'TEST') && mode === requiredMode,
    'Current CONFIG mode does not permit Gmail sending; draft was left unsent.');
  if (requiredMode === 'LIVE') {
    assertCondition_(typeof finalEligibilityCheck === 'function',
      'A live Gmail send requires a final sheet eligibility callback.');
  }
  validatePreparedDraftForSend_(draftId, expected);
  if (typeof finalEligibilityCheck === 'function') finalEligibilityCheck();
  assertCampaignWindowOpen_();
  assertCondition_(!isSystemDisabled_(), 'Runtime kill switch activated during final draft validation; draft was left unsent.');
  const sent = Gmail.Users.Drafts.send({ id: String(draftId) }, 'me');
  assertCondition_(sent && sent.id && sent.threadId, 'Gmail returned no message/thread ID after sending.');
  return {
    messageId: String(sent.id),
    threadId: String(sent.threadId),
    sentAt: sent.internalDate ? new Date(Number(sent.internalDate)) : new Date()
  };
}

function validatePreparedDraftForSend_(draftId, expected) {
  assertCondition_(expected && expected.leadId && expected.action && expected.attemptId,
    'Final draft validation metadata is incomplete.');
  const draft = Gmail.Users.Drafts.get('me', String(draftId), { format: 'minimal' });
  assertCondition_(draft && draft.message && draft.message.id, 'Prepared Gmail draft no longer exists.');
  const message = Gmail.Users.Messages.get('me', String(draft.message.id), {
    format: 'metadata',
    metadataHeaders: [
      'From', 'Reply-To', 'To', 'Cc', 'Bcc', 'Subject',
      'X-Brand-Outreach-Campaign-ID', 'X-Brand-Outreach-Lead-ID',
      'X-Brand-Outreach-Action', 'X-Brand-Outreach-Attempt-ID'
    ]
  });
  assertCondition_((message.labelIds || []).indexOf('DRAFT') !== -1,
    'Prepared Gmail message is no longer an unsent draft.');
  assertCondition_(getApiHeader_(message, 'X-Brand-Outreach-Campaign-ID') === String(CONFIG.CAMPAIGN_ID),
    'Draft campaign header changed; send refused.');
  assertCondition_(getApiHeader_(message, 'X-Brand-Outreach-Lead-ID') === String(expected.leadId),
    'Draft lead header changed; send refused.');
  assertCondition_(getApiHeader_(message, 'X-Brand-Outreach-Action') === String(expected.action),
    'Draft action header changed; send refused.');
  assertCondition_(getApiHeader_(message, 'X-Brand-Outreach-Attempt-ID') === String(expected.attemptId),
    'Draft attempt header changed; send refused.');

  const recipient = normalizeEmail_(expected.recipient);
  const to = extractEmailAddresses_(getApiHeader_(message, 'To'));
  const cc = extractEmailAddresses_(getApiHeader_(message, 'Cc'));
  const bcc = extractEmailAddresses_(getApiHeader_(message, 'Bcc'));
  assertCondition_(isValidSingleEmail_(recipient) && to.length === 1 && to[0] === recipient,
    'Draft recipient changed during processing; send refused.');
  assertCondition_(emailListsMatchAsSets_(cc, getConfiguredCcEmails_()),
    'Draft CC recipients changed during processing; send refused.');
  assertCondition_(bcc.length === 0, 'Draft contains a BCC recipient; send refused.');
  const own = getOwnEmailSet_();
  const from = extractEmailAddresses_(getApiHeader_(message, 'From'));
  const replyTo = extractEmailAddresses_(getApiHeader_(message, 'Reply-To'));
  assertCondition_(from.some(function (email) { return own[email]; }),
    'Draft From address is not currently authorized; send refused.');
  assertCondition_(replyTo.length === 1 && replyTo[0] === normalizeEmail_(CONFIG.SENDER.REPLY_TO_EMAIL),
    'Draft Reply-To address changed; send refused.');
  if (hasValue_(expected.subject)) {
    assertCondition_(decodeRfc2047Header_(getApiHeader_(message, 'Subject')) === String(expected.subject),
      'Draft Subject changed during processing; send refused.');
  }
  if (expected.threadId) {
    assertCondition_(String(message.threadId || '') === String(expected.threadId),
      'Draft thread changed during processing; send refused.');
  }
}

function buildRawMime_(params) {
  const to = normalizeEmail_(params.to);
  const configuredCc = getConfiguredCcEmails_();
  const cc = (params.cc || []).map(normalizeEmail_);
  const fromEmail = normalizeEmail_(CONFIG.SENDER.FROM_EMAIL);
  const replyTo = normalizeEmail_(CONFIG.SENDER.REPLY_TO_EMAIL);
  assertCondition_(isValidSingleEmail_(to), 'Cannot build MIME for an invalid recipient.');
  assertCondition_(isValidSingleEmail_(fromEmail), 'CONFIG.SENDER.FROM_EMAIL is invalid.');
  assertCondition_(isValidSingleEmail_(replyTo), 'CONFIG.SENDER.REPLY_TO_EMAIL is invalid.');
  assertCondition_(emailListsMatchAsSets_(cc, configuredCc),
    'Email CC list does not exactly match CONFIG.SENDER.CC_EMAILS.');
  assertCondition_(configuredCc.indexOf(to) === -1,
    'The lead/test To address cannot also be a configured internal CC.');

  const boundary = 'brand_outreach_' + Utilities.getUuid().replace(/-/g, '');
  const headers = [
    'To: ' + to,
    'Cc: ' + configuredCc.join(', '),
    'From: ' + encodeHeaderWord_(safeDisplayText_(CONFIG.SENDER.NAME)) + ' <' + fromEmail + '>',
    'Reply-To: ' + replyTo,
    'Subject: ' + encodeHeaderWord_(sanitizeHeaderValue_(params.subject)),
    'X-Brand-Outreach-Campaign-ID: ' + sanitizeHeaderValue_(CONFIG.CAMPAIGN_ID),
    'X-Brand-Outreach-Lead-ID: ' + sanitizeHeaderValue_(params.leadId),
    'X-Brand-Outreach-Action: ' + sanitizeHeaderValue_(params.action),
    'X-Brand-Outreach-Attempt-ID: ' + sanitizeHeaderValue_(params.attemptId)
  ];
  if (params.inReplyTo) headers.push('In-Reply-To: ' + sanitizeReferenceHeader_(params.inReplyTo));
  if (params.references) headers.push('References: ' + sanitizeReferenceHeader_(params.references));
  headers.push('MIME-Version: 1.0');
  headers.push('Content-Type: multipart/alternative; boundary="' + boundary + '"');

  const rawMessage = headers.concat([
    '',
    '--' + boundary,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    foldBase64_(Utilities.base64Encode(String(params.plainBody || ''), Utilities.Charset.UTF_8)),
    '--' + boundary,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    foldBase64_(Utilities.base64Encode(String(params.htmlBody || ''), Utilities.Charset.UTF_8)),
    '--' + boundary + '--',
    ''
  ]).join('\r\n');

  return Utilities.base64EncodeWebSafe(rawMessage, Utilities.Charset.UTF_8).replace(/=+$/g, '');
}

function encodeHeaderWord_(value) {
  const text = sanitizeHeaderValue_(value);
  if (!text) return '=?UTF-8?B??=';
  const chunks = [];
  let current = '';
  Array.from(text).forEach(function (character) {
    const candidate = current + character;
    const encoded = Utilities.base64Encode(candidate, Utilities.Charset.UTF_8);
    // RFC 2047 caps each encoded-word at 75 characters. The wrapper consumes
    // 12, so staying at/below 60 Base64 characters leaves safe headroom.
    if (encoded.length > 60 && current) {
      chunks.push(current);
      current = character;
    } else {
      current = candidate;
    }
  });
  if (current) chunks.push(current);
  return chunks.map(function (chunk) {
    return '=?UTF-8?B?' + Utilities.base64Encode(chunk, Utilities.Charset.UTF_8) + '?=';
  }).join('\r\n ');
}

function decodeRfc2047Header_(value) {
  const text = String(value || '');
  const pattern = /=\?([^?\s]+)\?([bq])\?([^?]*)\?=/gi;
  let output = '';
  let lastIndex = 0;
  let previousWasEncoded = false;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    const between = text.slice(lastIndex, match.index);
    if (!(previousWasEncoded && /^\s*$/.test(between))) output += between;
    let decoded = match[0];
    try {
      let bytes;
      if (match[2].toLowerCase() === 'b') {
        bytes = Utilities.base64Decode(match[3]);
      } else {
        const qValue = match[3].replace(/_/g, ' ');
        bytes = [];
        for (let i = 0; i < qValue.length; i += 1) {
          if (qValue.charAt(i) === '=' && /^[0-9a-f]{2}$/i.test(qValue.slice(i + 1, i + 3))) {
            bytes.push(parseInt(qValue.slice(i + 1, i + 3), 16));
            i += 2;
          } else {
            bytes.push(qValue.charCodeAt(i) & 0xff);
          }
        }
      }
      decoded = Utilities.newBlob(bytes).getDataAsString(match[1]);
    } catch (ignored) {
      // Preserve an unsupported/malformed encoded word. Final Gmail draft
      // validation will still fail closed if the Subject cannot thread.
      decoded = match[0];
    }
    output += decoded;
    lastIndex = pattern.lastIndex;
    previousWasEncoded = true;
  }
  return output + text.slice(lastIndex);
}

function foldBase64_(value) {
  const chunks = String(value || '').match(/.{1,76}/g) || [];
  return chunks.join('\r\n');
}

function sanitizeReferenceHeader_(value) {
  const matches = String(value || '').match(/<[^<>\r\n]+>/g) || [];
  return matches.join(' ');
}

function buildReferencesHeader_(existing, parentMessageId) {
  const values = [];
  (String(existing || '').match(/<[^<>\r\n]+>/g) || []).forEach(function (item) {
    if (values.indexOf(item) === -1) values.push(item);
  });
  (String(parentMessageId || '').match(/<[^<>\r\n]+>/g) || []).forEach(function (item) {
    if (values.indexOf(item) === -1) values.push(item);
  });
  return values.join(' ');
}

function getApiHeader_(message, headerName) {
  const headers = message && message.payload && message.payload.headers ? message.payload.headers : [];
  const target = String(headerName || '').toLowerCase();
  for (let i = 0; i < headers.length; i += 1) {
    if (String(headers[i].name || '').toLowerCase() === target) return String(headers[i].value || '');
  }
  return '';
}

function getGmailThread_(threadId, format) {
  assertAdvancedGmailAvailable_();
  return Gmail.Users.Threads.get('me', String(threadId), { format: format || 'full' });
}

function getThreadIdFromMessage_(messageId) {
  const message = Gmail.Users.Messages.get('me', String(messageId), { format: 'minimal' });
  return message && message.threadId ? String(message.threadId) : '';
}

function findSentMessageByAttempt_(threadId, attemptId, expected) {
  if (!threadId || !attemptId || !expected) return null;
  let thread;
  try {
    thread = Gmail.Users.Threads.get('me', String(threadId), {
      format: 'metadata',
      metadataHeaders: [
        'X-Brand-Outreach-Attempt-ID', 'X-Brand-Outreach-Campaign-ID',
        'X-Brand-Outreach-Lead-ID', 'X-Brand-Outreach-Action',
        'From', 'To', 'Cc', 'Bcc', 'Subject'
      ]
    });
  } catch (error) {
    return null;
  }
  const matches = [];
  const messages = (thread && thread.messages) || [];
  for (let i = 0; i < messages.length; i += 1) {
    const message = messages[i];
    const header = getApiHeader_(message, 'X-Brand-Outreach-Attempt-ID');
    if (header === String(attemptId)) {
      validateAutomatedSentMessage_(message, {
        campaignId: expected.campaignId,
        leadId: expected.leadId,
        action: expected.action,
        attemptId: attemptId,
        recipient: expected.recipient,
        description: 'recovered Gmail message'
      });
      matches.push(message);
    }
  }
  assertCondition_(matches.length <= 1, 'Multiple sent Gmail messages share one attempt ID; automatic recovery refused.');
  return matches.length === 1 ? matches[0] : null;
}

function validateAutomatedSentMessage_(message, expected) {
  const context = expected.description || 'Gmail message';
  const labels = message.labelIds || [];
  assertCondition_(labels.indexOf('SENT') !== -1 && labels.indexOf('DRAFT') === -1,
    'The ' + context + ' is not a completed sent message.');
  assertCondition_(getApiHeader_(message, 'X-Brand-Outreach-Campaign-ID') === String(expected.campaignId),
    'The ' + context + ' belongs to a different campaign.');
  assertCondition_(getApiHeader_(message, 'X-Brand-Outreach-Lead-ID') === String(expected.leadId),
    'The ' + context + ' belongs to a different lead.');
  assertCondition_(getApiHeader_(message, 'X-Brand-Outreach-Action') === String(expected.action),
    'The ' + context + ' has an unexpected outreach action.');
  if (expected.attemptId) {
    assertCondition_(getApiHeader_(message, 'X-Brand-Outreach-Attempt-ID') === String(expected.attemptId),
      'The ' + context + ' has an unexpected attempt ID.');
  } else {
    assertCondition_(hasValue_(getApiHeader_(message, 'X-Brand-Outreach-Attempt-ID')),
      'The ' + context + ' has no outreach attempt ID.');
  }

  const expectedRecipient = normalizeEmail_(expected.recipient);
  const to = extractEmailAddresses_(getApiHeader_(message, 'To'));
  const cc = extractEmailAddresses_(getApiHeader_(message, 'Cc'));
  const bcc = extractEmailAddresses_(getApiHeader_(message, 'Bcc'));
  assertCondition_(isValidSingleEmail_(expectedRecipient) && to.length === 1 && to[0] === expectedRecipient,
    'The ' + context + ' recipient does not match the immutable lead recipient.');
  assertCondition_(emailListsMatchAsSets_(cc, getConfiguredCcEmails_()),
    'The ' + context + ' CC recipients do not match the configured internal team.');
  assertCondition_(bcc.length === 0,
    'The ' + context + ' unexpectedly contains BCC recipients.');

  const own = getOwnEmailSet_();
  const from = extractEmailAddresses_(getApiHeader_(message, 'From'));
  assertCondition_(from.some(function (email) { return own[email]; }),
    'The ' + context + ' was not sent by a currently authorized sender address.');
  return { recipient: to[0], from: from[0] || '' };
}

function getDraftSafely_(draftId) {
  if (!draftId) return null;
  try {
    return Gmail.Users.Drafts.get('me', String(draftId), { format: 'minimal' });
  } catch (error) {
    return null;
  }
}

function removeDraft_(draftId) {
  Gmail.Users.Drafts.remove('me', String(draftId));
}

function getDailySendState_() {
  const properties = PropertiesService.getScriptProperties();
  const today = Utilities.formatDate(new Date(), CONFIG.TIME_ZONE, 'yyyy-MM-dd');
  const raw = properties.getProperty(SCRIPT_PROPERTY_KEYS.DAILY_SEND_STATE);
  if (!raw) return { date: today, count: 0, updatedAt: new Date().toISOString() };
  let state;
  try {
    state = JSON.parse(raw);
  } catch (error) {
    throw new Error('Daily send counter is unreadable; sending is blocked until an operator inspects the script property.');
  }
  if (!state || typeof state.date !== 'string' || !Number.isInteger(state.count) || state.count < 0) {
    throw new Error('Daily send counter is invalid; sending is blocked until an operator inspects the script property.');
  }
  if (state.date !== today) return { date: today, count: 0, updatedAt: new Date().toISOString() };
  return state;
}

function reserveDailySendSlot_() {
  const state = getDailySendState_();
  if (state.count >= CONFIG.SAFETY.DAILY_SEND_LIMIT) {
    return { reserved: false, reason: 'Configured daily send limit reached.' };
  }

  const gmailRemaining = Number(MailApp.getRemainingDailyQuota());
  const recipientUnits = recipientUnitsPerMessage_();
  if (!isFinite(gmailRemaining) ||
      gmailRemaining < recipientUnits + CONFIG.SAFETY.GMAIL_QUOTA_RESERVE) {
    return {
      reserved: false,
      reason: 'Gmail recipient quota cannot cover To + configured CC while retaining the safety reserve.'
    };
  }

  state.count += 1;
  state.updatedAt = new Date().toISOString();
  PropertiesService.getScriptProperties().setProperty(
    SCRIPT_PROPERTY_KEYS.DAILY_SEND_STATE,
    JSON.stringify(state)
  );
  return {
    reserved: true,
    count: state.count,
    configuredRemaining: Math.max(0, CONFIG.SAFETY.DAILY_SEND_LIMIT - state.count),
    gmailRemainingBeforeSend: gmailRemaining,
    recipientUnitsReserved: recipientUnits
  };
}

function sleepAfterActualSend_() {
  const delay = Math.max(0, Number(CONFIG.SAFETY.SEND_DELAY_MS) || 0);
  if (delay) Utilities.sleep(delay);
}

function safeSleepAfterActualSend_() {
  try {
    sleepAfterActualSend_();
  } catch (error) {
    console.error('Post-send delay failed after Gmail accepted the message: ' + errorMessage_(error));
  }
}


function detectThreadResponseForLead_(record) {
  const campaignId = String(leadValue_(record, LEAD_HEADERS.CAMPAIGN_ID) || '').trim();
  if (campaignId !== String(CONFIG.CAMPAIGN_ID)) {
    throw new Error('Stored Campaign ID does not match CONFIG.CAMPAIGN_ID; reply scan refused.');
  }
  const initialMessageId = String(leadValue_(record, LEAD_HEADERS.INITIAL_MESSAGE_ID) || '').trim();
  if (!initialMessageId) throw new Error('Cannot check replies without Initial Message ID.');

  const currentThreadId = getThreadIdFromMessage_(initialMessageId);
  if (!currentThreadId) throw new Error('The stored initial Gmail message could not be resolved to a thread.');
  const thread = getGmailThread_(currentThreadId, 'full');
  const messages = ((thread && thread.messages) || []).slice().sort(function (a, b) {
    return Number(a.internalDate || 0) - Number(b.internalDate || 0);
  });
  // Internal CC participants may reply-all for coordination. Ignore them just
  // like our own Send-As identities so they cannot be mistaken for the brand.
  const ignoredReplySenders = getIgnoredReplySenderSet_();
  const leadId = leadId_(record);
  const sentTo = normalizeEmail_(leadValue_(record, LEAD_HEADERS.SENT_TO_EMAIL));
  const knownSentActions = {};
  knownSentActions[initialMessageId] = ACTION.INITIAL;
  const firstMessageId = String(leadValue_(record, LEAD_HEADERS.FOLLOW_UP_1_MESSAGE_ID) || '').trim();
  const secondMessageId = String(leadValue_(record, LEAD_HEADERS.FOLLOW_UP_2_MESSAGE_ID) || '').trim();
  if (firstMessageId) knownSentActions[firstMessageId] = ACTION.FOLLOW_UP_1;
  if (secondMessageId) knownSentActions[secondMessageId] = ACTION.FOLLOW_UP_2;
  let foundInitial = false;
  let humanReply = null;
  let optOutReply = null;
  let bounce = null;
  let autoReply = null;
  let manualOutbound = null;

  messages.forEach(function (message) {
    if (String(message.id) === initialMessageId) {
      validateAutomatedSentMessage_(message, {
        campaignId: CONFIG.CAMPAIGN_ID,
        leadId: leadId,
        action: ACTION.INITIAL,
        recipient: sentTo,
        description: 'initial message used for reply detection'
      });
      foundInitial = true;
      return;
    }
    if (!foundInitial || (message.labelIds || []).indexOf('DRAFT') !== -1) return;

    const labels = message.labelIds || [];
    if (labels.indexOf('SENT') !== -1) {
      const knownAction = knownSentActions[String(message.id)];
      if (knownAction) {
        validateAutomatedSentMessage_(message, {
          campaignId: CONFIG.CAMPAIGN_ID,
          leadId: leadId,
          action: knownAction,
          recipient: sentTo,
          description: 'stored automated message used for reply detection'
        });
      } else if (!manualOutbound) {
        manualOutbound = {
          type: 'MANUAL_OUTBOUND',
          messageId: String(message.id || ''),
          threadId: String(message.threadId || currentThreadId),
          from: extractEmailAddresses_(getApiHeader_(message, 'From'))[0] || '',
          receivedAt: message.internalDate ? new Date(Number(message.internalDate)) : new Date()
        };
      }
      return;
    }

    const fromAddresses = extractEmailAddresses_(getApiHeader_(message, 'From'));
    if (!fromAddresses.length || fromAddresses.every(function (email) {
      return ignoredReplySenders[email];
    })) return;

    const response = {
      messageId: String(message.id || ''),
      threadId: String(message.threadId || currentThreadId),
      from: fromAddresses[0],
      receivedAt: message.internalDate ? new Date(Number(message.internalDate)) : new Date()
    };

    if (isBounceMessage_(message)) {
      if (!bounce) bounce = Object.assign({ type: 'BOUNCE' }, response);
      return;
    }
    if (isAutomatedResponse_(message)) {
      if (!autoReply) autoReply = Object.assign({ type: 'AUTO_REPLY' }, response);
      return;
    }

    const topText = getTopUnquotedText_(extractMessagePlainText_(message));
    if (containsStrongOptOut_(topText)) {
      if (!optOutReply) optOutReply = Object.assign({ type: 'OPT_OUT' }, response);
      return;
    }
    if (!humanReply) humanReply = Object.assign({ type: 'REPLY' }, response);
  });

  if (!foundInitial) throw new Error('Initial Message ID is not present in its resolved Gmail thread.');
  return optOutReply || humanReply || manualOutbound || bounce || autoReply || null;
}

function isBounceMessage_(message) {
  const from = getApiHeader_(message, 'From').toLowerCase();
  const subject = getApiHeader_(message, 'Subject').toLowerCase();
  const contentType = getApiHeader_(message, 'Content-Type').toLowerCase();
  return /mailer-daemon|postmaster/.test(from) ||
    /delivery status notification|undeliverable|delivery failure|failure notice|returned mail/.test(subject) ||
    /delivery-status|multipart\/report/.test(contentType);
}

function isAutomatedResponse_(message) {
  const autoSubmitted = getApiHeader_(message, 'Auto-Submitted').toLowerCase();
  const precedence = getApiHeader_(message, 'Precedence').toLowerCase();
  const subject = getApiHeader_(message, 'Subject').toLowerCase();
  const xAutoReply = getApiHeader_(message, 'X-Autoreply') ||
    getApiHeader_(message, 'X-Auto-Response-Suppress') ||
    getApiHeader_(message, 'X-Autorespond');
  if (autoSubmitted && autoSubmitted !== 'no') return true;
  if (xAutoReply) return true;
  if (/bulk|junk|list/.test(precedence)) return true;
  return /automatic reply|auto.?reply|out of office|away from the office|vacation response/.test(subject);
}

function extractMessagePlainText_(message) {
  const plainParts = [];
  const htmlParts = [];
  collectMessageParts_(message.payload, plainParts, htmlParts, String(message.id || ''));
  if (plainParts.length) return plainParts.join('\n');
  if (!htmlParts.length) return '';
  return stripHtml_(htmlParts.join('\n'));
}

function collectMessageParts_(part, plainParts, htmlParts, messageId) {
  if (!part) return;
  const mimeType = String(part.mimeType || '').toLowerCase();
  const disposition = getMimePartHeader_(part, 'Content-Disposition').toLowerCase();
  if (mimeType === 'message/rfc822' || part.filename || /attachment/.test(disposition)) return;

  let data = part.body && part.body.data ? part.body.data : '';
  const attachmentId = part.body && part.body.attachmentId ? String(part.body.attachmentId) : '';
  if (!data && attachmentId && messageId && (mimeType === 'text/plain' || mimeType === 'text/html')) {
    try {
      const attachment = Gmail.Users.Messages.Attachments.get('me', messageId, attachmentId);
      data = attachment && attachment.data ? attachment.data : '';
    } catch (ignored) {
      data = '';
    }
  }
  if (data && mimeType === 'text/plain') plainParts.push(decodeGmailBody_(data));
  if (data && mimeType === 'text/html') htmlParts.push(decodeGmailBody_(data));
  (part.parts || []).forEach(function (child) {
    collectMessageParts_(child, plainParts, htmlParts, messageId);
  });
}

function getMimePartHeader_(part, headerName) {
  const target = String(headerName || '').toLowerCase();
  const headers = (part && part.headers) || [];
  for (let i = 0; i < headers.length; i += 1) {
    if (String(headers[i].name || '').toLowerCase() === target) return String(headers[i].value || '');
  }
  return '';
}

function decodeGmailBody_(data) {
  try {
    const text = String(data || '');
    const padding = text.length % 4 ? new Array(5 - (text.length % 4)).join('=') : '';
    return Utilities.newBlob(Utilities.base64DecodeWebSafe(text + padding)).getDataAsString('UTF-8');
  } catch (ignored) {
    return '';
  }
}

function stripHtml_(html) {
  let source = String(html || '');
  const quoteMarkers = [
    /<blockquote\b/i,
    /<(?:div|span|table)\b[^>]*(?:class|id)\s*=\s*["'][^"']*(?:gmail_quote|yahoo_quoted|divRplyFwdMsg)[^"']*["'][^>]*>/i
  ];
  let quoteIndex = -1;
  quoteMarkers.forEach(function (pattern) {
    const index = source.search(pattern);
    if (index >= 0 && (quoteIndex < 0 || index < quoteIndex)) quoteIndex = index;
  });
  if (quoteIndex >= 0) source = source.slice(0, quoteIndex);

  return source
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function getTopUnquotedText_(body) {
  let source = String(body || '').replace(/\r/g, '');
  const wrappedOwnFooter = /if you would prefer not to receive[\s>|]+further[\s>|]+messages[\s>|]+about[\s>|]+this[\s>|]+event/i.exec(source);
  if (wrappedOwnFooter) source = source.slice(0, wrappedOwnFooter.index);
  const lines = source.split('\n');
  const kept = [];
  const ownOptOutMarker = 'if you would prefer not to receive further messages about this event';
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();
    const ownFooterIndex = trimmed.toLowerCase().indexOf(ownOptOutMarker);
    if (ownFooterIndex >= 0) {
      // Some localized mail clients do not expose a recognizable quote
      // delimiter. Stop at our deterministic footer so its words "opt out"
      // can never turn an unrelated reply into a durable suppression.
      const prefix = trimmed.slice(0, ownFooterIndex).trim();
      if (prefix) kept.push(prefix);
      break;
    }
    if (/^>/.test(trimmed)) break;
    if (/^on\s/i.test(trimmed)) {
      const possibleWrappedHeader = lines.slice(i, Math.min(lines.length, i + 4)).join(' ').replace(/\s+/g, ' ');
      if (/\bwrote:/i.test(possibleWrappedHeader)) break;
    }
    if (/^-{2,}\s*original message\s*-{2,}$/i.test(trimmed)) break;
    if (/^-{2,}\s*forwarded message\s*-{2,}$/i.test(trimmed) || /^begin forwarded message:?$/i.test(trimmed)) break;
    if (/^from:/i.test(trimmed)) {
      const headerWindow = lines.slice(i, Math.min(lines.length, i + 7)).join('\n');
      const headerCount = (headerWindow.match(/^(?:sent|date|to|subject):/gim) || []).length;
      if (headerCount >= 2) break;
    }
    kept.push(line);
    if (kept.join('\n').length >= 5000) break;
  }
  return kept.join('\n').slice(0, 5000).trim();
}

function containsStrongOptOut_(text) {
  const normalized = String(text || '').toLowerCase().replace(/[’]/g, "'");
  return /\bunsubscribe\b|\bopt[\s-]?out\b|\bremove (?:me|my email)\b|\btake me off\b|\bdo not (?:contact|email) me\b|\bdon't (?:contact|email) me\b|\bstop (?:emailing|mailing|contacting) me\b|\bno more emails\b/.test(normalized);
}

function applyDetectedResponse_(sheet, leadId, response, company, leadEmail) {
  const now = new Date();
  const current = refreshLeadById_(sheet, leadId);
  const currentStatus = normalizeStatus_(leadValue_(current, LEAD_HEADERS.STATUS));
  const alreadyStopped = isTrue_(leadValue_(current, LEAD_HEADERS.OPT_OUT));
  const updates = {};
  let action = 'REPLY';
  let logMessage = 'External reply detected in the stored Gmail thread; automated follow-ups stopped.';

  if (response.type !== 'MANUAL_OUTBOUND') {
    updates[LEAD_HEADERS.LAST_REPLY_AT] = response.receivedAt || now;
  }
  updates[LEAD_HEADERS.LAST_REPLY_CHECK_AT] = now;
  updates[LEAD_HEADERS.LAST_RESPONSE_MESSAGE_ID] = response.messageId || '';
  updates[LEAD_HEADERS.GMAIL_THREAD_ID] = response.threadId;
  updates[LEAD_HEADERS.UPDATED_AT] = now;
  updates[LEAD_HEADERS.LAST_ERROR] = '';

  if (response.type === 'OPT_OUT') {
    action = 'OPT_OUT';
    updates[LEAD_HEADERS.REPLY_STATUS] = 'OPTED_OUT';
    updates[LEAD_HEADERS.STATUS] = STATUS.DO_NOT_CONTACT;
    updates[LEAD_HEADERS.OPT_OUT] = true;
    logMessage = 'Explicit opt-out wording detected in the top, unquoted reply text.';
  } else if (response.type === 'BOUNCE') {
    action = 'BOUNCE';
    updates[LEAD_HEADERS.REPLY_STATUS] = 'BOUNCE';
    updates[LEAD_HEADERS.STATUS] = STATUS.REVIEW_REQUIRED;
    updates[LEAD_HEADERS.LAST_ERROR] = 'Delivery failure detected; verify or replace the email before re-approval.';
    logMessage = 'Likely delivery failure detected; row quarantined for review.';
  } else if (response.type === 'AUTO_REPLY') {
    action = 'AUTO_REPLY';
    updates[LEAD_HEADERS.REPLY_STATUS] = 'AUTO_REPLY';
    updates[LEAD_HEADERS.STATUS] = STATUS.REVIEW_REQUIRED;
    updates[LEAD_HEADERS.LAST_ERROR] = 'Automated response detected; review before resuming follow-ups.';
    logMessage = 'Likely automated response detected; row quarantined to avoid unwanted follow-ups.';
  } else if (response.type === 'MANUAL_OUTBOUND') {
    action = 'MANUAL_OUTBOUND';
    updates[LEAD_HEADERS.REPLY_STATUS] = 'MANUAL_REVIEW';
    updates[LEAD_HEADERS.STATUS] = STATUS.REVIEW_REQUIRED;
    updates[LEAD_HEADERS.LAST_ERROR] = 'A manual outbound message exists in this thread; automated follow-ups are paused.';
    logMessage = 'Manual outbound activity detected after the automated initial email; automation paused to avoid overlapping with a human.';
  } else {
    updates[LEAD_HEADERS.REPLY_STATUS] = 'REPLY_DETECTED';
    updates[LEAD_HEADERS.STATUS] = STATUS.REPLIED;
  }

  if (response.type !== 'OPT_OUT') {
    if (alreadyStopped || currentStatus === STATUS.DO_NOT_CONTACT) {
      updates[LEAD_HEADERS.STATUS] = STATUS.DO_NOT_CONTACT;
    } else if (AUTOMATION_STOP_STATUSES.indexOf(currentStatus) !== -1 &&
        currentStatus !== STATUS.REVIEW_REQUIRED) {
      // A reply scanner must not move an operator-qualified lead backwards
      // from INTERESTED/MEETING/etc. Later explicit opt-outs still win.
      updates[LEAD_HEADERS.STATUS] = currentStatus;
      logMessage += ' Existing terminal/commercial status was preserved.';
    }
  }

  updateLeadFieldsById_(sheet, leadId, updates, true);
  safeLogEvent_(company, leadEmail, action, 'DETECTED', logMessage);
}

function shouldCheckRepliesForRecord_(record) {
  if (!hasValue_(leadValue_(record, LEAD_HEADERS.INITIAL_MESSAGE_ID))) return false;
  // Pending sends must be reconciled by the send worker first. Otherwise a
  // sent-but-not-yet-recorded automated follow-up could look manual here.
  if (hasPendingAction_(record)) return false;
  const status = normalizeStatus_(leadValue_(record, LEAD_HEADERS.STATUS));
  if (isTrue_(leadValue_(record, LEAD_HEADERS.OPT_OUT)) || status === STATUS.DO_NOT_CONTACT) return false;
  if (ACTIVE_OUTREACH_STATUSES.indexOf(status) !== -1) return true;
  if (status === STATUS.REVIEW_REQUIRED) {
    return ['AUTO_REPLY', 'BOUNCE', 'MANUAL_REVIEW'].indexOf(
      String(leadValue_(record, LEAD_HEADERS.REPLY_STATUS) || '').trim().toUpperCase()
    ) !== -1;
  }
  // Continue low-frequency, opt-out-safe monitoring after a reply or a later
  // commercial status. The detector returns the already-recorded first human
  // reply unless a newer explicit opt-out appears, so these rows are not
  // moved backwards through the sales lifecycle.
  return [
    STATUS.REPLIED,
    STATUS.INTERESTED,
    STATUS.MEETING,
    STATUS.NEGOTIATING,
    STATUS.CLOSED,
    STATUS.NOT_INTERESTED
  ].indexOf(status) !== -1;
}

function sortReplyCandidates_(rows) {
  return rows.filter(shouldCheckRepliesForRecord_).sort(function (a, b) {
    const aDate = asDate_(leadValue_(a, LEAD_HEADERS.LAST_REPLY_CHECK_AT));
    const bDate = asDate_(leadValue_(b, LEAD_HEADERS.LAST_REPLY_CHECK_AT));
    const aTime = aDate ? aDate.getTime() : 0;
    const bTime = bDate ? bDate.getTime() : 0;
    return aTime === bTime ? a.rowNumber - b.rowNumber : aTime - bTime;
  });
}

function checkReplies(event) {
  const rejected = rejectDirectWorkerTrigger_(event, 'Check Replies');
  if (rejected) return rejected;
  return withScriptLock_('Check Replies', function () {
    const summary = newRunSummary_('Check Replies');
    if (applyScheduledWorkerGuard_(event, summary, 'SCHEDULED_REPLY_CHECK')) return summary;
    if (isSystemDisabled_()) {
      summary.message = 'System kill switch is active. Re-enable manual runs before checking replies.';
      return summary;
    }

    validateConfigurationOrThrow_({ requireMailbox: summary.mode !== 'DRY_RUN', requireSend: false });
    const startedAt = Date.now();
    const sheet = getLeadsSheet_();
    const rows = getLeadRows_(sheet);
    assertUniqueLeadIds_(rows);
    const candidates = sortReplyCandidates_(rows);
    const replyCheckCap = Math.max(1, Number(CONFIG.SAFETY.MAX_REPLY_CHECKS_PER_RUN) || 1);

    for (let i = 0; i < candidates.length && i < replyCheckCap; i += 1) {
      if (isRuntimeNearlyExhausted_(startedAt)) {
        summary.stoppedForRuntime = true;
        break;
      }
      const snapshot = candidates[i];
      const company = safeDisplayText_(leadValue_(snapshot, LEAD_HEADERS.COMPANY));
      const email = normalizeEmail_(leadValue_(snapshot, LEAD_HEADERS.SENT_TO_EMAIL) || leadValue_(snapshot, LEAD_HEADERS.EMAIL));
      summary.processed += 1;
      let id = '';
      try {
        if (summary.mode === 'DRY_RUN') {
          safeLogEvent_(company, email, 'CHECK_REPLY', 'DRY_RUN', 'Reply-check candidate; Gmail was not read and lead state was not changed.');
          summary.dryRun += 1;
          continue;
        }
        id = ensureLeadIdAtRow_(sheet, snapshot);
        const fresh = refreshLeadById_(sheet, id);
        if (isTrue_(leadValue_(fresh, LEAD_HEADERS.OPT_OUT))) {
          updateLeadFieldsById_(sheet, id, {
            [LEAD_HEADERS.STATUS]: STATUS.DO_NOT_CONTACT,
            [LEAD_HEADERS.REPLY_STATUS]: 'OPTED_OUT',
            [LEAD_HEADERS.UPDATED_AT]: new Date()
          }, true);
          safeLogEvent_(company, email, 'OPT_OUT', 'RECORDED', 'Opt Out checkbox stopped automation.');
          summary.replies += 1;
          continue;
        }

        if (String(leadValue_(fresh, LEAD_HEADERS.CAMPAIGN_ID) || '').trim() !== String(CONFIG.CAMPAIGN_ID)) {
          const issue = 'Stored Campaign ID does not match current CONFIG; reply checking paused.';
          markLeadForReview_(sheet, id, issue);
          safeLogEvent_(company, email, 'CHECK_REPLY', 'REVIEW_REQUIRED', issue);
          summary.errors += 1;
          continue;
        }

        const response = detectThreadResponseForLead_(fresh);
        if (response) {
          const lastResponseId = String(leadValue_(fresh, LEAD_HEADERS.LAST_RESPONSE_MESSAGE_ID) || '').trim();
          if (response.messageId && response.messageId === lastResponseId) {
            updateLeadFieldsById_(sheet, id, {
              [LEAD_HEADERS.LAST_REPLY_CHECK_AT]: new Date(),
              [LEAD_HEADERS.UPDATED_AT]: new Date()
            }, false);
          } else {
            applyDetectedResponse_(sheet, id, response, company, email);
            summary.replies += 1;
          }
        } else {
          updateLeadFieldsById_(sheet, id, {
            [LEAD_HEADERS.LAST_REPLY_CHECK_AT]: new Date(),
            [LEAD_HEADERS.GMAIL_THREAD_ID]: getThreadIdFromMessage_(leadValue_(fresh, LEAD_HEADERS.INITIAL_MESSAGE_ID)),
            [LEAD_HEADERS.LAST_ERROR]: '',
            [LEAD_HEADERS.UPDATED_AT]: new Date()
          }, false);
        }
      } catch (error) {
        summary.errors += 1;
        if (id && summary.mode !== 'DRY_RUN') {
          try {
            updateLeadFieldsById_(sheet, id, {
              [LEAD_HEADERS.LAST_REPLY_CHECK_AT]: new Date(),
              [LEAD_HEADERS.LAST_ERROR]: 'Reply check: ' + errorMessage_(error),
              [LEAD_HEADERS.UPDATED_AT]: new Date()
            }, false);
          } catch (ignored) {}
        }
        safeLogEvent_(company, email, 'CHECK_REPLY', 'ERROR', errorMessage_(error));
      }
    }
    if (candidates.length > replyCheckCap && !summary.stoppedForRuntime) {
      summary.message = (candidates.length - replyCheckCap) + ' reply-check candidate(s) deferred to a later run by MAX_REPLY_CHECKS_PER_RUN.';
    }
    return summary;
  });
}


function sendApprovedLeads(event) {
  const rejected = rejectDirectWorkerTrigger_(event, 'Send Approved Leads');
  if (rejected) return rejected;
  return withScriptLock_('Send Approved Leads', function () {
    const summary = newRunSummary_('Send Approved Leads');
    if (applyScheduledWorkerGuard_(event, summary, 'SCHEDULED_INITIALS')) return summary;
    if (isSystemDisabled_()) {
      summary.message = 'System kill switch is active. Use Re-enable Manual Runs only after review.';
      return summary;
    }
    if (summary.mode === 'BLOCKED') {
      summary.message = 'Actual sends are blocked because CONFIG.SAFETY.SENDS_ENABLED is false.';
      return summary;
    }

    validateConfigurationOrThrow_({
      requireMailbox: summary.mode !== 'DRY_RUN',
      requireSend: summary.mode !== 'DRY_RUN'
    });
    assertCampaignWindowOpen_();

    const startedAt = Date.now();
    const sheet = getLeadsSheet_();
    const rows = getLeadRows_(sheet);
    assertUniqueLeadIds_(rows);
    const safetyIndex = buildInitialSafetyIndex_(rows);
    const claimedThisRun = {};
    let actualSendsThisRun = 0;
    const actualRunCap = summary.mode === 'TEST'
      ? Math.min(CONFIG.SAFETY.MAX_INITIALS_PER_RUN, CONFIG.SAFETY.MAX_TEST_SENDS_PER_RUN)
      : CONFIG.SAFETY.MAX_INITIALS_PER_RUN;

    for (let i = 0; i < rows.length; i += 1) {
      if (isRuntimeNearlyExhausted_(startedAt)) {
        summary.stoppedForRuntime = true;
        break;
      }

      const snapshot = rows[i];
      if (!isExactStatus_(leadValue_(snapshot, LEAD_HEADERS.STATUS), STATUS.APPROVED) &&
          !hasPendingAction_(snapshot)) continue;

      const company = safeDisplayText_(leadValue_(snapshot, LEAD_HEADERS.COMPANY));
      const email = normalizeEmail_(leadValue_(snapshot, LEAD_HEADERS.EMAIL));
      summary.processed += 1;
      let id = '';

      try {
        let fresh;
        if (summary.mode === 'DRY_RUN') {
          id = leadId_(snapshot);
          fresh = getLeadAtRow_(sheet, snapshot.rowNumber, snapshot.headerMap);
        } else {
          id = ensureLeadIdAtRow_(sheet, snapshot);
          fresh = refreshLeadById_(sheet, id);
        }
        if (hasPendingAction_(fresh)) {
          if (summary.mode === 'LIVE') {
            reconcilePendingAction_(sheet, id, fresh, company, email);
          } else {
            logEvent_(company, email, ACTION.INITIAL, 'SKIPPED', 'A pending/uncertain action exists; dry/test mode did not modify it.');
          }
          summary.skipped += 1;
          continue;
        }
        if (!isExactStatus_(leadValue_(fresh, LEAD_HEADERS.STATUS), STATUS.APPROVED)) {
          summary.skipped += 1;
          continue;
        }

        if (isTrue_(leadValue_(fresh, LEAD_HEADERS.OPT_OUT))) {
          normalizeOptOutRow_(sheet, id, summary.mode);
          logEvent_(company, email, 'OPT_OUT', 'SKIPPED', 'Opt Out is TRUE; no initial email was sent.');
          summary.skipped += 1;
          continue;
        }
        if (!company) {
          quarantineValidationFailure_(sheet, id, summary.mode, 'Company is required.');
          logEvent_(company, email, ACTION.INITIAL, 'ERROR', 'Company is required.');
          summary.errors += 1;
          continue;
        }
        if (!isValidSingleEmail_(email)) {
          quarantineValidationFailure_(sheet, id, summary.mode, 'Email must contain one valid address.');
          logEvent_(company, email, ACTION.INITIAL, 'ERROR', 'Invalid or missing single email address.');
          summary.errors += 1;
          continue;
        }
        if (isConfiguredCcEmail_(email)) {
          const ccOverlap = 'Lead Email is also configured as an internal CC; initial send refused.';
          quarantineValidationFailure_(sheet, id, summary.mode, ccOverlap);
          logEvent_(company, email, ACTION.INITIAL, 'ERROR', ccOverlap);
          summary.errors += 1;
          continue;
        }

        if (hasInitialSuccessEvidence_(fresh)) {
          if (summary.mode === 'LIVE') repairLifecycleFromEvidence_(sheet, id, fresh);
          logEvent_(company, email, ACTION.INITIAL, 'SKIPPED', 'Initial-send evidence already exists; duplicate prevented.');
          summary.skipped += 1;
          continue;
        }

        const blockedReason = safetyIndex[email] || claimedThisRun[email];
        if (blockedReason) {
          const message = 'Duplicate or suppression match for normalized email: ' + blockedReason;
          quarantineValidationFailure_(sheet, id, summary.mode, message);
          logEvent_(company, email, ACTION.INITIAL, 'SKIPPED', message);
          summary.skipped += 1;
          continue;
        }
        claimedThisRun[email] = 'another earlier APPROVED row in this run';

        const message = buildEmailForLead_(fresh, ACTION.INITIAL);
        if (summary.mode === 'DRY_RUN') {
          logEvent_(company, email, ACTION.INITIAL, 'DRY_RUN', 'Eligible initial email; no Gmail draft or lead-state change was made.');
          summary.dryRun += 1;
          continue;
        }

        if (actualSendsThisRun >= actualRunCap) {
          summary.stoppedForLimit = true;
          break;
        }

        if (summary.mode === 'TEST') {
          const reservedTest = reserveDailySendSlot_();
          if (!reservedTest.reserved) {
            summary.stoppedForLimit = true;
            summary.message = reservedTest.reason;
            break;
          }
          actualSendsThisRun += 1;
          const testMessage = buildTestEnvelope_(message, email);
          const testAttemptId = makeAttemptId_(id, 'TEST_INITIAL');
          const testDraft = createInitialDraft_(testMessage, id, testAttemptId);
          sendPreparedDraft_(testDraft.draftId, 'TEST', {
            leadId: id,
            action: testMessage.action,
            attemptId: testAttemptId,
            recipient: testMessage.to,
            threadId: testDraft.threadId,
            subject: testDraft.subject
          });
          summary.testSent += 1;
          safeLogEvent_(company, email, 'TEST_INITIAL', 'SENT', 'To redirected to TEST_RECIPIENT with configured internal CC recipients; production lead state unchanged.');
          safeSleepAfterActualSend_();
          continue;
        }

        // Last-moment state check before any production Gmail side effect.
        fresh = refreshLeadById_(sheet, id);
        assertInitialStillEligible_(fresh, email);
        const reservation = reserveDailySendSlot_();
        if (!reservation.reserved) {
          summary.stoppedForLimit = true;
          summary.message = reservation.reason;
          break;
        }
        // Count the reserved attempt, not only a confirmed response. Gmail may
        // accept a send even if the API response is lost; the per-run cap must
        // remain conservative in that case.
        actualSendsThisRun += 1;

        const attemptId = makeAttemptId_(id, ACTION.INITIAL);
        const draft = createInitialDraft_(message, id, attemptId);
        writePendingAction_(sheet, id, ACTION.INITIAL, attemptId, draft, email);
        const pendingInitial = refreshLeadById_(sheet, id);
        const pendingInitialIssue = getPendingStateIssue_(pendingInitial, ACTION.INITIAL, email, attemptId, draft.draftId);
        if (pendingInitialIssue) {
          cancelConfirmedUnsentPendingDraft_(sheet, id, draft.draftId, ACTION.INITIAL, pendingInitialIssue);
          logEvent_(company, email, ACTION.INITIAL, 'SKIPPED', pendingInitialIssue + ' Unsent draft deleted.');
          summary.skipped += 1;
          continue;
        }
        const sent = sendPreparedDraft_(draft.draftId, 'LIVE', {
          leadId: id,
          action: ACTION.INITIAL,
          attemptId: attemptId,
          recipient: email,
          threadId: draft.threadId,
          subject: draft.subject
        }, function () {
          const lastPossibleSheetState = refreshLeadById_(sheet, id);
          const lastIssue = getPendingStateIssue_(
            lastPossibleSheetState,
            ACTION.INITIAL,
            email,
            attemptId,
            draft.draftId
          );
          assertCondition_(!lastIssue, lastIssue || 'Initial eligibility changed immediately before send.');
        });
        persistSendSuccess_(sheet, id, ACTION.INITIAL, sent, email);
        summary.sent += 1;
        safetyIndex[email] = 'initial sent earlier in this run';
        safeLogEvent_(company, email, ACTION.INITIAL, 'SENT', 'Initial email sent and Gmail identifiers recorded.');
        safeSleepAfterActualSend_();
      } catch (error) {
        summary.errors += 1;
        handleRowSendError_(sheet, id, company, email, ACTION.INITIAL, summary.mode, error);
      }
    }
    return summary;
  });
}

function processFollowUps(event) {
  const rejected = rejectDirectWorkerTrigger_(event, 'Process Follow-ups');
  if (rejected) return rejected;
  return withScriptLock_('Process Follow-ups', function () {
    const summary = newRunSummary_('Process Follow-ups');
    if (applyScheduledWorkerGuard_(event, summary, 'SCHEDULED_FOLLOW_UPS')) return summary;
    if (isSystemDisabled_()) {
      summary.message = 'System kill switch is active. Use Re-enable Manual Runs only after review.';
      return summary;
    }
    if (summary.mode === 'BLOCKED') {
      summary.message = 'Actual sends are blocked because CONFIG.SAFETY.SENDS_ENABLED is false.';
      return summary;
    }

    validateConfigurationOrThrow_({
      requireMailbox: summary.mode !== 'DRY_RUN',
      requireSend: summary.mode !== 'DRY_RUN'
    });
    assertCampaignWindowOpen_();

    const startedAt = Date.now();
    const sheet = getLeadsSheet_();
    const rows = getLeadRows_(sheet);
    assertUniqueLeadIds_(rows);
    let actualSendsThisRun = 0;
    const actualRunCap = summary.mode === 'TEST'
      ? Math.min(CONFIG.SAFETY.MAX_FOLLOW_UPS_PER_RUN, CONFIG.SAFETY.MAX_TEST_SENDS_PER_RUN)
      : CONFIG.SAFETY.MAX_FOLLOW_UPS_PER_RUN;

    for (let i = 0; i < rows.length; i += 1) {
      if (isRuntimeNearlyExhausted_(startedAt)) {
        summary.stoppedForRuntime = true;
        break;
      }

      const snapshot = rows[i];
      const snapshotStatusValue = leadValue_(snapshot, LEAD_HEADERS.STATUS);
      if (!isExactStatus_(snapshotStatusValue, STATUS.SENT) &&
          !isExactStatus_(snapshotStatusValue, STATUS.FOLLOW_UP_1) &&
          !hasPendingAction_(snapshot)) continue;

      const company = safeDisplayText_(leadValue_(snapshot, LEAD_HEADERS.COMPANY));
      const sentTo = normalizeEmail_(leadValue_(snapshot, LEAD_HEADERS.SENT_TO_EMAIL));
      summary.processed += 1;
      let id = '';

      try {
        let fresh;
        if (summary.mode === 'DRY_RUN') {
          id = leadId_(snapshot);
          fresh = getLeadAtRow_(sheet, snapshot.rowNumber, snapshot.headerMap);
        } else {
          id = ensureLeadIdAtRow_(sheet, snapshot);
          fresh = refreshLeadById_(sheet, id);
        }
        if (hasPendingAction_(fresh)) {
          if (summary.mode === 'LIVE') {
            reconcilePendingAction_(sheet, id, fresh, company, sentTo);
          } else {
            logEvent_(company, sentTo, 'FOLLOW_UP', 'SKIPPED', 'A pending/uncertain action exists; no test/dry-run action taken.');
          }
          summary.skipped += 1;
          continue;
        }
        const statusValue = leadValue_(fresh, LEAD_HEADERS.STATUS);
        const status = normalizeStatus_(statusValue);
        if (!isExactStatus_(statusValue, STATUS.SENT) &&
            !isExactStatus_(statusValue, STATUS.FOLLOW_UP_1)) {
          summary.skipped += 1;
          continue;
        }
        if (isTrue_(leadValue_(fresh, LEAD_HEADERS.OPT_OUT))) {
          normalizeOptOutRow_(sheet, id, summary.mode);
          logEvent_(company, sentTo, 'OPT_OUT', 'SKIPPED', 'Opt Out is TRUE; no follow-up was sent.');
          summary.skipped += 1;
          continue;
        }
        if (AUTOMATION_STOP_STATUSES.indexOf(status) !== -1) {
          summary.skipped += 1;
          continue;
        }
        const evidenceIssue = getEvidenceConsistencyIssue_(fresh);
        if (evidenceIssue) {
          quarantineValidationFailure_(sheet, id, summary.mode, evidenceIssue);
          logEvent_(company, sentTo, 'FOLLOW_UP', 'ERROR', evidenceIssue);
          summary.errors += 1;
          continue;
        }
        const evidenceStatus = latestStatusFromEvidence_(fresh);
        if (evidenceStatus && evidenceStatus !== status) {
          if (summary.mode === 'LIVE') repairLifecycleFromEvidence_(sheet, id, fresh);
          logEvent_(company, sentTo, 'FOLLOW_UP', 'SKIPPED', 'Lifecycle lagged complete delivery evidence; duplicate prevented' +
            (summary.mode === 'LIVE' ? ' and status repaired.' : '.'));
          summary.skipped += 1;
          continue;
        }

        const action = getDueFollowUpAction_(fresh, new Date());
        if (!action) continue;

        const stateIssue = validateFollowUpState_(fresh, action);
        if (stateIssue) {
          quarantineValidationFailure_(sheet, id, summary.mode, stateIssue);
          logEvent_(company, sentTo, action, 'ERROR', stateIssue);
          summary.errors += 1;
          continue;
        }

        if (summary.mode === 'DRY_RUN') {
          logEvent_(company, sentTo, action, 'DRY_RUN', 'Follow-up is due; no Gmail read/draft/send or lead-state change was made.');
          summary.dryRun += 1;
          continue;
        }

        if (actualSendsThisRun >= actualRunCap) {
          summary.stoppedForLimit = true;
          break;
        }

        const message = buildEmailForLead_(fresh, action);
        if (summary.mode === 'TEST') {
          const reservedTest = reserveDailySendSlot_();
          if (!reservedTest.reserved) {
            summary.stoppedForLimit = true;
            summary.message = reservedTest.reason;
            break;
          }
          actualSendsThisRun += 1;
          const testMessage = buildTestEnvelope_(message, sentTo);
          const testAttemptId = makeAttemptId_(id, 'TEST_' + action);
          const testDraft = createInitialDraft_(testMessage, id, testAttemptId);
          sendPreparedDraft_(testDraft.draftId, 'TEST', {
            leadId: id,
            action: testMessage.action,
            attemptId: testAttemptId,
            recipient: testMessage.to,
            threadId: testDraft.threadId,
            subject: testDraft.subject
          });
          summary.testSent += 1;
          safeLogEvent_(company, sentTo, 'TEST_' + action, 'SENT', 'Standalone To redirected to TEST_RECIPIENT with configured internal CC recipients; production state unchanged.');
          safeSleepAfterActualSend_();
          continue;
        }

        // Reply detection is repeated immediately before every live follow-up.
        const response = detectThreadResponseForLead_(fresh);
        if (response) {
          applyDetectedResponse_(sheet, id, response, company, sentTo);
          summary.replies += 1;
          continue;
        }

        fresh = refreshLeadById_(sheet, id);
        assertFollowUpStillEligible_(fresh, action, sentTo);
        const reservation = reserveDailySendSlot_();
        if (!reservation.reserved) {
          summary.stoppedForLimit = true;
          summary.message = reservation.reason;
          break;
        }
        actualSendsThisRun += 1;

        const attemptId = makeAttemptId_(id, action);
        const anchorId = action === ACTION.FOLLOW_UP_1
          ? String(leadValue_(fresh, LEAD_HEADERS.INITIAL_MESSAGE_ID))
          : String(leadValue_(fresh, LEAD_HEADERS.FOLLOW_UP_1_MESSAGE_ID));
        const draft = createThreadedFollowUpDraft_(
          message,
          id,
          attemptId,
          String(leadValue_(fresh, LEAD_HEADERS.INITIAL_MESSAGE_ID)),
          anchorId
        );
        writePendingAction_(sheet, id, action, attemptId, draft, sentTo);
        let pendingFollowUp = refreshLeadById_(sheet, id);
        let pendingFollowUpIssue = getPendingStateIssue_(pendingFollowUp, action, sentTo, attemptId, draft.draftId);
        if (pendingFollowUpIssue) {
          cancelConfirmedUnsentPendingDraft_(sheet, id, draft.draftId, action, pendingFollowUpIssue);
          logEvent_(company, sentTo, action, 'SKIPPED', pendingFollowUpIssue + ' Unsent draft deleted.');
          summary.skipped += 1;
          continue;
        }

        // Recheck the live thread after draft preparation; DRAFT messages are
        // ignored by the detector. A tiny non-atomic reply/send race remains.
        const lastSecondResponse = detectThreadResponseForLead_(pendingFollowUp);
        if (lastSecondResponse) {
          cancelConfirmedUnsentPendingDraft_(sheet, id, draft.draftId, action, 'External response arrived while the draft was being prepared.');
          applyDetectedResponse_(sheet, id, lastSecondResponse, company, sentTo);
          summary.replies += 1;
          continue;
        }
        pendingFollowUp = refreshLeadById_(sheet, id);
        pendingFollowUpIssue = getPendingStateIssue_(pendingFollowUp, action, sentTo, attemptId, draft.draftId);
        if (pendingFollowUpIssue) {
          cancelConfirmedUnsentPendingDraft_(sheet, id, draft.draftId, action, pendingFollowUpIssue);
          logEvent_(company, sentTo, action, 'SKIPPED', pendingFollowUpIssue + ' Unsent draft deleted.');
          summary.skipped += 1;
          continue;
        }
        const sent = sendPreparedDraft_(draft.draftId, 'LIVE', {
          leadId: id,
          action: action,
          attemptId: attemptId,
          recipient: sentTo,
          threadId: draft.threadId,
          subject: draft.subject
        }, function () {
          const lastPossibleSheetState = refreshLeadById_(sheet, id);
          const lastIssue = getPendingStateIssue_(
            lastPossibleSheetState,
            action,
            sentTo,
            attemptId,
            draft.draftId
          );
          assertCondition_(!lastIssue, lastIssue || 'Follow-up eligibility changed immediately before send.');
        });
        persistSendSuccess_(sheet, id, action, sent, sentTo);
        summary.sent += 1;
        safeLogEvent_(company, sentTo, action, 'SENT', 'Follow-up sent in the anchored Gmail thread.');
        safeSleepAfterActualSend_();
      } catch (error) {
        summary.errors += 1;
        let pendingAction = '';
        try {
          const current = refreshLeadById_(sheet, id);
          pendingAction = String(leadValue_(current, LEAD_HEADERS.PENDING_ACTION) || '').trim();
        } catch (ignored) {}
        handleRowSendError_(sheet, id, company, sentTo, pendingAction || 'FOLLOW_UP', summary.mode, error);
      }
    }
    return summary;
  });
}

function assertInitialStillEligible_(record, expectedEmail) {
  assertCondition_(isExactStatus_(leadValue_(record, LEAD_HEADERS.STATUS), STATUS.APPROVED),
    'Status changed; initial send cancelled.');
  assertCondition_(!isTrue_(leadValue_(record, LEAD_HEADERS.OPT_OUT)),
    'Opt Out changed to TRUE; initial send cancelled.');
  assertCondition_(normalizeEmail_(leadValue_(record, LEAD_HEADERS.EMAIL)) === expectedEmail,
    'Email changed during processing; initial send cancelled.');
  assertCondition_(!hasInitialSuccessEvidence_(record), 'Initial-send evidence appeared; duplicate prevented.');
  assertCondition_(!hasPendingAction_(record), 'A pending action appeared; send cancelled.');
}

function assertFollowUpStillEligible_(record, action, expectedSentTo) {
  const expectedStatus = action === ACTION.FOLLOW_UP_1 ? STATUS.SENT : STATUS.FOLLOW_UP_1;
  assertCondition_(isExactStatus_(leadValue_(record, LEAD_HEADERS.STATUS), expectedStatus),
    'Status changed; follow-up cancelled.');
  assertCondition_(!isTrue_(leadValue_(record, LEAD_HEADERS.OPT_OUT)),
    'Opt Out changed to TRUE; follow-up cancelled.');
  assertCondition_(normalizeEmail_(leadValue_(record, LEAD_HEADERS.SENT_TO_EMAIL)) === expectedSentTo,
    'Stored initial recipient changed; follow-up cancelled.');
  assertCondition_(normalizeEmail_(leadValue_(record, LEAD_HEADERS.EMAIL)) === expectedSentTo,
    'Current Email differs from Sent To Email; review is required before any follow-up.');
  assertCondition_(String(leadValue_(record, LEAD_HEADERS.CAMPAIGN_ID) || '').trim() === String(CONFIG.CAMPAIGN_ID),
    'Stored Campaign ID differs from current CONFIG; follow-up cancelled.');
  assertCondition_(!hasPendingAction_(record), 'A pending action appeared; follow-up cancelled.');
  assertCondition_(!followUpAlreadySent_(record, action), action + ' evidence already exists; duplicate prevented.');
}

function validateFollowUpState_(record, action) {
  const currentEmail = normalizeEmail_(leadValue_(record, LEAD_HEADERS.EMAIL));
  const sentTo = normalizeEmail_(leadValue_(record, LEAD_HEADERS.SENT_TO_EMAIL));
  if (!isValidSingleEmail_(sentTo)) return 'Sent To Email is missing or invalid; follow-up refused.';
  if (isConfiguredCcEmail_(sentTo)) return 'Sent To Email is also configured as an internal CC; follow-up refused.';
  if (String(leadValue_(record, LEAD_HEADERS.CAMPAIGN_ID) || '').trim() !== String(CONFIG.CAMPAIGN_ID)) {
    return 'Stored Campaign ID differs from current CONFIG; follow-up refused.';
  }
  if (currentEmail !== sentTo) return 'Email differs from immutable Sent To Email; follow-up refused.';
  if (!asDate_(leadValue_(record, LEAD_HEADERS.INITIAL_SENT_AT))) return 'Initial Sent At is missing or invalid.';
  if (!hasValue_(leadValue_(record, LEAD_HEADERS.INITIAL_MESSAGE_ID))) return 'Initial Message ID is missing.';
  if (action === ACTION.FOLLOW_UP_1) {
    if (followUpAlreadySent_(record, action)) return 'Follow-up 1 evidence already exists.';
    if (!isExactStatus_(leadValue_(record, LEAD_HEADERS.STATUS), STATUS.SENT)) return 'Status must be exactly SENT for follow-up 1.';
  }
  if (action === ACTION.FOLLOW_UP_2) {
    if (!asDate_(leadValue_(record, LEAD_HEADERS.FOLLOW_UP_1_SENT_AT))) return 'Follow-up 1 Sent At is missing or invalid.';
    if (!hasValue_(leadValue_(record, LEAD_HEADERS.FOLLOW_UP_1_MESSAGE_ID))) return 'Follow-up 1 Message ID is missing.';
    if (followUpAlreadySent_(record, action)) return 'Follow-up 2 evidence already exists.';
    if (!isExactStatus_(leadValue_(record, LEAD_HEADERS.STATUS), STATUS.FOLLOW_UP_1)) return 'Status must be exactly FOLLOW_UP_1 for follow-up 2.';
  }
  return '';
}

function getDueFollowUpAction_(record, now) {
  const status = leadValue_(record, LEAD_HEADERS.STATUS);
  const initialAt = asDate_(leadValue_(record, LEAD_HEADERS.INITIAL_SENT_AT));
  if (!initialAt) return null;

  if (status === STATUS.SENT && !followUpAlreadySent_(record, ACTION.FOLLOW_UP_1)) {
    return calendarDaysElapsed_(initialAt, now) >= CONFIG.FOLLOW_UP.FIRST_AFTER_DAYS_FROM_INITIAL
      ? ACTION.FOLLOW_UP_1
      : null;
  }
  if (status === STATUS.FOLLOW_UP_1 && !followUpAlreadySent_(record, ACTION.FOLLOW_UP_2)) {
    const firstAt = asDate_(leadValue_(record, LEAD_HEADERS.FOLLOW_UP_1_SENT_AT));
    if (!firstAt) return ACTION.FOLLOW_UP_2; // State validator will quarantine the inconsistency.
    const dayNineReached = calendarDaysElapsed_(initialAt, now) >= CONFIG.FOLLOW_UP.SECOND_AFTER_DAYS_FROM_INITIAL;
    const minimumGapReached = calendarDaysElapsed_(firstAt, now) >= CONFIG.FOLLOW_UP.SECOND_MIN_DAYS_AFTER_FIRST;
    return dayNineReached && minimumGapReached ? ACTION.FOLLOW_UP_2 : null;
  }
  return null;
}

function followUpAlreadySent_(record, action) {
  if (action === ACTION.FOLLOW_UP_1) {
    return hasValue_(leadValue_(record, LEAD_HEADERS.FOLLOW_UP_1_SENT_AT)) ||
      hasValue_(leadValue_(record, LEAD_HEADERS.FOLLOW_UP_1_MESSAGE_ID));
  }
  if (action === ACTION.FOLLOW_UP_2) {
    return hasValue_(leadValue_(record, LEAD_HEADERS.FOLLOW_UP_2_SENT_AT)) ||
      hasValue_(leadValue_(record, LEAD_HEADERS.FOLLOW_UP_2_MESSAGE_ID));
  }
  return false;
}

function hasCompleteActionEvidence_(record, action) {
  if (action === ACTION.INITIAL) {
    return !!asDate_(leadValue_(record, LEAD_HEADERS.INITIAL_SENT_AT)) &&
      hasValue_(leadValue_(record, LEAD_HEADERS.INITIAL_MESSAGE_ID)) &&
      isValidSingleEmail_(leadValue_(record, LEAD_HEADERS.SENT_TO_EMAIL));
  }
  if (action === ACTION.FOLLOW_UP_1) {
    return !!asDate_(leadValue_(record, LEAD_HEADERS.FOLLOW_UP_1_SENT_AT)) &&
      hasValue_(leadValue_(record, LEAD_HEADERS.FOLLOW_UP_1_MESSAGE_ID));
  }
  if (action === ACTION.FOLLOW_UP_2) {
    return !!asDate_(leadValue_(record, LEAD_HEADERS.FOLLOW_UP_2_SENT_AT)) &&
      hasValue_(leadValue_(record, LEAD_HEADERS.FOLLOW_UP_2_MESSAGE_ID));
  }
  return false;
}

function latestStatusFromEvidence_(record) {
  if (hasCompleteActionEvidence_(record, ACTION.FOLLOW_UP_2)) return STATUS.FOLLOW_UP_2;
  if (hasCompleteActionEvidence_(record, ACTION.FOLLOW_UP_1)) return STATUS.FOLLOW_UP_1;
  if (hasCompleteActionEvidence_(record, ACTION.INITIAL)) return STATUS.SENT;
  return '';
}

function hasAnyActionEvidence_(record, action) {
  if (action === ACTION.INITIAL) return hasInitialSuccessEvidence_(record);
  return followUpAlreadySent_(record, action);
}

function getEvidenceConsistencyIssue_(record) {
  const anyInitial = hasAnyActionEvidence_(record, ACTION.INITIAL);
  const anyFirst = hasAnyActionEvidence_(record, ACTION.FOLLOW_UP_1);
  const anySecond = hasAnyActionEvidence_(record, ACTION.FOLLOW_UP_2);
  if (anyInitial && String(leadValue_(record, LEAD_HEADERS.CAMPAIGN_ID) || '').trim() !== String(CONFIG.CAMPAIGN_ID)) {
    return 'Send evidence belongs to a different or missing Campaign ID; automatic action refused.';
  }
  if (anyInitial && !hasCompleteActionEvidence_(record, ACTION.INITIAL)) return 'Partial initial-send evidence found; automatic action refused.';
  if (anyFirst && (!hasCompleteActionEvidence_(record, ACTION.INITIAL) || !hasCompleteActionEvidence_(record, ACTION.FOLLOW_UP_1))) {
    return 'Partial or orphaned follow-up 1 evidence found; automatic action refused.';
  }
  if (anySecond && (!hasCompleteActionEvidence_(record, ACTION.FOLLOW_UP_1) || !hasCompleteActionEvidence_(record, ACTION.FOLLOW_UP_2))) {
    return 'Partial or orphaned follow-up 2 evidence found; automatic action refused.';
  }
  return '';
}

function hasInitialSuccessEvidence_(record) {
  return hasValue_(leadValue_(record, LEAD_HEADERS.INITIAL_SENT_AT)) ||
    hasValue_(leadValue_(record, LEAD_HEADERS.INITIAL_MESSAGE_ID)) ||
    hasValue_(leadValue_(record, LEAD_HEADERS.SENT_TO_EMAIL));
}

function hasPendingAction_(record) {
  return hasValue_(leadValue_(record, LEAD_HEADERS.PENDING_ACTION)) ||
    hasValue_(leadValue_(record, LEAD_HEADERS.PENDING_ATTEMPT_ID)) ||
    hasValue_(leadValue_(record, LEAD_HEADERS.PENDING_DRAFT_ID)) ||
    hasValue_(leadValue_(record, LEAD_HEADERS.PENDING_RECIPIENT));
}

function buildInitialSafetyIndex_(rows) {
  const blocked = getSuccessfulInitialEmailsFromLog_();
  rows.forEach(function (record) {
    const currentEmail = normalizeEmail_(leadValue_(record, LEAD_HEADERS.EMAIL));
    const sentTo = normalizeEmail_(leadValue_(record, LEAD_HEADERS.SENT_TO_EMAIL));
    const status = normalizeStatus_(leadValue_(record, LEAD_HEADERS.STATUS));
    let reason = '';
    if (isTrue_(leadValue_(record, LEAD_HEADERS.OPT_OUT)) || status === STATUS.DO_NOT_CONTACT || status === STATUS.NOT_INTERESTED) {
      reason = 'suppressed by another sheet row';
    } else if (hasInitialSuccessEvidence_(record)) {
      reason = 'initial-send evidence on another sheet row';
    } else if (String(leadValue_(record, LEAD_HEADERS.PENDING_ACTION) || '') === ACTION.INITIAL) {
      reason = 'uncertain initial attempt on another sheet row';
    }
    if (reason && currentEmail) blocked[currentEmail] = reason;
    if (reason && sentTo) blocked[sentTo] = reason;
  });
  return blocked;
}

function writePendingAction_(sheet, id, action, attemptId, draft, normalizedRecipient) {
  updateLeadFieldsById_(sheet, id, {
    [LEAD_HEADERS.NORMALIZED_EMAIL]: normalizedRecipient,
    [LEAD_HEADERS.CAMPAIGN_ID]: CONFIG.CAMPAIGN_ID,
    [LEAD_HEADERS.GMAIL_THREAD_ID]: draft.threadId || '',
    [LEAD_HEADERS.PENDING_ACTION]: action,
    [LEAD_HEADERS.PENDING_ATTEMPT_ID]: attemptId,
    [LEAD_HEADERS.PENDING_DRAFT_ID]: draft.draftId,
    [LEAD_HEADERS.PENDING_RECIPIENT]: normalizedRecipient,
    [LEAD_HEADERS.PENDING_SINCE]: new Date(),
    [LEAD_HEADERS.LAST_ERROR]: '',
    [LEAD_HEADERS.UPDATED_AT]: new Date()
  }, true);
}

function persistSendSuccess_(sheet, id, action, sent, recipient) {
  const evidence = {};
  const timestamp = sent.sentAt || new Date();
  evidence[LEAD_HEADERS.GMAIL_THREAD_ID] = sent.threadId;
  evidence[LEAD_HEADERS.CAMPAIGN_ID] = CONFIG.CAMPAIGN_ID;
  evidence[LEAD_HEADERS.UPDATED_AT] = new Date();
  if (action === ACTION.INITIAL) {
    evidence[LEAD_HEADERS.SENT_TO_EMAIL] = recipient;
    evidence[LEAD_HEADERS.NORMALIZED_EMAIL] = recipient;
    evidence[LEAD_HEADERS.INITIAL_MESSAGE_ID] = sent.messageId;
    evidence[LEAD_HEADERS.INITIAL_SENT_AT] = timestamp;
  } else if (action === ACTION.FOLLOW_UP_1) {
    evidence[LEAD_HEADERS.FOLLOW_UP_1_MESSAGE_ID] = sent.messageId;
    evidence[LEAD_HEADERS.FOLLOW_UP_1_SENT_AT] = timestamp;
  } else if (action === ACTION.FOLLOW_UP_2) {
    evidence[LEAD_HEADERS.FOLLOW_UP_2_MESSAGE_ID] = sent.messageId;
    evidence[LEAD_HEADERS.FOLLOW_UP_2_SENT_AT] = timestamp;
  } else {
    throw new Error('Unknown send action: ' + action);
  }

  // Evidence is flushed before eligibility status/pending fields are changed.
  // Any partial write therefore fails closed on the next run.
  updateLeadFieldsById_(sheet, id, evidence, true);
  const current = refreshLeadById_(sheet, id);
  const currentStatusValue = leadValue_(current, LEAD_HEADERS.STATUS);
  const currentStatus = normalizeStatus_(currentStatusValue);
  const expectedPreSendStatus = action === ACTION.INITIAL
    ? STATUS.APPROVED
    : (action === ACTION.FOLLOW_UP_1 ? STATUS.SENT : STATUS.FOLLOW_UP_1);
  let finalStatus = statusAfterAction_(action);
  let concurrentChangeMessage = '';
  if (isTrue_(leadValue_(current, LEAD_HEADERS.OPT_OUT))) {
    finalStatus = STATUS.DO_NOT_CONTACT;
  } else if (AUTOMATION_STOP_STATUSES.indexOf(currentStatus) !== -1) {
    finalStatus = currentStatus;
  } else if (!isExactStatus_(currentStatusValue, expectedPreSendStatus) ||
      normalizeEmail_(leadValue_(current, LEAD_HEADERS.EMAIL)) !== normalizeEmail_(recipient)) {
    finalStatus = STATUS.REVIEW_REQUIRED;
    concurrentChangeMessage = 'Lead status or email changed while Gmail was completing the send; delivery evidence was saved and automation was paused.';
  }
  const finalUpdates = {};
  finalUpdates[LEAD_HEADERS.STATUS] = finalStatus;
  finalUpdates[LEAD_HEADERS.PENDING_ACTION] = '';
  finalUpdates[LEAD_HEADERS.PENDING_ATTEMPT_ID] = '';
  finalUpdates[LEAD_HEADERS.PENDING_DRAFT_ID] = '';
  finalUpdates[LEAD_HEADERS.PENDING_RECIPIENT] = '';
  finalUpdates[LEAD_HEADERS.PENDING_SINCE] = '';
  finalUpdates[LEAD_HEADERS.LAST_ERROR] = concurrentChangeMessage;
  finalUpdates[LEAD_HEADERS.UPDATED_AT] = new Date();
  updateLeadFieldsById_(sheet, id, finalUpdates, true);
}

function statusAfterAction_(action) {
  if (action === ACTION.INITIAL) return STATUS.SENT;
  if (action === ACTION.FOLLOW_UP_1) return STATUS.FOLLOW_UP_1;
  if (action === ACTION.FOLLOW_UP_2) return STATUS.FOLLOW_UP_2;
  throw new Error('Unknown action: ' + action);
}

function reconcilePendingAction_(sheet, id, record, company, email) {
  const action = String(leadValue_(record, LEAD_HEADERS.PENDING_ACTION) || '').trim();
  const attemptId = String(leadValue_(record, LEAD_HEADERS.PENDING_ATTEMPT_ID) || '').trim();
  const draftId = String(leadValue_(record, LEAD_HEADERS.PENDING_DRAFT_ID) || '').trim();
  let threadId = String(leadValue_(record, LEAD_HEADERS.GMAIL_THREAD_ID) || '').trim();
  const attemptedRecipient = normalizeEmail_(leadValue_(record, LEAD_HEADERS.PENDING_RECIPIENT));

  if (!action || !attemptId || !draftId || !isValidSingleEmail_(attemptedRecipient)) {
    markLeadForReview_(sheet, id, 'Incomplete pending-send metadata; automatic retry refused.');
    safeLogEvent_(company, email, action || 'PENDING', 'REVIEW_REQUIRED', 'Incomplete pending metadata, including immutable pending recipient/draft evidence.');
    return 'REVIEW_REQUIRED';
  }
  if ([ACTION.INITIAL, ACTION.FOLLOW_UP_1, ACTION.FOLLOW_UP_2].indexOf(action) === -1) {
    markLeadForReview_(sheet, id, 'Unknown pending action; automatic retry refused.');
    safeLogEvent_(company, attemptedRecipient, action || 'PENDING', 'REVIEW_REQUIRED', 'Unknown pending action.');
    return 'REVIEW_REQUIRED';
  }
  if (String(leadValue_(record, LEAD_HEADERS.CAMPAIGN_ID) || '').trim() !== String(CONFIG.CAMPAIGN_ID)) {
    markLeadForReview_(sheet, id, 'Pending action belongs to a different campaign; automatic recovery refused.');
    safeLogEvent_(company, attemptedRecipient, action, 'REVIEW_REQUIRED', 'Pending Campaign ID does not match current CONFIG.');
    return 'REVIEW_REQUIRED';
  }
  if (hasCompleteActionEvidence_(record, action)) {
    repairLifecycleFromEvidence_(sheet, id, record);
    return 'ALREADY_RECORDED';
  }

  if (!threadId) {
    const initialId = String(leadValue_(record, LEAD_HEADERS.INITIAL_MESSAGE_ID) || '').trim();
    if (initialId) threadId = getThreadIdFromMessage_(initialId);
  }
  const recovered = findSentMessageByAttempt_(threadId, attemptId, {
    campaignId: CONFIG.CAMPAIGN_ID,
    leadId: id,
    action: action,
    recipient: attemptedRecipient
  });
  if (recovered) {
    persistSendSuccess_(sheet, id, action, {
      messageId: String(recovered.id),
      threadId: String(recovered.threadId || threadId),
      sentAt: recovered.internalDate ? new Date(Number(recovered.internalDate)) : new Date()
    }, attemptedRecipient);
    safeLogEvent_(company, attemptedRecipient, action, 'RECOVERED', 'A sent Gmail message matching the unique attempt header and immutable recipient was reconciled.');
    return 'RECOVERED';
  }

  const draft = getDraftSafely_(draftId);
  const reason = draft
    ? 'An unsent Gmail draft is preserved for this pending action. Review/delete it before clearing the guard.'
    : 'The draft is absent and no sent message could be proven. Delivery outcome is ambiguous; automatic retry refused.';
  markLeadForReview_(sheet, id, reason);
  safeLogEvent_(company, email, action, 'REVIEW_REQUIRED', reason);
  return 'REVIEW_REQUIRED';
}

function repairLifecycleFromEvidence_(sheet, id, record) {
  record = refreshLeadById_(sheet, id);
  const issue = getEvidenceConsistencyIssue_(record);
  if (issue || !hasCompleteActionEvidence_(record, ACTION.INITIAL)) {
    markLeadForReview_(sheet, id, issue || 'Initial success evidence is incomplete; lifecycle repair refused.');
    return false;
  }
  let inferred = latestStatusFromEvidence_(record);
  const currentStatus = normalizeStatus_(leadValue_(record, LEAD_HEADERS.STATUS));
  if (isTrue_(leadValue_(record, LEAD_HEADERS.OPT_OUT))) {
    inferred = STATUS.DO_NOT_CONTACT;
  } else if (AUTOMATION_STOP_STATUSES.indexOf(currentStatus) !== -1) {
    inferred = currentStatus;
  }
  updateLeadFieldsById_(sheet, id, {
    [LEAD_HEADERS.STATUS]: inferred,
    [LEAD_HEADERS.PENDING_ACTION]: '',
    [LEAD_HEADERS.PENDING_ATTEMPT_ID]: '',
    [LEAD_HEADERS.PENDING_DRAFT_ID]: '',
    [LEAD_HEADERS.PENDING_RECIPIENT]: '',
    [LEAD_HEADERS.PENDING_SINCE]: '',
    [LEAD_HEADERS.LAST_ERROR]: inferred === STATUS.REVIEW_REQUIRED
      ? leadValue_(record, LEAD_HEADERS.LAST_ERROR)
      : '',
    [LEAD_HEADERS.UPDATED_AT]: new Date()
  }, true);
  return true;
}

function getPendingStateIssue_(record, action, intendedRecipient, attemptId, draftId) {
  if (String(leadValue_(record, LEAD_HEADERS.PENDING_ACTION) || '') !== String(action)) return 'Pending action changed before send.';
  if (String(leadValue_(record, LEAD_HEADERS.PENDING_ATTEMPT_ID) || '') !== String(attemptId)) return 'Pending attempt ID changed before send.';
  if (String(leadValue_(record, LEAD_HEADERS.PENDING_DRAFT_ID) || '') !== String(draftId)) return 'Pending draft ID changed before send.';
  if (normalizeEmail_(leadValue_(record, LEAD_HEADERS.PENDING_RECIPIENT)) !== normalizeEmail_(intendedRecipient)) return 'Pending recipient changed before send.';
  if (String(leadValue_(record, LEAD_HEADERS.CAMPAIGN_ID) || '') !== String(CONFIG.CAMPAIGN_ID)) return 'Campaign ID changed before send.';
  if (isTrue_(leadValue_(record, LEAD_HEADERS.OPT_OUT))) return 'Opt Out changed to TRUE before send.';

  if (action === ACTION.INITIAL) {
    if (!isExactStatus_(leadValue_(record, LEAD_HEADERS.STATUS), STATUS.APPROVED)) return 'Status is not exactly APPROVED before initial send.';
    if (normalizeEmail_(leadValue_(record, LEAD_HEADERS.EMAIL)) !== intendedRecipient) return 'Email changed before initial send.';
    if (hasInitialSuccessEvidence_(record)) return 'Initial-send evidence appeared before send.';
    return '';
  }

  const expectedStatus = action === ACTION.FOLLOW_UP_1 ? STATUS.SENT : STATUS.FOLLOW_UP_1;
  if (!isExactStatus_(leadValue_(record, LEAD_HEADERS.STATUS), expectedStatus)) return 'Status changed before follow-up send.';
  if (normalizeEmail_(leadValue_(record, LEAD_HEADERS.EMAIL)) !== intendedRecipient ||
      normalizeEmail_(leadValue_(record, LEAD_HEADERS.SENT_TO_EMAIL)) !== intendedRecipient) {
    return 'Recipient changed before follow-up send.';
  }
  if (followUpAlreadySent_(record, action)) return action + ' evidence appeared before send.';
  return '';
}

function cancelConfirmedUnsentPendingDraft_(sheet, id, draftId, action, reason) {
  removeDraft_(draftId);
  const updates = {};
  updates[LEAD_HEADERS.PENDING_ACTION] = '';
  updates[LEAD_HEADERS.PENDING_ATTEMPT_ID] = '';
  updates[LEAD_HEADERS.PENDING_DRAFT_ID] = '';
  updates[LEAD_HEADERS.PENDING_RECIPIENT] = '';
  updates[LEAD_HEADERS.PENDING_SINCE] = '';
  updates[LEAD_HEADERS.LAST_ERROR] = truncate_(reason, CONFIG.SAFETY.MAX_LOG_MESSAGE_LENGTH);
  updates[LEAD_HEADERS.UPDATED_AT] = new Date();
  if (action === ACTION.INITIAL) updates[LEAD_HEADERS.GMAIL_THREAD_ID] = '';
  updateLeadFieldsById_(sheet, id, updates, true);
}

function handleRowSendError_(sheet, id, company, email, action, mode, error) {
  const message = errorMessage_(error);
  if (mode === 'LIVE' && id) {
    try {
      const fresh = refreshLeadById_(sheet, id);
      const status = normalizeStatus_(leadValue_(fresh, LEAD_HEADERS.STATUS));
      const protectedState = isTrue_(leadValue_(fresh, LEAD_HEADERS.OPT_OUT)) ||
        AUTOMATION_STOP_STATUSES.indexOf(status) !== -1 ||
        hasCompleteActionEvidence_(fresh, ACTION.INITIAL) ||
        hasCompleteActionEvidence_(fresh, ACTION.FOLLOW_UP_1) ||
        hasCompleteActionEvidence_(fresh, ACTION.FOLLOW_UP_2);
      if (hasPendingAction_(fresh)) {
        reconcilePendingAction_(sheet, id, fresh, company, email);
      } else if (protectedState) {
        // A telemetry failure or concurrent reply/opt-out must never downgrade
        // a completed delivery or a terminal lifecycle state.
        safeLogEvent_(company, email, action, 'POST_ACTION_WARNING', message);
      } else {
        if (action === ACTION.INITIAL) {
          updateLeadFieldsById_(sheet, id, {
            [LEAD_HEADERS.LAST_ERROR]: message,
            [LEAD_HEADERS.UPDATED_AT]: new Date()
          }, true);
        } else {
          markLeadForReview_(sheet, id, 'Follow-up failed closed: ' + message);
        }
      }
    } catch (recoveryError) {
      try {
        const latest = refreshLeadById_(sheet, id);
        const latestStatus = normalizeStatus_(leadValue_(latest, LEAD_HEADERS.STATUS));
        if (!isTrue_(leadValue_(latest, LEAD_HEADERS.OPT_OUT)) &&
            AUTOMATION_STOP_STATUSES.indexOf(latestStatus) === -1) {
          markLeadForReview_(sheet, id, 'Send/recovery error: ' + errorMessage_(recoveryError));
        }
      } catch (ignored) {
        // Row may have been deleted while Gmail was processing.
      }
    }
  }
  safeLogEvent_(company, email, action, 'ERROR', message);
}

function quarantineValidationFailure_(sheet, id, mode, message) {
  if (mode === 'LIVE') markLeadForReview_(sheet, id, message);
}

function normalizeOptOutRow_(sheet, id, mode) {
  if (mode !== 'LIVE') return;
  updateLeadFieldsById_(sheet, id, {
    [LEAD_HEADERS.STATUS]: STATUS.DO_NOT_CONTACT,
    [LEAD_HEADERS.REPLY_STATUS]: 'OPTED_OUT',
    [LEAD_HEADERS.UPDATED_AT]: new Date()
  }, true);
}

function collectConfigurationIssues_(options) {
  const opts = options || {};
  const errors = [];
  const warnings = [];
  ['SENDS_ENABLED', 'DRY_RUN', 'TEST_MODE'].forEach(function (key) {
    if (typeof CONFIG.SAFETY[key] !== 'boolean') errors.push(key + ' must be true or false (a Boolean, not text).');
  });
  if (!safeDisplayText_(CONFIG.SHEETS.LEADS_NAME) || !safeDisplayText_(CONFIG.SHEETS.LOG_NAME)) {
    errors.push('Lead and log sheet names are required.');
  } else if (CONFIG.SHEETS.LEADS_NAME === CONFIG.SHEETS.LOG_NAME) {
    errors.push('Lead and log sheet names must be different.');
  }
  const positiveNumbers = [
    ['DAILY_SEND_LIMIT', CONFIG.SAFETY.DAILY_SEND_LIMIT],
    ['MAX_INITIALS_PER_RUN', CONFIG.SAFETY.MAX_INITIALS_PER_RUN],
    ['MAX_FOLLOW_UPS_PER_RUN', CONFIG.SAFETY.MAX_FOLLOW_UPS_PER_RUN],
    ['FIRST_AFTER_DAYS_FROM_INITIAL', CONFIG.FOLLOW_UP.FIRST_AFTER_DAYS_FROM_INITIAL],
    ['SECOND_AFTER_DAYS_FROM_INITIAL', CONFIG.FOLLOW_UP.SECOND_AFTER_DAYS_FROM_INITIAL],
    ['SECOND_MIN_DAYS_AFTER_FIRST', CONFIG.FOLLOW_UP.SECOND_MIN_DAYS_AFTER_FIRST],
    ['MAX_TEST_SENDS_PER_RUN', CONFIG.SAFETY.MAX_TEST_SENDS_PER_RUN],
    ['MAX_REPLY_CHECKS_PER_RUN', CONFIG.SAFETY.MAX_REPLY_CHECKS_PER_RUN],
    ['MAX_LOG_MESSAGE_LENGTH', CONFIG.SAFETY.MAX_LOG_MESSAGE_LENGTH],
    ['LOCK_TIMEOUT_MS', CONFIG.SAFETY.LOCK_TIMEOUT_MS],
    ['MAX_RUNTIME_MS', CONFIG.SAFETY.MAX_RUNTIME_MS]
  ];
  positiveNumbers.forEach(function (entry) {
    if (!Number.isInteger(Number(entry[1])) || Number(entry[1]) <= 0) errors.push(entry[0] + ' must be a positive integer.');
  });
  if (CONFIG.FOLLOW_UP.SECOND_AFTER_DAYS_FROM_INITIAL <= CONFIG.FOLLOW_UP.FIRST_AFTER_DAYS_FROM_INITIAL) {
    errors.push('Follow-up 2 must be scheduled later than follow-up 1.');
  }
  if (!/^[A-Za-z0-9._-]+$/.test(String(CONFIG.CAMPAIGN_ID || ''))) {
    errors.push('CAMPAIGN_ID is required and may contain only letters, numbers, dot, underscore, or hyphen.');
  }
  if (String(CONFIG.CAMPAIGN_ID || '').length > 100) errors.push('CAMPAIGN_ID must be 100 characters or fewer.');
  const cutoff = String(CONFIG.CAMPAIGN_SEND_CUTOFF_ISO || '').trim();
  if (!cutoff) {
    (opts.requireSend ? errors : warnings).push('CAMPAIGN_SEND_CUTOFF_ISO is blank; confirm the event year and final outreach date before any actual send.');
  } else if (!isValidIsoCalendarDate_(cutoff)) {
    errors.push('CAMPAIGN_SEND_CUTOFF_ISO must be a real date in YYYY-MM-DD form.');
  }
  [
    ['FOLLOW_UP_HOUR', CONFIG.TRIGGERS.FOLLOW_UP_HOUR],
    ['INITIAL_SEND_HOUR', CONFIG.TRIGGERS.INITIAL_SEND_HOUR]
  ].forEach(function (entry) {
    const value = Number(entry[1]);
    if (!Number.isInteger(value) || value < 0 || value > 23) errors.push(entry[0] + ' must be an integer from 0 to 23.');
  });
  const supportedReplyIntervals = [1, 2, 4, 6, 8, 12];
  if (supportedReplyIntervals.indexOf(Number(CONFIG.TRIGGERS.REPLY_CHECK_EVERY_HOURS)) === -1) {
    errors.push('REPLY_CHECK_EVERY_HOURS must be one of: ' + supportedReplyIntervals.join(', ') + '.');
  }
  if (!Number.isInteger(Number(CONFIG.SAFETY.GMAIL_QUOTA_RESERVE)) || Number(CONFIG.SAFETY.GMAIL_QUOTA_RESERVE) < 0) {
    errors.push('GMAIL_QUOTA_RESERVE must be a non-negative integer.');
  }
  if (!Number.isInteger(Number(CONFIG.SAFETY.SEND_DELAY_MS)) || Number(CONFIG.SAFETY.SEND_DELAY_MS) < 0) {
    errors.push('SEND_DELAY_MS must be a non-negative integer.');
  }
  if (Number(CONFIG.SAFETY.MAX_RUNTIME_MS) > 300000) errors.push('MAX_RUNTIME_MS must not exceed 300000 (five minutes).');
  if (Number(CONFIG.SAFETY.LOCK_TIMEOUT_MS) >= Number(CONFIG.SAFETY.MAX_RUNTIME_MS)) {
    errors.push('LOCK_TIMEOUT_MS must be lower than MAX_RUNTIME_MS.');
  }
  try {
    Utilities.formatDate(new Date(), CONFIG.TIME_ZONE, 'yyyy-MM-dd');
  } catch (error) {
    errors.push('TIME_ZONE is not valid for Apps Script.');
  }

  [
    ['EVENT.NAME', CONFIG.EVENT.NAME],
    ['EVENT.ONE_LINE_DESCRIPTION', CONFIG.EVENT.ONE_LINE_DESCRIPTION],
    ['EVENT.DATE_DISPLAY', CONFIG.EVENT.DATE_DISPLAY],
    ['SENDER.NAME', CONFIG.SENDER.NAME],
    ['SENDER.BUSINESS_EMAIL', CONFIG.SENDER.BUSINESS_EMAIL]
  ].forEach(function (entry) {
    if (isPlaceholder_(entry[1])) {
      (opts.requireSend ? errors : warnings).push(entry[0] + ' still contains a placeholder.');
    }
  });
  if (['on', 'in'].indexOf(safeDisplayText_(CONFIG.EVENT.DATE_PREPOSITION).toLowerCase()) === -1) {
    errors.push('EVENT.DATE_PREPOSITION must be either "on" or "in".');
  }
  if (!isValidSingleEmail_(CONFIG.SENDER.BUSINESS_EMAIL)) {
    (opts.requireSend ? errors : warnings).push('SENDER.BUSINESS_EMAIL is not a valid single email address.');
  }
  if (!isValidSingleEmail_(CONFIG.SENDER.FROM_EMAIL)) {
    (opts.requireMailbox ? errors : warnings).push('SENDER.FROM_EMAIL is not a valid single email address.');
  }
  if (!isValidSingleEmail_(CONFIG.SENDER.REPLY_TO_EMAIL)) {
    (opts.requireMailbox ? errors : warnings).push('SENDER.REPLY_TO_EMAIL is not a valid single email address.');
  }
  let configuredCc = [];
  try {
    configuredCc = getConfiguredCcEmails_();
  } catch (error) {
    errors.push(errorMessage_(error));
  }
  if (CONFIG.SAFETY.TEST_MODE && !CONFIG.SAFETY.DRY_RUN && !isValidSingleEmail_(CONFIG.SAFETY.TEST_RECIPIENT)) {
    errors.push('TEST_RECIPIENT must be valid when TEST_MODE is active and DRY_RUN is false.');
  } else if (CONFIG.SAFETY.TEST_MODE && !CONFIG.SAFETY.DRY_RUN &&
      configuredCc.indexOf(normalizeEmail_(CONFIG.SAFETY.TEST_RECIPIENT)) !== -1) {
    errors.push('TEST_RECIPIENT must differ from every configured CC address.');
  }

  if (opts.requireMailbox && errors.length === 0) {
    try {
      const allowed = getAuthorizedSendAsAddresses_();
      const from = normalizeEmail_(CONFIG.SENDER.FROM_EMAIL);
      const replyTo = normalizeEmail_(CONFIG.SENDER.REPLY_TO_EMAIL);
      if (allowed.indexOf(from) === -1) errors.push('FROM_EMAIL is not an authorized Gmail Send-As address for this account.');
      if (allowed.indexOf(replyTo) === -1) {
        errors.push('REPLY_TO_EMAIL is not in this Gmail mailbox; automatic reply detection would be unreliable.');
      }
      if (CONFIG.SAFETY.TEST_MODE && !CONFIG.SAFETY.DRY_RUN) {
        const testRecipient = normalizeEmail_(CONFIG.SAFETY.TEST_RECIPIENT);
        if (allowed.indexOf(testRecipient) === -1) {
          errors.push('TEST_RECIPIENT must be the primary address or an accepted Send-As address owned by this Gmail mailbox.');
        }
      }
    } catch (error) {
      errors.push(errorMessage_(error));
    }
  }

  return { errors: errors, warnings: warnings };
}

function assertCampaignWindowOpen_() {
  const cutoff = String(CONFIG.CAMPAIGN_SEND_CUTOFF_ISO || '').trim();
  if (!cutoff) return;
  const today = Utilities.formatDate(new Date(), CONFIG.TIME_ZONE, 'yyyy-MM-dd');
  assertCondition_(today <= cutoff, 'Campaign send cutoff (' + cutoff + ') has passed; outreach is blocked.');
}

function validateConfigurationOrThrow_(options) {
  const issues = collectConfigurationIssues_(options);
  if (issues.errors.length) throw new Error('Configuration error(s):\n- ' + issues.errors.join('\n- '));
  return issues;
}

function validateConfiguration() {
  const issues = collectConfigurationIssues_({ requireMailbox: true, requireSend: true });
  const mode = getExecutionMode_();
  const lines = ['Current mode: ' + mode];
  if (issues.errors.length) lines.push('\nERRORS\n- ' + issues.errors.join('\n- '));
  if (issues.warnings.length) lines.push('\nWARNINGS\n- ' + issues.warnings.join('\n- '));
  if (!issues.errors.length && !issues.warnings.length) lines.push('\nConfiguration is ready. This check did not send email.');
  SpreadsheetApp.getUi().alert('Brand Outreach configuration', lines.join('\n'), SpreadsheetApp.getUi().ButtonSet.OK);
  return issues;
}


function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Brand Outreach')
    .addItem('Setup Sheet', 'menuSetupSheet')
    .addItem('Validate Configuration', 'validateConfiguration')
    .addItem('Run Safe Self-Tests', 'runSelfTests')
    .addSeparator()
    .addItem('Preview Selected Email', 'previewSelectedEmail')
    .addItem('Send Approved Leads', 'menuSendApprovedLeads')
    .addItem('Process Follow-ups', 'menuProcessFollowUps')
    .addItem('Check Replies', 'menuCheckReplies')
    .addSeparator()
    .addItem('Install / Re-enable Automation', 'installAutomation')
    .addItem('Disable Automation (Emergency)', 'disableAutomation')
    .addItem('Re-enable Manual Runs Only', 'reenableManualRuns')
    .addSeparator()
    .addItem('Reset Selected Pending Draft', 'resetSelectedPendingDraft')
    .addItem('Show System Status', 'showSystemStatus')
    .addToUi();
}

function menuSetupSheet() {
  runMenuAction_('Setup Sheet', setupSheet);
}

function menuSendApprovedLeads(event) {
  if (rejectDirectWorkerTrigger_(event, 'Menu: Send Approved Leads')) return;
  if (!confirmLiveSending_('send approved initial emails')) return;
  runMenuAction_('Send Approved Leads', sendApprovedLeads);
}

function menuProcessFollowUps(event) {
  if (rejectDirectWorkerTrigger_(event, 'Menu: Process Follow-ups')) return;
  if (!confirmLiveSending_('send due follow-ups')) return;
  runMenuAction_('Process Follow-ups', processFollowUps);
}

function confirmLiveSending_(description) {
  if (getExecutionMode_() !== 'LIVE') return true;
  const ui = SpreadsheetApp.getUi();
  return ui.alert(
    'Confirm live sending',
    'This will ' + description + ' through Gmail now. Every message will CC ' +
      getConfiguredCcEmails_().join(', ') + '. APPROVED/state gates and configured limits still apply. Continue?',
    ui.ButtonSet.YES_NO
  ) === ui.Button.YES;
}

function menuCheckReplies(event) {
  if (rejectDirectWorkerTrigger_(event, 'Menu: Check Replies')) return;
  runMenuAction_('Check Replies', checkReplies);
}

function runMenuAction_(title, action) {
  try {
    const result = action();
    SpreadsheetApp.getUi().alert(title, formatRunSummary_(result), SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (error) {
    SpreadsheetApp.getUi().alert(title + ' failed', errorMessage_(error), SpreadsheetApp.getUi().ButtonSet.OK);
    throw error;
  }
}

function scheduledSendApprovedLeads(event) {
  runScheduledAction_('SCHEDULED_INITIALS', sendApprovedLeads, event, 'scheduledSendApprovedLeads');
}

function scheduledProcessFollowUps(event) {
  runScheduledAction_('SCHEDULED_FOLLOW_UPS', processFollowUps, event, 'scheduledProcessFollowUps');
}

function scheduledCheckReplies(event) {
  runScheduledAction_('SCHEDULED_REPLY_CHECK', checkReplies, event, 'scheduledCheckReplies');
}

function runScheduledAction_(name, action, event, handlerName) {
  if (!isDirectInstallableTriggerEvent_(event)) {
    const invalidEventMessage = 'Scheduled wrapper skipped: no installable-trigger identity was supplied.';
    safeLogEvent_('', '', name, 'SKIPPED', invalidEventMessage);
    console.error(name + ': ' + invalidEventMessage);
    return;
  }
  const scheduledMode = getExecutionMode_();
  if (scheduledMode === 'TEST') {
    const message = 'Scheduled execution skipped: redirected TEST_MODE is manual-only.';
    safeLogEvent_('', '', name, 'SKIPPED', message);
    console.log(name + ': ' + message);
    return;
  }
  // DRY_RUN workers do not access Gmail or advance lifecycle state. For every
  // other mode, verify trigger ownership at execution time so a hidden trigger
  // installed by another collaborator cannot act on this campaign.
  if (scheduledMode !== 'DRY_RUN') {
    const recordedOwner = normalizeEmail_(
      PropertiesService.getScriptProperties().getProperty(SCRIPT_PROPERTY_KEYS.TRIGGER_OWNER_EMAIL)
    );
    let executingMailbox = '';
    try {
      executingMailbox = getCurrentMailboxEmail_();
    } catch (error) {
      const authorizationMessage = 'Scheduled execution skipped: Gmail mailbox identity could not be verified (' + errorMessage_(error) + ').';
      safeLogEvent_('', '', name, 'SKIPPED', authorizationMessage);
      console.error(name + ': ' + authorizationMessage);
      return;
    }
    if (!recordedOwner || executingMailbox !== recordedOwner) {
      const ownerMessage = 'Scheduled execution skipped: executing Gmail mailbox is not the designated trigger owner.';
      safeLogEvent_('', '', name, 'SKIPPED', ownerMessage);
      console.error(name + ': ' + ownerMessage);
      return;
    }
  }
  try {
    // The worker validates this exact trigger ID/handler again *inside* the
    // shared lock. Deleting triggers or choosing manual-only mode therefore
    // also neutralizes an old execution that was already dispatched/queued.
    const result = action({
      source: 'SCHEDULED_WRAPPER',
      authorizedTriggerUid: String(event.triggerUid),
      handlerName: handlerName
    });
    console.log(formatRunSummary_(result));
  } catch (error) {
    console.error(name + ': ' + errorMessage_(error));
    try {
      logEvent_('', '', name, 'ERROR', errorMessage_(error));
    } catch (ignored) {
      // Apps Script Executions remains the fallback diagnostic channel.
    }
    throw error;
  }
}

function installAutomation() {
  const ui = SpreadsheetApp.getUi();
  if (CONFIG.SAFETY.TEST_MODE && !CONFIG.SAFETY.DRY_RUN) {
    ui.alert(
      'Automation not installed',
      'Redirected TEST_MODE is intentionally manual-only so a trigger cannot repeatedly email the test inbox. Use DRY_RUN=true to test triggers, or finish testing before installation.',
      ui.ButtonSet.OK
    );
    return;
  }

  let currentMailbox = '';
  try {
    currentMailbox = getCurrentMailboxEmail_();
  } catch (error) {
    ui.alert('Automation not installed', 'Authorize Gmail first: ' + errorMessage_(error), ui.ButtonSet.OK);
    return;
  }
  const properties = PropertiesService.getScriptProperties();
  const recordedOwner = normalizeEmail_(properties.getProperty(SCRIPT_PROPERTY_KEYS.TRIGGER_OWNER_EMAIL));
  if (recordedOwner && recordedOwner !== currentMailbox) {
    ui.alert(
      'Automation not installed',
      'This project is owned for automation by ' + recordedOwner + '. Only that Gmail account may install or re-enable triggers.',
      ui.ButtonSet.OK
    );
    return;
  }

  const issues = collectConfigurationIssues_({
    requireMailbox: true,
    requireSend: getExecutionMode_() === 'LIVE'
  });
  if (issues.errors.length) {
    ui.alert('Automation not installed', issues.errors.join('\n'), ui.ButtonSet.OK);
    return;
  }
  try {
    assertCampaignWindowOpen_();
  } catch (error) {
    ui.alert('Automation not installed', errorMessage_(error), ui.ButtonSet.OK);
    return;
  }

  // Capture before the operator confirms. Any Emergency Disable requested
  // while the dialog is open or while installation waits for the lock gets a
  // different nonce and therefore wins.
  const disableNonceAtConfirmation = getCurrentDisableNonce_();
  const mode = getExecutionMode_();
  const prompt = [
    'Install one daily follow-up trigger around ' + CONFIG.TRIGGERS.FOLLOW_UP_HOUR + ':00,',
    'one daily approved-lead trigger around ' + CONFIG.TRIGGERS.INITIAL_SEND_HOUR + ':00,',
    'and a reply check every ' + CONFIG.TRIGGERS.REPLY_CHECK_EVERY_HOURS + ' hours?',
    '',
    'Current execution mode: ' + mode,
    'Trigger owner: ' + currentMailbox,
    'Daily cap: ' + CONFIG.SAFETY.DAILY_SEND_LIMIT,
    'CC on every message: ' + getConfiguredCcEmails_().join(', '),
    'Recipient units per message: ' + recipientUnitsPerMessage_(),
    '',
    'Apps Script trigger times are approximate.'
  ].join('\n');
  if (ui.alert('Install Brand Outreach automation', prompt, ui.ButtonSet.YES_NO) !== ui.Button.YES) return;

  let installResult;
  try {
    installResult = withScriptLock_('Install Automation', function () {
      const created = [];
      const ownerInsideLock = normalizeEmail_(properties.getProperty(SCRIPT_PROPERTY_KEYS.TRIGGER_OWNER_EMAIL));
      assertCondition_(!ownerInsideLock || ownerInsideLock === currentMailbox,
        'Another Gmail account owns this automation project.');
      const oldTriggers = ScriptApp.getProjectTriggers().filter(function (trigger) {
        return OWNED_TRIGGER_HANDLERS.indexOf(trigger.getHandlerFunction()) !== -1;
      });
      setSystemDisabled_(true);
      clearAuthorizedTriggers_();
      try {
        created.push(ScriptApp.newTrigger('scheduledProcessFollowUps')
          .timeBased()
          .everyDays(1)
          .atHour(CONFIG.TRIGGERS.FOLLOW_UP_HOUR)
          .inTimezone(CONFIG.TIME_ZONE)
          .create());
        created.push(ScriptApp.newTrigger('scheduledSendApprovedLeads')
          .timeBased()
          .everyDays(1)
          .atHour(CONFIG.TRIGGERS.INITIAL_SEND_HOUR)
          .inTimezone(CONFIG.TIME_ZONE)
          .create());
        created.push(ScriptApp.newTrigger('scheduledCheckReplies')
          .timeBased()
          .everyHours(CONFIG.TRIGGERS.REPLY_CHECK_EVERY_HOURS)
          .create());
        oldTriggers.forEach(function (trigger) { ScriptApp.deleteTrigger(trigger); });
        authorizeScheduledTriggers_(created);
        properties.setProperty(SCRIPT_PROPERTY_KEYS.TRIGGER_OWNER_EMAIL, currentMailbox);
        const enabled = enableSystemForDisableNonce_(disableNonceAtConfirmation);
        if (!enabled) {
          clearAuthorizedTriggers_();
          created.forEach(function (trigger) {
            try { ScriptApp.deleteTrigger(trigger); } catch (ignored) {}
          });
          safeLogEvent_('', '', 'INSTALL_AUTOMATION', 'SKIPPED', 'A newer Emergency Disable request arrived during installation; new triggers were removed and the system remains disabled.');
          return { installed: false, disabledByNewerRequest: true };
        }
        safeLogEvent_('', '', 'INSTALL_AUTOMATION', 'SUCCESS', 'Triggers replaced by the designated owner; runtime kill switch cleared after complete installation.');
        return { installed: true, enabled: true };
      } catch (error) {
        clearAuthorizedTriggers_();
        created.forEach(function (trigger) {
          try { ScriptApp.deleteTrigger(trigger); } catch (ignored) {}
        });
        setSystemDisabled_(true);
        throw error;
      }
    });
  } catch (error) {
    ui.alert('Automation not installed', errorMessage_(error) + '\n\nRuntime kill switch: ' + (isSystemDisabled_() ? 'ON' : 'OFF') + '.', ui.ButtonSet.OK);
    return;
  }
  if (installResult && installResult.lockedOut) {
    ui.alert('Automation not installed', installResult.message, ui.ButtonSet.OK);
    return;
  }
  if (installResult && installResult.disabledByNewerRequest) {
    ui.alert('Automation remains disabled', 'Emergency Disable was requested while installation was running. Newly created triggers were removed.', ui.ButtonSet.OK);
    return;
  }
  ui.alert('Automation installed', 'Triggers were installed idempotently. Review Apps Script → Triggers to verify them.', ui.ButtonSet.OK);
}

function disableAutomation() {
  // Set the property before deleting triggers. sendPreparedDraft_ checks this
  // immediately before Gmail sends, so an in-flight run fails closed.
  const disableNonce = requestSystemDisable_();
  let deleted = 0;
  let deletionIssue = '';
  try {
    // Immediately revoke every previously installed trigger generation. A
    // queued wrapper then fails inside the worker lock even if manual runs are
    // enabled later.
    clearAuthorizedTriggers_();
  } catch (error) {
    deletionIssue = ' Trigger authorization revocation reported an error; the shared kill switch remains active. ' + errorMessage_(error);
  }
  try {
    deleted = deleteOwnedTriggers_();
  } catch (error) {
    deletionIssue += ' Trigger removal reported an error; remaining triggers are still neutralized by the shared kill switch. Review Apps Script → Triggers. ' + errorMessage_(error);
  }
  const owner = normalizeEmail_(PropertiesService.getScriptProperties().getProperty(SCRIPT_PROPERTY_KEYS.TRIGGER_OWNER_EMAIL));
  try {
    logEvent_('', '', 'DISABLE_AUTOMATION', deletionIssue ? 'WARNING' : 'SUCCESS', 'Kill switch enabled with a new emergency nonce; deleted ' + deleted + ' owned trigger(s).' + deletionIssue);
  } catch (ignored) {
    // The kill switch is already active even if logging is unavailable.
  }
  SpreadsheetApp.getUi().alert(
    'Automation disabled',
    'The shared runtime kill switch is ON and ' + deleted + ' trigger(s) owned by your current account were removed. Any remaining or collaborator-owned triggers are blocked by emergency request ' + disableNonce.slice(0, 8) + '…. Designated owner: ' + (owner || '(not established)') + '.' + deletionIssue,
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

function reenableManualRuns() {
  const ui = SpreadsheetApp.getUi();
  let currentMailbox = '';
  try {
    currentMailbox = getCurrentMailboxEmail_();
  } catch (error) {
    ui.alert('Manual runs remain disabled', 'Authorize Gmail first: ' + errorMessage_(error), ui.ButtonSet.OK);
    return;
  }
  const properties = PropertiesService.getScriptProperties();
  const owner = normalizeEmail_(properties.getProperty(SCRIPT_PROPERTY_KEYS.TRIGGER_OWNER_EMAIL));
  if (owner && owner !== currentMailbox) {
    ui.alert('Manual runs remain disabled', 'Only designated automation owner ' + owner + ' may clear the shared kill switch.', ui.ButtonSet.OK);
    return;
  }
  const disableNonceAtConfirmation = getCurrentDisableNonce_();
  const answer = ui.alert(
    'Re-enable manual runs?',
    'This removes any remaining outreach triggers owned by your account, then clears the runtime kill switch for manual runs only. It does not create triggers or bypass DRY_RUN, TEST_MODE, or SENDS_ENABLED.',
    ui.ButtonSet.YES_NO
  );
  if (answer !== ui.Button.YES) return;
  let result;
  try {
    result = withScriptLock_('Re-enable Manual Runs', function () {
      const latestOwner = normalizeEmail_(properties.getProperty(SCRIPT_PROPERTY_KEYS.TRIGGER_OWNER_EMAIL));
      assertCondition_(!latestOwner || latestOwner === currentMailbox,
        'Another Gmail account owns this automation project.');
      if (!latestOwner) properties.setProperty(SCRIPT_PROPERTY_KEYS.TRIGGER_OWNER_EMAIL, currentMailbox);
      setSystemDisabled_(true);
      clearAuthorizedTriggers_();
      const deleted = deleteOwnedTriggers_();
      const remaining = ScriptApp.getProjectTriggers().filter(function (trigger) {
        return OWNED_TRIGGER_HANDLERS.indexOf(trigger.getHandlerFunction()) !== -1;
      });
      assertCondition_(remaining.length === 0, 'Could not remove every current-account outreach trigger; manual re-enable refused.');
      const enabled = enableSystemForDisableNonce_(disableNonceAtConfirmation);
      if (!enabled) {
        safeLogEvent_('', '', 'REENABLE_MANUAL', 'SKIPPED', 'A newer Emergency Disable request arrived; manual runs remain disabled.');
        return { reenabled: false, disabledByNewerRequest: true, deleted: deleted };
      }
      safeLogEvent_('', '', 'REENABLE_MANUAL', 'SUCCESS', 'Runtime kill switch cleared by designated owner; ' + deleted + ' remaining current-account trigger(s) removed and no triggers created.');
      return { reenabled: true, deleted: deleted };
    });
  } catch (error) {
    ui.alert('Manual runs remain disabled', errorMessage_(error), ui.ButtonSet.OK);
    return;
  }
  if (result && result.lockedOut) {
    ui.alert('Manual runs remain disabled', result.message, ui.ButtonSet.OK);
    return;
  }
  if (result && result.disabledByNewerRequest) {
    ui.alert('Manual runs remain disabled', 'A newer Emergency Disable request arrived during re-enable. No triggers were installed.', ui.ButtonSet.OK);
    return;
  }
  ui.alert('Manual runs re-enabled', 'No triggers are installed for your account.', ui.ButtonSet.OK);
}

function deleteOwnedTriggers_() {
  let deleted = 0;
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (OWNED_TRIGGER_HANDLERS.indexOf(trigger.getHandlerFunction()) !== -1) {
      ScriptApp.deleteTrigger(trigger);
      deleted += 1;
    }
  });
  return deleted;
}

function showSystemStatus() {
  const state = getDailySendState_();
  const authorizedTriggerMap = getAuthorizedTriggerMap_();
  const ownedTriggers = ScriptApp.getProjectTriggers().filter(function (trigger) {
    return OWNED_TRIGGER_HANDLERS.indexOf(trigger.getHandlerFunction()) !== -1;
  });
  const triggerOwner = normalizeEmail_(PropertiesService.getScriptProperties().getProperty(SCRIPT_PROPERTY_KEYS.TRIGGER_OWNER_EMAIL));
  const lines = [
    'Execution mode: ' + getExecutionMode_(),
    'Runtime kill switch: ' + (isSystemDisabled_() ? 'ON' : 'OFF'),
    'Automation sends recorded today: ' + state.count + ' / ' + CONFIG.SAFETY.DAILY_SEND_LIMIT,
    'Configured CC on every message: ' + getConfiguredCcEmails_().join(', '),
    'Recipient units per message: ' + recipientUnitsPerMessage_(),
    'Owned installed triggers: ' + ownedTriggers.length,
    'Authorized scheduled trigger IDs: ' + Object.keys(authorizedTriggerMap).length,
    'Designated trigger owner: ' + (triggerOwner || '(not established)'),
    'Campaign ID: ' + CONFIG.CAMPAIGN_ID
  ];
  SpreadsheetApp.getUi().alert('Brand Outreach status', lines.join('\n'), SpreadsheetApp.getUi().ButtonSet.OK);
}

function resetSelectedPendingDraft() {
  const ui = SpreadsheetApp.getUi();
  let selected;
  let id;
  let record;
  try {
    selected = getSelectedLead_();
    id = ensureLeadIdAtRow_(selected.sheet, selected.record);
    assertUniqueLeadIds_(getLeadRows_(selected.sheet));
    record = refreshLeadById_(selected.sheet, id);
  } catch (error) {
    ui.alert('Reset refused', errorMessage_(error), ui.ButtonSet.OK);
    return;
  }

  const action = String(leadValue_(record, LEAD_HEADERS.PENDING_ACTION) || '').trim();
  const attemptId = String(leadValue_(record, LEAD_HEADERS.PENDING_ATTEMPT_ID) || '').trim();
  const draftId = String(leadValue_(record, LEAD_HEADERS.PENDING_DRAFT_ID) || '').trim();
  const pendingRecipient = normalizeEmail_(leadValue_(record, LEAD_HEADERS.PENDING_RECIPIENT));
  const threadId = String(leadValue_(record, LEAD_HEADERS.GMAIL_THREAD_ID) || '').trim();
  if ([ACTION.INITIAL, ACTION.FOLLOW_UP_1, ACTION.FOLLOW_UP_2].indexOf(action) === -1 ||
      !attemptId || !draftId || !threadId || !isValidSingleEmail_(pendingRecipient)) {
    ui.alert('Reset refused', 'The selected row has incomplete or unknown pending-send metadata. Inspect it manually; nothing was deleted.', ui.ButtonSet.OK);
    return;
  }
  if ((action === ACTION.INITIAL && hasInitialSuccessEvidence_(record)) ||
      (action !== ACTION.INITIAL && followUpAlreadySent_(record, action))) {
    ui.alert('Reset refused', 'Success evidence exists. Clearing this guard could allow a duplicate.', ui.ButtonSet.OK);
    return;
  }
  if (!getDraftSafely_(draftId)) {
    ui.alert(
      'Reset refused',
      'The saved draft is no longer present, so delivery may have occurred. Check Gmail Sent and the internal attempt ID manually; the script will not risk an automatic retry.',
      ui.ButtonSet.OK
    );
    return;
  }
  if (ui.alert(
    'Validate and delete the pending draft?',
    'The script will re-read the row under a lock, verify the exact campaign, lead, action, attempt, recipient, thread and Gmail draft headers, then delete only that proven-unsent draft. Terminal and opt-out statuses will be preserved.',
    ui.ButtonSet.YES_NO
  ) !== ui.Button.YES) return;

  try {
    const result = withScriptLock_('Reset Pending Draft', function () {
      const sheet = getLeadsSheet_();
      assertUniqueLeadIds_(getLeadRows_(sheet));
      const fresh = refreshLeadById_(sheet, id);
      const currentAction = String(leadValue_(fresh, LEAD_HEADERS.PENDING_ACTION) || '').trim();
      const currentAttemptId = String(leadValue_(fresh, LEAD_HEADERS.PENDING_ATTEMPT_ID) || '').trim();
      const currentDraftId = String(leadValue_(fresh, LEAD_HEADERS.PENDING_DRAFT_ID) || '').trim();
      const currentRecipient = normalizeEmail_(leadValue_(fresh, LEAD_HEADERS.PENDING_RECIPIENT));
      const currentThreadId = String(leadValue_(fresh, LEAD_HEADERS.GMAIL_THREAD_ID) || '').trim();
      assertCondition_(currentAction === action && currentAttemptId === attemptId &&
        currentDraftId === draftId && currentRecipient === pendingRecipient && currentThreadId === threadId,
      'Pending metadata changed after confirmation; nothing was deleted.');
      assertCondition_(String(leadValue_(fresh, LEAD_HEADERS.CAMPAIGN_ID) || '').trim() === String(CONFIG.CAMPAIGN_ID),
        'Pending campaign does not match current CONFIG; nothing was deleted.');
      assertCondition_(!((action === ACTION.INITIAL && hasInitialSuccessEvidence_(fresh)) ||
        (action !== ACTION.INITIAL && followUpAlreadySent_(fresh, action))),
      'Success evidence appeared after confirmation; nothing was deleted.');

      validatePreparedDraftForSend_(draftId, {
        leadId: id,
        action: action,
        attemptId: attemptId,
        recipient: pendingRecipient,
        threadId: threadId
      });
      removeDraft_(draftId);

      const latest = refreshLeadById_(sheet, id);
      const tupleStillOwned = String(leadValue_(latest, LEAD_HEADERS.PENDING_ACTION) || '').trim() === action &&
        String(leadValue_(latest, LEAD_HEADERS.PENDING_ATTEMPT_ID) || '').trim() === attemptId &&
        String(leadValue_(latest, LEAD_HEADERS.PENDING_DRAFT_ID) || '').trim() === draftId &&
        normalizeEmail_(leadValue_(latest, LEAD_HEADERS.PENDING_RECIPIENT)) === pendingRecipient;
      if (!tupleStillOwned) {
        markLeadForReview_(sheet, id, 'The validated draft was deleted, but pending metadata changed concurrently; inspect the row before any further action.');
        safeLogEvent_(
          leadValue_(latest, LEAD_HEADERS.COMPANY),
          pendingRecipient,
          action,
          'RESET_REVIEW_REQUIRED',
          'The exact unsent draft was deleted, but the row tuple changed concurrently; pending metadata was left for inspection.'
        );
        return { reset: false, concurrentChange: true };
      }

      const expectedPriorStatus = action === ACTION.INITIAL
        ? STATUS.APPROVED
        : (action === ACTION.FOLLOW_UP_1 ? STATUS.SENT : STATUS.FOLLOW_UP_1);
      const currentStatusValue = leadValue_(latest, LEAD_HEADERS.STATUS);
      const currentStatus = normalizeStatus_(currentStatusValue);
      let finalStatus = expectedPriorStatus;
      let finalError = '';
      if (isTrue_(leadValue_(latest, LEAD_HEADERS.OPT_OUT))) {
        finalStatus = STATUS.DO_NOT_CONTACT;
      } else if (AUTOMATION_STOP_STATUSES.indexOf(currentStatus) !== -1) {
        finalStatus = currentStatus;
        finalError = String(leadValue_(latest, LEAD_HEADERS.LAST_ERROR) || '');
      } else if (!isExactStatus_(currentStatusValue, expectedPriorStatus)) {
        finalStatus = STATUS.REVIEW_REQUIRED;
        finalError = 'Status changed while the pending draft was being reset; automation remains paused.';
      }
      updateLeadFieldsById_(sheet, id, {
        [LEAD_HEADERS.STATUS]: finalStatus,
        [LEAD_HEADERS.PENDING_ACTION]: '',
        [LEAD_HEADERS.PENDING_ATTEMPT_ID]: '',
        [LEAD_HEADERS.PENDING_DRAFT_ID]: '',
        [LEAD_HEADERS.PENDING_RECIPIENT]: '',
        [LEAD_HEADERS.PENDING_SINCE]: '',
        [LEAD_HEADERS.LAST_ERROR]: finalError,
        [LEAD_HEADERS.UPDATED_AT]: new Date()
      }, true);
      safeLogEvent_(
        leadValue_(latest, LEAD_HEADERS.COMPANY),
        pendingRecipient,
        action,
        'RESET',
        'Exact pending draft tuple was validated, the proven-unsent draft was deleted, and terminal/opt-out state was preserved.'
      );
      return { reset: true, status: finalStatus };
    });
    if (result && result.lockedOut) {
      ui.alert('Reset deferred', result.message, ui.ButtonSet.OK);
      return;
    }
    if (result && result.concurrentChange) {
      ui.alert('Draft deleted; row needs review', 'The pending fields changed concurrently, so the script left the row quarantined for inspection.', ui.ButtonSet.OK);
      return;
    }
    ui.alert('Pending draft reset', 'The exact unsent draft was deleted. Current status: ' + result.status + '.', ui.ButtonSet.OK);
  } catch (error) {
    ui.alert('Reset refused', errorMessage_(error), ui.ButtonSet.OK);
  }
}

function onEdit(e) {
  try {
    if (!e || !e.range) return;
    const sheet = e.range.getSheet();
    if (sheet.getName() !== CONFIG.SHEETS.LEADS_NAME || e.range.getRow() < 2) return;
    const map = getHeaderMap_(sheet, ALL_LEAD_HEADERS);
    const firstColumn = e.range.getColumn();
    const lastColumn = firstColumn + e.range.getNumColumns() - 1;
    const optOutColumn = map[LEAD_HEADERS.OPT_OUT];
    const emailColumn = map[LEAD_HEADERS.EMAIL];
    const statusColumn = map[LEAD_HEADERS.STATUS];
    const spreadsheet = e.source || sheet.getParent();

    for (let row = e.range.getRow(); row <= e.range.getLastRow(); row += 1) {
      const rowRecord = getLeadAtRow_(sheet, row, map);
      if (!isLeadRowBlank_(rowRecord)) {
        if (!leadId_(rowRecord)) {
          sheet.getRange(row, map[LEAD_HEADERS.LEAD_ID]).setValue(Utilities.getUuid());
        }
        if (!hasValue_(leadValue_(rowRecord, LEAD_HEADERS.STATUS))) {
          sheet.getRange(row, map[LEAD_HEADERS.STATUS]).setValue(STATUS.NEW);
        }
      }
      if (firstColumn <= optOutColumn && optOutColumn <= lastColumn && isTrue_(sheet.getRange(row, optOutColumn).getValue())) {
        sheet.getRange(row, map[LEAD_HEADERS.STATUS]).setValue(STATUS.DO_NOT_CONTACT);
        sheet.getRange(row, map[LEAD_HEADERS.REPLY_STATUS]).setValue('OPTED_OUT');
        sheet.getRange(row, map[LEAD_HEADERS.UPDATED_AT]).setValue(new Date());
        const optedOutRecord = getLeadAtRow_(sheet, row, map);
        appendBoundLogEvent_(
          spreadsheet,
          leadValue_(optedOutRecord, LEAD_HEADERS.COMPANY),
          leadValue_(optedOutRecord, LEAD_HEADERS.EMAIL),
          'OPT_OUT',
          'RECORDED',
          'Opt Out checkbox was set by an operator; suppression remains in the log even if the lead row is later removed.'
        );
      }
      if (firstColumn <= emailColumn && emailColumn <= lastColumn) {
        const record = getLeadAtRow_(sheet, row, map);
        const normalized = normalizeEmail_(leadValue_(record, LEAD_HEADERS.EMAIL));
        sheet.getRange(row, map[LEAD_HEADERS.NORMALIZED_EMAIL]).setValue(normalized);
        const sentTo = normalizeEmail_(leadValue_(record, LEAD_HEADERS.SENT_TO_EMAIL));
        const status = normalizeStatus_(leadValue_(record, LEAD_HEADERS.STATUS));
        if (sentTo && normalized !== sentTo && ACTIVE_OUTREACH_STATUSES.indexOf(status) !== -1) {
          sheet.getRange(row, map[LEAD_HEADERS.STATUS]).setValue(STATUS.REVIEW_REQUIRED);
          sheet.getRange(row, map[LEAD_HEADERS.LAST_ERROR]).setValue('Email changed after initial send; follow-ups paused.');
        }
        if (isValidSingleEmail_(normalized) &&
            (status === STATUS.DO_NOT_CONTACT || status === STATUS.NOT_INTERESTED ||
             isTrue_(leadValue_(record, LEAD_HEADERS.OPT_OUT)))) {
          appendBoundLogEvent_(
            spreadsheet,
            leadValue_(record, LEAD_HEADERS.COMPANY),
            normalized,
            status === STATUS.NOT_INTERESTED ? 'NOT_INTERESTED' : 'DO_NOT_CONTACT',
            'RECORDED',
            'Email was edited on a suppressed row; the new normalized address was added to durable suppression evidence.'
          );
        }
        sheet.getRange(row, map[LEAD_HEADERS.UPDATED_AT]).setValue(new Date());
      }
      if (firstColumn <= statusColumn && statusColumn <= lastColumn &&
          [STATUS.DO_NOT_CONTACT, STATUS.NOT_INTERESTED].indexOf(
            normalizeStatus_(sheet.getRange(row, statusColumn).getValue())
          ) !== -1) {
        const blockedRecord = getLeadAtRow_(sheet, row, map);
        const blockedStatus = normalizeStatus_(leadValue_(blockedRecord, LEAD_HEADERS.STATUS));
        appendBoundLogEvent_(
          spreadsheet,
          leadValue_(blockedRecord, LEAD_HEADERS.COMPANY),
          leadValue_(blockedRecord, LEAD_HEADERS.EMAIL),
          blockedStatus,
          'RECORDED',
          blockedStatus + ' status was set by an operator; normalized email added to durable suppression evidence.'
        );
      }
    }
  } catch (error) {
    console.error('onEdit safety helper failed: ' + errorMessage_(error));
  }
}


/**
 * Safe unit checks for deterministic logic only. This function never calls
 * Gmail, creates drafts, changes leads, or consumes send quota.
 */
function runSelfTests() {
  const tests = [
    function () { assertCondition_(isValidSingleEmail_('partnerships@example.com'), 'valid email rejected'); },
    function () { assertCondition_(isValidSingleEmail_('Name+events@sub.example.co.in'), 'plus/subdomain email rejected'); },
    function () { assertCondition_(!isValidSingleEmail_('a@example.com,b@example.com'), 'email list accepted'); },
    function () { assertCondition_(!isValidSingleEmail_('a@example.com\r\nBcc: other@example.com'), 'header injection accepted as email'); },
    function () { assertCondition_(!isValidSingleEmail_('a@example'), 'domain without public-style suffix accepted'); },
    function () { assertCondition_(normalizeEmail_('  A@Example.COM ') === 'a@example.com', 'normalization failed'); },
    function () {
      const cc = getConfiguredCcEmails_();
      assertCondition_(emailListsMatchAsSets_(cc, CONFIG.SENDER.CC_EMAILS), 'configured internal CC list is incorrect');
      assertCondition_(recipientUnitsPerMessage_() === 1 + cc.length, 'To + CC recipient-unit count is incorrect');
      assertCondition_(!emailListsMatchAsSets_(cc, cc.slice(0, -1)), 'missing CC was accepted');
    },
    function () {
      const raw = buildRawMime_({
        to: 'brand@example.com',
        cc: getConfiguredCcEmails_(),
        subject: 'CC safety test',
        plainBody: 'Plain body',
        htmlBody: '<p>HTML body</p>',
        leadId: 'lead-test',
        action: ACTION.INITIAL,
        attemptId: 'attempt-test'
      });
      const padding = raw.length % 4 ? new Array(5 - (raw.length % 4)).join('=') : '';
      const decoded = Utilities.newBlob(
        Utilities.base64DecodeWebSafe(raw + padding)
      ).getDataAsString('UTF-8');
      assertCondition_(decoded.indexOf('Cc: ' + getConfiguredCcEmails_().join(', ') + '\r\n') !== -1,
        'MIME CC header is missing or incorrect');
      assertCondition_(decoded.indexOf('\r\nBcc:') === -1, 'MIME unexpectedly contains BCC');
    },
    function () {
      assertCondition_(isExactStatus_('APPROVED', STATUS.APPROVED), 'exact approval was rejected');
      assertCondition_(!isExactStatus_('approved', STATUS.APPROVED), 'lowercase approval authorized a send');
      assertCondition_(!isExactStatus_(' APPROVED ', STATUS.APPROVED), 'padded approval authorized a send');
    },
    function () {
      assertCondition_(isDirectInstallableTriggerEvent_({ triggerUid: 'legacy-trigger' }), 'direct trigger event was not recognized');
      assertCondition_(!isDirectInstallableTriggerEvent_({}), 'ordinary manual call was mistaken for a trigger');
      assertCondition_(!isDirectInstallableTriggerEvent_({
        source: 'SCHEDULED_WRAPPER',
        authorizedTriggerUid: 'current-id'
      }), 'trusted wrapper context was mistaken for a direct trigger event');
      assertCondition_(isAuthorizedTriggerIdentity_(
        { 'current-id': 'scheduledSendApprovedLeads' },
        'current-id',
        'scheduledSendApprovedLeads'
      ), 'authorized trigger identity was rejected');
      assertCondition_(!isAuthorizedTriggerIdentity_(
        { 'old-id': 'scheduledSendApprovedLeads' },
        'queued-old-id',
        'scheduledSendApprovedLeads'
      ), 'stale queued trigger identity was accepted');
    },
    function () { assertCondition_(resolveCategoryTemplate_('Gaming Peripherals') === CATEGORY_TEMPLATES.GAMING_HARDWARE, 'gaming category failed'); },
    function () { assertCondition_(resolveCategoryTemplate_('SaaS / AI') === CATEGORY_TEMPLATES.TECHNOLOGY, 'technology category failed'); },
    function () { assertCondition_(resolveCategoryTemplate_('Food / FMCG') === CATEGORY_TEMPLATES.FMCG_BEVERAGE, 'FMCG category failed'); },
    function () { assertCondition_(resolveCategoryTemplate_('Gaming Community') === CATEGORY_TEMPLATES.CREATOR_COMMUNITY, 'gaming community category failed'); },
    function () { assertCondition_(containsStrongOptOut_('Please remove me from this list.'), 'opt-out phrase missed'); },
    function () { assertCondition_(!containsStrongOptOut_('Thanks, please send the details.'), 'normal reply misclassified'); },
    function () {
      const top = getTopUnquotedText_('Thanks, please send details.\n\nOn Tue, Taran wrote:\nIf you prefer, reply opt out.');
      assertCondition_(!containsStrongOptOut_(top), 'quoted outreach opt-out caused a false positive');
    },
    function () {
      const text = stripHtml_('<div>Thanks, please send details.</div><blockquote>If you prefer, reply opt out.</blockquote>');
      assertCondition_(!containsStrongOptOut_(getTopUnquotedText_(text)), 'HTML blockquote caused a false opt-out');
    },
    function () {
      const top = getTopUnquotedText_('Sounds useful.\n\nFrom: Taran <t@example.com>\nSent: Tuesday\nTo: Brand\nSubject: Event\nReply opt out');
      assertCondition_(!containsStrongOptOut_(top), 'Outlook quoted block caused a false opt-out');
    },
    function () {
      const top = getTopUnquotedText_('Thanks, please send the deck.\n\nLe message précédent suit.\nIf you would prefer not to receive further messages about this event, reply “opt out” and we will update our list.');
      assertCondition_(!containsStrongOptOut_(top), 'localized quote retained our own opt-out footer');
    },
    function () {
      const top = getTopUnquotedText_('Thanks, please send the deck.\n\nRéponse précédente:\nIf you would prefer not to receive\n| further messages about this\n| event, reply “opt out”.');
      assertCondition_(!containsStrongOptOut_(top), 'wrapped localized quote retained our own opt-out footer');
    },
    function () {
      assertCondition_(containsStrongOptOut_(getTopUnquotedText_('Please opt out.\n\nIf you would prefer not to receive further messages about this event, reply “opt out”.')),
        'explicit opt-out before our quoted footer was missed');
    },
    function () {
      const record = makeSelfTestLead_({
        Company: 'Example Gear',
        Email: 'brand@example.com',
        Category: 'PC Hardware',
        Personalization: 'your hands-on product demos are a natural match'
      });
      const message = buildEmailForLead_(record, ACTION.INITIAL);
      assertCondition_(message.to === 'brand@example.com', 'template recipient failed');
      assertCondition_(emailListsMatchAsSets_(message.cc, getConfiguredCcEmails_()), 'template CC recipients failed');
      assertCondition_(message.subject.indexOf('Example Gear') !== -1, 'company missing from subject');
      assertCondition_(message.plainBody.indexOf('hands-on product demos') !== -1, 'personalization missing');
      assertCondition_(message.plainBody.toLowerCase().indexOf('opt out') !== -1, 'opt-out line missing');
      assertCondition_(message.plainBody.indexOf('taking place in January 2027 in India') !== -1,
        'configured month/year event timing is missing');
      assertCondition_(message.plainBody.indexOf('30–31') === -1, 'unconfirmed exact dates leaked into the email');
      assertCondition_(message.plainBody.indexOf('\nBest,\nTaran\ntaran@asaiverse.com\n\n') !== -1,
        'minimal sender signature is incorrect');
    },
    function () {
      const record = makeSelfTestLead_({
        Company: 'Example',
        Email: 'brand@example.com',
        Personalization: '<script>alert("x")</script>'
      });
      const message = buildEmailForLead_(record, ACTION.INITIAL);
      assertCondition_(message.htmlBody.indexOf('<script>') === -1, 'personalization was not HTML escaped');
      assertCondition_(message.htmlBody.indexOf('&lt;script&gt;') !== -1, 'escaped personalization missing');
    },
    function () {
      const initial = new Date('2027-01-01T18:00:00.000Z'); // 23:30 in Asia/Kolkata.
      const dayFourMorning = new Date('2027-01-05T04:30:00.000Z'); // 10:00, under 96 elapsed hours.
      const record = makeSelfTestLead_({
        Company: 'Example',
        Email: 'brand@example.com',
        Status: STATUS.SENT,
        'Initial Sent At': initial,
        'Initial Message ID': 'abc',
        'Sent To Email': 'brand@example.com'
      });
      assertCondition_(getDueFollowUpAction_(record, dayFourMorning) === ACTION.FOLLOW_UP_1, 'calendar day-4 follow-up eligibility failed');
    },
    function () {
      const tenDaysAgo = new Date(Date.now() - 10 * MILLIS_PER_DAY);
      const oneDayAgo = new Date(Date.now() - 1 * MILLIS_PER_DAY);
      const record = makeSelfTestLead_({
        Company: 'Example',
        Email: 'brand@example.com',
        Status: STATUS.FOLLOW_UP_1,
        'Initial Sent At': tenDaysAgo,
        'Follow-up 1 Sent At': oneDayAgo,
        'Initial Message ID': 'abc',
        'Follow-up 1 Message ID': 'def',
        'Sent To Email': 'brand@example.com'
      });
      assertCondition_(getDueFollowUpAction_(record, new Date()) === null, 'minimum F1-to-F2 gap was ignored');
    },
    function () {
      const original = new Array(121).join('é');
      const encoded = encodeHeaderWord_(original);
      encoded.split('\r\n ').forEach(function (word) {
        assertCondition_(word.length <= 75, 'RFC 2047 encoded-word exceeds 75 characters');
      });
      assertCondition_(decodeRfc2047Header_(encoded) === original, 'folded RFC 2047 subject did not round-trip');
    },
    function () {
      assertCondition_(isValidIsoCalendarDate_('2027-01-31'), 'valid cutoff date rejected');
      assertCondition_(!isValidIsoCalendarDate_('2027-02-29'), 'invalid cutoff date accepted');
    },
    function () {
      const record = makeSelfTestLead_({
        'Initial Sent At': new Date(),
        'Initial Message ID': 'abc',
        'Sent To Email': 'brand@example.com',
        'Campaign ID': 'OLD_CAMPAIGN'
      });
      assertCondition_(getEvidenceConsistencyIssue_(record).indexOf('Campaign ID') !== -1, 'campaign mismatch was not quarantined');
    },
    function () {
      const record = makeSelfTestLead_({ 'Pending Recipient': 'brand@example.com' });
      assertCondition_(hasPendingAction_(record), 'pending recipient alone did not fail closed');
    },
    function () {
      const record = makeSelfTestLead_({
        Status: STATUS.SENT,
        'Initial Message ID': 'abc',
        'Pending Action': ACTION.FOLLOW_UP_1,
        'Pending Recipient': 'brand@example.com'
      });
      assertCondition_(!shouldCheckRepliesForRecord_(record), 'reply worker accepted a row that still needs send reconciliation');
    },
    function () {
      const record = makeSelfTestLead_({
        Status: STATUS.INTERESTED,
        'Initial Message ID': 'abc',
        'Sent To Email': 'brand@example.com'
      });
      assertCondition_(shouldCheckRepliesForRecord_(record), 'later opt-out monitoring stopped after INTERESTED');
    },
    function () {
      const record = makeSelfTestLead_({
        Status: STATUS.DO_NOT_CONTACT,
        'Initial Message ID': 'abc',
        'Sent To Email': 'brand@example.com',
        'Opt Out': true
      });
      assertCondition_(!shouldCheckRepliesForRecord_(record), 'already suppressed row remained a reply-scan candidate');
    }
  ];

  const failures = [];
  tests.forEach(function (test, index) {
    try {
      test();
    } catch (error) {
      failures.push('Test ' + (index + 1) + ': ' + errorMessage_(error));
    }
  });
  const message = failures.length
    ? failures.length + ' of ' + tests.length + ' checks failed:\n\n' + failures.join('\n')
    : 'All ' + tests.length + ' deterministic checks passed. No email was sent and no lead data was changed.';
  try {
    SpreadsheetApp.getUi().alert('Brand Outreach self-tests', message, SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (uiError) {
    console.log('Brand Outreach self-tests: ' + message);
  }
  if (failures.length) throw new Error(message);
  return { passed: tests.length, failed: 0 };
}

function makeSelfTestLead_(valuesByHeader) {
  const headerMap = {};
  const values = [];
  ALL_LEAD_HEADERS.forEach(function (header, index) {
    headerMap[header] = index + 1;
    values[index] = Object.prototype.hasOwnProperty.call(valuesByHeader, header)
      ? valuesByHeader[header]
      : '';
  });
  return { rowNumber: 2, headerMap: headerMap, values: values };
}


/**
 * Private React operator console.
 *
 * The browser never receives Gmail credentials or direct Sheet access. Every
 * read/write crosses this owner-authenticated server boundary and reuses the
 * same validation, locking, status, duplicate, and sending services as the
 * Google Sheets menu.
 */
function doGet() {
  try {
    assertUiOwner_();
    return HtmlService.createHtmlOutputFromFile('Index')
      .setTitle(CONFIG.UI.TITLE)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  } catch (error) {
    return HtmlService.createHtmlOutput(
      '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<style>body{margin:0;background:#07111f;color:#e5edf8;font:16px/1.5 Arial,sans-serif}' +
      'main{max-width:680px;margin:12vh auto;padding:32px;border:1px solid #25364e;border-radius:18px;background:#0d1b2e}' +
      'h1{margin-top:0}code{color:#67e8f9}</style></head><body><main>' +
      '<h1>Access unavailable</h1><p>' + htmlEscape_(errorMessage_(error)) + '</p>' +
      '<p>Open the deployment while signed in to the Google account listed in <code>CONFIG.UI.ALLOWED_EMAILS</code>.</p>' +
      '</main></body></html>'
    ).setTitle('Brand Outreach — access unavailable');
  }
}

function assertUiOwner_() {
  const allowed = (CONFIG.UI.ALLOWED_EMAILS || []).map(normalizeEmail_).filter(Boolean);
  assertCondition_(allowed.length > 0, 'No UI owner email is configured.');
  const active = normalizeEmail_(Session.getActiveUser().getEmail());
  assertCondition_(active && allowed.indexOf(active) !== -1,
    'This Google account is not authorized to use the outreach console.');
  return active;
}

function uiBootstrap() {
  const owner = assertUiOwner_();
  const sheet = getLeadsSheet_();
  const rows = getLeadRows_(sheet);
  assertUniqueLeadIds_(rows);
  const now = new Date();
  const leads = rows.slice(0, CONFIG.UI.MAX_LEADS_RETURNED).map(function (record) {
    return leadToUiDto_(record, now);
  });
  const statusCounts = {};
  STATUS_VALUES.forEach(function (status) { statusCounts[status] = 0; });
  rows.forEach(function (record) {
    const status = normalizeStatus_(leadValue_(record, LEAD_HEADERS.STATUS)) || STATUS.NEW;
    statusCounts[status] = (statusCounts[status] || 0) + 1;
  });
  const dueFollowUps = rows.filter(function (record) {
    const action = getDueFollowUpAction_(record, now);
    return !!action && !validateFollowUpState_(record, action) &&
      !isTrue_(leadValue_(record, LEAD_HEADERS.OPT_OUT));
  }).length;
  const initialSafetyIndex = buildInitialSafetyIndex_(rows);
  const emailCounts = buildUiEmailCounts_(rows);
  const approvedReady = rows.filter(function (record) {
    return getInitialApprovalIssue_(record, rows, '', initialSafetyIndex, emailCounts) === '';
  }).length;
  const dailyState = getDailySendState_();
  const mode = getExecutionMode_();
  const issues = collectConfigurationIssues_({
    requireMailbox: mode !== 'DRY_RUN',
    requireSend: mode === 'LIVE'
  });
  const ownedTriggers = ScriptApp.getProjectTriggers().filter(function (trigger) {
    return OWNED_TRIGGER_HANDLERS.indexOf(trigger.getHandlerFunction()) !== -1;
  });

  return {
    generatedAt: now.toISOString(),
    ownerEmail: owner,
    title: CONFIG.UI.TITLE,
    event: {
      name: safeDisplayText_(CONFIG.EVENT.NAME),
      date: safeDisplayText_(CONFIG.EVENT.DATE_DISPLAY),
      location: safeDisplayText_(CONFIG.EVENT.LOCATION_DISPLAY),
      organization: safeDisplayText_(CONFIG.EVENT.ORGANIZATION)
    },
    sender: {
      from: normalizeEmail_(CONFIG.SENDER.FROM_EMAIL),
      replyTo: normalizeEmail_(CONFIG.SENDER.REPLY_TO_EMAIL),
      cc: getConfiguredCcEmails_()
    },
    safety: {
      mode: mode,
      sendsEnabled: CONFIG.SAFETY.SENDS_ENABLED === true,
      dryRun: CONFIG.SAFETY.DRY_RUN === true,
      testMode: CONFIG.SAFETY.TEST_MODE === true,
      systemDisabled: isSystemDisabled_(),
      dailyLimit: Number(CONFIG.SAFETY.DAILY_SEND_LIMIT),
      sentToday: dailyState.count,
      remainingToday: Math.max(0, Number(CONFIG.SAFETY.DAILY_SEND_LIMIT) - dailyState.count),
      triggerCount: ownedTriggers.length,
      configurationErrors: issues.errors,
      configurationWarnings: issues.warnings
    },
    metrics: {
      total: rows.length,
      approved: statusCounts[STATUS.APPROVED] || 0,
      approvedReady: approvedReady,
      dueFollowUps: dueFollowUps,
      replied: statusCounts[STATUS.REPLIED] || 0,
      interested: (statusCounts[STATUS.INTERESTED] || 0) + (statusCounts[STATUS.MEETING] || 0) +
        (statusCounts[STATUS.NEGOTIATING] || 0) + (statusCounts[STATUS.CLOSED] || 0)
    },
    statuses: STATUS_VALUES.slice(),
    categories: CATEGORY_VALUES.slice(),
    statusCounts: statusCounts,
    leads: leads,
    truncated: rows.length > leads.length,
    logs: getRecentUiLogs_(),
    spreadsheetUrl: getSpreadsheet_().getUrl()
  };
}

function leadToUiDto_(record, now) {
  const status = normalizeStatus_(leadValue_(record, LEAD_HEADERS.STATUS)) || STATUS.NEW;
  const dueAction = getDueFollowUpAction_(record, now || new Date());
  return {
    id: leadId_(record),
    rowNumber: record.rowNumber,
    company: safeDisplayText_(leadValue_(record, LEAD_HEADERS.COMPANY)),
    contactName: safeDisplayText_(leadValue_(record, LEAD_HEADERS.CONTACT_NAME)),
    email: normalizeEmail_(leadValue_(record, LEAD_HEADERS.EMAIL)),
    category: safeDisplayText_(leadValue_(record, LEAD_HEADERS.CATEGORY)),
    website: safeDisplayText_(leadValue_(record, LEAD_HEADERS.WEBSITE)),
    personalization: String(leadValue_(record, LEAD_HEADERS.PERSONALIZATION) || '').trim(),
    status: status,
    initialSentAt: dateToUiString_(leadValue_(record, LEAD_HEADERS.INITIAL_SENT_AT)),
    followUp1SentAt: dateToUiString_(leadValue_(record, LEAD_HEADERS.FOLLOW_UP_1_SENT_AT)),
    followUp2SentAt: dateToUiString_(leadValue_(record, LEAD_HEADERS.FOLLOW_UP_2_SENT_AT)),
    replyStatus: safeDisplayText_(leadValue_(record, LEAD_HEADERS.REPLY_STATUS)),
    notes: String(leadValue_(record, LEAD_HEADERS.NOTES) || '').trim(),
    optOut: isTrue_(leadValue_(record, LEAD_HEADERS.OPT_OUT)),
    lastError: safeDisplayText_(leadValue_(record, LEAD_HEADERS.LAST_ERROR)),
    updatedAt: dateToUiString_(leadValue_(record, LEAD_HEADERS.UPDATED_AT)),
    previewAction: determinePreviewAction_(record),
    dueAction: dueAction || '',
    hasSendEvidence: hasInitialSuccessEvidence_(record),
    hasPendingAction: hasPendingAction_(record)
  };
}

function dateToUiString_(value) {
  const date = asDate_(value);
  return date ? date.toISOString() : '';
}

function getRecentUiLogs_() {
  const sheet = getLogSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const count = Math.min(CONFIG.UI.MAX_LOG_ROWS, lastRow - 1);
  const firstRow = lastRow - count + 1;
  const values = sheet.getRange(firstRow, 1, count, LOG_HEADERS.length).getValues();
  return values.reverse().map(function (row) {
    return {
      timestamp: dateToUiString_(row[0]),
      company: safeDisplayText_(row[1]),
      email: normalizeEmail_(row[2]),
      action: safeDisplayText_(row[3]),
      result: safeDisplayText_(row[4]),
      message: safeDisplayText_(row[5])
    };
  });
}

function uiPreviewLead(leadId) {
  assertUiOwner_();
  const sheet = getLeadsSheet_();
  const record = refreshLeadById_(sheet, validateUiLeadId_(leadId));
  const action = determinePreviewAction_(record);
  const message = buildEmailForLead_(record, action);
  return {
    action: action,
    to: message.to,
    cc: message.cc,
    subject: message.subject,
    body: message.plainBody,
    warnings: getPreviewWarnings_(record, action, message)
  };
}

function uiSaveLead(payload) {
  assertUiOwner_();
  return withScriptLock_('UI Save Lead', function () {
    assertCondition_(payload && typeof payload === 'object', 'Lead data is required.');
    const id = validateUiLeadId_(payload.id);
    const sheet = getLeadsSheet_();
    const rows = getLeadRows_(sheet);
    assertUniqueLeadIds_(rows);
    const record = refreshLeadById_(sheet, id);
    const currentStatus = normalizeStatus_(leadValue_(record, LEAD_HEADERS.STATUS));
    const updates = {};
    const company = sanitizeUiText_(payload.company, 200);
    const contactName = sanitizeUiText_(payload.contactName, 160);
    const email = normalizeEmail_(payload.email);
    const category = sanitizeUiText_(payload.category, 160);
    const website = sanitizeUiText_(payload.website, 500);
    const personalization = sanitizeUiMultilineText_(payload.personalization, 1200);
    const notes = sanitizeUiMultilineText_(payload.notes, 2000);
    const requestedStatus = normalizeStatus_(payload.status || currentStatus || STATUS.NEW);
    const optOut = payload.optOut === true;

    assertCondition_(STATUS_VALUES.indexOf(requestedStatus) !== -1, 'Choose a valid status.');
    assertCondition_(!email || isValidSingleEmail_(email), 'Email must be blank or contain exactly one valid address.');
    if (website) assertCondition_(/^https?:\/\//i.test(website), 'Website must begin with http:// or https://.');

    updates[LEAD_HEADERS.COMPANY] = safeSheetText_(company);
    updates[LEAD_HEADERS.CONTACT_NAME] = safeSheetText_(contactName);
    updates[LEAD_HEADERS.EMAIL] = email;
    updates[LEAD_HEADERS.NORMALIZED_EMAIL] = email;
    updates[LEAD_HEADERS.CATEGORY] = safeSheetText_(category);
    updates[LEAD_HEADERS.WEBSITE] = safeSheetText_(website);
    updates[LEAD_HEADERS.PERSONALIZATION] = safeSheetText_(personalization);
    updates[LEAD_HEADERS.NOTES] = safeSheetText_(notes);
    updates[LEAD_HEADERS.OPT_OUT] = optOut;
    updates[LEAD_HEADERS.STATUS] = requestedStatus;
    updates[LEAD_HEADERS.UPDATED_AT] = new Date();

    if (optOut) {
      updates[LEAD_HEADERS.STATUS] = STATUS.DO_NOT_CONTACT;
      updates[LEAD_HEADERS.REPLY_STATUS] = 'OPTED_OUT';
    }

    const sentTo = normalizeEmail_(leadValue_(record, LEAD_HEADERS.SENT_TO_EMAIL));
    if (sentTo && email !== sentTo && ACTIVE_OUTREACH_STATUSES.indexOf(currentStatus) !== -1) {
      updates[LEAD_HEADERS.STATUS] = STATUS.REVIEW_REQUIRED;
      updates[LEAD_HEADERS.LAST_ERROR] = 'Email changed after initial send; follow-ups paused.';
    }

    if (updates[LEAD_HEADERS.STATUS] === STATUS.APPROVED) {
      const candidate = cloneRecordWithUpdates_(record, updates);
      const issue = getInitialApprovalIssue_(candidate, rows, id);
      assertCondition_(!issue, 'Approval refused: ' + issue);
    }
    if (hasInitialSuccessEvidence_(record) &&
        [STATUS.NEW, STATUS.APPROVED].indexOf(updates[LEAD_HEADERS.STATUS]) !== -1) {
      throw new Error('A contacted lead cannot be moved back to NEW or APPROVED.');
    }

    updateLeadFieldsById_(sheet, id, updates, true);
    const finalStatus = updates[LEAD_HEADERS.STATUS];
    const action = optOut ? 'OPT_OUT' : 'UI_EDIT';
    safeLogEvent_(company, email, action,
      optOut ? 'RECORDED' : 'SUCCESS',
      optOut ? 'Opt Out set in the private operator console.' : 'Operator updated approved lead fields/status in the private console.');
    if ([STATUS.DO_NOT_CONTACT, STATUS.NOT_INTERESTED].indexOf(finalStatus) !== -1 && !optOut) {
      safeLogEvent_(company, email, finalStatus, 'RECORDED', finalStatus + ' set in the private operator console.');
    }
    return leadToUiDto_(refreshLeadById_(sheet, id), new Date());
  });
}

function cloneRecordWithUpdates_(record, updates) {
  const values = record.values.slice();
  Object.keys(updates).forEach(function (header) {
    values[record.headerMap[header] - 1] = updates[header];
  });
  return { rowNumber: record.rowNumber, values: values, headerMap: record.headerMap };
}

function buildUiEmailCounts_(rows) {
  const counts = {};
  (rows || []).forEach(function (record) {
    const email = normalizeEmail_(leadValue_(record, LEAD_HEADERS.EMAIL));
    if (email) counts[email] = (counts[email] || 0) + 1;
  });
  return counts;
}

function getInitialApprovalIssue_(record, allRows, currentId, safetyIndex, emailCounts) {
  if (!isExactStatus_(leadValue_(record, LEAD_HEADERS.STATUS), STATUS.APPROVED)) return 'Status is not APPROVED.';
  if (isTrue_(leadValue_(record, LEAD_HEADERS.OPT_OUT))) return 'Opt Out is TRUE.';
  if (!safeDisplayText_(leadValue_(record, LEAD_HEADERS.COMPANY))) return 'Company is required.';
  const email = normalizeEmail_(leadValue_(record, LEAD_HEADERS.EMAIL));
  if (!isValidSingleEmail_(email)) return 'A valid single email is required.';
  if (isConfiguredCcEmail_(email)) return 'Lead email matches an internal CC address.';
  if (hasInitialSuccessEvidence_(record)) return 'Initial-send evidence already exists.';
  if (hasPendingAction_(record)) return 'A pending/uncertain send action exists.';
  const id = currentId || leadId_(record);
  const counts = emailCounts || buildUiEmailCounts_(allRows || []);
  let duplicate = Number(counts[email] || 0) > 1;
  // A proposed email edit is not represented in allRows/emailCounts yet.
  if (!duplicate) {
    duplicate = (allRows || []).some(function (other) {
      return leadId_(other) !== id && normalizeEmail_(leadValue_(other, LEAD_HEADERS.EMAIL)) === email;
    });
  }
  if (duplicate) return 'Another lead row already uses this email address.';
  const blocked = safetyIndex || buildInitialSafetyIndex_(allRows || []);
  if (blocked[email]) return 'Suppression or prior-send evidence exists for this email.';
  return '';
}

function uiBulkApprove(leadIds) {
  assertUiOwner_();
  return withScriptLock_('UI Bulk Approve', function () {
    assertCondition_(Array.isArray(leadIds) && leadIds.length > 0, 'Select at least one lead.');
    assertCondition_(leadIds.length <= 100, 'Approve no more than 100 leads at once.');
    const sheet = getLeadsSheet_();
    const rows = getLeadRows_(sheet);
    assertUniqueLeadIds_(rows);
    const safetyIndex = buildInitialSafetyIndex_(rows);
    const emailCounts = buildUiEmailCounts_(rows);
    const approved = [];
    const rejected = [];
    leadIds.forEach(function (rawId) {
      const id = validateUiLeadId_(rawId);
      try {
        const record = refreshLeadById_(sheet, id);
        const proposed = {};
        proposed[LEAD_HEADERS.STATUS] = STATUS.APPROVED;
        const candidate = cloneRecordWithUpdates_(record, proposed);
        const issue = getInitialApprovalIssue_(candidate, rows, id, safetyIndex, emailCounts);
        assertCondition_(!issue, issue);
        updateLeadFieldsById_(sheet, id, {
          [LEAD_HEADERS.STATUS]: STATUS.APPROVED,
          [LEAD_HEADERS.UPDATED_AT]: new Date()
        }, false);
        approved.push(id);
        safeLogEvent_(leadValue_(record, LEAD_HEADERS.COMPANY), leadValue_(record, LEAD_HEADERS.EMAIL),
          'APPROVE', 'SUCCESS', 'Lead explicitly approved in the private operator console; no email was sent by this action.');
      } catch (error) {
        rejected.push({ id: id, message: errorMessage_(error) });
      }
    });
    SpreadsheetApp.flush();
    return { approved: approved, rejected: rejected };
  });
}

function uiImportLeads(rawText) {
  assertUiOwner_();
  return withScriptLock_('UI Import Leads', function () {
    const text = String(rawText || '').trim();
    assertCondition_(text.length > 0, 'Paste at least one email or CSV row.');
    assertCondition_(text.length <= CONFIG.UI.MAX_IMPORT_CHARACTERS, 'Import text is too large.');
    const parsed = Utilities.parseCsv(text);
    assertCondition_(parsed.length <= CONFIG.UI.MAX_IMPORT_ROWS + 1,
      'Import exceeds the configured row limit of ' + CONFIG.UI.MAX_IMPORT_ROWS + '.');
    const sheet = getLeadsSheet_();
    const headerMap = getHeaderMap_(sheet, ALL_LEAD_HEADERS);
    const existingRows = getLeadRows_(sheet);
    const seen = {};
    existingRows.forEach(function (record) {
      const email = normalizeEmail_(leadValue_(record, LEAD_HEADERS.EMAIL));
      if (email) seen[email] = true;
    });

    let sourceRows = parsed;
    let importMap = null;
    if (parsed.length) {
      const normalizedHeaders = parsed[0].map(function (value) {
        return safeDisplayText_(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
      });
      const emailIndex = normalizedHeaders.indexOf('email');
      if (emailIndex !== -1) {
        importMap = {
          company: normalizedHeaders.indexOf('company'),
          contactName: normalizedHeaders.indexOf('contactname'),
          email: emailIndex,
          category: normalizedHeaders.indexOf('category'),
          website: normalizedHeaders.indexOf('website'),
          personalization: normalizedHeaders.indexOf('personalization'),
          notes: normalizedHeaders.indexOf('notes')
        };
        sourceRows = parsed.slice(1);
      }
    }

    const output = [];
    const skipped = [];
    sourceRows.forEach(function (row, index) {
      const valueAt = function (key, fallbackIndex) {
        const column = importMap ? importMap[key] : fallbackIndex;
        return column >= 0 && column < row.length ? row[column] : '';
      };
      const oneColumn = !importMap && row.length === 1;
      const company = oneColumn ? '' : sanitizeUiText_(valueAt('company', 0), 200);
      const email = normalizeEmail_(oneColumn ? row[0] : valueAt('email', 1));
      const sourceRowNumber = index + (importMap ? 2 : 1);
      if (!isValidSingleEmail_(email)) {
        skipped.push({ row: sourceRowNumber, value: truncate_(safeDisplayText_(email), 120), reason: 'Invalid email' });
        return;
      }
      if (seen[email]) {
        skipped.push({ row: sourceRowNumber, value: email, reason: 'Duplicate email' });
        return;
      }
      seen[email] = true;
      const values = new Array(sheet.getLastColumn()).fill('');
      const set = function (header, value) { values[headerMap[header] - 1] = value; };
      set(LEAD_HEADERS.COMPANY, safeSheetText_(company));
      set(LEAD_HEADERS.CONTACT_NAME, safeSheetText_(sanitizeUiText_(valueAt('contactName', -1), 160)));
      set(LEAD_HEADERS.EMAIL, email);
      set(LEAD_HEADERS.NORMALIZED_EMAIL, email);
      set(LEAD_HEADERS.CATEGORY, safeSheetText_(sanitizeUiText_(valueAt('category', 2), 160)));
      set(LEAD_HEADERS.WEBSITE, safeSheetText_(sanitizeUiText_(valueAt('website', -1), 500)));
      set(LEAD_HEADERS.PERSONALIZATION, safeSheetText_(sanitizeUiMultilineText_(valueAt('personalization', -1), 1200)));
      set(LEAD_HEADERS.NOTES, safeSheetText_(sanitizeUiMultilineText_(valueAt('notes', -1), 2000)));
      set(LEAD_HEADERS.STATUS, STATUS.NEW);
      set(LEAD_HEADERS.OPT_OUT, false);
      set(LEAD_HEADERS.LEAD_ID, Utilities.getUuid());
      set(LEAD_HEADERS.UPDATED_AT, new Date());
      output.push(values);
    });

    if (output.length) {
      const startRow = sheet.getLastRow() + 1;
      ensureGridSize_(sheet, startRow + output.length - 1, sheet.getLastColumn());
      sheet.getRange(startRow, 1, output.length, sheet.getLastColumn()).setValues(output);
      SpreadsheetApp.flush();
    }
    safeLogEvent_('', '', 'IMPORT', 'SUCCESS', output.length + ' NEW lead(s) imported; ' + skipped.length + ' row(s) skipped. No lead was approved or emailed.');
    return { imported: output.length, skipped: skipped.slice(0, 100) };
  });
}

function uiRunJob(jobName, confirmation) {
  assertUiOwner_();
  const job = String(jobName || '').trim().toUpperCase();
  const mode = getExecutionMode_();
  const phrase = String(confirmation || '').trim().toUpperCase();
  if (mode === 'LIVE') {
    const expected = job === 'INITIALS' ? 'SEND APPROVED' :
      (job === 'FOLLOW_UPS' ? 'SEND FOLLOW UPS' : 'CHECK REPLIES');
    assertCondition_(phrase === expected, 'Live action refused: confirmation phrase did not match.');
  } else if (mode === 'TEST') {
    assertCondition_(phrase === 'SEND TEST', 'Redirected test action refused: confirmation phrase did not match.');
  }
  if (job === 'INITIALS') return sendApprovedLeads();
  if (job === 'FOLLOW_UPS') return processFollowUps();
  if (job === 'REPLIES') return checkReplies();
  throw new Error('Unknown outreach job.');
}

function uiEmergencyDisable() {
  assertUiOwner_();
  const disableNonce = requestSystemDisable_();
  let deleted = 0;
  let warning = '';
  try { clearAuthorizedTriggers_(); } catch (error) { warning = errorMessage_(error); }
  try { deleted = deleteOwnedTriggers_(); } catch (error) {
    warning += (warning ? ' ' : '') + errorMessage_(error);
  }
  safeLogEvent_('', '', 'DISABLE_AUTOMATION', warning ? 'WARNING' : 'SUCCESS',
    'Private console enabled the kill switch and removed ' + deleted + ' owned trigger(s).' +
    (warning ? ' ' + warning : ''));
  return {
    systemDisabled: true,
    deletedTriggers: deleted,
    requestId: disableNonce.slice(0, 8),
    warning: warning
  };
}

function validateUiLeadId_(value) {
  const id = String(value || '').trim();
  assertCondition_(/^[A-Za-z0-9_-]{8,100}$/.test(id), 'Lead ID is missing or invalid.');
  return id;
}

function sanitizeUiText_(value, maxLength) {
  return truncate_(safeDisplayText_(value), maxLength);
}

function sanitizeUiMultilineText_(value, maxLength) {
  return truncate_(String(value || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim(), maxLength);
}

function safeSheetText_(value) {
  const text = String(value || '');
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}
