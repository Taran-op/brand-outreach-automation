/**
 * Telling a brand name from a description of one.
 *
 * Discovery reads company names off search results, and a search result's
 * title is often what a company does rather than what it is called: "AI
 * Development Services Company for Business Automation". Addressing an email
 * to that is worse than not naming the company at all, so every place a name
 * is shown to a brand asks here first, and falls back to a formal greeting
 * when the cell holds a description.
 */

import { safeDisplayText } from './text';

/**
 * Words that describe an industry, a service or a superlative. A real brand
 * name can contain one — Tata Consultancy Services — but a name made mostly
 * of them is a description, which is what the length and word-count limits
 * below catch.
 */
const DESCRIPTOR_WORDS = [
  'services',
  'service',
  'solutions',
  'solution',
  'development',
  'developers',
  'agency',
  'agencies',
  'provider',
  'providers',
  'manufacturer',
  'manufacturers',
  'supplier',
  'suppliers',
  'distributor',
  'wholesale',
  'consultancy',
  'consulting',
  'specialist',
  'specialists',
  'experts',
  'expert',
  'outsourcing',
  'freelance',
  'best',
  'top',
  'leading',
  'cheapest',
  'affordable',
  'trusted',
  'certified',
  'award',
  'winning',
  'number',
  'no1',
  'reviews',
  'review',
  'directory',
  'listing',
  'marketplace',
  'near',
  'welcome',
  'homepage',
  'untitled'
];

/** Phrases that only ever appear in a description or a page title. */
const DESCRIPTOR_PHRASES = [
  ' for business',
  ' for businesses',
  ' for startups',
  ' in india',
  ' near me',
  ' company for',
  ' services in',
  ' solutions for',
  'list of ',
  'how to ',
  'what is ',
  'we provide',
  'we offer'
];

/** Domain labels that name a service or a page, never the brand behind it. */
const WEAK_DOMAIN_LABELS = new Set([
  'www',
  'web',
  'site',
  'sites',
  'home',
  'info',
  'mail',
  'shop',
  'store',
  'online',
  'app',
  'apps',
  'my',
  'the',
  'india',
  'business',
  'company',
  'services',
  'solutions',
  'blog',
  'news',
  'page',
  'pages'
]);

const words = (value: string): string[] => value.split(/\s+/).filter(Boolean);

/**
 * True when a value reads as something a person would call the company, not
 * a summary of what it sells. Deliberately strict: a wrong "Dear Sir/Ma'am"
 * costs nothing, while "Dear AI Development Services Company team" costs the
 * lead.
 */
export function looksLikeBrandName(value: unknown): boolean {
  const name = safeDisplayText(value);
  if (!name) return false;
  if (name.length < 2 || name.length > 45) return false;

  const lower = name.toLowerCase();
  if (DESCRIPTOR_PHRASES.some((phrase) => lower.includes(phrase))) return false;

  const parts = words(name);
  // Four words is a generous ceiling for a name: The Whole Truth Foods fits,
  // a sentence about what a company does does not.
  if (parts.length > 4) return false;
  if (DESCRIPTOR_WORDS.some((word) => parts.some((part) => part.replace(/[^a-z0-9]/gi, '').toLowerCase() === word))) {
    return false;
  }

  // "10 Best Gaming Brands", "#1 Rated" — a roundup, not a company.
  if (/^[#\d]/.test(name)) return false;
  // A name is mostly letters; a title tends to carry punctuation and clauses.
  if ((name.match(/[,;:|/\\]/g) || []).length > 0) return false;
  if (!/[a-z]/i.test(name)) return false;

  return true;
}

/**
 * The brand as its own domain spells it: "cosmicbyte.com" -> "Cosmicbyte",
 * "green-soul.co.in" -> "Green Soul". Returns empty when the label carries no
 * name of its own, rather than inventing one.
 */
export function brandFromWebsite(website: unknown): string {
  let host = '';
  try {
    const raw = safeDisplayText(website);
    host = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).hostname.toLowerCase();
  } catch {
    return '';
  }

  const label = host.replace(/^www\./, '').split('.')[0] || '';
  if (!label || label.length < 3 || label.length > 24) return '';
  if (WEAK_DOMAIN_LABELS.has(label)) return '';
  if (/^\d+$/.test(label)) return '';

  const spelled = label
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
  return looksLikeBrandName(spelled) ? spelled : '';
}

/**
 * The best name available for a lead: what the operator or the site calls it,
 * otherwise what its domain spells, otherwise nothing.
 */
export const displayBrand = (company: unknown, website: unknown): string =>
  looksLikeBrandName(company) ? safeDisplayText(company) : brandFromWebsite(website);

/**
 * How the email opens. A named contact wins; a real brand name becomes
 * "<Brand> team"; anything else becomes the formal address, because a
 * description read back to a company reads as a mail merge that went wrong.
 */
export function greetingFor(contactName: unknown, company: unknown): string {
  const contact = safeDisplayText(contactName);
  if (contact) return contact;
  return looksLikeBrandName(company) ? `${safeDisplayText(company)} team` : "Sir/Ma'am";
}
