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
    imports: {
      maxRows: Number(CONFIG.UI.MAX_IMPORT_ROWS),
      maxFileBytes: Number(CONFIG.UI.MAX_IMPORT_FILE_BYTES)
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
  const text = String(rawText || '').trim();
  assertCondition_(text.length > 0, 'Paste at least one email or CSV row.');
  assertCondition_(text.length <= CONFIG.UI.MAX_IMPORT_CHARACTERS, 'Import text is too large.');
  const parsed = Utilities.parseCsv(text);
  return withScriptLock_('UI Import Leads', function () {
    return importLeadRows_(parsed, 'PASTE');
  });
}

/**
 * Receives rows parsed locally by the private React console. The original
 * workbook is never uploaded to Drive or stored by Apps Script.
 */
function uiImportWorkbook(payload) {
  assertUiOwner_();
  const workbook = validateWorkbookImportPayload_(payload);
  return withScriptLock_('UI Import Workbook', function () {
    return importLeadRows_(workbook.rows, 'XLSX');
  });
}

function validateWorkbookImportPayload_(payload) {
  assertCondition_(payload && typeof payload === 'object', 'Choose an .xlsx file first.');
  const fileName = sanitizeUiText_(payload.fileName, 180);
  const sheetName = sanitizeUiText_(payload.sheetName, 120);
  assertCondition_(/\.xlsx$/i.test(fileName), 'Only .xlsx files are accepted.');
  assertCondition_(sheetName.length > 0, 'Choose a worksheet to import.');
  assertCondition_(Array.isArray(payload.rows) && payload.rows.length > 0, 'The selected worksheet is empty.');
  assertCondition_(payload.rows.length <= CONFIG.UI.MAX_IMPORT_ROWS + 1,
    'Import exceeds the configured row limit of ' + CONFIG.UI.MAX_IMPORT_ROWS + '.');

  let characterCount = 0;
  const rows = payload.rows.map(function (row, rowIndex) {
    assertCondition_(Array.isArray(row), 'Workbook row ' + (rowIndex + 1) + ' is invalid.');
    assertCondition_(row.length <= CONFIG.UI.MAX_IMPORT_COLUMNS,
      'Workbook row ' + (rowIndex + 1) + ' exceeds the configured column limit.');
    return row.map(function (cell) {
      assertCondition_(cell === null || ['string', 'number', 'boolean'].indexOf(typeof cell) !== -1,
        'Workbook contains an unsupported cell value.');
      const value = cell === null ? '' : String(cell);
      characterCount += value.length;
      return truncate_(value, 4000);
    });
  });
  assertCondition_(characterCount <= CONFIG.UI.MAX_IMPORT_CHARACTERS,
    'The selected worksheet contains too much text to import safely.');
  return { fileName: fileName, sheetName: sheetName, rows: rows };
}

const IMPORT_HEADER_ALIASES = Object.freeze({
  company: Object.freeze(['company', 'companyname', 'brand', 'brandname']),
  contactName: Object.freeze(['contactname', 'contactperson', 'contactpersonname', 'recipientname']),
  email: Object.freeze(['email', 'emailaddress', 'workemail', 'businessemail', 'contactemail']),
  category: Object.freeze(['category', 'brandcategory', 'productcategory', 'segment', 'industry']),
  website: Object.freeze(['website', 'websiteurl', 'companywebsite', 'brandwebsite', 'url', 'site']),
  personalization: Object.freeze(['personalization', 'personalisation', 'customline', 'openingline']),
  notes: Object.freeze(['notes', 'note', 'remarks', 'details', 'description', 'productnotes', 'focus']),
  contact: Object.freeze(['contact', 'contactinfo', 'contactdetails', 'contactmethod', 'contactleadsource', 'leadsource', 'outreachmethod']),
  india: Object.freeze(['india', 'indiapresence', 'indiaavailability', 'availableinindia', 'availabilityinindia'])
});

