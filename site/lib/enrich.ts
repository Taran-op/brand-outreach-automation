/**
 * Company enrichment.
 *
 * Reads a company's own public website and pulls back what it publishes about
 * itself: a description, a category hint, and any contact address it lists for
 * business enquiries. Enriched rows stay NEW — discovery never approves and
 * never sends, because a machine-found address is exactly the kind that should
 * get a human's eyes before a brand hears from us.
 */

import { brandFromWebsite, looksLikeBrandName } from './brand';
import { CATEGORY_VALUES } from './constants';
import { canonicalizeImportedCategory, normalizeImportWebsite } from './import';
import { isValidSingleEmail, normalizeEmail, safeDisplayText, truncate } from './text';

const FETCH_TIMEOUT_MS = 5000;
/**
 * Storefront pages inline their whole product catalogue as JSON, so a
 * homepage of two or three megabytes is normal and the contact address is
 * often in the footer at the very end of it.
 */
const MAX_BYTES = 1_500_000;

/**
 * Pages a company usually publishes contacts on, in two waves. The first
 * wave is where an address almost always is; the second runs only when the
 * first gave no partnerships-grade channel. Each wave is fetched together,
 * and kept small: a burst of ten requests reads as an attack to some hosting
 * firewalls, which then ban the address for a while. The /pages/ forms are
 * the storefront convention most Indian direct-to-consumer brands use.
 */
const PATH_WAVES = [
  ['', '/contact', '/contact-us', '/pages/contact-us'],
  ['/contactus', '/pages/contact', '/about-us', '/partnerships', '/partner-with-us', '/press']
];

/**
 * Local-parts we actively want, best first: a partnerships or marketing
 * channel is what a sponsorship enquiry is for, a general inbox is a fair
 * second, and a social or press desk will at least know who to forward to.
 */
const PREFERRED_LOCALPARTS = [
  'partnerships',
  'partnership',
  'brandpartnerships',
  'partners',
  'partner',
  'sponsorships',
  'sponsorship',
  'sponsor',
  'collaborations',
  'collaboration',
  'collabs',
  'collab',
  'brands',
  'brand',
  'marketing',
  'alliances',
  'bd',
  'business',
  'biz',
  'growth',
  'events',
  'media',
  'press',
  'pr',
  'communications',
  'comms',
  'social',
  'connect',
  'hello',
  'hi',
  'hey',
  'namaste',
  'contact',
  'contactus',
  'info',
  'enquiries',
  'enquiry',
  'inquiries',
  'inquiry',
  'reachus',
  'reach',
  'team',
  'mail',
  'office',
  'sales',
  'admin'
];

/**
 * A customer-service inbox is a real published channel and often the only
 * one a brand lists, so it is used when nothing better exists, and the row's
 * notes say so.
 */
const SUPPORT_TOKENS = [
  'support',
  'help',
  'care',
  'customer',
  'service',
  'feedback',
  'query',
  'queries',
  'cs'
];

/**
 * Never contact these for brand outreach, even when published. Matched as a
 * token anywhere in the local part, so no-reply-orders@ is caught as well as
 * noreply@.
 */
const REJECTED_TOKENS = [
  'noreply',
  'no-reply',
  'no_reply',
  'donotreply',
  'do-not-reply',
  'do_not_reply',
  'careers',
  'career',
  'jobs',
  'hiring',
  'recruit',
  'privacy',
  'legal',
  'dpo',
  'grievance',
  'nodal',
  'compliance',
  'abuse',
  'security',
  'postmaster',
  'mailer-daemon',
  'unsubscribe',
  'billing',
  'invoice',
  'accounts',
  'payments',
  'investor',
  'shareholder',
  'orders',
  'returns',
  'refund',
  'webmaster',
  'dmca',
  'copyright',
  'whistleblow',
  'complaint',
  'appellate',
  'ombudsman',
  'redressal',
  'talent',
  'joinus'
];

/** Exact local parts too short or too common to token-match safely. */
const REJECTED_EXACT = ['hr', 'ir', 'order', 'cfo', 'cs-legal', 'join', 'future'];

