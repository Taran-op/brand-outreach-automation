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
