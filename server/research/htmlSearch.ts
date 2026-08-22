/**
 * Key-free HTML search layer used only after the paid provider attempts.
 *
 * This is intentionally a search-result parser, not a browser simulation. It
 * returns links for the agent to inspect; snippets are never promoted to facts.
 */

import {
  cleanSearchDestinationUrl,
  classifySearchItem,
  extractDomain,
  GoogleSearchResultItem,
} from './googleSearch.js';

export interface FreeHtmlSearchOptions {
  limit?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export interface FreeHtmlSearchResponse {
  query: string;
  success: boolean;
  items: GoogleSearchResultItem[];
  totalResults: number;
  engineUsed: 'google' | 'bing' | 'duckduckgo' | 'none';
  attemptedEngines: Array<'google' | 'bing' | 'duckduckgo'>;
}

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const SEARCH_HOSTS = new Set(['google.com', 'www.google.com', 'bing.com', 'www.bing.com', 'duckduckgo.com', 'html.duckduckgo.com']);

function stripMarkup(value: string): string {
  return (value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;|&quot;|&#39;|&apos;|&lt;|&gt;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isSearchHost(domain: string): boolean {
  return SEARCH_HOSTS.has(domain) || domain.endsWith('.google.com') || domain.endsWith('.bing.com');
}

function addParsedItem(
  items: GoogleSearchResultItem[],
  seenDomains: Set<string>,
  title: string,
  rawUrl: string,
  snippet: string,
  engine: 'google' | 'bing' | 'duckduckgo'
): void {
  const url = cleanSearchDestinationUrl(rawUrl);
  if (!url) return;
  const domain = extractDomain(url);
  if (!domain || !domain.includes('.') || isSearchHost(domain)) return;

  const classification = classifySearchItem(url);
  // Social profiles, directories, articles and listicles are not official
  // company candidates. The router applies the full editorial filter too;
  // this early filter keeps the HTML layer small and predictable.
  if (classification.isSocialProfile || classification.isDirectory) return;
  if (seenDomains.has(domain)) return;

  seenDomains.add(domain);
  items.push({
    title: stripMarkup(title) || domain,
    url,
    snippet: stripMarkup(snippet),
    domain,
    sourceEngine: engine,
    isOfficialWebsite: true,
    isSocialProfile: false,
    isDirectory: false,
  });
}

async function fetchText(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  fetchImpl: typeof fetch
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { ...init, signal: controller.signal });
    if (!response.ok) return '';
    return await response.text();
  } catch {
    return '';
  } finally {
    clearTimeout(timer);
  }
}

