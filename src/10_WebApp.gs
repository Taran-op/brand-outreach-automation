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
  const issues = collectConfigurationIssues_({ requireMailbox: false, requireSend: false });
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
      mode: getExecutionMode_(),
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