function normalizeImportHeader_(value) {
  return safeDisplayText_(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function findImportColumn_(headers, aliases) {
  for (let i = 0; i < aliases.length; i += 1) {
    const index = headers.indexOf(aliases[i]);
    if (index !== -1) return index;
  }
  return -1;
}

function detectImportLayout_(rows) {
  const firstRow = rows.length ? rows[0] : [];
  const headers = firstRow.map(normalizeImportHeader_);
  const map = {};
  Object.keys(IMPORT_HEADER_ALIASES).forEach(function (key) {
    map[key] = findImportColumn_(headers, IMPORT_HEADER_ALIASES[key]);
  });
  const recognized = Object.keys(map).filter(function (key) { return map[key] >= 0; }).length;
  if (recognized >= 2 || map.email >= 0) return { map: map, headerRows: 1, kind: 'HEADER' };

  // Supports the common research-list layout:
  // Row #, Category, Company, Website, Contact/Lead Source, India, Notes.
  if (firstRow.length >= 7 && /^\d+$/.test(safeDisplayText_(firstRow[0])) &&
      /\.[a-z]{2,}(?:\/|$)/i.test(safeDisplayText_(firstRow[3]))) {
    return {
      map: { company: 2, contactName: -1, email: -1, category: 1, website: 3,
        personalization: -1, notes: 6, contact: 4, india: 5 },
      headerRows: 0,
      kind: 'RESEARCH_LIST'
    };
  }

  return {
    map: { company: 0, contactName: -1, email: 1, category: 2, website: -1,
      personalization: -1, notes: -1, contact: -1, india: -1 },
    headerRows: 0,
    kind: 'BASIC'
  };
}

function extractImportEmail_(value) {
  const candidates = String(value || '').match(/[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,63}/ig) || [];
  for (let i = 0; i < candidates.length; i += 1) {
    const email = normalizeEmail_(candidates[i]);
    if (isValidSingleEmail_(email)) return email;
  }
  return '';
}

function normalizeImportWebsite_(value) {
  const website = sanitizeUiText_(value, 500);
  if (!website) return '';
  if (/^https?:\/\/[^\s]+$/i.test(website)) return website;
  if (/^(?:www\.)?[a-z0-9][a-z0-9.\-]*\.[a-z]{2,}(?:\/[^\s]*)?$/i.test(website)) return 'https://' + website;
  return '';
}

function canonicalizeImportedCategory_(value) {
  const original = safeDisplayText_(value);
  const exact = CATEGORY_VALUES.filter(function (category) {
    return category.toLowerCase() === original.toLowerCase();
  });
  if (exact.length) return exact[0];
  const text = original.toLowerCase();
  if (/creator|streamer|entertainment|comic|anime|media|music/.test(text)) return 'Creator / Entertainment';
  if (/communit/.test(text)) return 'Gaming Community';
  if (/mouse|mice|mousepad|deskmat|keyboard|chair|desk|controller|gaming access|peripheral/.test(text)) return 'Gaming Accessories';
  if (/\bpc\b|hardware|processor|graphics|gpu|motherboard|memory|storage/.test(text)) return 'PC Hardware';
  if (/laptop|notebook/.test(text)) return 'Laptops';
  if (/smartphone|mobile phone/.test(text)) return 'Smartphones';
  if (/audio|headphone|headset|speaker|microphone/.test(text)) return 'Audio';
  if (/consumer electronic/.test(text)) return 'Consumer Electronics';
  if (/saas|\bai\b|artificial intelligence|software/.test(text)) return 'SaaS / AI';
  if (/telecom|internet|\bisp\b/.test(text)) return 'Telecom / Internet';
  if (/startup|technology|\btech\b/.test(text)) return 'Technology Startup';
  if (/beverage|drink/.test(text)) return 'Beverage';
  if (/food|fmcg|snack|nutrition/.test(text)) return 'Food / FMCG';
  if (/fashion|streetwear|lifestyle|apparel|beauty/.test(text)) return 'Fashion / Streetwear';
  if (/automotive|automobile|mobility|vehicle|motorcycle|\bev\b/.test(text)) return 'Automotive';
  if (/education|edtech|learning|career|upskill/.test(text)) return 'Education / EdTech';
  return original ? 'Other' : '';
}

function importDuplicateKey_(company, email, website) {
  if (email) return 'EMAIL:' + normalizeEmail_(email);
  const normalizedCompany = safeDisplayText_(company).toLowerCase();
  if (!normalizedCompany) return '';
  return 'RESEARCH:' + normalizedCompany + '|' + safeDisplayText_(website).toLowerCase();
}

function buildImportedNotes_(rawCategory, category, rawWebsite, website, rawEmail, contact, india, sourceNotes) {
  const parts = [];
  if (rawCategory && category && rawCategory.toLowerCase() !== category.toLowerCase()) {
    parts.push('Source category: ' + rawCategory);
  }
  const rawContact = safeDisplayText_(contact || rawEmail);
  if (rawContact && rawContact.toLowerCase() !== extractImportEmail_(rawContact)) parts.push('Contact: ' + rawContact);
  if (safeDisplayText_(india)) parts.push('India availability: ' + safeDisplayText_(india));
  if (safeDisplayText_(rawWebsite) && !website) parts.push('Website: ' + safeDisplayText_(rawWebsite));
  if (String(sourceNotes || '').trim()) parts.push(String(sourceNotes).trim());
  return sanitizeUiMultilineText_(parts.join('\n'), 2000);
}

function importLeadRows_(parsed, sourceType) {
  assertCondition_(Array.isArray(parsed) && parsed.length > 0, 'The import contains no rows.');
  assertCondition_(parsed.length <= CONFIG.UI.MAX_IMPORT_ROWS + 1,
    'Import exceeds the configured row limit of ' + CONFIG.UI.MAX_IMPORT_ROWS + '.');
  const sheet = getLeadsSheet_();
  const headerMap = getHeaderMap_(sheet, ALL_LEAD_HEADERS);
  const existingRows = getLeadRows_(sheet);
  const seen = {};
  existingRows.forEach(function (record) {
    const company = safeDisplayText_(leadValue_(record, LEAD_HEADERS.COMPANY));
    const email = normalizeEmail_(leadValue_(record, LEAD_HEADERS.EMAIL));
    const website = safeDisplayText_(leadValue_(record, LEAD_HEADERS.WEBSITE));
    const key = importDuplicateKey_(company, email, website);
    if (key) seen[key] = true;
  });

  const layout = detectImportLayout_(parsed);
  const sourceRows = parsed.slice(layout.headerRows);
  const output = [];
  const skipped = [];
  let withoutEmail = 0;
  sourceRows.forEach(function (row, index) {
    if (!Array.isArray(row) || !row.some(function (value) { return safeDisplayText_(value); })) return;
    const valueAt = function (key) {
      const column = layout.map[key];
      return column >= 0 && column < row.length ? row[column] : '';
    };
    const oneColumn = layout.kind === 'BASIC' && row.length === 1;
    const rawEmail = oneColumn ? row[0] : valueAt('email');
    const contact = valueAt('contact');
    const company = oneColumn ? '' : sanitizeUiText_(valueAt('company'), 200);
    const email = extractImportEmail_(rawEmail) || extractImportEmail_(contact);
    const rawWebsite = valueAt('website');
    const website = normalizeImportWebsite_(rawWebsite);
    const rawCategory = sanitizeUiText_(valueAt('category'), 160);
    const category = canonicalizeImportedCategory_(rawCategory);
    const sourceRowNumber = index + layout.headerRows + 1;
    if (!company && !email) {
      skipped.push({ row: sourceRowNumber, value: truncate_(safeDisplayText_(rawEmail || contact), 120), reason: 'Missing company and valid email' });
      return;
    }
    const duplicateKey = importDuplicateKey_(company, email, website);
    if (duplicateKey && seen[duplicateKey]) {
      skipped.push({ row: sourceRowNumber, value: email || company, reason: email ? 'Duplicate email' : 'Duplicate company/website' });
      return;
    }
    if (duplicateKey) seen[duplicateKey] = true;
    if (!email) withoutEmail += 1;
    const notes = buildImportedNotes_(rawCategory, category, rawWebsite, website, rawEmail, contact,
      valueAt('india'), valueAt('notes'));
    const values = new Array(sheet.getLastColumn()).fill('');
    const set = function (header, value) { values[headerMap[header] - 1] = value; };
    set(LEAD_HEADERS.COMPANY, safeSheetText_(company));
    set(LEAD_HEADERS.CONTACT_NAME, safeSheetText_(sanitizeUiText_(valueAt('contactName'), 160)));
    set(LEAD_HEADERS.EMAIL, email);
    set(LEAD_HEADERS.NORMALIZED_EMAIL, email);
    set(LEAD_HEADERS.CATEGORY, safeSheetText_(category));
    set(LEAD_HEADERS.WEBSITE, safeSheetText_(website));
    set(LEAD_HEADERS.PERSONALIZATION, safeSheetText_(sanitizeUiMultilineText_(valueAt('personalization'), 1200)));
    set(LEAD_HEADERS.NOTES, safeSheetText_(notes));
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
  safeLogEvent_('', '', 'IMPORT_' + sourceType, 'SUCCESS', output.length + ' NEW lead(s) imported; ' +
    withoutEmail + ' require email research; ' + skipped.length + ' row(s) skipped. No lead was approved or emailed.');
  return { imported: output.length, withoutEmail: withoutEmail, skipped: skipped.slice(0, 100) };
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
