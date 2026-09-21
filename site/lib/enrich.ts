/**
 * Company enrichment.
 *
 * Reads a company's own public website and pulls back what it publishes about
 * itself: a description, a category hint, and any contact address it lists for
 * business enquiries. Enriched rows stay NEW — discovery never approves and
 * never sends, because a machine-found address is exactly the kind that should
 * get a human's eyes before a brand hears from us.
 */

import { CATEGORY_VALUES } from './constants';
import { canonicalizeImportedCategory, normalizeImportWebsite } from './import';
import { isValidSingleEmail, normalizeEmail, safeDisplayText, truncate } from './text';

const FETCH_TIMEOUT_MS = 8000;
const MAX_BYTES = 600_000;

/** Pages a company usually publishes partnership contacts on. */
const CANDIDATE_PATHS = ['', '/contact', '/contact-us', '/about', '/about-us', '/partnerships', '/press'];

/**
 * Local-parts we actively want, best first. A partnerships address is a public
 * business channel; a personal address found on a page is not, and is never
 * promoted here.
 */
const PREFERRED_LOCALPARTS = [
  'partnerships',
  'partner',
  'brand',
  'brands',
  'marketing',
  'media',
  'press',
  'collab',
  'collaborations',
  'business',
  'bd',
  'sales',
  'hello',
  'contact',
  'info',
  'enquiries',
  'inquiries'
];

/** Never contact these for brand outreach, even when published. */
const REJECTED_LOCALPARTS = [
  'noreply',
  'no-reply',
  'donotreply',
  'careers',
  'jobs',
  'recruitment',
  'hr',
  'privacy',
  'legal',
  'dpo',
  'abuse',
  'security',
  'postmaster',
  'mailer-daemon',
  'unsubscribe',
  'support',
  'help',
  'billing',
  'invoice',
  'accounts'
];

const REJECTED_DOMAINS = [
  'example.com',
  'sentry.io',
  'wixpress.com',
  'squarespace.com',
  'godaddy.com',
  'cloudflare.com',
  'google.com',
  'facebook.com',
  'w3.org'
];

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

async function fetchPage(url: string): Promise<string> {
  if (!isPublicHttpUrl(url)) return '';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        // The conventional bot format: still honest about being a crawler, but
        // shaped the way WAFs expect, since a bare product token is widely
        // blocked outright and was returning nothing.
        'User-Agent':
          'Mozilla/5.0 (compatible; AsaiverseOutreachBot/1.0; +https://asaiverse.com; contact taran@asaiverse.com)',
        Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
        'Accept-Language': 'en-IN,en;q=0.9'
      },
      cache: 'no-store'
    });
    if (!response.ok) return '';
    const type = response.headers.get('content-type') || '';
    if (!/text\/html|application\/xhtml/i.test(type)) return '';

    const text = await response.text();
    return text.slice(0, MAX_BYTES);
  } catch {
    return '';
  } finally {
    clearTimeout(timer);
  }
}

const decodeEntities = (value: string): string =>
  value
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&amp;/gi, '&')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");

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

const localPartOf = (email: string) => email.split('@')[0].toLowerCase();
const domainOf = (email: string) => email.split('@')[1]?.toLowerCase() || '';

/**
 * Ranks candidates so a published partnerships channel wins over a generic
 * inbox, and anything on the rejected list is discarded outright.
 */
