/**
 * Email copy. Originally a port of src/04_EmailTemplates.gs.
 *
 * Copy is deterministic: no text is generated at runtime. The only per-lead
 * variation is the greeting and the operator-written Personalization cell.
 *
 * The initial email now carries the approved Emailer document and no longer
 * matches the Apps Script version, which still sends the older, shorter pitch.
 * The two must not both be used for first contact — this console is the one
 * with the current copy.
 *
 * Follow-up 1 and 2 remain the original wording, including the per-category
 * sentence, because the document did not replace them.
 */

import { displayBrand, greetingFor, looksLikeBrandName } from './brand';
import { CONFIG } from './config';
import { ACTION, AUTOMATION_STOP_STATUSES, LEAD_HEADERS, STATUS, type ActionValue } from './constants';
import { leadValue, type LeadRecord } from './sheets';
import {
  isExactStatus,
  isTrue,
  isValidSingleEmail,
  normalizeEmail,
  safeDisplayText,
  truncate
} from './text';

type Template = { initial: string; followUp: string };

const CATEGORY_TEMPLATES: Record<string, Template> = {
  GAMING_HARDWARE: {
    initial:
      'The event brings together gamers and esports audiences in an environment designed for hands-on product demos, trials and playable brand experiences—making it a strong setting for gaming and hardware brands.',
    followUp:
      'It could be a practical setting for hands-on demos, product trials or a gaming-led activation.'
  },
  TECHNOLOGY: {
    initial:
      'With developers, technology enthusiasts, creators and early adopters attending, the event offers a practical setting for product demonstrations, interactive showcases and conversations with a technology-focused audience.',
    followUp:
      'The developer and technology audience could make a product demonstration or interactive showcase especially relevant.'
  },
  FMCG_BEVERAGE: {
    initial:
      'The mix of gaming, creators, live entertainment and community experiences is designed to attract a young, engaged audience, creating opportunities for sampling, high-visibility stalls and memorable physical activations.',
    followUp: 'Sampling, a high-visibility stall or an experiential activation could fit the audience well.'
  },
  FASHION_LIFESTYLE: {
    initial:
      'The event sits at the intersection of youth culture, gaming, creators, music and fandom, creating a relevant space for physical displays, limited drops, retail-led experiences and lifestyle activations.',
    followUp:
      'The overlap between youth culture, creators, gaming and live entertainment could support a strong physical display or activation.'
  },
  AUTOMOTIVE: {
    initial:
      'The event combines technology, entertainment and youth culture, offering automotive and mobility brands room for vehicle displays, technology showcases and interactive audience experiences.',
    followUp: 'A vehicle display, technology showcase or interactive mobility experience could be a natural fit.'
  },
  EDUCATION: {
    initial:
      'The audience includes students, developers, creators and technology enthusiasts, creating a relevant environment for career, learning, upskilling and education-led experiences.',
    followUp:
      'The student, developer and creator audience could make a learning, careers or upskilling activation relevant.'
  },
  CREATOR_COMMUNITY: {
    initial:
      'Creator meetups, gaming communities, fandom experiences and live entertainment are central to the event, giving community and entertainment brands space to host interactions, showcases and audience-led experiences.',
    followUp:
      'A creator, community or fandom-led experience could sit naturally within the event programme.'
  },
  GENERAL: {
    initial:
      'The event brings gamers, creators, developers, technology enthusiasts and youth communities together under one roof, creating room for interactive product showcases and relevant physical brand experiences.',
    followUp:
      'The cross-section of gaming, technology, creators and youth culture could support a relevant physical brand experience.'
  }
};

export function resolveCategoryTemplate(category: unknown): Template {
  const text = safeDisplayText(category).toLowerCase();
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
  if (/fmcg|food|beverage|drink|snack|nutrition/.test(text)) return CATEGORY_TEMPLATES.FMCG_BEVERAGE;
  if (/fashion|streetwear|lifestyle|apparel|beauty|retail/.test(text)) return CATEGORY_TEMPLATES.FASHION_LIFESTYLE;
  if (/automotive|automobile|mobility|motorcycle|\bev\b|vehicle/.test(text)) return CATEGORY_TEMPLATES.AUTOMOTIVE;
  if (/education|edtech|university|college|upskill|learning|career/.test(text)) return CATEGORY_TEMPLATES.EDUCATION;
  return CATEGORY_TEMPLATES.GENERAL;
}

