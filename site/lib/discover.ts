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

import { brandFromWebsite, looksLikeBrandName } from './brand';
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

/**
 * "Cosmic Byte - India's Gaming Gear | Official" -> "Cosmic Byte".
 *
 * A title is only sometimes a name. Plenty read "AI Development Services
 * Company for Business Automation", which is a description of the business,
 * and putting that in the Company cell means the outreach email addresses a
 * brand by what it sells. So each segment of the title is tried in turn and
 * kept only if it reads as a name; the domain's own spelling is the fallback,
 * and an empty result — no row — is better than a sentence.
 */
function companyNameFromTitle(title: string, host: string): string {
  const clean = (value: string) =>
    value
      .replace(/^(?:home|welcome(?: to)?|official website of)\b[\s:–—-]*/i, '')
      .replace(/\b(official|website|site|online|store|shop|homepage|buy)\b/gi, '')
      .replace(/[™®©]/g, '')
      .replace(/\s{2,}/g, ' ')
      .replace(/^[\s|\-–—:•,]+|[\s|\-–—:•,]+$/g, '')
      .trim();

  for (const segment of safeDisplayText(title).split(/\s[|\-–—:•]\s|(?:\s[|•]\s?)/)) {
    const candidate = clean(segment);
    if (candidate && looksLikeBrandName(candidate)) return candidate;
  }
  return brandFromWebsite(`https://${host}`);
}

export type Candidate = {
  company: string;
  website: string;
  category: string;
  snippet: string;
};

type SearchItem = { title?: string; link?: string; snippet?: string };

/**
 * Brave Search: whole-web by default, one key, no engine to configure. This is
 * the primary provider because Google's Programmable Search Engine will not
 * enable "search the entire web" on every account, and without that setting
 * it only searches sites you list — useless for discovery.
 */
async function searchBrave(query: string, key: string): Promise<SearchItem[]> {
  const url =
    'https://api.search.brave.com/res/v1/web/search' +
    `?q=${encodeURIComponent(query)}&count=10&country=IN&search_lang=en&safesearch=moderate`;

  const response = await fetch(url, {
    headers: { Accept: 'application/json', 'X-Subscription-Token': key },
    cache: 'no-store'
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    if (response.status === 429) {
      throw new DiscoveryNotConfigured('Brave Search quota is exhausted for now (the free plan allows 2,000 queries a month).');
    }
    if (response.status === 401 || response.status === 403) {
      throw new DiscoveryNotConfigured('Brave rejected BRAVE_SEARCH_KEY. Check the key at brave.com/search/api.');
    }
    throw new Error(`Brave Search failed (${response.status}): ${safeDisplayText(detail).slice(0, 200)}`);
  }

  const body = (await response.json()) as { web?: { results?: { title?: string; url?: string; description?: string }[] } };
  return (body.web?.results || []).map((item) => ({
    title: item.title,
    link: item.url,
    snippet: item.description
  }));
}

/** Google Custom Search, kept as the fallback for accounts where it works. */
async function searchGoogle(query: string, key: string, cx: string): Promise<SearchItem[]> {
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
 * Serper: Google's own results through an API, 2,500 free queries on signup
 * with no card. The closest thing to "what would Google show" for a query.
 */
async function searchSerper(query: string, key: string): Promise<SearchItem[]> {
  const response = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: query, gl: 'in', hl: 'en', num: 10 }),
    cache: 'no-store'
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    if (response.status === 401 || response.status === 403) {
      throw new DiscoveryNotConfigured('Serper rejected SERPER_API_KEY. Check the key at serper.dev.');
    }
    if (response.status === 429 || /credits/i.test(detail)) {
      throw new DiscoveryNotConfigured('Serper credits are exhausted. Top up at serper.dev or switch providers.');
    }
    throw new Error(`Serper failed (${response.status}): ${safeDisplayText(detail).slice(0, 200)}`);
  }

  const body = (await response.json()) as { organic?: { title?: string; link?: string; snippet?: string }[] };
  return body.organic || [];
}

/** Tavily: 1,000 free queries a month, no card. */
async function searchTavily(query: string, key: string): Promise<SearchItem[]> {
  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, max_results: 10, search_depth: 'basic', country: 'india' }),
    cache: 'no-store'
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    if (response.status === 401 || response.status === 403) {
      throw new DiscoveryNotConfigured('Tavily rejected TAVILY_API_KEY. Check the key at tavily.com.');
    }
    if (response.status === 429 || response.status === 432) {
      throw new DiscoveryNotConfigured('Tavily monthly credits are exhausted; they reset each month.');
    }
    throw new Error(`Tavily failed (${response.status}): ${safeDisplayText(detail).slice(0, 200)}`);
  }

  const body = (await response.json()) as { results?: { title?: string; url?: string; content?: string }[] };
  return (body.results || []).map((item) => ({ title: item.title, link: item.url, snippet: item.content }));
}

/** First configured provider wins. */
async function searchOnce(query: string): Promise<SearchItem[]> {
  const serper = process.env.SERPER_API_KEY;
  if (serper) return searchSerper(query, serper);

  const tavily = process.env.TAVILY_API_KEY;
  if (tavily) return searchTavily(query, tavily);

  const brave = process.env.BRAVE_SEARCH_KEY;
  if (brave) return searchBrave(query, brave);

  const key = process.env.GOOGLE_CSE_KEY;
  const cx = process.env.GOOGLE_CSE_ID;
  if (key && cx) return searchGoogle(query, key, cx);

  throw new DiscoveryNotConfigured(
    'Discovery needs a search key. Set SERPER_API_KEY (serper.dev, 2,500 free queries, no card) ' +
      'or TAVILY_API_KEY (tavily.com, 1,000 free a month, no card). BRAVE_SEARCH_KEY and Google Custom Search also work.'
  );
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
