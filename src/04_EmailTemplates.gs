/**
 * Runtime personalization is deterministic. Category matching and the custom
 * Personalization cell select/insert approved copy; no AI service is used.
 */
const CATEGORY_TEMPLATES = Object.freeze({
  GAMING_HARDWARE: Object.freeze({
    initial: 'The event brings together gamers and esports audiences in an environment designed for hands-on product demos, trials and playable brand experiences—making it a strong setting for gaming and hardware brands.',
    followUp: 'It could be a practical setting for hands-on demos, product trials or a gaming-led activation.'
  }),
  TECHNOLOGY: Object.freeze({
    initial: 'With developers, technology enthusiasts, creators and early adopters attending, the event offers a practical setting for product demonstrations, interactive showcases and conversations with a technology-focused audience.',
    followUp: 'The developer and technology audience could make a product demonstration or interactive showcase especially relevant.'
  }),
  FMCG_BEVERAGE: Object.freeze({
    initial: 'The mix of gaming, creators, live entertainment and community experiences is designed to attract a young, engaged audience, creating opportunities for sampling, high-visibility stalls and memorable physical activations.',
    followUp: 'Sampling, a high-visibility stall or an experiential activation could fit the audience well.'
  }),
  FASHION_LIFESTYLE: Object.freeze({
    initial: 'The event sits at the intersection of youth culture, gaming, creators, music and fandom, creating a relevant space for physical displays, limited drops, retail-led experiences and lifestyle activations.',
    followUp: 'The overlap between youth culture, creators, gaming and live entertainment could support a strong physical display or activation.'
  }),
  AUTOMOTIVE: Object.freeze({
    initial: 'The event combines technology, entertainment and youth culture, offering automotive and mobility brands room for vehicle displays, technology showcases and interactive audience experiences.',
    followUp: 'A vehicle display, technology showcase or interactive mobility experience could be a natural fit.'
  }),
  EDUCATION: Object.freeze({
    initial: 'The audience includes students, developers, creators and technology enthusiasts, creating a relevant environment for career, learning, upskilling and education-led experiences.',
    followUp: 'The student, developer and creator audience could make a learning, careers or upskilling activation relevant.'
  }),
  CREATOR_COMMUNITY: Object.freeze({
    initial: 'Creator meetups, gaming communities, fandom experiences and live entertainment are central to the event, giving community and entertainment brands space to host interactions, showcases and audience-led experiences.',
    followUp: 'A creator, community or fandom-led experience could sit naturally within the event programme.'
  }),
  GENERAL: Object.freeze({
    initial: 'The event brings gamers, creators, developers, technology enthusiasts and youth communities together under one roof, creating room for interactive product showcases and relevant physical brand experiences.',
    followUp: 'The cross-section of gaming, technology, creators and youth culture could support a relevant physical brand experience.'
  })
});

function resolveCategoryTemplate_(category) {
  const text = safeDisplayText_(category).toLowerCase();
  // Community/creator categories are checked before the broad word "gaming"
  // so "Gaming Community" does not receive a hardware-demo template.
  if (/creator|streamer|community|entertainment|comic|anime|media|music/.test(text)) {
    return CATEGORY_TEMPLATES.CREATOR_COMMUNITY;
  }
  if (/gaming|esports|peripheral|\bpc\b|hardware|laptop|smartphone|consumer electronics|accessor|audio/.test(text)) {
    return CATEGORY_TEMPLATES.GAMING_HARDWARE;
  }
  if (/technology|tech startup|startup|saas|\bai\b|software|developer|telecom|internet|\bisp\b|cloud/.test(text)) {
    return CATEGORY_TEMPLATES.TECHNOLOGY;
  }
  if (/fmcg|food|beverage|drink|snack|nutrition/.test(text)) {
    return CATEGORY_TEMPLATES.FMCG_BEVERAGE;
  }
  if (/fashion|streetwear|lifestyle|apparel|beauty|retail/.test(text)) {
    return CATEGORY_TEMPLATES.FASHION_LIFESTYLE;
  }
  if (/automotive|automobile|mobility|motorcycle|\bev\b|vehicle/.test(text)) {
    return CATEGORY_TEMPLATES.AUTOMOTIVE;
  }
  if (/education|edtech|university|college|upskill|learning|career/.test(text)) {
    return CATEGORY_TEMPLATES.EDUCATION;
  }
  return CATEGORY_TEMPLATES.GENERAL;
}