function chooseBestEmail(candidates: string[], siteHost: string): string {
  const seen = new Set<string>();
  const scored: { email: string; score: number }[] = [];

  for (const raw of candidates) {
    const email = normalizeEmail(raw);
    if (!isValidSingleEmail(email) || seen.has(email)) continue;
    seen.add(email);

    const local = localPartOf(email);
    const domain = domainOf(email);
    if (REJECTED_LOCALPARTS.some((bad) => local === bad || local.startsWith(`${bad}.`))) continue;
    if (REJECTED_DOMAINS.some((bad) => domain === bad || domain.endsWith(`.${bad}`))) continue;
    if (/\.(png|jpe?g|gif|svg|webp|css|js)$/i.test(email)) continue;

    let score = 0;
    const preferenceIndex = PREFERRED_LOCALPARTS.indexOf(local);
    if (preferenceIndex >= 0) score += 100 - preferenceIndex;
    // An address on the company's own domain is far more likely to be theirs.
    if (siteHost && (domain === siteHost || siteHost.endsWith(`.${domain}`) || domain.endsWith(`.${siteHost}`))) {
      score += 50;
    }
    if (score === 0) continue; // No signal it is a business channel — skip it.
    scored.push({ email, score });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.length ? scored[0].email : '';
}

function extractEmails(html: string): string[] {
  const found: string[] = [];
  // mailto: links are an explicit publication of a contact channel.
  for (const match of html.matchAll(/mailto:([^"'?>\s]+)/gi)) found.push(decodeEntities(match[1]));
  for (const match of html.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,63}/gi)) found.push(match[0]);
  return found;
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
  description: string;
  category: string;
  sourceUrl: string;
  pagesTried: number;
  /** Why nothing was found, when nothing was. */
  diagnosis: string;
  pagesFetched: number;
  rawEmailsSeen: number;
};

/**
 * Visits a company's own site and reports what it publishes. Returns empty
 * fields rather than guesses when nothing usable is found.
 */
export async function enrichCompany(website: unknown, companyName: unknown): Promise<EnrichmentResult> {
  const base = normalizeImportWebsite(website);
  const empty: EnrichmentResult = {
    email: '',
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
  let description = '';
  let title = '';
  let sourceUrl = '';
  let pagesTried = 0;
  let pagesFetched = 0;

  outer: for (const origin of origins) {
    for (const path of CANDIDATE_PATHS) {
      const url = `${origin}${path}`;
      const html = await fetchPage(url);
      pagesTried += 1;
      if (!html) continue;
      pagesFetched += 1;

      if (!description) description = extractMetaDescription(html);
      if (!title) title = extractTitle(html);

      const pageEmails = extractEmails(html);
      if (pageEmails.length) {
        candidates.push(...pageEmails);
        if (!sourceUrl) sourceUrl = url;
      }
      // A published partnerships channel is the best outcome; stop early.
      if (chooseBestEmail(candidates, host)) break outer;
    }
    if (pagesFetched) break; // The first origin that answered is the right one.
  }

  const email = chooseBestEmail(candidates, host);
  const haystack = `${companyName ?? ''} ${title} ${description}`;
  const guessed = guessCategory(haystack);

  let diagnosis = '';
  if (!pagesFetched) {
    diagnosis = `No page on ${host} could be read — the site blocked the request, timed out, or returned no HTML.`;
  } else if (!candidates.length) {
    diagnosis = `Read ${pagesFetched} page(s) on ${host} but found no email address in the HTML. The contact details are probably rendered by JavaScript or hidden behind a form.`;
  } else if (!email) {
    diagnosis = `Found ${candidates.length} address(es) on ${host}, but none looked like a business contact channel (careers, privacy, no-reply and third-party addresses are rejected).`;
  }

  return {
    email,
    description: truncate(description, 500),
    category: guessed && CATEGORY_VALUES.includes(guessed as never) ? guessed : canonicalizeImportedCategory(guessed),
    sourceUrl: email ? sourceUrl || base : '',
    pagesTried,
    pagesFetched,
    rawEmailsSeen: candidates.length,
    diagnosis
  };
}

/**
 * Second source: ask the search engine for addresses on the company's domain.
 * Many companies publish partnerships or press contacts on pages a shallow
 * crawl never reaches — a media kit, a PDF, a directory listing — and search
 * snippets surface them. Only addresses on the company's own domain are kept,
 * so a directory's own contact address can never be attributed to the brand.
 */
export async function searchForEmail(companyName: string, website: string): Promise<{ email: string; source: string }> {
  const key = process.env.SERPER_API_KEY;
  if (!key) return { email: '', source: '' };

  let host = '';
  try {
    host = new URL(normalizeImportWebsite(website)).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return { email: '', source: '' };
  }
  if (!host) return { email: '', source: '' };

  const query = `"@${host}" ${companyName} (partnerships OR marketing OR brand OR press OR business OR contact)`;
  let organic: { title?: string; link?: string; snippet?: string }[] = [];
  try {
    const response = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: query, gl: 'in', hl: 'en', num: 10 }),
      cache: 'no-store'
    });
    if (!response.ok) return { email: '', source: '' };
    organic = ((await response.json()) as { organic?: typeof organic }).organic || [];
  } catch {
    return { email: '', source: '' };
  }

  const candidates: string[] = [];
  let source = '';
  for (const item of organic) {
    const text = `${item.title || ''} ${item.snippet || ''}`;
    const found = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,63}/gi) || [];
    const onDomain = found.filter((email) => {
      const domain = email.split('@')[1]?.toLowerCase() || '';
      return domain === host || domain.endsWith(`.${host}`);
    });
    if (onDomain.length) {
      candidates.push(...onDomain);
      if (!source) source = item.link || 'search';
    }
  }

  return { email: chooseBestEmail(candidates, host), source };
}