export const normalizeStatus = (value: unknown): string =>
  String(value ?? '').trim().toUpperCase().replace(/[\s-]+/g, '_');

export const htmlEscape = (value: unknown): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const paragraphToHtml = (value: string) => htmlEscape(value).replace(/\r?\n/g, '<br>');

const ensureTerminalPunctuation = (value: unknown): string => {
  const text = safeDisplayText(value);
  if (!text) return '';
  return /[.!?]$/.test(text) ? text : `${text}.`;
};

export const configuredCcEmails = (): string[] =>
  CONFIG.SENDER.CC_EMAILS.map(normalizeEmail).filter(isValidSingleEmail);

export const isConfiguredCcEmail = (email: unknown): boolean =>
  configuredCcEmails().includes(normalizeEmail(email));

export type OutreachMessage = {
  action: ActionValue;
  to: string;
  cc: string[];
  subject: string;
  plainBody: string;
  htmlBody: string;
};

const buildInitialSubject = (brand: string): string =>
  truncate(`${brand || 'Your team'} × ${safeDisplayText(CONFIG.EVENT.NAME)} — Brand Activation Opportunity`, 180);

const eventOpeningLine = (): string => {
  const location = safeDisplayText(CONFIG.EVENT.LOCATION_DISPLAY);
  const datePreposition = safeDisplayText(CONFIG.EVENT.DATE_PREPOSITION) || 'on';
  return (
    `I'm reaching out regarding ${safeDisplayText(CONFIG.EVENT.NAME)}, ` +
    `${safeDisplayText(CONFIG.EVENT.ONE_LINE_DESCRIPTION)} taking place ${datePreposition} ` +
    `${safeDisplayText(CONFIG.EVENT.DATE_DISPLAY)}${location ? ` in ${location}` : ''}.`
  );
};

const customPersonalizationLine = (company: string, personalization: string): string => {
  if (!personalization) return '';
  return `One reason I thought ${company || 'your team'} could be a strong fit: ${ensureTerminalPunctuation(personalization)}`;
};

/** A body block is either a paragraph or a bulleted list. */
export type Block = string | { bullets: string[] };

function finishEmail(
  to: string,
  subject: string,
  action: ActionValue,
  blocks: Block[],
  inlineImageCid?: string
): OutreachMessage {
  const signatureLines = [
    safeDisplayText(CONFIG.SENDER.SIGN_OFF),
    safeDisplayText(CONFIG.SENDER.NAME),
    safeDisplayText(CONFIG.SENDER.TITLE),
    safeDisplayText(CONFIG.EVENT.ORGANIZATION),
    safeDisplayText(CONFIG.SENDER.PHONE),
    safeDisplayText(CONFIG.SENDER.BUSINESS_EMAIL)
  ].filter(Boolean);

  // This exact sentence is the anchor reply detection uses to find where our
  // own words end and a quoted reply begins. Changing it silently breaks
  // opt-out handling, so it stays verbatim — see OWN_FOOTER in replies.ts.
  const optOut =
    'If you would prefer not to receive further messages about this event, reply “opt out” and we will update our list.';

  const plainBlocks = blocks.map((block) =>
    typeof block === 'string' ? block : block.bullets.map((item) => `• ${item}`).join('\n')
  );
  const plainBody = `${plainBlocks.join('\n\n')}\n\n${signatureLines.join('\n')}\n\n${optOut}`;

  const htmlParagraphs = blocks
    .map((block) =>
      typeof block === 'string'
        ? `<p style="margin:0 0 14px 0">${paragraphToHtml(block)}</p>`
        : `<ul style="margin:0 0 14px 0;padding-left:20px">${block.bullets
            .map((item) => `<li style="margin:0 0 4px 0">${htmlEscape(item)}</li>`)
            .join('')}</ul>`
    )
    .join('');
  const htmlSignature = `<p style="margin:0 0 14px 0">${signatureLines.map(htmlEscape).join('<br>')}</p>`;
  const htmlOptOut = `<p style="margin:20px 0 0 0;color:#64748b;font-size:12px">${htmlEscape(optOut)}</p>`;
  // Only emitted when the caller confirms the part is attached, so a missing
  // file can never leave a broken image in the recipient's client.
  const htmlImage = inlineImageCid
    ? `<p style="margin:0 0 18px 0"><img src="cid:${inlineImageCid}" alt="${htmlEscape(CONFIG.EVENT.NAME)} overview" width="600" style="display:block;width:100%;max-width:600px;height:auto;border:0"></p>`
    : '';

  const htmlBody =
    '<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.55;color:#1f2937">' +
    htmlImage +
    htmlParagraphs +
    htmlSignature +
    htmlOptOut +
    '</div>';

  return { action, to, cc: configuredCcEmails(), subject, plainBody, htmlBody };
}

