import { ExtractedHtmlData, PageLink } from './types.js';

/**
 * Decodes common HTML entities to plaintext.
 */
export function decodeHtmlEntities(str: string): string {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, dec) => {
      try {
        return String.fromCharCode(parseInt(dec, 10));
      } catch {
        return '';
      }
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      try {
        return String.fromCharCode(parseInt(hex, 16));
      } catch {
        return '';
      }
    });
}

/**
 * Strips script tags, style blocks, comments, and SVGs from raw HTML.
 */
export function sanitizeHtml(html: string): string {
  if (!html) return '';
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, ' ')
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, ' ')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, ' ');
}

/**
 * Extracts readable, human-facing plaintext from HTML.
 */
export function extractReadableText(html: string): string {
  const sanitized = sanitizeHtml(html);
  // Replace block-level tags with linebreaks
  const withBreaks = sanitized
    .replace(/<\/(p|div|section|article|h1|h2|h3|h4|h5|h6|li|tr|header|footer)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n');

  // Strip remaining HTML tags
  const stripped = withBreaks.replace(/<[^>]+>/g, ' ');
  const decoded = decodeHtmlEntities(stripped);

  // Normalize whitespace: collapse multiple spaces and blank lines
  const lines = decoded
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0);

  return lines.join('\n');
}

/**
 * Extracts page title from `<title>` tag or `<meta property="og:title">`.
 */
export function extractTitle(html: string): string {
  if (!html) return '';
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch && titleMatch[1]) {
    const raw = decodeHtmlEntities(titleMatch[1].replace(/<[^>]+>/g, '').trim());
    if (raw.length > 0) return raw;
  }

  // Fallback to og:title
  const ogTitleMatch =
    html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i);
  if (ogTitleMatch && ogTitleMatch[1]) {
    return decodeHtmlEntities(ogTitleMatch[1].trim());
  }

  return '';
}

/**
 * Extracts meta description from `<meta name="description">` or `<meta property="og:description">`.
 */
export function extractDescription(html: string): string {
  if (!html) return '';
  const descMatch =
    html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);
  if (descMatch && descMatch[1]) {
    const raw = decodeHtmlEntities(descMatch[1].trim());
    if (raw.length > 0) return raw;
  }

  // Fallback to og:description
  const ogDescMatch =
    html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i);
  if (ogDescMatch && ogDescMatch[1]) {
    return decodeHtmlEntities(ogDescMatch[1].trim());
  }

  return '';
}

/**
 * Extracts OpenGraph metadata tags.
 */
