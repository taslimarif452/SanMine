import {
  ExtractedFact,
  FetchedPage,
  ResearchOptions,
  ResearchResult,
} from './types.js';
import { fetchWebPage, normalizeTargetUrl } from './webFetcher.js';

const DEFAULT_MAX_PAGES = 4;
const DEFAULT_TIMEOUT_MS = 10000;

/**
 * Extracts grounded, verified facts from a fetched page.
 * Every fact is directly backed by an exact source URL and raw textual evidence.
 */
export function extractFactsFromPage(page: FetchedPage): ExtractedFact[] {
  const facts: ExtractedFact[] = [];
  let factCounter = 1;

  if (page.error || page.status < 200 || page.status >= 400) {
    return facts;
  }

  // 1. Page Title fact
  if (page.title) {
    facts.push({
      id: `fact_${page.url}_title_${factCounter++}`,
      fact: `Page title is "${page.title}"`,
      sourceUrl: page.finalUrl || page.url,
      evidence: page.title,
      confidence: 'HIGH',
      category: 'general',
    });
  }

  // 2. Meta description fact
  if (page.description) {
    facts.push({
      id: `fact_${page.url}_desc_${factCounter++}`,
      fact: `Page meta description describes the business as: "${page.description}"`,
      sourceUrl: page.finalUrl || page.url,
      evidence: page.description,
      confidence: 'HIGH',
      category: 'about',
    });
  }

  // 3. Contact emails fact
  if (page.emails.length > 0) {
    for (const email of page.emails) {
      facts.push({
        id: `fact_${page.url}_email_${factCounter++}`,
        fact: `Public contact email address found: ${email}`,
        sourceUrl: page.finalUrl || page.url,
        evidence: email,
        confidence: 'HIGH',
        category: 'contact',
      });
    }
  }

  // 4. Contact phones fact
  if (page.phoneNumbers.length > 0) {
    for (const phone of page.phoneNumbers) {
      facts.push({
        id: `fact_${page.url}_phone_${factCounter++}`,
        fact: `Public telephone number found: ${phone}`,
        sourceUrl: page.finalUrl || page.url,
        evidence: phone,
        confidence: 'HIGH',
        category: 'contact',
      });
    }
  }

  // 5. Headings & Services/Offerings facts
  if (page.headings.h1.length > 0) {
    for (const h1 of page.headings.h1) {
      if (h1.length > 3 && h1.length < 150) {
        facts.push({
          id: `fact_${page.url}_h1_${factCounter++}`,
          fact: `Primary page heading highlights: "${h1}"`,
          sourceUrl: page.finalUrl || page.url,
          evidence: h1,
          confidence: 'HIGH',
          category: 'services',
        });
      }
    }
  }

  // 6. Responsive Mobile Viewport
  facts.push({
    id: `fact_${page.url}_vp_${factCounter++}`,
    fact: page.hasMobileViewport
      ? 'Configures a responsive mobile viewport tag (<meta name="viewport">).'
      : 'Missing responsive mobile viewport tag (<meta name="viewport">).',
    sourceUrl: page.finalUrl || page.url,
    evidence: page.hasMobileViewport ? 'viewport tag present' : 'no viewport tag found',
    confidence: 'HIGH',
    category: 'technology',
  });

  // 7. HTTPS Security Fact
  facts.push({
    id: `fact_${page.url}_https_${factCounter++}`,
    fact: page.isHttps
      ? 'Served securely over encrypted HTTPS protocol.'
      : 'Insecurely served over unencrypted HTTP protocol.',
    sourceUrl: page.finalUrl || page.url,
    evidence: page.finalUrl || page.url,
    confidence: 'HIGH',
    category: 'technology',
  });

  return facts;
}

/**
 * Extracts candidate service keywords from headings and readable text.
 */
export function extractServicesFromPages(pages: FetchedPage[]): string[] {
  const services = new Set<string>();

  for (const page of pages) {
    // Check h2/h3 headings on services subpages or root
    const headings = [...page.headings.h2, ...page.headings.h3];
    for (const heading of headings) {
      const trimmed = heading.trim();
      if (trimmed.length >= 4 && trimmed.length <= 60 && !trimmed.includes('\n')) {
        // Exclude generic UI headers like "Menu", "Navigation", "Footer", "Recent Posts"
        const lower = trimmed.toLowerCase();
        if (
          !lower.includes('cookie') &&
          !lower.includes('copyright') &&
          !lower.includes('privacy') &&
          !lower.includes('terms') &&
          !lower.includes('navigation') &&
          !lower.includes('subscribe') &&
          !lower.includes('quick links')
        ) {
          services.add(trimmed);
        }
      }
    }
  }

  return Array.from(services).slice(0, 15);
}