/** Infrastructure, sample and placeholder domains that never belong to the brand. */
const REJECTED_DOMAINS = [
  // Our own: some pages echo the visitor's User-Agent, which names us.
  'asaiverse.com',
  'example.com',
  'example.org',
  'example.net',
  'sentry.io',
  'wixpress.com',
  'wix.com',
  'squarespace.com',
  'godaddy.com',
  'cloudflare.com',
  'google.com',
  'googlemail.com',
  'facebook.com',
  'w3.org',
  'shopify.com',
  'myshopify.com',
  'yourstore.com',
  'yourdomain.com',
  'yourcompany.com',
  'yourwebsite.com',
  'yoursite.com',
  'yourmail.com',
  'youremail.com',
  'domain.com',
  'company.com',
  'website.com',
  'mysite.com',
  'email.com',
  'mail.com',
  'test.com',
  'abc.com',
  'xyz.com',
  'mailinator.com',
  'placeholder.com',
  'sample.com',
  'demo.com',
  'schema.org',
  'apple.com',
  'microsoft.com',
  'adobe.com',
  'razorpay.com',
  'paytm.com',
  'phonepe.com',
  'zendesk.com',
  'freshdesk.com',
  'hubspot.com',
  'mailchimp.com',
  'klaviyo.com',
  'judge.me',
  'stamped.io',
  'yotpo.com',
  'gorgias.com',
  'tidio.co',
  'wati.io',
  'interakt.ai'
];

/** Free mailboxes: real for small brands, but only when clearly the brand's own. */
const FREE_MAIL_DOMAINS = ['gmail.com', 'yahoo.com', 'yahoo.in', 'outlook.com', 'hotmail.com', 'rediffmail.com', 'ymail.com', 'live.com', 'protonmail.com', 'proton.me', 'icloud.com'];

/** Blocks SSRF via a website cell pointing at internal infrastructure. */
function isPublicHttpUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;

  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal')) return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    const [a, b] = host.split('.').map(Number);
    if (a === 10 || a === 127 || a === 0 || a === 169) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
  }
  if (host.includes(':')) return false; // bare IPv6, including ::1
  return true;
}

type PageFetch = {
  html: string;
  status: number;
  /** A short reason when nothing usable came back: dns, timeout, blocked, refused, empty. */
  failure: string;
};

/**
 * Both honest about being a crawler — each names the bot and a contact —
 * but shaped differently, because firewalls disagree: some block anything
 * that is not browser-shaped, others block a browser string carrying an
 * extra product token. The second is tried only when the first is refused.
 */
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36 ' +
    'AsaiverseOutreachBot/1.0 (+https://asaiverse.com; contact taran@asaiverse.com)',
  'Mozilla/5.0 (compatible; AsaiverseOutreachBot/1.0; +https://asaiverse.com; contact taran@asaiverse.com)'
];

const BLOCK_STATUSES = new Set([401, 403, 406, 409, 429, 503]);

async function fetchOnce(url: string, userAgent: string): Promise<PageFetch> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': userAgent,
        Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
        'Accept-Language': 'en-IN,en;q=0.9'
      },
      cache: 'no-store'
    });
    const type = response.headers.get('content-type') || '';
    if (!/text\/html|application\/xhtml/i.test(type)) {
      return { html: '', status: response.status, failure: BLOCK_STATUSES.has(response.status) ? 'blocked' : 'not-html' };
    }
    const text = (await response.text()).slice(0, MAX_BYTES);

    // Some firewalls answer a crawler with 403 but still serve the real page,
    // and 404s on storefronts are full pages with the footer contacts intact.
    // A short error body is a block page; a long one is content.
    if (!response.ok && text.length < 4000) {
      return { html: '', status: response.status, failure: BLOCK_STATUSES.has(response.status) ? 'blocked' : 'empty' };
    }
    return { html: text, status: response.status, failure: text ? '' : 'empty' };
  } catch (error) {
    const cause = (error as { cause?: { code?: string } }).cause;
    const code = cause?.code || '';
    if ((error as Error).name === 'AbortError') return { html: '', status: 0, failure: 'timeout' };
    if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return { html: '', status: 0, failure: 'dns' };
    if (code === 'ECONNREFUSED' || code === 'ECONNRESET') return { html: '', status: 0, failure: 'refused' };
    if (/CERT|TLS|SSL/i.test(code)) return { html: '', status: 0, failure: 'tls' };
    return { html: '', status: 0, failure: 'error' };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchPage(url: string): Promise<PageFetch> {
  if (!isPublicHttpUrl(url)) return { html: '', status: 0, failure: 'unsafe' };
  const first = await fetchOnce(url, USER_AGENTS[0]);
  if (first.html || (first.failure !== 'blocked' && first.failure !== 'empty')) return first;
  const second = await fetchOnce(url, USER_AGENTS[1]);
  return second.html ? second : first;
}

const decodeEntities = (value: string): string =>
  value
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&amp;/gi, '&')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&commat;/gi, '@');