function parseGoogle(html: string, items: GoogleSearchResultItem[], seen: Set<string>, limit: number): void {
  const blocks = html.split(/<div\b[^>]*class=["'][^"']*(?:MjjYud|tF2Cxc|g)[^"']*["'][^>]*>/gi).slice(1);
  for (const block of blocks) {
    const link = block.match(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
    const title = block.match(/<h3\b[^>]*>([\s\S]*?)<\/h3>/i);
    const snippet = block.match(/<div\b[^>]*class=["'][^"']*(?:VwiC3b|yXK7lf|MUxGbd)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
    if (link) addParsedItem(items, seen, title?.[1] || link[2], link[1], snippet?.[1] || '', 'google');
    if (items.length >= limit) return;
  }

  // Google changes result markup frequently. This conservative fallback only
  // accepts anchors that contain an h3, and never treats surrounding prose as
  // a verified fact.
  if (items.length < limit) {
    const anchors = html.matchAll(/<a\b[^>]*href=["'](https?:\/\/[^"']+)["'][^>]*>[\s\S]*?<h3\b[^>]*>([\s\S]*?)<\/h3>[\s\S]*?<\/a>/gi);
    for (const match of anchors) {
      addParsedItem(items, seen, match[2], match[1], '', 'google');
      if (items.length >= limit) return;
    }
  }
}

function parseBing(html: string, items: GoogleSearchResultItem[], seen: Set<string>, limit: number): void {
  const blocks = html.split(/<li\b[^>]*class=["'][^"']*b_algo[^"']*["'][^>]*>/gi).slice(1);
  for (const block of blocks) {
    const link = block.match(/<h2[^>]*>\s*<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
    const snippet = block.match(/<p\b[^>]*>([\s\S]*?)<\/p>|<div\b[^>]*class=["'][^"']*b_caption[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
    if (link) addParsedItem(items, seen, link[2], link[1], snippet?.[1] || snippet?.[2] || '', 'bing');
    if (items.length >= limit) return;
  }
}

function parseDuckDuckGo(html: string, items: GoogleSearchResultItem[], seen: Set<string>, limit: number): void {
  const blocks = html.split(/<div\b[^>]*class=["'][^"']*result\b[^"']*["'][^>]*>/gi).slice(1);
  for (const block of blocks) {
    const link = block.match(/<a\b[^>]*class=["'][^"']*result__a[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
    const snippet = block.match(/<a\b[^>]*class=["'][^"']*result__snippet[^"']*["'][^>]*>([\s\S]*?)<\/a>/i);
    if (link) addParsedItem(items, seen, link[2], link[1], snippet?.[1] || '', 'duckduckgo');
    if (items.length >= limit) return;
  }
}

/**
 * Scrape Google, Bing, and DuckDuckGo result pages without any API key.
 * The caller owns the attempt counter; this function is deliberately unaware
 * of Tavily/Serper.
 */
export async function performFreeHtmlSearch(
  query: string,
  options: FreeHtmlSearchOptions = {}
): Promise<FreeHtmlSearchResponse> {
  const rawQuery = (query || '').trim();
  const limit = Math.min(Math.max(options.limit || 10, 1), 30);
  const timeoutMs = options.timeoutMs || 8000;
  const fetchImpl = options.fetchImpl || fetch;
  const items: GoogleSearchResultItem[] = [];
  const seenDomains = new Set<string>();
  const attemptedEngines: Array<'google' | 'bing' | 'duckduckgo'> = [];

  if (!rawQuery) {
    return { query: '', success: false, items: [], totalResults: 0, engineUsed: 'none', attemptedEngines };
  }

  const engines: Array<{
    id: 'google' | 'bing' | 'duckduckgo';
    url: string;
    init: RequestInit;
    parse: (html: string, output: GoogleSearchResultItem[], seen: Set<string>, max: number) => void;
  }> = [
    {
      id: 'google',
      url: `https://www.google.com/search?q=${encodeURIComponent(rawQuery)}&num=${limit}&hl=en`,
      init: {
        method: 'GET',
        headers: { 'User-Agent': DEFAULT_USER_AGENT, Accept: 'text/html,application/xhtml+xml' },
      },
      parse: parseGoogle,
    },
    {
      id: 'bing',
      url: `https://www.bing.com/search?q=${encodeURIComponent(rawQuery)}&count=${limit}`,
      init: {
        method: 'GET',
        headers: { 'User-Agent': DEFAULT_USER_AGENT, Accept: 'text/html,application/xhtml+xml' },
      },
      parse: parseBing,
    },
    {
      id: 'duckduckgo',
      url: `https://html.duckduckgo.com/html/?q=${encodeURIComponent(rawQuery)}`,
      init: {
        method: 'GET',
        headers: { 'User-Agent': DEFAULT_USER_AGENT, Accept: 'text/html,application/xhtml+xml' },
      },
      parse: parseDuckDuckGo,
    },
  ];

  for (const engine of engines) {
    attemptedEngines.push(engine.id);
    const html = await fetchText(engine.url, engine.init, timeoutMs, fetchImpl);
    if (html) engine.parse(html, items, seenDomains, limit);
    if (items.length >= limit) break;
  }

  const firstEngine = items[0]?.sourceEngine;
  const engineUsed: FreeHtmlSearchResponse['engineUsed'] =
    firstEngine === 'google' || firstEngine === 'bing' || firstEngine === 'duckduckgo'
      ? firstEngine
      : 'none';

  return {
    query: rawQuery,
    success: items.length > 0,
    items: items.slice(0, limit),
    totalResults: items.length,
    engineUsed,
    attemptedEngines,
  };
}
