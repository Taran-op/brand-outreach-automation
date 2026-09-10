/**
 * Port of src/00_Config.gs for the Next.js console.
 *
 * Values that differ per environment (which Sheet, who may sign in) come from
 * environment variables so the same build can serve preview and production.
 * Campaign copy and safety limits stay in source, exactly as they do in the
 * Apps Script project, so changing them remains a reviewed code change.
 */

const requiredEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
};

const listEnv = (name: string): string[] =>
  (process.env[name] || '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

export const CONFIG = {
  CAMPAIGN_ID: 'ASAIVERSE_2027_BRAND_OUTREACH_V1',
  TIME_ZONE: 'Asia/Kolkata',

  EVENT: {
    NAME: 'AsaiVerse',
    ONE_LINE_DESCRIPTION:
      'a two-day esports, gaming, technology, creator and entertainment event',
    DATE_PREPOSITION: 'in',
    DATE_DISPLAY: 'January 2027',
    LOCATION_DISPLAY: 'India',
    ORGANIZATION: 'Asaiverse'
  },

  CAMPAIGN_SEND_CUTOFF_ISO: '2027-01-31',

  SENDER: {
    NAME: 'Taran',
    TITLE: 'Lead – Brand Connect',
    SIGN_OFF: 'Warm regards,',
    PHONE: '',
    BUSINESS_EMAIL: 'taran@asaiverse.com',
    FROM_EMAIL: 'taran@asaiverse.com',
    REPLY_TO_EMAIL: 'taran@asaiverse.com',
    CC_EMAILS: ['ashish@asaiverse.com', 'gaurav@asaiverse.com']
  },

  SHEETS: {
    LEADS_NAME: 'Leads',
    LOG_NAME: 'Outreach Log'
  },

  UI: {
    TITLE: 'Brand Outreach Console',
    MAX_LEADS_RETURNED: 500,
    MAX_LOG_ROWS: 80,
    MAX_IMPORT_ROWS: 500,
    MAX_IMPORT_COLUMNS: 40,
    MAX_IMPORT_CHARACTERS: 300000,
    MAX_IMPORT_FILE_BYTES: 5 * 1024 * 1024
  },

  FOLLOW_UP: {
    FIRST_AFTER_DAYS_FROM_INITIAL: 4,
    SECOND_AFTER_DAYS_FROM_INITIAL: 9,
    SECOND_MIN_DAYS_AFTER_FIRST: 3
  },

  SAFETY: {
    /**
     * Sending is armed by the CONSOLE_SENDS_ENABLED environment variable, not
     * by source, so a deploy alone can never make this console capable of
     * delivery. These caps then bound what an armed run may do; they mirror
     * the Apps Script values deliberately.
     */
    DAILY_SEND_LIMIT: 1,
    MAX_INITIALS_PER_RUN: 1,
    MAX_FOLLOW_UPS_PER_RUN: 1,
    MAX_REPLY_CHECKS_PER_RUN: 50,
    MAX_LOG_MESSAGE_LENGTH: 500
  }
} as const;

/** Google accounts permitted to use the console, lowercase. */
export const allowedEmails = (): string[] => {
  const configured = listEnv('CONSOLE_ALLOWED_EMAILS');
  if (!configured.length) {
    throw new Error('CONSOLE_ALLOWED_EMAILS must list at least one Google account.');
  }
  return configured;
};

/**
 * Gmail ignores dots in the local part, so taran.devx@gmail.com and
 * tarandevx@gmail.com are the same mailbox. Google may return either form,
 * and a plain string compare would lock the operator out of their own
 * console. Only gmail.com/googlemail.com get this treatment — dots are
 * significant everywhere else.
 */
const canonicalEmail = (value: string): string => {
  const email = String(value || '').trim().toLowerCase();
  const at = email.lastIndexOf('@');
  if (at < 1) return email;

  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (domain !== 'gmail.com' && domain !== 'googlemail.com') return email;

  // A Gmail "+tag" suffix also routes to the same mailbox.
  const untagged = local.split('+')[0];
  return `${untagged.replace(/\./g, '')}@gmail.com`;
};

export const isAllowedEmail = (value: unknown): boolean => {
  const candidate = canonicalEmail(String(value ?? ''));
  if (!candidate) return false;
  return allowedEmails().some((allowed) => canonicalEmail(allowed) === candidate);
};

/**
 * The account whose Gmail mailbox *is* the campaign mailbox.
 *
 * Every operator acts as themselves, so mail operations are not
 * interchangeable between them: a send from a colleague would leave their
 * mailbox with the wrong Send-As, and a reply scan run by a colleague would
 * search their inbox for threads that live in the owner's. Mail operations are
 * therefore restricted to this one account, while lead management stays open
 * to everyone on the allowlist. Defaults to the first allowlisted address.
 */
export const mailboxOwner = (): string => {
  const configured = String(process.env.CONSOLE_MAILBOX_OWNER || '').trim().toLowerCase();
  return configured || allowedEmails()[0];
};

export const isMailboxOwner = (value: unknown): boolean => {
  const candidate = String(value ?? '').trim().toLowerCase();
  return Boolean(candidate) && canonicalEmail(candidate) === canonicalEmail(mailboxOwner());
};

/** Spreadsheet that remains the source of truth and approval ledger. */
export const spreadsheetId = (): string => requiredEnv('SHEET_ID');

export const spreadsheetUrl = (): string =>
  `https://docs.google.com/spreadsheets/d/${spreadsheetId()}/edit`;