function buildEmailForLead_(record, action) {
  const company = safeDisplayText_(leadValue_(record, LEAD_HEADERS.COMPANY));
  const contactName = safeDisplayText_(leadValue_(record, LEAD_HEADERS.CONTACT_NAME));
  const category = safeDisplayText_(leadValue_(record, LEAD_HEADERS.CATEGORY));
  const personalization = safeDisplayText_(leadValue_(record, LEAD_HEADERS.PERSONALIZATION));
  const currentEmail = normalizeEmail_(leadValue_(record, LEAD_HEADERS.EMAIL));
  const sentToEmail = normalizeEmail_(leadValue_(record, LEAD_HEADERS.SENT_TO_EMAIL));
  const to = action === ACTION.INITIAL ? currentEmail : (sentToEmail || currentEmail);
  const subject = buildInitialSubject_(company);
  const greeting = contactName || (company ? company + ' team' : 'team');
  const template = resolveCategoryTemplate_(category);

  if (action === ACTION.FOLLOW_UP_1) {
    return buildFollowUpOne_(to, subject, greeting, company, template);
  }
  if (action === ACTION.FOLLOW_UP_2) {
    return buildFollowUpTwo_(to, subject, greeting, company, template);
  }
  return buildInitialEmail_(to, subject, greeting, company, personalization, template);
}

function buildInitialSubject_(company) {
  const companyName = safeDisplayText_(company) || 'Your team';
  return truncate_(
    companyName + ' × ' + safeDisplayText_(CONFIG.EVENT.NAME) + ' — Brand Activation Opportunity',
    180
  );
}

function eventOpeningLine_() {
  const location = safeDisplayText_(CONFIG.EVENT.LOCATION_DISPLAY);
  return "I'm reaching out regarding " + safeDisplayText_(CONFIG.EVENT.NAME) +
    ', ' + safeDisplayText_(CONFIG.EVENT.ONE_LINE_DESCRIPTION) + ' taking place on ' +
    safeDisplayText_(CONFIG.EVENT.DATE_DISPLAY) + (location ? ' in ' + location : '') + '.';
}

function customPersonalizationLine_(company, personalization) {
  if (!personalization) return '';
  return 'One reason I thought ' + (company || 'your team') + ' could be a strong fit: ' +
    ensureTerminalPunctuation_(personalization);
}

function buildInitialEmail_(to, subject, greeting, company, personalization, template) {
  const paragraphs = [
    'Hi ' + greeting + ',',
    eventOpeningLine_(),
    template.initial,
    customPersonalizationLine_(company, personalization),
    "We're currently opening exhibition and brand activation spaces for selected brands interested in reaching this audience.",
    "I'd be glad to share our stall options, audience plan and collaboration opportunities if this is relevant for " + (company || 'your team') + '.',
    'Would you be open to a quick conversation?'
  ].filter(Boolean);
  return finishEmail_(to, subject, ACTION.INITIAL, paragraphs);
}

function buildFollowUpOne_(to, subject, greeting, company, template) {
  const paragraphs = [
    'Hi ' + greeting + ',',
    'Just following up on my note about exhibition and brand activation opportunities at ' + safeDisplayText_(CONFIG.EVENT.NAME) + '.',
    template.followUp,
    'Would it be useful if I sent over the stall options, audience plan and possible collaboration formats for ' + (company || 'your team') + '?'
  ];
  return finishEmail_(to, subject, ACTION.FOLLOW_UP_1, paragraphs);
}

function buildFollowUpTwo_(to, subject, greeting, company, template) {
  const paragraphs = [
    'Hi ' + greeting + ',',
    'One final follow-up regarding ' + safeDisplayText_(CONFIG.EVENT.NAME) + ' on ' + safeDisplayText_(CONFIG.EVENT.DATE_DISPLAY) + '.',
    template.followUp,
    'If brand partnerships or physical activations are being planned, I would be happy to share the available options. If it is not relevant right now, no problem at all.'
  ];
  return finishEmail_(to, subject, ACTION.FOLLOW_UP_2, paragraphs);
}

function finishEmail_(to, subject, action, paragraphs) {
  const signatureLines = [
    'Best,',
    safeDisplayText_(CONFIG.SENDER.NAME),
    safeDisplayText_(CONFIG.EVENT.ORGANIZATION),
    safeDisplayText_(CONFIG.SENDER.PHONE),
    safeDisplayText_(CONFIG.SENDER.BUSINESS_EMAIL)
  ].filter(Boolean);
  const optOut = 'If you would prefer not to receive further messages about this event, reply “opt out” and we will update our list.';
  const plainBody = paragraphs.join('\n\n') + '\n\n' + signatureLines.join('\n') + '\n\n' + optOut;

  const htmlParagraphs = paragraphs.map(function (paragraph) {
    return '<p style="margin:0 0 14px 0">' + paragraphToHtml_(paragraph) + '</p>';
  }).join('');
  const htmlSignature = '<p style="margin:0 0 14px 0">' + signatureLines.map(htmlEscape_).join('<br>') + '</p>';
  const htmlOptOut = '<p style="margin:20px 0 0 0;color:#64748b;font-size:12px">' + htmlEscape_(optOut) + '</p>';
  const htmlBody = '<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.55;color:#1f2937">' +
    htmlParagraphs + htmlSignature + htmlOptOut + '</div>';

  return {
    action: action,
    to: to,
    cc: getConfiguredCcEmails_(),
    subject: subject,
    plainBody: plainBody,
    htmlBody: htmlBody
  };
}

