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
