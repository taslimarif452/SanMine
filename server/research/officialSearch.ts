/**
 * Official (key-based) Web Search with Automatic Failover
 *
 * Order of operations:
 *   1. Tavily  (TAVILY_API_KEY)
 *   2. Serper  (SERPER_API_KEY)  — used immediately if Tavily
 *      is rate-limited / quota-exhausted / unauthenticated / down
 *   3. Neither provider returns hits → caller falls back to the legacy
 *      Google / Bing / DuckDuckGo HTML scraping layer.
 *
 * Provider failures (HTTP 402 / 429 / 432, quota / credits / invalid key
 * messages, or network outage) put that provider on a ~45 minute cooldown
 * so subsequent requests skip it non-stop instead of waiting on a dead key.
 *
 * If NO search keys are configured the module returns 0 items and NEVER
 * invents companies, emails, or other facts.
 *
 * API key values are read from the server environment only. They are never
 * logged, returned to the frontend, or embedded in diagnostics.
 */

import type { GoogleSearchResultItem } from './googleSearch.js';
import { buildWebSearchQuery } from './searchQuery.js';

export type OfficialProviderId = 'tavily' | 'serper';

export interface OfficialSearchResultItem {
  title: string;
  url: string;
  snippet: string;
  domain: string;
  sourceEngine: 'tavily' | 'serper';
  isOfficialWebsite?: boolean;
  isSocialProfile?: boolean;
  isDirectory?: boolean;
  socialPlatform?: 'instagram' | 'linkedin' | 'twitter' | 'facebook' | 'youtube';
}

export interface OfficialSearchResponse {
  query: string;
  success: boolean;
  items: OfficialSearchResultItem[];
  totalResults: number;
  /** Provider that produced hits, or 'none' if no provider could. */
  providerUsed: OfficialProviderId | 'none';
  /** Providers attempted (including any that were skipped due to cooldown). */
  providersAttempted: OfficialProviderId[];
  /** Providers currently on cooldown at the time of the call. */
  cooldownProviders: OfficialProviderId[];
  /** True when at least one valid API key is configured. */
  hasAnyKey: boolean;
}

export interface OfficialSearchOptions {
  limit?: number;
  timeoutMs?: number;
  /** Restrict this call to one provider for deterministic router attempts. */
  provider?: OfficialProviderId;
  /** Injectable clock / fetch for unit tests (not used by production code). */
  now?: () => number;
  fetchImpl?: typeof fetch;
}

const COOLDOWN_MS = 45 * 60 * 1000; // ~45 minutes
const DEFAULT_TIMEOUT_MS = 8000;

// In-memory cooldown table. Serverless instances keep their own; a warm
// instance will skip exhausted providers non-stop until the cooldown
// elapses, which is the intended behaviour.
interface CooldownEntry {
  until: number;
  reason: string;
}
const providerCooldown: Partial<Record<OfficialProviderId, CooldownEntry>> = {};

// Re-exported for tests / diagnostics. Never contains key material.
export function getCooldownState(now: number = Date.now()): Array<{
  provider: OfficialProviderId;
  onCooldown: boolean;
  remainingMs: number;
  reason: string;
}> {
  return (['tavily', 'serper'] as OfficialProviderId[]).map((provider) => {
    const entry = providerCooldown[provider];
    const remaining = entry ? Math.max(0, entry.until - now) : 0;
    return {
      provider,
      onCooldown: remaining > 0,
      remainingMs: remaining,
      reason: entry?.reason || '',
    };
  });
}

/** Test-only: reset cooldown table. */
export function __resetOfficialSearchCooldownsForTests(): void {
  for (const key of Object.keys(providerCooldown) as OfficialProviderId[]) {
    delete providerCooldown[key];
  }
}

function readTavilyKey(): string {
  return (process.env.TAVILY_API_KEY || '').trim();
}

function readSerperKey(): string {
  return (process.env.SERPER_API_KEY || '').trim();
}

/** Diagnostic booleans only — never reveal key material. */
export function hasTavilyKey(): boolean {
  return Boolean(readTavilyKey());
}

export function hasSerperKey(): boolean {
  return Boolean(readSerperKey());
}

function getPrimaryProvider(): OfficialProviderId {
  const raw = (process.env.SEARCH_PRIMARY || 'tavily').trim().toLowerCase();
  return raw === 'serper' ? 'serper' : 'tavily';
}

