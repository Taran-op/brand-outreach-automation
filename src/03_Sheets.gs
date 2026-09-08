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