function extractMetaDescription(html: string): string {
  const patterns = [
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(html);
    if (match) return safeDisplayText(decodeEntities(match[1]));
  }
  return '';
}

function extractTitle(html: string): string {
  const match = /<title[^>]*>([\s\S]{0,300}?)<\/title>/i.exec(html);
  return match ? safeDisplayText(decodeEntities(match[1])) : '';
}

/**
 * What the site calls itself. og:site_name is the company's own answer to
 * that question, which beats a page title full of keywords; the title's
 * segments are tried after it, and only a segment that reads as a name is
 * kept, so a lead never ends up named after what it sells.
 */
function extractSiteName(html: string, title: string): string {
  const patterns = [
    /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:site_name["']/i,
    /<meta[^>]+name=["']application-name["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+name=["']apple-mobile-web-app-title["'][^>]+content=["']([^"']+)["']/i
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(html);
    const candidate = match ? safeDisplayText(decodeEntities(match[1])) : '';
    if (looksLikeBrandName(candidate)) return candidate;
  }

  for (const segment of title.split(/\s[|\-–—:•]\s/)) {
    const candidate = safeDisplayText(segment)
      .replace(/^(?:home|welcome(?: to)?)\b[\s:–—-]*/i, '')
      .replace(/[™®©]/g, '')
      .trim();
    if (looksLikeBrandName(candidate)) return candidate;
  }
  return '';
}

const localPartOf = (email: string) => email.split('@')[0].toLowerCase();
const domainOf = (email: string) => email.split('@')[1]?.toLowerCase() || '';

/** Words of four letters or more from a company name or host, for kinship checks. */
const nameTokens = (text: string): string[] =>
  text
    .toLowerCase()
    .replace(/\.(com|in|co|net|org|gg|io|tech|live|club|app|store|shop)\b/g, ' ')
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 4 && !['india', 'official', 'store', 'shop', 'online', 'limited', 'private', 'group'].includes(token));

export type EmailQuality = 'preferred' | 'person' | 'support' | '';

type Ranked = { email: string; score: number; quality: EmailQuality };

/**
 * Ranks candidates so a published partnerships channel wins over a general
 * inbox, a general inbox over a named person, and a named person over a
 * customer-service desk. Anything on the rejected lists is discarded, and an
 * address on another domain only survives when the site clearly presents it
 * as its own — a parent company, or a free mailbox carrying the brand name.
 */
export function rankEmails(candidates: string[], siteHost: string, companyName = ''): Ranked[] {
  const seen = new Set<string>();
  const ranked: Ranked[] = [];
  const kin = new Set([...nameTokens(siteHost), ...nameTokens(companyName)]);

  for (const raw of candidates) {
    const email = normalizeEmail(raw);
    if (!isValidSingleEmail(email) || seen.has(email)) continue;
    seen.add(email);

    const local = localPartOf(email);
    const domain = domainOf(email);
    if (/\.(png|jpe?g|gif|svg|webp|avif|css|js|json|woff2?|ttf|mp4|pdf)$/i.test(email)) continue;
    if (/^[0-9a-f]{12,}$/i.test(local) || /^\d+x$/.test(domain.split('.')[0])) continue; // hashes, @2x assets
    if (REJECTED_DOMAINS.some((bad) => domain === bad || domain.endsWith(`.${bad}`))) continue;
    if (REJECTED_EXACT.includes(local)) continue;
    if (REJECTED_TOKENS.some((bad) => local.includes(bad))) continue;

    const onDomain = Boolean(siteHost) && (domain === siteHost || siteHost.endsWith(`.${domain}`) || domain.endsWith(`.${siteHost}`));
    const domainTokens = nameTokens(domain);
    const localTokens = nameTokens(local);
    const related = !onDomain && (domainTokens.some((token) => kin.has(token)) || [...kin].some((token) => domain.includes(token)));
    const freeMail = FREE_MAIL_DOMAINS.includes(domain);
    const brandedMailbox = freeMail && (localTokens.some((token) => kin.has(token)) || [...kin].some((token) => local.includes(token)));

    const preferenceIndex = PREFERRED_LOCALPARTS.indexOf(local);
    const supportLike = SUPPORT_TOKENS.some((token) => local === token || local.includes(token));

    let score = 0;
    let quality: EmailQuality = '';
    if (preferenceIndex >= 0) {
      score = 100 - preferenceIndex;
      quality = 'preferred';
    } else if (supportLike) {
      score = 10;
      quality = 'support';
    } else {
      score = 20; // A named person or an unlisted inbox: a real contact, ranked below a channel.
      quality = 'person';
    }

    if (onDomain) score += 50;
    else if (related) score += 30;
    else if (brandedMailbox) score += 25;
    else if (freeMail) continue; // Someone else's personal mailbox.
    else if (quality !== 'preferred') continue; // A stray third-party address with no signal.

    ranked.push({ email, score, quality });
  }

  return ranked.sort((a, b) => b.score - a.score);
}

export function chooseBestEmail(candidates: string[], siteHost: string, companyName = ''): string {
  const ranked = rankEmails(candidates, siteHost, companyName);
  return ranked.length ? ranked[0].email : '';
}

/** Cloudflare's email obfuscation: a key byte followed by XOR-ed characters, hex encoded. */
const decodeCloudflareEmail = (hex: string): string => {
  const key = parseInt(hex.slice(0, 2), 16);
  let out = '';
  for (let index = 2; index + 1 < hex.length; index += 2) {
    out += String.fromCharCode(parseInt(hex.slice(index, index + 2), 16) ^ key);
  }
  return out;
};

/**
 * Turns the ways a page hides an address from harvesters back into plain
 * text before extraction: script-escaped characters, entity-encoded @, URL
 * encoding inside mailto links, Cloudflare obfuscation and the written-out
 * "name [at] domain [dot] com" form.
 */
function revealEmails(html: string): string {
  let text = html
    .replace(/\\u([0-9a-f]{4})/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/\\\//g, '/')
    .replace(/&#(?:64|x40);|&commat;/gi, '@')
    .replace(/&#(?:46|x2e);/gi, '.')
    .replace(/mailto:([^"'?>\s]+)/gi, (_, target) => {
      try {
        return `mailto:${decodeURIComponent(target)}`;
      } catch {
        return `mailto:${target}`;
      }
    })
    .replace(/data-cfemail=["']([0-9a-f]+)["']/gi, (_, hex) => ` ${decodeCloudflareEmail(hex)} `);

  // "hello [at] brand [dot] com", "hello (at) brand dot com" and friends.
  text = text.replace(
    /([a-z0-9._%+-]+)\s*[\[({]\s*at\s*[\])}]\s*([a-z0-9-]+(?:\s*[\[({]\s*dot\s*[\])}]\s*[a-z0-9-]+)+)/gi,
    (_, local, rest) => `${local}@${rest.replace(/\s*[\[({]\s*dot\s*[\])}]\s*/gi, '.')}`
  );
  return text;
}

/**
 * Trims the script and markup debris that ends up glued to an address once
 * escapes are undone: a trailing quote, a leading "u003e" from an escaped
 * bracket, a stray "3D" from quoted-printable.
 */
const cleanCandidate = (value: string): string =>
  value
    .replace(/^(?:u003e|u003c|x3e|x3c|%3e|%22|%27)+/i, '')
    .replace(/^[^a-z0-9]+/i, '')
    .replace(/[^a-z0-9]+$/i, '')
    .replace(/^(?:mailto:|email:|e-mail:|mail:)/i, '');

function extractEmails(html: string): string[] {
  const text = revealEmails(html);
  const found: string[] = [];
  // mailto: links are an explicit publication of a contact channel.
  for (const match of text.matchAll(/mailto:([^"'?>\s]+)/gi)) found.push(cleanCandidate(decodeEntities(match[1])));
  for (const match of text.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,63}/gi)) found.push(cleanCandidate(match[0]));
  return found.filter(Boolean);
}

const CATEGORY_HINTS: [RegExp, string][] = [
  [/\bgaming\b|\besports\b|\bgamer/i, 'Gaming Peripherals'],
  [/\bkeyboard|\bmouse\b|\bmousepad|\bheadset|\bperipheral/i, 'Gaming Accessories'],
  [/\blaptop|\bnotebook\b/i, 'Laptops'],
  [/\bsmartphone|\bmobile phone/i, 'Smartphones'],
  [/\bheadphone|\bearbud|\bspeaker|\baudio\b/i, 'Audio'],
  [/\bgpu\b|\bprocessor|\bmotherboard|\bpc build/i, 'PC Hardware'],
  [/\bsaas\b|\bplatform\b|\bapi\b|\bsoftware\b|\bartificial intelligence\b/i, 'SaaS / AI'],
  [/\benergy drink|\bbeverage|\bsoft drink/i, 'Beverage'],
  [/\bsnack|\bnutrition|\bfmcg\b|\bfood\b/i, 'Food / FMCG'],
  [/\bstreetwear|\bapparel|\bclothing|\bfashion\b/i, 'Fashion / Streetwear'],
  [/\bautomotive|\bmotorcycle|\bscooter|\belectric vehicle/i, 'Automotive'],
  [/\bedtech|\bupskill|\bcourses\b|\blearning platform/i, 'Education / EdTech']
];

const guessCategory = (text: string): string => {
  for (const [pattern, category] of CATEGORY_HINTS) {
    if (pattern.test(text)) return category;
  }
  return '';
};

export type EnrichmentResult = {
  email: string;
  /** What the site calls itself, when that reads as a name. */
  brandName: string;
  /** What kind of channel the address is, so the notes can say so. */
  emailQuality: EmailQuality;
  description: string;
  category: string;
  sourceUrl: string;
  pagesTried: number;
  /** Why nothing was found, when nothing was. */
  diagnosis: string;
  pagesFetched: number;
  rawEmailsSeen: number;
};

const FAILURE_TEXT: Record<string, string> = {
  dns: 'the domain does not resolve — check the Website cell',
  timeout: 'the site did not answer within 5 s',
  blocked: 'the site blocks automated visitors',
  refused: 'the server refused the connection',
  tls: 'the site has a broken certificate',
  'not-html': 'the site returned something other than a web page',
  empty: 'the site returned an empty page'
};

/**
 * Visits a company's own site and reports what it publishes. Returns empty
 * fields rather than guesses when nothing usable is found.
 */
export async function enrichCompany(website: unknown, companyName: unknown): Promise<EnrichmentResult> {
  const base = normalizeImportWebsite(website);
  const company = safeDisplayText(companyName);
  const empty: EnrichmentResult = {
    email: '',
    brandName: '',
    emailQuality: '',
    description: '',
    category: '',
    sourceUrl: '',
    pagesTried: 0,
    pagesFetched: 0,
    rawEmailsSeen: 0,
    diagnosis: ''
  };
  if (!base) {
    return {
      ...empty,
      diagnosis: `The Website cell (${safeDisplayText(website) || 'blank'}) is not a usable URL.`
    };
  }

  let host = '';
  try {
    host = new URL(base).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return { ...empty, diagnosis: 'The Website cell could not be parsed as a URL.' };
  }

  // Some hosts answer only on the www form, or only over http.
  const origins = [base.replace(/\/$/, '')];
  try {
    const url = new URL(base);
    const swapped = url.hostname.startsWith('www.')
      ? url.hostname.replace(/^www\./i, '')
      : `www.${url.hostname}`;
    origins.push(`${url.protocol}//${swapped}`);
  } catch {
    // Single origin is fine.
  }

  const candidates: string[] = [];
  const failures = new Map<string, number>();
  let description = '';
  let title = '';
  let brandName = '';
  let sourceUrl = '';
  let pagesTried = 0;
  let pagesFetched = 0;

  const goodEnough = () => rankEmails(candidates, host, company)[0]?.quality === 'preferred';

  outer: for (const origin of origins) {
    for (const wave of PATH_WAVES) {
      const pages = await Promise.all(
        wave.map(async (path) => {
          const url = `${origin}${path}`;
          return { url, page: await fetchPage(url) };
        })
      );
      for (const { url, page } of pages) {
        pagesTried += 1;
        if (!page.html) {
          if (page.failure) failures.set(page.failure, (failures.get(page.failure) || 0) + 1);
          continue;
        }
        pagesFetched += 1;

        if (!description) description = extractMetaDescription(page.html);
        if (!title) title = extractTitle(page.html);
        if (!brandName) brandName = extractSiteName(page.html, title);

        const pageEmails = extractEmails(page.html);
        if (pageEmails.length) {
          candidates.push(...pageEmails);
          if (!sourceUrl) sourceUrl = url;
        }
      }
      // A dead origin is not worth a second wave; a live one that already
      // gave a partnerships-grade channel is not worth the extra requests.
      if (!pagesFetched || goodEnough()) break;
    }
    if (pagesFetched) break outer; // The first origin that answered is the right one.
  }

  const ranked = rankEmails(candidates, host, company);
  const best = ranked[0];
  const haystack = `${company} ${title} ${description}`;
  const guessed = guessCategory(haystack);

  let diagnosis = '';
  if (!pagesFetched) {
    const [failure] = [...failures.entries()].sort((a, b) => b[1] - a[1])[0] || ['error'];
    diagnosis = `No page on ${host} could be read: ${FAILURE_TEXT[failure] || 'the requests failed'}.`;
  } else if (!candidates.length) {
    diagnosis = `Read ${pagesFetched} page(s) on ${host} but found no email address in the HTML. The contact details are probably rendered by JavaScript or hidden behind a form.`;
  } else if (!best) {
    const seen = [...new Set(candidates.map((email) => normalizeEmail(email)))].filter((email) => isValidSingleEmail(email)).slice(0, 3);
    diagnosis =
      `Found ${candidates.length} address(es) on ${host}, but none looked like a business contact channel` +
      (seen.length ? ` (saw ${seen.join(', ')})` : '') +
      '. Careers, legal, no-reply, investor and third-party addresses are rejected.';
  }

  return {
    email: best?.email || '',
    // The site's own name for itself, or its domain's spelling of it.
    brandName: brandName || brandFromWebsite(base),
    emailQuality: best?.quality || '',
    description: truncate(description, 500),
    category: guessed && CATEGORY_VALUES.includes(guessed as never) ? guessed : canonicalizeImportedCategory(guessed),
    sourceUrl: best ? sourceUrl || base : '',
    pagesTried,
    pagesFetched,
    rawEmailsSeen: candidates.length,
    diagnosis
  };
}

type SearchHit = { title?: string; link?: string; snippet?: string };

async function serperSearch(query: string, key: string): Promise<SearchHit[]> {
  try {
    const response = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: query, gl: 'in', hl: 'en', num: 10 }),
      cache: 'no-store',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
    });
    if (!response.ok) return [];
    return ((await response.json()) as { organic?: SearchHit[] }).organic || [];
  } catch {
    return [];
  }
}

/**
 * Second source: ask the search engine for addresses on the company's domain.
 * Many companies publish partnerships or press contacts on pages a shallow
 * crawl never reaches — a media kit, a PDF, a directory listing — and search
 * snippets surface them. Only addresses on the company's own domain are kept,
 * so a directory's own contact address can never be attributed to the brand.
 * Two queries at most: the second, for a general contact, runs only when the
 * first finds nothing.
 */
export async function searchForEmail(
  companyName: string,
  website: string
): Promise<{ email: string; source: string; quality: EmailQuality }> {
  const none = { email: '', source: '', quality: '' as EmailQuality };
  const key = process.env.SERPER_API_KEY;
  if (!key) return none;

  let host = '';
  try {
    host = new URL(normalizeImportWebsite(website)).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return none;
  }
  if (!host) return none;

  const queries = [
    `"@${host}" ${companyName} (partnerships OR marketing OR brand OR press OR business)`,
    `"@${host}" ${companyName} email contact`
  ];

  for (const query of queries) {
    const hits = await serperSearch(query, key);
    const candidates: string[] = [];
    let source = '';
    for (const item of hits) {
      const text = revealEmails(`${item.title || ''} ${item.snippet || ''}`);
      const found = (text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,63}/gi) || []).map(cleanCandidate);
      const onDomain = found.filter((email) => {
        const domain = domainOf(email);
        return domain === host || domain.endsWith(`.${host}`);
      });
      if (onDomain.length) {
        candidates.push(...onDomain);
        if (!source) source = item.link || 'search';
      }
    }
    const ranked = rankEmails(candidates, host, companyName);
    if (ranked.length) return { email: ranked[0].email, source, quality: ranked[0].quality };
  }
  return none;
}