function setCooldown(provider: OfficialProviderId, reason: string, now: number): void {
  providerCooldown[provider] = {
    until: now + COOLDOWN_MS,
    reason: reason.slice(0, 200),
  };
  console.warn(
    `[OFFICIAL SEARCH] Provider "${provider}" placed on ~45 min cooldown: ${reason}`
  );
}

function isOnCooldown(provider: OfficialProviderId, now: number): boolean {
  const entry = providerCooldown[provider];
  if (!entry) return false;
  if (entry.until <= now) {
    delete providerCooldown[provider];
    return false;
  }
  return true;
}

/**
 * Classifies an error response from a search provider.
 *
 * Returns `{ failover: true }` when the provider should be treated as
 * exhausted / unavailable and the next provider should be tried immediately,
 * while also placing the failed provider on cooldown.
 */
function classifyProviderFailure(
  provider: OfficialProviderId,
  status: number | undefined,
  bodyText: string
): { failover: boolean; reason: string } {
  const lower = (bodyText || '').toLowerCase();

  // Explicit HTTP status codes that mean "stop using this provider for now".
  if (status === 429 || status === 402 || status === 432) {
    return { failover: true, reason: `HTTP ${status}` };
  }

  // Auth failure: invalid / missing / unauthorized key.
  if (status === 401 || status === 403) {
    return { failover: true, reason: `HTTP ${status} (invalid/unauthorized key)` };
  }

  // Server-side outage of the provider.
  if (status !== undefined && status >= 500) {
    return { failover: true, reason: `HTTP ${status} (provider down)` };
  }

  // Body-text quota / credit / auth signals (defence in depth).
  if (
    lower.includes('quota') ||
    lower.includes('rate limit') ||
    lower.includes('too many requests') ||
    lower.includes('insufficient credits') ||
    lower.includes('out of credits') ||
    lower.includes('no credits') ||
    lower.includes('invalid api key') ||
    lower.includes('unauthorized') ||
    lower.includes('forbidden')
  ) {
    return { failover: true, reason: `provider indicated quota/auth failure (HTTP ${status ?? 'n/a'})` };
  }

  // A 4xx on a bad request is not a quota/auth failure; do not cooldown.
  return { failover: false, reason: `HTTP ${status ?? 'network'} — not a quota/auth error` };
}