/**
 * Executes a thorough, API-free web research crawl on a target URL.
 * Fetches root page and prioritizes subpages (/about, /contact, /services, etc.).
 */
export async function conductWebResearch(
  targetUrl: string,
  options: ResearchOptions = {}
): Promise<ResearchResult> {
  const startTime = Date.now();
  const normalizedUrl = normalizeTargetUrl(targetUrl);
  const maxPages = options.maxPages || DEFAULT_MAX_PAGES;
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;

  const pages: FetchedPage[] = [];
  const allFacts: ExtractedFact[] = [];
  const contactEmails = new Set<string>();
  const phoneNumbers = new Set<string>();
  const sources = new Set<string>();
  const warnings: string[] = [];

  // Step 1: Fetch primary root page
  const rootPage = await fetchWebPage(normalizedUrl, {
    ...options,
    timeoutMs,
  });

  pages.push(rootPage);
  sources.add(rootPage.finalUrl || rootPage.url);

  if (rootPage.error || rootPage.status < 200 || rootPage.status >= 400) {
    warnings.push(`Primary page error: ${rootPage.error || `HTTP ${rootPage.status}`}`);
  } else {
    // Collect facts from root page
    const rootFacts = extractFactsFromPage(rootPage);
    allFacts.push(...rootFacts);
    rootPage.emails.forEach((e) => contactEmails.add(e));
    rootPage.phoneNumbers.forEach((p) => phoneNumbers.add(p));

    if (!rootPage.hasMobileViewport) {
      warnings.push('Website lacks a responsive mobile viewport configuration.');
    }
    if (!rootPage.isHttps) {
      warnings.push('Website is not using secure HTTPS encryption.');
    }
    if (!rootPage.description) {
      warnings.push('Website lacks an SEO meta description tag.');
    }
  }

  // Step 2: Follow relevant subpages if requested
  const followSubpages = options.followSubpages !== false;
  if (followSubpages && rootPage.links.length > 0 && !rootPage.error) {
    // Find candidate subpages sorted by priority: contact > about > services > team > location
    const priorityOrder = {
      contact: 1,
      about: 2,
      services: 3,
      products: 4,
      team: 5,
      location: 6,
      general: 7,
    };

    const candidateSubpages = rootPage.links
      .filter((link) => link.isSubpage && !link.isExternal)
      .sort((a, b) => {
        const pA = priorityOrder[a.subpageType || 'general'] || 99;
        const pB = priorityOrder[b.subpageType || 'general'] || 99;
        return pA - pB;
      });

    const crawledUrls = new Set<string>([normalizedUrl, rootPage.finalUrl]);
    const subpagesToFetch: string[] = [];

    for (const cand of candidateSubpages) {
      if (!crawledUrls.has(cand.fullUrl) && subpagesToFetch.length < maxPages - 1) {
        crawledUrls.add(cand.fullUrl);
        subpagesToFetch.push(cand.fullUrl);
      }
    }

    // Fetch candidate subpages in parallel
    if (subpagesToFetch.length > 0) {
      const subpagePromises = subpagesToFetch.map((subUrl) =>
        fetchWebPage(subUrl, {
          ...options,
          timeoutMs: Math.min(timeoutMs, 6000), // Slightly shorter timeout for subpages
        })
      );

      const subpageResults = await Promise.allSettled(subpagePromises);

      for (const res of subpageResults) {
        if (res.status === 'fulfilled') {
          const subPage = res.value;
          pages.push(subPage);
          sources.add(subPage.finalUrl || subPage.url);

          if (!subPage.error && subPage.status >= 200 && subPage.status < 400) {
            const subFacts = extractFactsFromPage(subPage);
            allFacts.push(...subFacts);
            subPage.emails.forEach((e) => contactEmails.add(e));
            subPage.phoneNumbers.forEach((p) => phoneNumbers.add(p));
          }
        }
      }
    }
  }

  const durationMs = Date.now() - startTime;
  const servicesFound = extractServicesFromPages(pages);

  return {
    query: targetUrl,
    primaryUrl: normalizedUrl,
    success: rootPage.status >= 200 && rootPage.status < 400 && !rootPage.error,
    pages,
    facts: allFacts,
    contactEmails: Array.from(contactEmails),
    phoneNumbers: Array.from(phoneNumbers),
    servicesFound,
    sources: Array.from(sources),
    warnings,
    durationMs,
    metadata: {
      pageTitle: rootPage.title || undefined,
      description: rootPage.description || undefined,
      isHttps: rootPage.isHttps,
      hasMobileViewport: rootPage.hasMobileViewport,
      totalLinksDiscovered: rootPage.links.length,
      subpagesCrawled: pages.length - 1,
    },
  };
}