export function buildEmailForLead(
  record: LeadRecord,
  action: ActionValue,
  options: { inlineImageCid?: string } = {}
): OutreachMessage {
  const company = safeDisplayText(leadValue(record, LEAD_HEADERS.COMPANY));
  const contactName = safeDisplayText(leadValue(record, LEAD_HEADERS.CONTACT_NAME));
  const category = safeDisplayText(leadValue(record, LEAD_HEADERS.CATEGORY));
  const personalization = safeDisplayText(leadValue(record, LEAD_HEADERS.PERSONALIZATION));
  const currentEmail = normalizeEmail(leadValue(record, LEAD_HEADERS.EMAIL));
  const sentToEmail = normalizeEmail(leadValue(record, LEAD_HEADERS.SENT_TO_EMAIL));

  // Follow-ups go to the address the initial actually reached, never to a
  // later edit of the Email cell.
  const to = action === ACTION.INITIAL ? currentEmail : sentToEmail || currentEmail;
  const website = leadValue(record, LEAD_HEADERS.WEBSITE);
  // The Company cell can hold a description rather than a name — discovery
  // reads it off a search result — so the brand shown to the reader is the
  // name if there is one, the domain's own spelling if not.
  const brand = displayBrand(company, website);
  const subject = buildInitialSubject(brand);
  const greeting = greetingFor(contactName, company);
  const template = resolveCategoryTemplate(category);

  if (action === ACTION.FOLLOW_UP_1) {
    return finishEmail(to, subject, ACTION.FOLLOW_UP_1, [
      `Hi ${greeting},`,
      `Just following up on my note about exhibition and brand activation opportunities at ${safeDisplayText(CONFIG.EVENT.NAME)}.`,
      template.followUp,
      `Would it be useful if I sent over the stall options, audience plan and possible collaboration formats for ${brand || 'your team'}?`
    ]);
  }

  if (action === ACTION.FOLLOW_UP_2) {
    return finishEmail(to, subject, ACTION.FOLLOW_UP_2, [
      `Hi ${greeting},`,
      `One final follow-up regarding ${safeDisplayText(CONFIG.EVENT.NAME)} ` +
        `${safeDisplayText(CONFIG.EVENT.DATE_PREPOSITION) || 'on'} ${safeDisplayText(CONFIG.EVENT.DATE_DISPLAY)}.`,
      template.followUp,
      'If brand partnerships or physical activations are being planned, I would be happy to share the available options. If it is not relevant right now, no problem at all.'
    ]);
  }

  return buildInitialEmail(to, subject, greeting, brand, personalization, options.inlineImageCid);
}

/**
 * The initial pitch, from the approved Emailer document.
 *
 * The event name is interpolated rather than written literally so the subject
 * line and the body cannot drift apart in spelling. The operator-written
 * Personalization cell is inserted before the ask, where a specific reason
 * lands best; leads without one simply skip it.
 */