function stripHtml(input: string): string {
  return (input || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(?:amp|quot|apos|lt|gt|#39|#34);/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractDomain(urlStr: string): string {
  try {
    const parsed = new URL(urlStr.startsWith('http') ? urlStr : `https://${urlStr}`);
    return parsed.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

const SOCIAL_DOMAINS: Record<string, 'instagram' | 'linkedin' | 'twitter' | 'facebook' | 'youtube'> = {
  'instagram.com': 'instagram',
  'www.instagram.com': 'instagram',
  'linkedin.com': 'linkedin',
  'www.linkedin.com': 'linkedin',
  'twitter.com': 'twitter',
  'www.twitter.com': 'twitter',
  'x.com': 'twitter',
  'www.x.com': 'twitter',
  'facebook.com': 'facebook',
  'www.facebook.com': 'facebook',
  'youtube.com': 'youtube',
  'www.youtube.com': 'youtube',
};

const DIRECTORY_DOMAINS = new Set([
  'justdial.com',
  'indiamart.com',
  'tradeindia.com',
  'sulekha.com',
  'yellowpages.com',
  'yelp.com',
  'tripadvisor.com',
  'zaubacorp.com',
  'tofler.in',
  'crunchbase.com',
  'pitchbook.com',
  'glassdoor.com',
  'ambitionbox.com',
  'f6s.com',
]);

function classifyUrl(rawUrl: string): {
  domain: string;
  isOfficialWebsite: boolean;
  isSocialProfile: boolean;
  isDirectory: boolean;
  socialPlatform?: 'instagram' | 'linkedin' | 'twitter' | 'facebook' | 'youtube';
} {
  const domain = extractDomain(rawUrl);
  const socialPlatform = SOCIAL_DOMAINS[domain] || undefined;
  const isSocialProfile = Boolean(socialPlatform);
  const isDirectory = DIRECTORY_DOMAINS.has(domain);
  const isOfficialWebsite =
    !isSocialProfile &&
    !isDirectory &&
    !domain.includes('wikipedia.org') &&
    !domain.includes('reddit.com') &&
    !domain.includes('quora.com');

  return { domain, isOfficialWebsite, isSocialProfile, isDirectory, socialPlatform };
}

function buildItem(
  title: string,
  url: string,
  snippet: string,
  provider: OfficialProviderId
): OfficialSearchResultItem | null {
  const cleanUrl = (url || '').trim();
  if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
    return null;
  }
  const domain = extractDomain(cleanUrl);
  if (!domain || !domain.includes('.') || domain.length < 4) {
    return null;
  }
  // Drop search-engine-internal URLs defensively.
  if (
    domain.includes('google.com') ||
    domain.includes('bing.com') ||
    domain.includes('duckduckgo.com') ||
    domain.includes('tavily.com') ||
    domain.includes('serper.dev')
  ) {
    return null;
  }

  const c = classifyUrl(cleanUrl);
  return {
    title: stripHtml(title) || domain,
    url: cleanUrl,
    snippet: stripHtml(snippet),
    domain: c.domain,
    sourceEngine: provider,
    isOfficialWebsite: c.isOfficialWebsite,
    isSocialProfile: c.isSocialProfile,
    isDirectory: c.isDirectory,
    socialPlatform: c.socialPlatform,
  };
}

async function callTavily(
  query: string,
  limit: number,
  timeoutMs: number,
  fetchImpl: typeof fetch
): Promise<{ items: OfficialSearchResultItem[]; failure?: { reason: string; cooldown: boolean } }> {
  const apiKey = readTavilyKey();
  if (!apiKey) {
    return { items: [], failure: { reason: 'no Tavily key configured', cooldown: false } };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetchImpl('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: 'basic',
        max_results: limit,
        include_answer: false,
      }),
      signal: controller.signal,
    });

    const rawText = await res.text();
    if (!res.ok) {
      const verdict = classifyProviderFailure('tavily', res.status, rawText);
      return {
        items: [],
        failure: { reason: verdict.reason, cooldown: verdict.failover },
      };
    }

    let data: any = {};
    try {
      data = rawText ? JSON.parse(rawText) : {};
    } catch {
      return {
        items: [],
        failure: { reason: 'Tavily returned non-JSON response', cooldown: false },
      };
    }

    const results = Array.isArray(data.results) ? data.results : [];
    const items: OfficialSearchResultItem[] = [];
    for (const r of results) {
      const item = buildItem(r?.title, r?.url, r?.content, 'tavily');
      if (item) items.push(item);
    }
    return { items };
  } catch (err: any) {
    const name = err?.name || '';
    // Network / DNS / timeout → provider is effectively down; cooldown briefly.
    if (name === 'AbortError') {
      return { items: [], failure: { reason: 'Tavily request timed out', cooldown: true } };
    }
    return {
      items: [],
      failure: { reason: `Tavily network error: ${err?.message || 'unknown'}`, cooldown: true },
    };
  } finally {
    clearTimeout(timer);
  }
}

