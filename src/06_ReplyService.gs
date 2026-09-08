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