function buildInitialEmail(
  to: string,
  subject: string,
  greeting: string,
  company: string,
  personalization: string,
  inlineImageCid?: string
): OutreachMessage {
  const event = safeDisplayText(CONFIG.EVENT.NAME);

  return finishEmail(to, subject, ACTION.INITIAL, [
    `Dear ${greeting},`,
    'Most gaming events in India bring audiences together to watch.',
    `${event} is being built to make them participate.`,
    `${event} is India's next-generation gaming and youth culture festival, bringing together esports, technology, creators, entertainment, music, food, and digital communities under one immersive ecosystem.`,
    'The upcoming edition is expected to attract 30,000+ attendees, but what makes this audience unique is its composition.',

    '15,000+ Competitive Gamers',
    `Unlike conventional esports events where online qualifiers culminate in an on-ground final, ${event} will host the entire competitive journey physically at the venue.`,
    `From registrations and qualifiers to playoffs and championships, more than 15,000 players are expected to compete on-ground, making ${event} one of the few gaming festivals globally where brands can engage with thousands of active participants rather than just spectators.`,

    '15,000+ Festival Visitors',
    `Alongside competitive gaming, ${event} is designed as a large-scale consumer festival featuring:`,
    {
      bullets: [
        'Technology & Gaming Exhibition Zones',
        'Creator Meet & Greet Experiences',
        'Food Festival',
        'Cosplay Activations',
        'Indie Gaming Showcase',
        'Live Entertainment & Rock Concerts',
        'Community Experiences & Fan Engagement Activities'
      ]
    },
    'These attractions are expected to draw an additional 15,000+ visitors, creating a diverse audience of students, professionals, creators, gamers, and technology enthusiasts.',

    '100+ Creators Under One Roof',
    `${event} will bring together 100+ gaming, technology, lifestyle, and entertainment creators, creating one of the largest creator gatherings within a gaming festival environment.`,
    'For brands, this means access not only to on-ground audiences but also to creator-led amplification across social media platforms through content creation, product integration, live streams, challenges, and branded collaborations.',

    'Direct Access to 400+ Colleges',
    `Through the ${event} Campus Ambassador Program, the festival is expected to establish direct engagement across 400+ colleges in Delhi NCR, with expansion planned across multiple cities in future editions.`,
    "This network creates year-round touchpoints with student communities and enables partner brands to activate directly within India's most influential youth demographic.",

    'Why Brands Are Taking Notice',
    `${event} combines:`,
    {
      bullets: [
        '30,000+ total attendees',
        '15,000+ competitive gamers',
        '15,000+ festival visitors',
        '100+ creators and influencers',
        '400+ colleges in Delhi NCR',
        'Multi-city expansion roadmap',
        'Integrated digital campaigns',
        'Radio promotions and media partnerships',
        'Experiential activations and product showcases'
      ]
    },
    `In a market where consumer attention is increasingly fragmented, ${event} offers brands a rare opportunity to engage gaming audiences, youth communities, creators, technology enthusiasts, and students through a single platform.`,

    `We are currently inviting a limited number of brands to join ${event} as Sponsorship, Experience, Technology, and Category Partners.`,
    customPersonalizationLine(company, personalization),
    `We would be delighted to present the sponsorship opportunities and explore how ${event} can help achieve your brand's engagement and growth objectives.`,
    'Would you be available for a brief discussion next week?'
  ].filter(Boolean) as Block[], inlineImageCid);
}


const hasInitialSuccessEvidence = (record: LeadRecord): boolean =>
  Boolean(
    safeDisplayText(leadValue(record, LEAD_HEADERS.INITIAL_MESSAGE_ID)) &&
      safeDisplayText(leadValue(record, LEAD_HEADERS.SENT_TO_EMAIL))
  );

const followUpAlreadySent = (record: LeadRecord, action: ActionValue): boolean => {
  const header =
    action === ACTION.FOLLOW_UP_1
      ? LEAD_HEADERS.FOLLOW_UP_1_MESSAGE_ID
      : LEAD_HEADERS.FOLLOW_UP_2_MESSAGE_ID;
  return Boolean(safeDisplayText(leadValue(record, header)));
};

export const hasPendingAction = (record: LeadRecord): boolean =>
  Boolean(
    safeDisplayText(leadValue(record, LEAD_HEADERS.PENDING_ACTION)) ||
      safeDisplayText(leadValue(record, LEAD_HEADERS.PENDING_ATTEMPT_ID)) ||
      safeDisplayText(leadValue(record, LEAD_HEADERS.PENDING_DRAFT_ID)) ||
      safeDisplayText(leadValue(record, LEAD_HEADERS.PENDING_RECIPIENT))
  );

