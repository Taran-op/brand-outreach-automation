/**
 * Safe unit checks for deterministic logic only. This function never calls
 * Gmail, creates drafts, changes leads, or consumes send quota.
 */
function runSelfTests() {
  const tests = [
    function () { assertCondition_(isValidSingleEmail_('partnerships@example.com'), 'valid email rejected'); },
    function () { assertCondition_(isValidSingleEmail_('Name+events@sub.example.co.in'), 'plus/subdomain email rejected'); },
    function () { assertCondition_(!isValidSingleEmail_('a@example.com,b@example.com'), 'email list accepted'); },
    function () { assertCondition_(!isValidSingleEmail_('a@example.com\r\nBcc: other@example.com'), 'header injection accepted as email'); },
    function () { assertCondition_(!isValidSingleEmail_('a@example'), 'domain without public-style suffix accepted'); },
    function () { assertCondition_(normalizeEmail_('  A@Example.COM ') === 'a@example.com', 'normalization failed'); },
    function () {
      const cc = getConfiguredCcEmails_();
      assertCondition_(emailListsMatchAsSets_(cc, CONFIG.SENDER.CC_EMAILS), 'configured internal CC list is incorrect');
      assertCondition_(recipientUnitsPerMessage_() === 1 + cc.length, 'To + CC recipient-unit count is incorrect');
      assertCondition_(!emailListsMatchAsSets_(cc, cc.slice(0, -1)), 'missing CC was accepted');
    },
    function () {
      const raw = buildRawMime_({
        to: 'brand@example.com',
        cc: getConfiguredCcEmails_(),
        subject: 'CC safety test',
        plainBody: 'Plain body',
        htmlBody: '<p>HTML body</p>',
        leadId: 'lead-test',
        action: ACTION.INITIAL,
        attemptId: 'attempt-test'
      });
      const padding = raw.length % 4 ? new Array(5 - (raw.length % 4)).join('=') : '';
      const decoded = Utilities.newBlob(
        Utilities.base64DecodeWebSafe(raw + padding)
      ).getDataAsString('UTF-8');
      assertCondition_(decoded.indexOf('Cc: ' + getConfiguredCcEmails_().join(', ') + '\r\n') !== -1,
        'MIME CC header is missing or incorrect');
      assertCondition_(decoded.indexOf('\r\nBcc:') === -1, 'MIME unexpectedly contains BCC');
    },
    function () {
      assertCondition_(isExactStatus_('APPROVED', STATUS.APPROVED), 'exact approval was rejected');
      assertCondition_(!isExactStatus_('approved', STATUS.APPROVED), 'lowercase approval authorized a send');
      assertCondition_(!isExactStatus_(' APPROVED ', STATUS.APPROVED), 'padded approval authorized a send');
    },
    function () {
      assertCondition_(isDirectInstallableTriggerEvent_({ triggerUid: 'legacy-trigger' }), 'direct trigger event was not recognized');
      assertCondition_(!isDirectInstallableTriggerEvent_({}), 'ordinary manual call was mistaken for a trigger');
      assertCondition_(!isDirectInstallableTriggerEvent_({
        source: 'SCHEDULED_WRAPPER',
        authorizedTriggerUid: 'current-id'
      }), 'trusted wrapper context was mistaken for a direct trigger event');
      assertCondition_(isAuthorizedTriggerIdentity_(
        { 'current-id': 'scheduledSendApprovedLeads' },
        'current-id',
        'scheduledSendApprovedLeads'
      ), 'authorized trigger identity was rejected');
      assertCondition_(!isAuthorizedTriggerIdentity_(
        { 'old-id': 'scheduledSendApprovedLeads' },
        'queued-old-id',
        'scheduledSendApprovedLeads'
      ), 'stale queued trigger identity was accepted');
    },
    function () { assertCondition_(resolveCategoryTemplate_('Gaming Peripherals') === CATEGORY_TEMPLATES.GAMING_HARDWARE, 'gaming category failed'); },
    function () { assertCondition_(resolveCategoryTemplate_('SaaS / AI') === CATEGORY_TEMPLATES.TECHNOLOGY, 'technology category failed'); },
    function () { assertCondition_(resolveCategoryTemplate_('Food / FMCG') === CATEGORY_TEMPLATES.FMCG_BEVERAGE, 'FMCG category failed'); },
    function () { assertCondition_(resolveCategoryTemplate_('Gaming Community') === CATEGORY_TEMPLATES.CREATOR_COMMUNITY, 'gaming community category failed'); },
    function () { assertCondition_(containsStrongOptOut_('Please remove me from this list.'), 'opt-out phrase missed'); },
    function () { assertCondition_(!containsStrongOptOut_('Thanks, please send the details.'), 'normal reply misclassified'); },
    function () {
      const top = getTopUnquotedText_('Thanks, please send details.\n\nOn Tue, Taran wrote:\nIf you prefer, reply opt out.');
      assertCondition_(!containsStrongOptOut_(top), 'quoted outreach opt-out caused a false positive');
    },
    function () {
      const text = stripHtml_('<div>Thanks, please send details.</div><blockquote>If you prefer, reply opt out.</blockquote>');
      assertCondition_(!containsStrongOptOut_(getTopUnquotedText_(text)), 'HTML blockquote caused a false opt-out');
    },
    function () {
      const top = getTopUnquotedText_('Sounds useful.\n\nFrom: Taran <t@example.com>\nSent: Tuesday\nTo: Brand\nSubject: Event\nReply opt out');
      assertCondition_(!containsStrongOptOut_(top), 'Outlook quoted block caused a false opt-out');
    },
    function () {
      const top = getTopUnquotedText_('Thanks, please send the deck.\n\nLe message précédent suit.\nIf you would prefer not to receive further messages about this event, reply “opt out” and we will update our list.');
      assertCondition_(!containsStrongOptOut_(top), 'localized quote retained our own opt-out footer');
    },
    function () {
      const top = getTopUnquotedText_('Thanks, please send the deck.\n\nRéponse précédente:\nIf you would prefer not to receive\n| further messages about this\n| event, reply “opt out”.');
      assertCondition_(!containsStrongOptOut_(top), 'wrapped localized quote retained our own opt-out footer');
    },
    function () {
      assertCondition_(containsStrongOptOut_(getTopUnquotedText_('Please opt out.\n\nIf you would prefer not to receive further messages about this event, reply “opt out”.')),
        'explicit opt-out before our quoted footer was missed');
    },
    function () {
      const record = makeSelfTestLead_({
        Company: 'Example Gear',
        Email: 'brand@example.com',
        Category: 'PC Hardware',
        Personalization: 'your hands-on product demos are a natural match'
      });
      const message = buildEmailForLead_(record, ACTION.INITIAL);
      assertCondition_(message.to === 'brand@example.com', 'template recipient failed');
      assertCondition_(emailListsMatchAsSets_(message.cc, getConfiguredCcEmails_()), 'template CC recipients failed');
      assertCondition_(message.subject.indexOf('Example Gear') !== -1, 'company missing from subject');
      assertCondition_(message.plainBody.indexOf('hands-on product demos') !== -1, 'personalization missing');
      assertCondition_(message.plainBody.toLowerCase().indexOf('opt out') !== -1, 'opt-out line missing');
      assertCondition_(message.plainBody.indexOf('taking place in January 2027 in India') !== -1,
        'configured month/year event timing is missing');
      assertCondition_(message.plainBody.indexOf('30–31') === -1, 'unconfirmed exact dates leaked into the email');
      assertCondition_(message.plainBody.indexOf('\nBest,\nTaran\ntaran@asaiverse.com\n\n') !== -1,
        'minimal sender signature is incorrect');
    },
    function () {
      const record = makeSelfTestLead_({
        Company: 'Example',
        Email: 'brand@example.com',
        Personalization: '<script>alert("x")</script>'
      });
      const message = buildEmailForLead_(record, ACTION.INITIAL);
      assertCondition_(message.htmlBody.indexOf('<script>') === -1, 'personalization was not HTML escaped');
      assertCondition_(message.htmlBody.indexOf('&lt;script&gt;') !== -1, 'escaped personalization missing');
    },
    function () {
      const initial = new Date('2027-01-01T18:00:00.000Z'); // 23:30 in Asia/Kolkata.
      const dayFourMorning = new Date('2027-01-05T04:30:00.000Z'); // 10:00, under 96 elapsed hours.
      const record = makeSelfTestLead_({
        Company: 'Example',
        Email: 'brand@example.com',
        Status: STATUS.SENT,
        'Initial Sent At': initial,
        'Initial Message ID': 'abc',
        'Sent To Email': 'brand@example.com'
      });
      assertCondition_(getDueFollowUpAction_(record, dayFourMorning) === ACTION.FOLLOW_UP_1, 'calendar day-4 follow-up eligibility failed');
    },
    function () {
      const tenDaysAgo = new Date(Date.now() - 10 * MILLIS_PER_DAY);
      const oneDayAgo = new Date(Date.now() - 1 * MILLIS_PER_DAY);
      const record = makeSelfTestLead_({
        Company: 'Example',
        Email: 'brand@example.com',
        Status: STATUS.FOLLOW_UP_1,
        'Initial Sent At': tenDaysAgo,
        'Follow-up 1 Sent At': oneDayAgo,
        'Initial Message ID': 'abc',
        'Follow-up 1 Message ID': 'def',
        'Sent To Email': 'brand@example.com'
      });
      assertCondition_(getDueFollowUpAction_(record, new Date()) === null, 'minimum F1-to-F2 gap was ignored');
    },
    function () {
      const original = new Array(121).join('é');
      const encoded = encodeHeaderWord_(original);
      encoded.split('\r\n ').forEach(function (word) {
        assertCondition_(word.length <= 75, 'RFC 2047 encoded-word exceeds 75 characters');
      });
      assertCondition_(decodeRfc2047Header_(encoded) === original, 'folded RFC 2047 subject did not round-trip');
    },
    function () {
      assertCondition_(isValidIsoCalendarDate_('2027-01-31'), 'valid cutoff date rejected');
      assertCondition_(!isValidIsoCalendarDate_('2027-02-29'), 'invalid cutoff date accepted');
    },
    function () {
      const record = makeSelfTestLead_({
        'Initial Sent At': new Date(),
        'Initial Message ID': 'abc',
        'Sent To Email': 'brand@example.com',
        'Campaign ID': 'OLD_CAMPAIGN'
      });
      assertCondition_(getEvidenceConsistencyIssue_(record).indexOf('Campaign ID') !== -1, 'campaign mismatch was not quarantined');
    },
    function () {
      const record = makeSelfTestLead_({ 'Pending Recipient': 'brand@example.com' });
      assertCondition_(hasPendingAction_(record), 'pending recipient alone did not fail closed');
    },
    function () {
      const record = makeSelfTestLead_({
        Status: STATUS.SENT,
        'Initial Message ID': 'abc',
        'Pending Action': ACTION.FOLLOW_UP_1,
        'Pending Recipient': 'brand@example.com'
      });
      assertCondition_(!shouldCheckRepliesForRecord_(record), 'reply worker accepted a row that still needs send reconciliation');
    },
    function () {
      const record = makeSelfTestLead_({
        Status: STATUS.INTERESTED,
        'Initial Message ID': 'abc',
        'Sent To Email': 'brand@example.com'
      });
      assertCondition_(shouldCheckRepliesForRecord_(record), 'later opt-out monitoring stopped after INTERESTED');
    },
    function () {
      const record = makeSelfTestLead_({
        Status: STATUS.DO_NOT_CONTACT,
        'Initial Message ID': 'abc',
        'Sent To Email': 'brand@example.com',
        'Opt Out': true
      });
      assertCondition_(!shouldCheckRepliesForRecord_(record), 'already suppressed row remained a reply-scan candidate');
    }
  ];

  const failures = [];
  tests.forEach(function (test, index) {
    try {
      test();
    } catch (error) {
      failures.push('Test ' + (index + 1) + ': ' + errorMessage_(error));
    }
  });
  const message = failures.length
    ? failures.length + ' of ' + tests.length + ' checks failed:\n\n' + failures.join('\n')
    : 'All ' + tests.length + ' deterministic checks passed. No email was sent and no lead data was changed.';
  try {
    SpreadsheetApp.getUi().alert('Brand Outreach self-tests', message, SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (uiError) {
    console.log('Brand Outreach self-tests: ' + message);
  }
  if (failures.length) throw new Error(message);
  return { passed: tests.length, failed: 0 };
}

function makeSelfTestLead_(valuesByHeader) {
  const headerMap = {};
  const values = [];
  ALL_LEAD_HEADERS.forEach(function (header, index) {
    headerMap[header] = index + 1;
    values[index] = Object.prototype.hasOwnProperty.call(valuesByHeader, header)
      ? valuesByHeader[header]
      : '';
  });
  return { rowNumber: 2, headerMap: headerMap, values: values };
}
