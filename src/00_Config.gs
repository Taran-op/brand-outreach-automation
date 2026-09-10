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
    MAX_IMPORT_COLUMNS: 40,
    MAX_IMPORT_CHARACTERS: 300000,
    MAX_IMPORT_FILE_BYTES: 5 * 1024 * 1024
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
