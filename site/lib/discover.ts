/**
 * Brand discovery through Google's Custom Search JSON API.
 *
 * This is the official, quota-governed search API — not scraped result pages,
 * which Google blocks and forbids. Each category runs one India-targeted query
 * and the organic results become candidate companies: a name, a website and
 * the category that found them. Nothing here has an email address and nothing
 * here is approved; candidates enter the Sheet as NEW and take the same path
 * as a hand-imported list — research, then the approval gates, then sending.
 */

import { CATEGORY_VALUES } from './constants';
import { safeDisplayText, truncate } from './text';

export class DiscoveryNotConfigured extends Error {
  readonly status = 409;
  constructor(message: string) {
    super(message);
    this.name = 'DiscoveryNotConfigured';
  }
}

/** One query per category, phrased to surface brands rather than articles. */
const CATEGORY_QUERIES: Record<string, string> = {
  'Gaming Peripherals': 'gaming peripherals brand India official site',
  'PC Hardware': 'PC components graphics card brand India official site',
  Laptops: 'gaming laptop brand India official site',
  Smartphones: 'smartphone brand India official site',
  'Consumer Electronics': 'consumer electronics brand India official site',
  'Gaming Accessories': 'gaming chair keyboard mouse brand India official site',
  Audio: 'headphones earbuds audio brand India official site',
  'Technology Startup': 'technology startup India consumer brand official site',
  'SaaS / AI': 'AI software company India official site',
  'Telecom / Internet': 'broadband internet provider India official site',
  'Food / FMCG': 'snacks FMCG brand India official site',
  Beverage: 'energy drink beverage brand India official site',
  'Fashion / Streetwear': 'streetwear apparel brand India official site',
  Automotive: 'electric scooter motorcycle brand India official site',
  'Education / EdTech': 'edtech platform India official site',
  'Gaming Community': 'esports organisation India official site',
  'Creator / Entertainment': 'creator network entertainment company India official site'
};

/**
 * Hosts that are never a brand's own site: marketplaces, social networks,
 * publishers, directories. A result on one of these is an article about
 * brands, not a brand.
 */
const BLOCKED_HOSTS = [
  'amazon.', 'flipkart.', 'myntra.', 'snapdeal.', 'meesho.', 'nykaa.', 'ajio.',
  'wikipedia.org', 'wikimedia.org', 'linkedin.com', 'facebook.com', 'instagram.com',
  'twitter.com', 'x.com', 'youtube.com', 'reddit.com', 'quora.com', 'medium.com',
  'pinterest.', 'glassdoor.', 'indeed.', 'naukri.', 'crunchbase.com', 'tracxn.com',
  'zaubacorp.', 'tofler.', 'justdial.com', 'indiamart.com', 'tradeindia.com',
  'sulekha.com', 'gadgets360.com', 'ndtv.com', 'timesofindia.', 'hindustantimes.',
  'indianexpress.', 'economictimes.', 'livemint.', 'moneycontrol.', 'business-standard.',
  'yourstory.com', 'inc42.com', 'techcrunch.com', 'forbes.com', 'entrepreneur.com',
  'google.', 'apple.com', 'microsoft.com', 'blogspot.', 'wordpress.com', 'wixsite.com',
  'shopify.com', 'github.com', 'play.google', 'apps.apple'
];

/** Titles that signal a roundup rather than a company. */
const LISTICLE_TITLE = /\b(top|best|list of|\d+\s+(?:best|top)|vs\.?|comparison|review|ranked|guide)\b/i;

const registrableHost = (url: string): string => {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
};

/** "Cosmic Byte - India's Gaming Gear | Official" -> "Cosmic Byte". */
function companyNameFromTitle(title: string, host: string): string {
  const first = safeDisplayText(title)
    .split(/\s[|\-–—:•]\s/)[0]
    .replace(/\b(official|website|site|india|online|store|shop|home|buy)\b/gi, '')
    .replace(/[™®©]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (first && first.length >= 2 && first.length <= 60 && !/^https?:/i.test(first)) return first;

  // Fall back to the domain label, title-cased.
  const label = host.split('.')[0] || '';
  return label ? label.charAt(0).toUpperCase() + label.slice(1) : '';
}

export type Candidate = {
  company: string;
  website: string;
  category: string;
  snippet: string;
};

type SearchItem = { title?: string; link?: string; snippet?: string };

async function searchOnce(query: string): Promise<SearchItem[]> {
  const key = process.env.GOOGLE_CSE_KEY;
  const cx = process.env.GOOGLE_CSE_ID;
  if (!key || !cx) {
    throw new DiscoveryNotConfigured(
      'Discovery needs GOOGLE_CSE_KEY and GOOGLE_CSE_ID. Enable the Custom Search API in the Cloud project, create an API key, and create a Programmable Search Engine set to search the whole web.'
    );
  }

  const url =
    'https://www.googleapis.com/customsearch/v1' +
    `?key=${encodeURIComponent(key)}&cx=${encodeURIComponent(cx)}` +
    `&q=${encodeURIComponent(query)}&num=10&gl=in&cr=countryIN&safe=active`;

  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    if (response.status === 429) {
      throw new DiscoveryNotConfigured('Custom Search daily quota is exhausted (100 free queries per day).');
    }
    throw new Error(`Custom Search failed (${response.status}): ${safeDisplayText(detail).slice(0, 200)}`);
  }

  const body = (await response.json()) as { items?: SearchItem[] };
  return body.items || [];
}

/**
 * Runs discovery for the requested categories, or every configured one.
 * Returns de-duplicated candidates not already present in `knownHosts`.
 */
export async function discoverBrands(
  categories: string[],
  knownHosts: Set<string>,
  maxQueries: number
): Promise<{ candidates: Candidate[]; queriesRun: number; rejected: number }> {
  const wanted = categories.length
    ? categories.filter((category) => CATEGORY_QUERIES[category])
    : Object.keys(CATEGORY_QUERIES);

  const seen = new Set<string>(knownHosts);
  const candidates: Candidate[] = [];
  let queriesRun = 0;
  let rejected = 0;

  for (const category of wanted.slice(0, maxQueries)) {
    const items = await searchOnce(CATEGORY_QUERIES[category]);
    queriesRun += 1;

    for (const item of items) {
      const host = registrableHost(item.link || '');
      if (!host) continue;

      if (BLOCKED_HOSTS.some((blocked) => host === blocked || host.includes(blocked)) ||
          LISTICLE_TITLE.test(item.title || '')) {
        rejected += 1;
        continue;
      }
      if (seen.has(host)) continue;
      seen.add(host);

      const company = companyNameFromTitle(item.title || '', host);
      if (!company) continue;

      candidates.push({
        company: truncate(company, 200),
        website: `https://${host}`,
        category: CATEGORY_VALUES.includes(category as never) ? category : 'Other',
        snippet: truncate(safeDisplayText(item.snippet), 300)
      });
    }
  }

  return { candidates, queriesRun, rejected };
}

export const discoveryCategories = (): string[] => Object.keys(CATEGORY_QUERIES);