export function extractOgTags(html: string): Record<string, string> {
  const tags: Record<string, string> = {};
  if (!html) return tags;

  const ogRegex = /<meta[^>]+property=["']og:([a-zA-Z0-9_:-]+)["'][^>]+content=["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = ogRegex.exec(html)) !== null) {
    const key = match[1].toLowerCase();
    const val = decodeHtmlEntities(match[2].trim());
    if (key && val) {
      tags[key] = val;
    }
  }

  // Also support reversed attribute order: content then property
  const ogReverseRegex = /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:([a-zA-Z0-9_:-]+)["']/gi;
  while ((match = ogReverseRegex.exec(html)) !== null) {
    const key = match[2].toLowerCase();
    const val = decodeHtmlEntities(match[1].trim());
    if (key && val && !tags[key]) {
      tags[key] = val;
    }
  }

  return tags;
}

/**
 * Checks for responsive `<meta name="viewport">` tag.
 */
export function extractViewportTag(html: string): { hasViewport: boolean; tag?: string } {
  if (!html) return { hasViewport: false };
  const viewportMatch =
    html.match(/<meta[^>]+name=["']viewport["'][^>]+content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']viewport["']/i);

  if (viewportMatch) {
    const content = viewportMatch[1].trim();
    return {
      hasViewport: content.toLowerCase().includes('width=device-width') || content.length > 0,
      tag: content,
    };
  }

  return { hasViewport: false };
}

/**
 * Extracts canonical URL from `<link rel="canonical">`.
 */
export function extractCanonicalUrl(html: string): string | undefined {
  if (!html) return undefined;
  const match =
    html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i) ||
    html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i);
  return match ? match[1].trim() : undefined;
}

/**
 * Extracts headings (h1, h2, h3).
 */
export function extractHeadings(html: string): { h1: string[]; h2: string[]; h3: string[] } {
  const headings = { h1: [] as string[], h2: [] as string[], h3: [] as string[] };
  if (!html) return headings;

  const h1Regex = /<h1\b[^>]*>([\s\S]*?)<\/h1>/gi;
  let match: RegExpExecArray | null;
  while ((match = h1Regex.exec(html)) !== null) {
    const text = decodeHtmlEntities(match[1].replace(/<[^>]+>/g, '').trim());
    if (text) headings.h1.push(text);
  }

  const h2Regex = /<h2\b[^>]*>([\s\S]*?)<\/h2>/gi;
  while ((match = h2Regex.exec(html)) !== null) {
    const text = decodeHtmlEntities(match[1].replace(/<[^>]+>/g, '').trim());
    if (text) headings.h2.push(text);
  }

  const h3Regex = /<h3\b[^>]*>([\s\S]*?)<\/h3>/gi;
  while ((match = h3Regex.exec(html)) !== null) {
    const text = decodeHtmlEntities(match[1].replace(/<[^>]+>/g, '').trim());
    if (text) headings.h3.push(text);
  }

  return headings;
}

/**
 * Strictly extracts verified public contact emails from HTML and text.
 * Filters out image assets, fonts, JavaScript artifacts, and template dummy emails.
 */
export function extractEmails(html: string, readableText: string): string[] {
  const combined = `${html} \n ${readableText}`;
  if (!combined) return [];

  // Match mailto: links first
  const mailtoRegex = /mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi;
  const rawEmails = new Set<string>();

  let mMatch: RegExpExecArray | null;
  while ((mMatch = mailtoRegex.exec(html)) !== null) {
    const email = mMatch[1].toLowerCase().trim();
    rawEmails.add(email);
  }

  // Match general email pattern
  const generalEmailRegex = /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g;
  let gMatch: RegExpExecArray | null;
  while ((gMatch = generalEmailRegex.exec(combined)) !== null) {
    const email = gMatch[0].toLowerCase().trim();
    rawEmails.add(email);
  }

  const invalidExtensions = [
    '.png',
    '.jpg',
    '.jpeg',
    '.gif',
    '.svg',
    '.webp',
    '.css',
    '.js',
    '.woff',
    '.woff2',
    '.ttf',
    '.eot',
    '.map',
  ];

  const placeholderDomains = [
    'example.com',
    'example.org',
    'domain.com',
    'yourdomain.com',
    'yoursite.com',
    'email.com',
    'test.com',
    'sample.com',
    'tempmail.com',
    'sentry.io',
    'wixpress.com',
    'schema.org',
    'w3.org',
    'gravatar.com',
  ];

  const validEmails: string[] = [];

  for (const email of rawEmails) {
    // Check extension
    if (invalidExtensions.some((ext) => email.endsWith(ext))) continue;

    // Check placeholder domains
    const domain = email.split('@')[1] || '';
    if (placeholderDomains.some((d) => domain === d || domain.endsWith(`.${d}`))) continue;

    // Check template user prefix
    const user = email.split('@')[0] || '';
    if (['user', 'username', 'name', 'yourname', 'test', 'sample', 'placeholder'].includes(user)) continue;

    // Ensure valid domain format with at least one dot and 2+ char TLD
    if (!domain.includes('.') || domain.split('.').pop()!.length < 2) continue;

    validEmails.push(email);
  }

  return Array.from(new Set(validEmails));
}

/**
 * Extracts phone numbers from `tel:` links and standard text phone patterns.
 */
export function extractPhoneNumbers(html: string, readableText: string): string[] {
  const phones = new Set<string>();

  // 1. tel: links
  const telRegex = /href=["']tel:([^"']+)["']/gi;
  let tMatch: RegExpExecArray | null;
  while ((tMatch = telRegex.exec(html)) !== null) {
    const raw = tMatch[1].replace(/[^\d+()-\s.]/g, '').trim();
    if (raw.length >= 7 && raw.length <= 25) {
      phones.add(raw);
    }
  }

  // 2. Text patterns: (123) 456-7890, +1 123 456 7890, +91 98765 43210, etc.
  const phonePattern = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}\b/g;
  let pMatch: RegExpExecArray | null;
  while ((pMatch = phonePattern.exec(readableText)) !== null) {
    const raw = pMatch[0].trim();
    const digitsOnly = raw.replace(/\D/g, '');
    if (digitsOnly.length >= 10 && digitsOnly.length <= 15) {
      phones.add(raw);
    }
  }

  return Array.from(phones);
}

