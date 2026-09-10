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
        // Identify honestly rather than impersonating a browser.
        'User-Agent': 'AsaiVerse-BrandOutreach/1.0 (+partnerships research; contact taran@asaiverse.com)',
        Accept: 'text/html,application/xhtml+xml'
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
};

/**
 * Visits a company's own site and reports what it publishes. Returns empty
 * fields rather than guesses when nothing usable is found.
 */
export async function enrichCompany(website: unknown, companyName: unknown): Promise<EnrichmentResult> {
  const base = normalizeImportWebsite(website);
  const empty: EnrichmentResult = { email: '', description: '', category: '', sourceUrl: '', pagesTried: 0 };
  if (!base) return empty;

  let host = '';
  try {
    host = new URL(base).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return empty;
  }

  const candidates: string[] = [];
  let description = '';
  let title = '';
  let sourceUrl = '';
  let pagesTried = 0;

  for (const path of CANDIDATE_PATHS) {
    const url = `${base.replace(/\/$/, '')}${path}`;
    const html = await fetchPage(url);
    pagesTried += 1;
    if (!html) continue;

    if (!description) description = extractMetaDescription(html);
    if (!title) title = extractTitle(html);

    const pageEmails = extractEmails(html);
    if (pageEmails.length) {
      candidates.push(...pageEmails);
      if (!sourceUrl) sourceUrl = url;
    }
    // A published partnerships channel is the best outcome; stop early.
    if (chooseBestEmail(candidates, host)) break;
  }

  const email = chooseBestEmail(candidates, host);
  const haystack = `${companyName ?? ''} ${title} ${description}`;
  const guessed = guessCategory(haystack);

  return {
    email,
    description: truncate(description, 500),
    category: guessed && CATEGORY_VALUES.includes(guessed as never) ? guessed : canonicalizeImportedCategory(guessed),
    sourceUrl: email ? sourceUrl || base : '',
    pagesTried
  };
}
