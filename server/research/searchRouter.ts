/**
 * Deterministic web-search router.
 *
 * The agent has one discovery tool: `search_web`. Provider selection is a
 * backend concern and is controlled by the attempt number:
 *   0 -> Tavily, 1 -> Serper, 2+ -> free HTML result pages.
 *
 * Search output is a candidate URL queue. A result title or snippet is not a
 * verified company fact; only an inspected official page may create an entity.
 */

import {
  OfficialProviderId,
  performOfficialProviderSearch,
  toGoogleSearchResultItems,
} from './officialSearch.js';
import { performFreeHtmlSearch } from './htmlSearch.js';
import { buildWebSearchQuery } from './searchQuery.js';
import { GoogleSearchResultItem, extractDomain } from './googleSearch.js';

export interface SearchWebOptions {
  attempt?: number;
  limit?: number;
  location?: string;
  industry?: string;
  timeoutMs?: number;
  now?: () => number;
  fetchImpl?: typeof fetch;
}

export interface SearchWebResponse {
  query: string;
  success: boolean;
  items: GoogleSearchResultItem[];
  totalResults: number;
  engineUsed: 'tavily' | 'serper' | 'google' | 'bing' | 'duckduckgo' | 'none';
  providerUsed: 'tavily' | 'serper' | 'html' | 'none';
  attempt: number;
  providersAttempted: OfficialProviderId[];
  attemptedEngines: Array<'google' | 'bing' | 'duckduckgo'>;
  /** True when an API key exists for the selected official attempt. */
  hasProviderKey: boolean;
  /** Explicitly documents that these are destinations, not verified facts. */
  candidatesAreUrlsOnly: true;
}

/**
 * Domains that are useful as context but are not official company candidates.
 * Keep this list in one place so a listicle cannot become a verified entity.
 */
export const NON_OFFICIAL_CANDIDATE_DOMAINS = new Set([
  'growth.cx',
  'f6s.com',
  'yourstory.com',
  'inc42.com',
  'inc42.in',
  'clutch.co',
  'justdial.com',
  'wikipedia.org',
  'wikimedia.org',
  'crunchbase.com',
  'pitchbook.com',
  'tracxn.com',
  'glassdoor.com',
  'ambitionbox.com',
  'zaubacorp.com',
  'tofler.in',
  'sulekha.com',
  'indiamart.com',
  'tradeindia.com',
  'yellowpages.com',
  'yelp.com',
  'tripadvisor.com',
  'g2.com',
  'capterra.com',
  'producthunt.com',
  'linkedin.com',
  'facebook.com',
  'instagram.com',
  'twitter.com',
  'x.com',
  'youtube.com',
  'reddit.com',
  'quora.com',
  'medium.com',
  'forbes.com',
  'techcrunch.com',
  'entrackr.com',
  'inc42.in',
]);

const NON_OFFICIAL_PATH = /\/(?:blog|blogs)(?:\/|$)|(?:^|\/)top-[^/]*|(?:^|\/)best-[^/]*/i;
const LISTICLE_TITLE = /\b(?:top\s*\d+|\d+\s+(?:best|top)|best\s+(?:saas|software|companies|startups)|list\s+of|ranking|roundup)\b/i;

function domainMatches(domain: string, blocked: string): boolean {
  return domain === blocked || domain.endsWith(`.${blocked}`);
}

export function isNonOfficialCandidateUrl(rawUrl: string, title = ''): boolean {
  if (!rawUrl || typeof rawUrl !== 'string') return true;
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`);
  } catch {
    return true;
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) return true;
  const domain = parsed.hostname.toLowerCase().replace(/^www\./, '');
  if (!domain || !domain.includes('.')) return true;
  if ([...NON_OFFICIAL_CANDIDATE_DOMAINS].some((blocked) => domainMatches(domain, blocked))) return true;
  if (NON_OFFICIAL_PATH.test(parsed.pathname.toLowerCase())) return true;
  if (LISTICLE_TITLE.test(title || '')) return true;
  return false;
}

/** Normalize an inspected destination to its official homepage. */
export function normalizeOfficialHomepage(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`);
    parsed.hash = '';
    parsed.search = '';
    parsed.username = '';
    parsed.password = '';
    parsed.hostname = parsed.hostname.replace(/^www\./i, '');
    parsed.pathname = '/';
    return parsed.toString();
  } catch {
    return '';
  }
}

