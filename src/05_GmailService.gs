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