/**
 * Determines the subpage classification based on URL path or anchor text.
 */
export function classifySubpageType(
  pathOrText: string
): 'about' | 'contact' | 'services' | 'products' | 'team' | 'location' | 'general' {
  const lower = pathOrText.toLowerCase();

  if (
    lower.includes('contact') ||
    lower.includes('get-in-touch') ||
    lower.includes('reach-us') ||
    lower.includes('support')
  ) {
    return 'contact';
  }

  if (
    lower.includes('about') ||
    lower.includes('our-story') ||
    lower.includes('who-we-are') ||
    lower.includes('company') ||
    lower.includes('mission')
  ) {
    return 'about';
  }

  if (
    lower.includes('service') ||
    lower.includes('what-we-do') ||
    lower.includes('offer') ||
    lower.includes('solutions') ||
    lower.includes('treatments') ||
    lower.includes('repairs') ||
    lower.includes('menu') ||
    lower.includes('pricing')
  ) {
    return 'services';
  }

  if (
    lower.includes('product') ||
    lower.includes('catalog') ||
    lower.includes('shop') ||
    lower.includes('store') ||
    lower.includes('inventory')
  ) {
    return 'products';
  }

  if (
    lower.includes('team') ||
    lower.includes('staff') ||
    lower.includes('leadership') ||
    lower.includes('doctors') ||
    lower.includes('attorneys') ||
    lower.includes('dentists')
  ) {
    return 'team';
  }

  if (
    lower.includes('location') ||
    lower.includes('directions') ||
    lower.includes('find-us') ||
    lower.includes('address') ||
    lower.includes('hours')
  ) {
    return 'location';
  }

  return 'general';
}

/**
 * Extracts links from HTML and classifies internal subpages.
 */
export function extractLinks(html: string, baseUrl: string): PageLink[] {
  const links: PageLink[] = [];
  if (!html) return links;

  let baseOrigin = '';
  let baseHostname = '';
  try {
    const parsed = new URL(baseUrl);
    baseOrigin = parsed.origin;
    baseHostname = parsed.hostname.replace(/^www\./, '');
  } catch {
    return links;
  }

  const linkRegex = /<a\b[^>]*\bhref=["']([^"'#][^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  const seenUrls = new Set<string>();

  while ((match = linkRegex.exec(html)) !== null) {
    const href = match[1].trim();
    const text = decodeHtmlEntities(match[2].replace(/<[^>]+>/g, '').trim());

    if (!href || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) {
      continue;
    }

    let fullUrl = '';
    try {
      fullUrl = new URL(href, baseOrigin).href;
    } catch {
      continue;
    }

    if (seenUrls.has(fullUrl)) continue;
    seenUrls.add(fullUrl);

    let isExternal = false;
    let isSubpage = false;
    let subpageType: PageLink['subpageType'] = 'general';

    try {
      const parsedFull = new URL(fullUrl);
      const fullHostname = parsedFull.hostname.replace(/^www\./, '');
      isExternal = fullHostname !== baseHostname;

      if (!isExternal) {
        const path = parsedFull.pathname;
        if (path && path !== '/' && path !== '') {
          isSubpage = true;
          subpageType = classifySubpageType(`${path} ${text}`);
        }
      }
    } catch {
      continue;
    }

    links.push({
      href,
      fullUrl,
      text: text.slice(0, 80),
      isExternal,
      isSubpage,
      subpageType,
    });
  }

  return links;
}

/**
 * Parses raw HTML into structured, verified extracted data.
 */
export function extractHtmlData(html: string, baseUrl: string): ExtractedHtmlData {
  const title = extractTitle(html);
  const description = extractDescription(html);
  const canonicalUrl = extractCanonicalUrl(html);
  const ogTags = extractOgTags(html);
  const viewport = extractViewportTag(html);
  const readableText = extractReadableText(html);
  const links = extractLinks(html, baseUrl);
  const emails = extractEmails(html, readableText);
  const phones = extractPhoneNumbers(html, readableText);
  const headings = extractHeadings(html);

  return {
    title,
    description,
    canonicalUrl,
    ogTags,
    viewportTag: viewport.tag,
    hasViewport: viewport.hasViewport,
    readableText,
    links,
    emails,
    phones,
    headings,
  };
}
