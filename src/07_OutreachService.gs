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
    ['MAX_IMPORT_ROWS', CONFIG.UI.MAX_IMPORT_ROWS],
    ['MAX_IMPORT_COLUMNS', CONFIG.UI.MAX_IMPORT_COLUMNS],
    ['MAX_IMPORT_CHARACTERS', CONFIG.UI.MAX_IMPORT_CHARACTERS],
    ['MAX_IMPORT_FILE_BYTES', CONFIG.UI.MAX_IMPORT_FILE_BYTES],
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