export function determinePreviewAction(record: LeadRecord): ActionValue {
  const status = normalizeStatus(leadValue(record, LEAD_HEADERS.STATUS));
  if (status === STATUS.FOLLOW_UP_2 || followUpAlreadySent(record, ACTION.FOLLOW_UP_2)) return ACTION.FOLLOW_UP_2;
  if (status === STATUS.FOLLOW_UP_1 || followUpAlreadySent(record, ACTION.FOLLOW_UP_1)) return ACTION.FOLLOW_UP_2;
  if (status === STATUS.SENT || hasInitialSuccessEvidence(record)) return ACTION.FOLLOW_UP_1;
  return ACTION.INITIAL;
}

export function getPreviewWarnings(
  record: LeadRecord,
  action: ActionValue,
  message: OutreachMessage
): string[] {
  const warnings: string[] = [];
  const statusValue = leadValue(record, LEAD_HEADERS.STATUS);
  const status = normalizeStatus(statusValue);

  if (!isValidSingleEmail(message.to)) warnings.push('The current TO address is invalid; sending would be refused.');
  if (isValidSingleEmail(message.to) && isConfiguredCcEmail(message.to)) {
    warnings.push('The current TO address is also an internal CC; sending would be refused.');
  }
  if (isTrue(leadValue(record, LEAD_HEADERS.OPT_OUT))) warnings.push('Opt Out is TRUE; automation will not send.');

  if (AUTOMATION_STOP_STATUSES.includes(status as never) || status === STATUS.FOLLOW_UP_2) {
    warnings.push(`Status ${status} is not eligible for another automated email.`);
  } else if (action === ACTION.INITIAL && !isExactStatus(statusValue, STATUS.APPROVED)) {
    warnings.push(
      `Initial email requires exact Status APPROVED; current value is ${String(statusValue || '') || '(blank)'}.`
    );
  } else if (action === ACTION.FOLLOW_UP_1 && !isExactStatus(statusValue, STATUS.SENT)) {
    warnings.push(
      `Follow-up 1 requires exact Status SENT; current value is ${String(statusValue || '') || '(blank)'}.`
    );
  } else if (action === ACTION.FOLLOW_UP_2 && !isExactStatus(statusValue, STATUS.FOLLOW_UP_1)) {
    warnings.push(
      `Follow-up 2 requires exact Status FOLLOW_UP_1; current value is ${String(statusValue || '') || '(blank)'}.`
    );
  }

  if (hasPendingAction(record)) warnings.push('A pending send guard exists; automatic sending is paused.');

  // Worth saying out loud in the preview: the operator can type the real name
  // into the Company cell and the email will use it.
  const company = leadValue(record, LEAD_HEADERS.COMPANY);
  if (safeDisplayText(company) && !looksLikeBrandName(company) && !safeDisplayText(leadValue(record, LEAD_HEADERS.CONTACT_NAME))) {
    warnings.push(
      `The Company cell reads as a description rather than a brand name, so this email opens with "Dear Sir/Ma'am". ` +
        'Put the brand name in Company to address them by name.'
    );
  }
  return warnings;
}

/**
 * Redirects a composed message to the operator's own mailbox for a smoke test.
 *
 * The production recipient is named in the body rather than used, the subject
 * is prefixed so it can never be mistaken for real outreach, and the caller is
 * responsible for writing no lead evidence — a test must not advance a lead's
 * lifecycle or consume its one real send.
 */
export function buildTestEnvelope(
  message: OutreachMessage,
  testRecipient: string,
  intendedRecipient: string
): OutreachMessage {
  const to = normalizeEmail(testRecipient);
  if (!isValidSingleEmail(to)) throw new Error('The test recipient address is invalid.');
  if (to === normalizeEmail(intendedRecipient)) {
    throw new Error('The test recipient matches the real lead address; redirected test refused.');
  }

  // The body is left byte-identical to production so the test shows exactly
  // what a brand receives. Only the subject is marked, which is enough to stop
  // the CC'd colleagues mistaking it for real outreach in an inbox list, and
  // the intended recipient is reported to the console rather than written into
  // the message where it would corrupt the preview.
  return {
    action: message.action,
    to,
    cc: configuredCcEmails(),
    subject: `[TEST] ${message.subject}`,
    plainBody: message.plainBody,
    htmlBody: message.htmlBody
  };
}