async function callSerper(
  query: string,
  limit: number,
  timeoutMs: number,
  fetchImpl: typeof fetch
): Promise<{ items: OfficialSearchResultItem[]; failure?: { reason: string; cooldown: boolean } }> {
  const apiKey = readSerperKey();
  if (!apiKey) {
    return { items: [], failure: { reason: 'no Serper key configured', cooldown: false } };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetchImpl('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': apiKey,
      },
      body: JSON.stringify({
        q: query,
        num: limit,
      }),
      signal: controller.signal,
    });

    const rawText = await res.text();
    if (!res.ok) {
      const verdict = classifyProviderFailure('serper', res.status, rawText);
      return {
        items: [],
        failure: { reason: verdict.reason, cooldown: verdict.failover },
      };
    }

    let data: any = {};
    try {
      data = rawText ? JSON.parse(rawText) : {};
    } catch {
      return {
        items: [],
        failure: { reason: 'Serper returned non-JSON response', cooldown: false },
      };
    }

    const organic = Array.isArray(data.organic) ? data.organic : [];
    const items: OfficialSearchResultItem[] = [];
    for (const r of organic) {
      const item = buildItem(r?.title, r?.link, r?.snippet, 'serper');
      if (item) items.push(item);
    }
    return { items };
  } catch (err: any) {
    const name = err?.name || '';
    if (name === 'AbortError') {
      return { items: [], failure: { reason: 'Serper request timed out', cooldown: true } };
    }
    return {
      items: [],
      failure: { reason: `Serper network error: ${err?.message || 'unknown'}`, cooldown: true },
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Performs official (key-based) web search with automatic failover.
 *
 * Returns hits from the first provider that succeeds. On quota/auth/network
 * failure the exhausted provider is put on a ~45 minute cooldown and the
 * next provider is tried immediately. A zero-length `items` array with
 * `providerUsed: 'none'` is the honest "no results" signal — callers must
 * NOT fabricate data in that case.
 */
export async function performOfficialWebSearch(
  query: string,
  options: OfficialSearchOptions = {}
): Promise<OfficialSearchResponse> {
  const rawQuery = (query || '').trim();
  const normalizedQuery = buildWebSearchQuery(rawQuery) || rawQuery;
  const limit = Math.min(Math.max(options.limit || 10, 1), 30);
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const fetchImpl: typeof fetch = options.fetchImpl || fetch;
  const now = options.now || Date.now;

  const hasAnyKey = options.provider
    ? options.provider === 'tavily'
      ? Boolean(readTavilyKey())
      : Boolean(readSerperKey())
    : Boolean(readTavilyKey() || readSerperKey());

  const base: OfficialSearchResponse = {
    query: normalizedQuery,
    success: false,
    items: [],
    totalResults: 0,
    providerUsed: 'none',
    providersAttempted: [],
    cooldownProviders: [],
    hasAnyKey,
  };

  if (!rawQuery) {
    return { ...base, query: '' };
  }

  // No keys at all → zero results, never invent.
  if (!hasAnyKey) {
    console.log('[OFFICIAL SEARCH] No TAVILY_API_KEY or SERPER_API_KEY configured; skipping official search.');
    return base;
  }

  const primary = getPrimaryProvider();
  const order: OfficialProviderId[] = options.provider
    ? [options.provider]
    : primary === 'serper'
    ? ['serper', 'tavily']
    : ['tavily', 'serper'];

  const cooldownNow = now();
  const cooldownProviders = order.filter((p) => isOnCooldown(p, cooldownNow));
  base.cooldownProviders = cooldownProviders;

  for (const provider of order) {
    if (isOnCooldown(provider, now())) {
      // Exhausted provider — skip non-stop.
      continue;
    }

    base.providersAttempted.push(provider);

    const outcome =
      provider === 'tavily'
        ? await callTavily(normalizedQuery, limit, timeoutMs, fetchImpl)
        : await callSerper(normalizedQuery, limit, timeoutMs, fetchImpl);

    if (outcome.failure) {
      if (outcome.failure.cooldown) {
        setCooldown(provider, outcome.failure.reason, now());
      } else {
        console.warn(`[OFFICIAL SEARCH] ${provider} failed without cooldown: ${outcome.failure.reason}`);
      }
      continue;
    }

    if (outcome.items.length > 0) {
      return {
        ...base,
        success: true,
        items: outcome.items.slice(0, limit),
        totalResults: outcome.items.length,
        providerUsed: provider,
        cooldownProviders: getCooldownState(now())
          .filter((c) => c.onCooldown)
          .map((c) => c.provider),
      };
    }

    // A successful call that simply returned 0 results is NOT a failure —
    // do not fail over to the other paid provider (would waste credits and
    // change ranking). Let the caller's HTML fallback take over.
    break;
  }

  return {
    ...base,
    cooldownProviders: getCooldownState(now())
      .filter((c) => c.onCooldown)
      .map((c) => c.provider),
  };
}

/**
 * Executes exactly one official provider. The search router uses this method
 * to make provider choice a backend attempt (0 = Tavily, 1 = Serper), rather
 * than an LLM decision. The legacy `performOfficialWebSearch` above remains
 * available for callers that need its automatic Tavily → Serper failover.
 */
export async function performOfficialProviderSearch(
  provider: OfficialProviderId,
  query: string,
  options: Omit<OfficialSearchOptions, 'provider'> = {}
): Promise<OfficialSearchResponse> {
  return performOfficialWebSearch(query, { ...options, provider });
}

/**
 * Adapter: maps official search items onto the legacy GoogleSearchResultItem
 * shape used throughout the rest of the codebase.
 */
export function toGoogleSearchResultItems(items: OfficialSearchResultItem[]): GoogleSearchResultItem[] {
  return items.map((it) => ({
    title: it.title,
    url: it.url,
    snippet: it.snippet,
    domain: it.domain,
    sourceEngine: it.sourceEngine,
    isOfficialWebsite: it.isOfficialWebsite,
    isSocialProfile: it.isSocialProfile,
    isDirectory: it.isDirectory,
    socialPlatform: it.socialPlatform,
  }));
}