function buildTestEnvelope_(message, intendedRecipient) {
  const testRecipient = normalizeEmail_(CONFIG.SAFETY.TEST_RECIPIENT);
  assertCondition_(isValidSingleEmail_(testRecipient), 'TEST_RECIPIENT is invalid.');
  assertCondition_(testRecipient !== normalizeEmail_(intendedRecipient),
    'TEST_RECIPIENT matches the production recipient; redirected test send refused.');
  const notice = 'TEST MODE — Intended production recipient: ' + normalizeEmail_(intendedRecipient) +
    '. No production lead state will be changed.';
  return {
    action: message.action,
    to: testRecipient,
    cc: getConfiguredCcEmails_(),
    subject: sanitizeHeaderValue_(CONFIG.SAFETY.TEST_SUBJECT_PREFIX) + ' [' + message.action + '] ' + message.subject,
    plainBody: notice + '\n\n' + message.plainBody,
    htmlBody: '<div style="padding:10px;margin-bottom:16px;background:#fef3c7;border:1px solid #f59e0b">' +
      htmlEscape_(notice) + '</div>' + message.htmlBody
  };
}

function determinePreviewAction_(record) {
  const status = normalizeStatus_(leadValue_(record, LEAD_HEADERS.STATUS));
  if (status === STATUS.FOLLOW_UP_2 || followUpAlreadySent_(record, ACTION.FOLLOW_UP_2)) return ACTION.FOLLOW_UP_2;
  if (status === STATUS.FOLLOW_UP_1 || followUpAlreadySent_(record, ACTION.FOLLOW_UP_1)) return ACTION.FOLLOW_UP_2;
  if (status === STATUS.SENT || hasInitialSuccessEvidence_(record)) return ACTION.FOLLOW_UP_1;
  return ACTION.INITIAL;
}

function getPreviewWarnings_(record, action, message) {
  const warnings = [];
  const statusValue = leadValue_(record, LEAD_HEADERS.STATUS);
  const status = normalizeStatus_(statusValue);
  if (!isValidSingleEmail_(message.to)) warnings.push('The current TO address is invalid; sending would be refused.');
  if (isValidSingleEmail_(message.to) && isConfiguredCcEmail_(message.to)) {
    warnings.push('The current TO address is also an internal CC; sending would be refused.');
  }
  if (isTrue_(leadValue_(record, LEAD_HEADERS.OPT_OUT))) warnings.push('Opt Out is TRUE; automation will not send.');
  if (AUTOMATION_STOP_STATUSES.indexOf(status) !== -1 || status === STATUS.FOLLOW_UP_2) {
    warnings.push('Status ' + status + ' is not eligible for another automated email.');
  } else if (action === ACTION.INITIAL && !isExactStatus_(statusValue, STATUS.APPROVED)) {
    warnings.push('Initial email requires exact Status APPROVED; current value is ' + (String(statusValue || '') || '(blank)') + '.');
  } else if (action === ACTION.FOLLOW_UP_1 && !isExactStatus_(statusValue, STATUS.SENT)) {
    warnings.push('Follow-up 1 requires exact Status SENT; current value is ' + (String(statusValue || '') || '(blank)') + '.');
  } else if (action === ACTION.FOLLOW_UP_2 && !isExactStatus_(statusValue, STATUS.FOLLOW_UP_1)) {
    warnings.push('Follow-up 2 requires exact Status FOLLOW_UP_1; current value is ' + (String(statusValue || '') || '(blank)') + '.');
  }
  if (hasPendingAction_(record)) warnings.push('A pending send guard exists; automatic sending is paused.');
  return warnings;
}

function previewSelectedEmail() {
  const selected = getSelectedLead_();
  const action = determinePreviewAction_(selected.record);
  const message = buildEmailForLead_(selected.record, action);
  const warnings = getPreviewWarnings_(selected.record, action, message);
  const warning = warnings.length ? '⚠ ' + warnings.join('\n⚠ ') + '\n\n' : '';

  const content = '<div style="font-family:Arial,sans-serif;padding:16px">' +
    '<p><strong>STAGE</strong><br>' + htmlEscape_(action) + '</p>' +
    '<p><strong>TO</strong><br>' + htmlEscape_(message.to || '(blank)') + '</p>' +
    '<p><strong>CC</strong><br>' + htmlEscape_((message.cc || []).join(', ')) + '</p>' +
    '<p><strong>SUBJECT</strong><br>' + htmlEscape_(message.subject) + '</p>' +
    '<p><strong>BODY</strong></p>' +
    '<pre style="white-space:pre-wrap;font-family:Arial,sans-serif;border:1px solid #cbd5e1;padding:12px;background:#f8fafc">' +
    htmlEscape_(warning + message.plainBody) + '</pre></div>';
  SpreadsheetApp.getUi().showModalDialog(
    HtmlService.createHtmlOutput(content).setWidth(720).setHeight(620),
    'Email preview — no message was sent'
  );
}
