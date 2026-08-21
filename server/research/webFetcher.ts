import { FetchedPage, ResearchOptions } from './types.js';
import { extractHtmlData } from './htmlExtractor.js';

const DEFAULT_TIMEOUT_MS = 10000;
const MAX_BODY_BYTES = 2 * 1024 * 1024; // 2MB cap
const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (compatible; SANMineWebResearch/1.0; +https://sanmine.ai/bot)';

/**
 * Normalizes input URL ensuring a valid HTTP/HTTPS protocol.
 */
export function normalizeTargetUrl(rawUrl: string): string {
  let trimmed = rawUrl.trim();
  if (!trimmed) return '';

  if (!/^https?:\/\//i.test(trimmed)) {
    trimmed = `https://${trimmed}`;
  }

  try {
    const parsed = new URL(trimmed);
    return parsed.href;
  } catch {
    return trimmed;
  }
}

/**
 * Fetches a single public web page over HTTPS/HTTP, parses HTML, and returns structured page data.
 * Does not implement stealth automation, anti-bot evasions, or proxy rotation.
 */
export async function fetchWebPage(
  rawUrl: string,
  options: ResearchOptions = {}
): Promise<FetchedPage> {
  const url = normalizeTargetUrl(rawUrl);
  const startTime = Date.now();
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;

  const controller = new AbortController();
  let timeoutId: any = null;

  if (options.abortSignal) {
    options.abortSignal.addEventListener('abort', () => controller.abort());
  }

  timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  const defaultEmptyPage: FetchedPage = {
    url,
    finalUrl: url,
    status: 0,
    statusText: 'Unreachable',
    contentType: '',
    isHttps: url.startsWith('https://'),
    responseTimeMs: 0,
    readableText: '',
    title: '',
    description: '',
    ogTags: {},
    hasMobileViewport: false,
    links: [],
    emails: [],
    phoneNumbers: [],
    headings: { h1: [], h2: [], h3: [] },
    fetchedAt: new Date().toISOString(),
  };

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': options.customUserAgent || DEFAULT_USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
      },
      signal: controller.signal,
      redirect: 'follow',
    });

    clearTimeout(timeoutId);
    const duration = Date.now() - startTime;
    const finalUrl = response.url || url;
    const status = response.status;
    const statusText = response.statusText;
    const contentType = response.headers.get('content-type') || '';
    const isHttps = finalUrl.startsWith('https://');

    // Only process text/html or text/plain responses
    if (!contentType.includes('text/html') && !contentType.includes('text/plain') && !contentType.includes('application/xhtml')) {
      return {
        ...defaultEmptyPage,
        finalUrl,
        status,
        statusText,
        contentType,
        isHttps,
        responseTimeMs: duration,
        error: `Non-HTML content type received: ${contentType || 'unknown'}`,
      };
    }

    const rawHtml = await response.text();
    const cappedHtml = rawHtml.length > MAX_BODY_BYTES ? rawHtml.slice(0, MAX_BODY_BYTES) : rawHtml;

    const extracted = extractHtmlData(cappedHtml, finalUrl);

    return {
      url,
      finalUrl,
      status,
      statusText,
      contentType,
      isHttps,
      responseTimeMs: duration,
      rawHtml: cappedHtml,
      readableText: extracted.readableText,
      title: extracted.title,
      description: extracted.description,
      canonicalUrl: extracted.canonicalUrl,
      ogTags: extracted.ogTags,
      hasMobileViewport: extracted.hasViewport,
      links: extracted.links,
      emails: extracted.emails,
      phoneNumbers: extracted.phones,
      headings: extracted.headings,
      fetchedAt: new Date().toISOString(),
    };
  } catch (err: any) {
    if (timeoutId) clearTimeout(timeoutId);
    const duration = Date.now() - startTime;
    const isTimeout = err.name === 'AbortError' || err.message?.includes('aborted');

    return {
      ...defaultEmptyPage,
      responseTimeMs: duration,
      error: isTimeout ? `Request timed out after ${timeoutMs}ms` : (err.message || 'Fetch failed'),
    };
  }
}
