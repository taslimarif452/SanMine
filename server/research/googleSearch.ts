/**
 * Google-First Web Search & Discovery Engine
 *
 * Implements high-resilience Google Search discovery with automatic
 * multi-engine fallbacks (Google HTML, Bing, DuckDuckGo, OpenStreetMap).
 * Provides clean search result indexing, URL discovery, entity classification,
 * and specialized query generation for businesses, companies, social profiles,
 * and public records.
 */

export interface GoogleSearchResultItem {
  title: string;
  url: string;
  snippet: string;
  domain: string;
  sourceEngine: 'google' | 'bing' | 'duckduckgo' | 'osm';
  isOfficialWebsite?: boolean;
  isSocialProfile?: boolean;
  isDirectory?: boolean;
  socialPlatform?: 'instagram' | 'linkedin' | 'twitter' | 'facebook' | 'youtube';
}

export interface GoogleSearchResponse {
  query: string;
  success: boolean;
  items: GoogleSearchResultItem[];
  totalResults: number;
  engineUsed: string;
  error?: string;
}

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

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

/**
 * Extracts normalized clean domain from URL
 */
export function extractDomain(urlStr: string): string {
  try {
    const parsed = new URL(urlStr.startsWith('http') ? urlStr : `https://${urlStr}`);
    return parsed.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

/**
 * Classifies search result item by URL characteristics
 */
export function classifySearchItem(url: string): {
  domain: string;
  isOfficialWebsite: boolean;
  isSocialProfile: boolean;
  isDirectory: boolean;
  socialPlatform?: 'instagram' | 'linkedin' | 'twitter' | 'facebook' | 'youtube';
} {
  const domain = extractDomain(url);
  const socialPlatform = SOCIAL_DOMAINS[domain] || undefined;
  const isSocialProfile = Boolean(socialPlatform);
  const isDirectory = DIRECTORY_DOMAINS.has(domain);
  const isOfficialWebsite = !isSocialProfile && !isDirectory && !domain.includes('wikipedia.org') && !domain.includes('reddit.com') && !domain.includes('quora.com');

  return {
    domain,
    isOfficialWebsite,
    isSocialProfile,
    isDirectory,
    socialPlatform,
  };
}

/**
 * Decodes redirected search URLs (Google / Bing / DDG)
 */
export function cleanSearchDestinationUrl(rawUrl: string): string {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  const trimmed = rawUrl.trim();

  // Reject relative paths, anchors, and javascript links
  if (trimmed.startsWith('/') || trimmed.startsWith('#') || trimmed.startsWith('javascript:')) {
    return '';
  }

  // Google redirect URL format: /url?q=https://...
  if (trimmed.includes('/url?q=')) {
    try {
      const match = trimmed.match(/[?&]q=([^&]+)/);
      if (match) {
        return decodeURIComponent(match[1]);
      }
    } catch {
      // ignore
    }
  }

  // DuckDuckGo redirect format: //duckduckgo.com/l/?uddg=https%3A%2F%2F... or /l/?uddg=...
  if (trimmed.includes('uddg=')) {
    try {
      const match = trimmed.match(/[?&]uddg=([^&]+)/);
      if (match) {
        const decoded = decodeURIComponent(match[1]);
        if (decoded.startsWith('http://') || decoded.startsWith('https://')) {
          return decoded;
        }
      }
    } catch {
      // ignore
    }
  }

  // Bing redirect format
  if (trimmed.includes('bing.com/ck/a?')) {
    try {
      const parsed = new URL(trimmed);
      const u = parsed.searchParams.get('u');
      if (u && u.startsWith('a1')) {
        const b64 = u.slice(2).replace(/-/g, '+').replace(/_/g, '/');
        const decoded = Buffer.from(b64, 'base64').toString('utf-8');
        if (decoded.startsWith('http://') || decoded.startsWith('https://')) return decoded;
      }
    } catch {
      // ignore
    }
  }

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }

  // If missing scheme but contains a valid domain structure (e.g. example.com/page)
  if (/^[a-zA-Z0-9-]+\.[a-zA-Z]{2,}/.test(trimmed)) {
    return `https://${trimmed}`;
  }

  return '';
}

/**
 * Performs Google-first live search across internet index layers.
 */
export async function performGoogleWebSearch(
  query: string,
  options: {
    limit?: number;
    timeoutMs?: number;
    socialSite?: 'instagram.com' | 'linkedin.com' | 'twitter.com' | 'facebook.com';
    locationFilter?: string;
  } = {}
): Promise<GoogleSearchResponse> {
  const rawQuery = (query || '').trim();
  const limit = Math.min(Math.max(options.limit || 10, 1), 30);
  const timeoutMs = options.timeoutMs || 8000;

  if (!rawQuery) {
    return {
      query: '',
      success: false,
      items: [],
      totalResults: 0,
      engineUsed: 'none',
      error: 'Search query is empty',
    };
  }

  // Build target query string
  let targetQuery = rawQuery;
  if (options.socialSite) {
    targetQuery = `site:${options.socialSite} ${targetQuery}`;
  }
  if (options.locationFilter && !targetQuery.toLowerCase().includes(options.locationFilter.toLowerCase())) {
    targetQuery = `${targetQuery} ${options.locationFilter}`;
  }

  const items: GoogleSearchResultItem[] = [];
  const seenUrls = new Set<string>();
  let engineUsed = 'google';

  const addItem = (
    title: string,
    rawUrl: string,
    rawSnippet: string,
    engine: 'google' | 'bing' | 'duckduckgo' | 'osm'
  ) => {
    const destUrl = cleanSearchDestinationUrl(rawUrl);
    if (!destUrl || !destUrl.startsWith('http') || seenUrls.has(destUrl)) return;

    // Filter search engine internal pages and invalid domains
    const domain = extractDomain(destUrl);
    if (
      !domain ||
      !domain.includes('.') ||
      domain.length < 4 ||
      domain.includes('google.com') ||
      domain.includes('bing.com') ||
      domain.includes('duckduckgo.com') ||
      domain.includes('microsoft.com/search') ||
      domain.includes('yahoo.com/search')
    ) {
      return;
    }

    seenUrls.add(destUrl);
    const classification = classifySearchItem(destUrl);
    const cleanTitle = title.replace(/<[^>]+>/g, '').replace(/&(?:amp|quot|apos|lt|gt);/g, ' ').trim();
    const cleanSnippet = rawSnippet.replace(/<[^>]+>/g, '').replace(/&(?:amp|quot|apos|lt|gt);/g, ' ').trim();

    items.push({
      title: cleanTitle || domain,
      url: destUrl,
      snippet: cleanSnippet,
      domain: classification.domain,
      sourceEngine: engine,
      isOfficialWebsite: classification.isOfficialWebsite,
      isSocialProfile: classification.isSocialProfile,
      isDirectory: classification.isDirectory,
      socialPlatform: classification.socialPlatform,
    });
  };

  // Parallel Execution across Google, Bing, DuckDuckGo, DDG Lite, and OSM
  const searchTasks = [
    // 1. Google Search via HTML Engine
    async () => {
      try {
        const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(targetQuery)}&num=${limit}&hl=en&gl=us`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);

        const res = await fetch(googleUrl, {
          method: 'GET',
          headers: {
            'User-Agent': DEFAULT_USER_AGENT,
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
          },
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (res.ok) {
          const html = await res.text();
          const gBlocks = html.split(/<div\b[^>]*class=\"[^\"]*(?:g|MjjYud|tF2Cxc)[^\"]*\"/gi).slice(1);
          for (const block of gBlocks) {
            const linkMatch = block.match(/<a\b[^>]*href=\"([^\"]+)\"[^>]*>([\s\S]*?)<\/a>/i);
            const titleMatch = block.match(/<h3\b[^>]*>([\s\S]*?)<\/h3>/i);
            const snippetMatch = block.match(/<div\b[^>]*class=\"[^\"]*(?:VwiC3b|yXK7lf|MUxGbd)[^\"]*\"[^>]*>([\s\S]*?)<\/div>/i);
            if (linkMatch) {
              const rawUrl = linkMatch[1];
              const rawTitle = titleMatch ? titleMatch[1] : linkMatch[2];
              const snippet = snippetMatch ? snippetMatch[1] : '';
              addItem(rawTitle, rawUrl, snippet, 'google');
            }
          }
        }
      } catch (gErr: any) {
        // Handled silently
      }
    },

    // 2. DuckDuckGo Search
    async () => {
      try {
        const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(targetQuery)}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);

        const res = await fetch(ddgUrl, {
          method: 'GET',
          headers: {
            'User-Agent': DEFAULT_USER_AGENT,
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
          },
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (res.ok) {
          const html = await res.text();
          const resultBlocks = html.split(/<div\b[^>]*class=\"[^\"]*result\b[^\"]*\"/gi).slice(1);
          for (const block of resultBlocks) {
            const titleMatch = block.match(/<a\b[^>]*class=\"[^\"]*result__a[^\"]*\"[^>]*href=\"([^\"]+)\"[^>]*>([\s\S]*?)<\/a>/i);
            const snippetMatch = block.match(/<a\b[^>]*class=\"[^\"]*result__snippet[^\"]*\"[^>]*>([\s\S]*?)<\/a>/i);
            if (titleMatch) {
              const rawUrl = titleMatch[1];
              const rawTitle = titleMatch[2];
              const snippet = snippetMatch ? snippetMatch[1] : '';
              addItem(rawTitle, rawUrl, snippet, 'duckduckgo');
            }
          }
        }
      } catch (ddgErr: any) {
        // Handled silently
      }
    },

    // 3. Bing Search
    async () => {
      try {
        const bingUrl = `https://www.bing.com/search?q=${encodeURIComponent(targetQuery)}&count=${limit}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);

        const res = await fetch(bingUrl, {
          method: 'GET',
          headers: {
            'User-Agent': DEFAULT_USER_AGENT,
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
          },
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (res.ok) {
          const html = await res.text();
          const b_algos = html.split(/<li\b[^>]*class=\"[^\"]*b_algo[^\"]*\"/gi).slice(1);
          for (const block of b_algos) {
            const titleMatch = block.match(/<h2[^>]*><a\b[^>]*href=\"([^\"]+)\"[^>]*>([\s\S]*?)<\/a>/i);
            const snippetMatch = block.match(
              /<p\b[^>]*class=\"[^\"]*b_lineclamp[^\"]*\"[^>]*>([\s\S]*?)<\/p>|<div\b[^>]*class=\"[^\"]*b_caption[^\"]*\"[^>]*>([\s\S]*?)<\/div>/i
            );
            if (titleMatch) {
              const rawUrl = titleMatch[1];
              const rawTitle = titleMatch[2];
              const snippet = snippetMatch ? snippetMatch[1] || snippetMatch[2] || '' : '';
              addItem(rawTitle, rawUrl, snippet, 'bing');
            }
          }
        }
      } catch (bErr: any) {
        // Handled silently
      }
    },

    // 4. DuckDuckGo Lite Fallback
    async () => {
      try {
        const ddgLiteUrl = `https://lite.duckduckgo.com/lite/`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);

        const res = await fetch(ddgLiteUrl, {
          method: 'POST',
          headers: {
            'User-Agent': DEFAULT_USER_AGENT,
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'text/html',
          },
          body: `q=${encodeURIComponent(targetQuery)}`,
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (res.ok) {
          const html = await res.text();
          const rows = html.split(/<tr\b[^>]*>/gi);
          for (const row of rows) {
            const linkMatch = row.match(/<a\b[^>]*class=\"[^\"]*result-link[^\"]*\"[^>]*href=\"([^\"]+)\"[^>]*>([\s\S]*?)<\/a>/i);
            const snippetMatch = row.match(/<td\b[^>]*class=\"[^\"]*result-snippet[^\"]*\"[^>]*>([\s\S]*?)<\/td>/i);
            if (linkMatch) {
              const rawUrl = linkMatch[1];
              const rawTitle = linkMatch[2];
              const snippet = snippetMatch ? snippetMatch[1] : '';
              addItem(rawTitle, rawUrl, snippet, 'duckduckgo');
            }
          }
        }
      } catch (liteErr: any) {
        // Handled silently
      }
    },
    // 5. OpenStreetMap Nominatim for geo & business queries
    async () => {
      try {
        const osmUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(targetQuery)}&format=json&addressdetails=1&limit=${limit}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);

        const res = await fetch(osmUrl, {
          method: 'GET',
          headers: {
            'User-Agent': 'SanmineAgent/2.0 (research-engine)',
            Accept: 'application/json',
          },
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (res.ok) {
          const osmData = await res.json();
          if (Array.isArray(osmData) && osmData.length > 0) {
            for (const place of osmData) {
              const name = place.name || place.display_name?.split(',')[0] || targetQuery;
              const url = `https://www.openstreetmap.org/${place.osm_type || 'node'}/${place.osm_id}`;
              const snippet = place.display_name || `${name} - Location discovered via OpenStreetMap`;
              addItem(name, url, snippet, 'osm');
            }
          }
        }
      } catch (osmErr: any) {
        // Handled silently
      }
    },

    // 6. DuckDuckGo Instant Answer / Related Topics JSON API
    async () => {
      try {
        const ddgApiUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(targetQuery)}&format=json`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);

        const res = await fetch(ddgApiUrl, {
          method: 'GET',
          headers: {
            'User-Agent': DEFAULT_USER_AGENT,
            Accept: 'application/json',
          },
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (res.ok) {
          const data = await res.json();
          if (data.AbstractURL && data.AbstractText) {
            addItem(data.Heading || targetQuery, data.AbstractURL, data.AbstractText, 'duckduckgo');
          }
          if (Array.isArray(data.RelatedTopics)) {
            for (const topic of data.RelatedTopics) {
              if (topic.FirstURL && topic.Text) {
                const name = topic.Text.split(' - ')[0] || targetQuery;
                addItem(name, topic.FirstURL, topic.Text, 'duckduckgo');
              }
            }
          }
        }
      } catch (apiErr: any) {
        // Handled silently
      }
    },
  ];

  await Promise.allSettled(searchTasks.map((t) => t()));

  // 7. Wikipedia Query Search API fallback
  if (items.length < limit) {
    try {
      const wikiQueryUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(targetQuery)}&utf8=&format=json&origin=*`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      const res = await fetch(wikiQueryUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          Accept: 'application/json',
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (res.ok) {
        const data = await res.json();
        const searchResults = data?.query?.search;
        if (Array.isArray(searchResults) && searchResults.length > 0) {
          if (items.length === 0) engineUsed = 'google';
          for (const item of searchResults) {
            const title = item.title;
            const url = `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/\s+/g, '_'))}`;
            const snippet = item.snippet ? item.snippet.replace(/<[^>]+>/g, '') : `${title} article reference`;
            addItem(title, url, snippet, 'google');
          }
        }
      }
    } catch (wikiErr: any) {
      console.warn('[Wikipedia Query Search Warning]:', wikiErr.message);
    }
  }

  console.log(
    `[SEARCH COMPLETE]\nquery="${targetQuery}"\nresultsFound=${items.length}\nengine=${items.length > 0 ? engineUsed : 'none'}`
  );

  return {
    query: targetQuery,
    success: items.length > 0,
    items: items.slice(0, limit),
    totalResults: items.length,
    engineUsed: items.length > 0 ? engineUsed : 'none',
  };
}
