/**
 * SANMine Web Research Engine Types
 *
 * Grounded, API-free web research and HTML extraction foundation.
 * Every extracted fact is strictly attributed to a specific source URL with raw evidence.
 */

export interface FetchedPage {
  url: string;
  finalUrl: string;
  status: number;
  statusText: string;
  contentType: string;
  isHttps: boolean;
  responseTimeMs: number;
  rawHtml?: string;
  readableText: string;
  title: string;
  description: string;
  canonicalUrl?: string;
  ogTags: Record<string, string>;
  hasMobileViewport: boolean;
  links: PageLink[];
  emails: string[];
  phoneNumbers: string[];
  headings: {
    h1: string[];
    h2: string[];
    h3: string[];
  };
  error?: string;
  fetchedAt: string;
}

export interface PageLink {
  href: string;
  fullUrl: string;
  text: string;
  isExternal: boolean;
  isSubpage: boolean;
  subpageType?: 'about' | 'contact' | 'services' | 'products' | 'team' | 'location' | 'general';
}

export interface ExtractedFact {
  id: string;
  fact: string;
  sourceUrl: string;
  evidence: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  category: 'about' | 'contact' | 'services' | 'products' | 'technology' | 'general';
}

export interface ResearchOptions {
  maxPages?: number;
  timeoutMs?: number;
  followSubpages?: boolean;
  allowedSubpaths?: string[];
  customUserAgent?: string;
  abortSignal?: AbortSignal;
}

export interface ResearchResult {
  query: string;
  primaryUrl: string;
  success: boolean;
  pages: FetchedPage[];
  facts: ExtractedFact[];
  contactEmails: string[];
  phoneNumbers: string[];
  servicesFound: string[];
  sources: string[];
  warnings: string[];
  durationMs: number;
  metadata: {
    pageTitle?: string;
    description?: string;
    isHttps: boolean;
    hasMobileViewport: boolean;
    totalLinksDiscovered: number;
    subpagesCrawled: number;
  };
}

export interface ExtractedHtmlData {
  title: string;
  description: string;
  canonicalUrl?: string;
  ogTags: Record<string, string>;
  viewportTag?: string;
  hasViewport: boolean;
  readableText: string;
  links: PageLink[];
  emails: string[];
  phones: string[];
  headings: {
    h1: string[];
    h2: string[];
    h3: string[];
  };
}