function dedupeOfficialResults(items: GoogleSearchResultItem[]): GoogleSearchResultItem[] {
  const seenDomains = new Set<string>();
  const deduped: GoogleSearchResultItem[] = [];

  for (const item of items) {
    if (!item?.url || isNonOfficialCandidateUrl(item.url, item.title)) continue;
    const homepage = normalizeOfficialHomepage(item.url);
    const domain = extractDomain(homepage);
    if (!homepage || !domain || seenDomains.has(domain)) continue;
    seenDomains.add(domain);
    deduped.push({
      ...item,
      url: homepage,
      domain,
      isOfficialWebsite: true,
      isSocialProfile: false,
      isDirectory: false,
    });
  }
  return deduped;
}

export function filterOfficialCandidates(items: GoogleSearchResultItem[]): GoogleSearchResultItem[] {
  return dedupeOfficialResults(items);
}

function emptyResponse(query: string, attempt: number): SearchWebResponse {
  return {
    query,
    success: false,
    items: [],
    totalResults: 0,
    engineUsed: 'none',
    providerUsed: 'none',
    attempt,
    providersAttempted: [],
    attemptedEngines: [],
    hasProviderKey: false,
    candidatesAreUrlsOnly: true,
  };
}

/**
 * Route one search attempt. Do not move provider selection into a prompt or
 * ask the LLM to choose an API; the attempt number is the state-machine input.
 */
export async function searchWeb(
  query: string,
  options: SearchWebOptions = {}
): Promise<SearchWebResponse> {
  const attempt = Number.isFinite(options.attempt) ? Math.max(0, Math.floor(options.attempt!)) : 0;
  const builtQuery = buildWebSearchQuery(query, {
    location: options.location,
    industry: options.industry,
  });
  if (!builtQuery) return emptyResponse('', attempt);

  const limit = Math.min(Math.max(options.limit || 10, 1), 30);
  const timeoutMs = options.timeoutMs || 8000;

  if (attempt === 0 || attempt === 1) {
    const provider: OfficialProviderId = attempt === 0 ? 'tavily' : 'serper';
    const official = await performOfficialProviderSearch(provider, builtQuery, {
      limit,
      timeoutMs,
      now: options.now,
      fetchImpl: options.fetchImpl,
    });
    const candidates = filterOfficialCandidates(toGoogleSearchResultItems(official.items));
    return {
      query: builtQuery,
      success: candidates.length > 0,
      items: candidates.slice(0, limit),
      totalResults: candidates.length,
      engineUsed: candidates.length > 0 ? provider : 'none',
      providerUsed: provider,
      attempt,
      providersAttempted: official.providersAttempted,
      attemptedEngines: [],
      hasProviderKey: official.hasAnyKey,
      candidatesAreUrlsOnly: true,
    };
  }

  const html = await performFreeHtmlSearch(builtQuery, {
    limit,
    timeoutMs,
    fetchImpl: options.fetchImpl,
  });
  const candidates = filterOfficialCandidates(html.items);
  const firstEngine = candidates[0]?.sourceEngine;
  const engineUsed: SearchWebResponse['engineUsed'] =
    firstEngine === 'google' || firstEngine === 'bing' || firstEngine === 'duckduckgo'
      ? firstEngine
      : 'none';
  return {
    query: builtQuery,
    success: candidates.length > 0,
    items: candidates.slice(0, limit),
    totalResults: candidates.length,
    engineUsed,
    providerUsed: 'html',
    attempt,
    providersAttempted: [],
    attemptedEngines: html.attemptedEngines,
    hasProviderKey: false,
    candidatesAreUrlsOnly: true,
  };
}

export interface OfficialCandidateLike {
  url: string;
  title?: string;
  domain?: string;
  snippet?: string;
  [key: string]: any;
}

/**
 * Select the next unvisited official homepage, deduplicating by domain. This
 * is used by the deterministic brain state machine after every search.
 */
export function pickUnvisitedOfficialCandidate<T extends OfficialCandidateLike>(
  candidates: T[],
  visitedUrls: Set<string> | string[] = new Set<string>(),
  visitedDomains: Set<string> | string[] = new Set<string>()
): T | undefined {
  const visitedUrlSet = visitedUrls instanceof Set ? visitedUrls : new Set(visitedUrls);
  const visitedDomainSet = visitedDomains instanceof Set ? visitedDomains : new Set(visitedDomains);

  for (const candidate of candidates || []) {
    if (!candidate?.url || isNonOfficialCandidateUrl(candidate.url, candidate.title || '')) continue;
    const homepage = normalizeOfficialHomepage(candidate.url);
    const domain = extractDomain(homepage);
    if (!homepage || !domain) continue;
    if (visitedUrlSet.has(candidate.url) || visitedUrlSet.has(homepage)) continue;
    if ([...visitedDomainSet].some((visited) => visited.replace(/^www\./, '').toLowerCase() === domain)) continue;

    return {
      ...candidate,
      url: homepage,
      domain,
    };
  }
  return undefined;
}

export { buildWebSearchQuery } from './searchQuery.js';
