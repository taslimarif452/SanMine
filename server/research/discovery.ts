import { FetchedPage, ResearchResult } from './types.js';
import { fetchWebPage, normalizeTargetUrl } from './webFetcher.js';
import { conductWebResearch } from './researchEngine.js';
import { normalizeRequestedLocation, verifyBusinessLocation } from '../search/location.js';

export interface DiscoveredBusiness {
  id: string;
  name: string;
  address: string;
  city?: string;
  phone?: string;
  email?: string;
  website?: string;
  category?: string;
  rating?: number;
  reviewsCount?: number;
  verifiedLocation?: string;
  sourceUrl?: string;
  sources?: string[];
  qualityScore?: number;
  acceptanceReason?: string;
  description?: string;
  services?: string[];
  audit?: {
    responseTimeMs: number;
    isHttps: boolean;
    hasMobileViewport: boolean;
    pageTitle?: string;
  };
}

export interface WebDiscoveryResult {
  query: string;
  location: string;
  providerQuery: string;
  success: boolean;
  businesses: DiscoveredBusiness[];
  sourcesFound: string[];
  totalFound: number;
  message: string;
  error?: string;
}

interface CandidateEvidence {
  source: 'openstreetmap' | 'bing' | 'duckduckgo' | 'website_crawl';
  sourceUrl?: string;
  title?: string;
  snippet?: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  category?: string;
}

interface DiscoveredCandidate {
  id: string;
  normalizedName: string;
  displayName: string;
  domain: string;
  normalizedPhone: string;
  website?: string;
  address?: string;
  phone?: string;
  email?: string;
  category?: string;
  snippet?: string;
  sources: string[];
  evidence: CandidateEvidence[];
  isDirect: boolean;
  verifiedLocation?: string;
  qualityScore?: number;
  acceptanceReason?: string;
  audit?: {
    responseTimeMs: number;
    isHttps: boolean;
    hasMobileViewport: boolean;
    pageTitle?: string;
  };
  services?: string[];
  description?: string;
}

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

const GENERIC_NAMES = new Set([
  'shop',
  'shops',
  'store',
  'stores',
  'service',
  'services',
  'restaurant',
  'restaurants',
  'cafe',
  'cafes',
  'clinic',
  'clinics',
  'dentist',
  'dentists',
  'gym',
  'gyms',
  'salon',
  'salons',
  'business',
  'businesses',
  'local business',
  'local shop',
  'local store',
  'shop 1',
  'store 1',
  'commercial',
  'retail',
  'outlet',
  'office',
  'vendor',
  'market',
  'supermarket',
  'mart',
  'mall',
  'local services',
  'small business',
  'company',
  'center',
  'centre',
]);

export type BusinessEntityType =
  | 'INDIVIDUAL_LOCAL_BUSINESS'
  | 'BUSINESS_DIRECTORY'
  | 'ARTICLE'
  | 'BLOG_POST'
  | 'BUSINESS_IDEA_PAGE'
  | 'LISTICLE'
  | 'FRANCHISE_PAGE'
  | 'NEWS_PAGE'
  | 'ORGANIZATION_OVERVIEW'
  | 'SEARCH_RESULT_PAGE'
  | 'SOFTWARE/PRODUCT'
  | 'OTHER_NON_BUSINESS';

export interface EntityClassificationResult {
  type: BusinessEntityType;
  isIndividualBusiness: boolean;
  rejectionReason?: string;
  matchedPatterns?: string[];
}

const EDITORIAL_OR_AGGREGATOR_HOSTS = new Set([
  'amazon.com',
  'amazon.co.uk',
  'amazon.in',
  'flipkart.com',
  'walmart.com',
  'ebay.com',
  'etsy.com',
  'target.com',
  'f6s.com',
  'growthromeo.com',
  '99businessideas.com',
  'viestories.com',
  'franchiseindia.com',
  'wanderlog.com',
  'datagemba.com',
  'meraapnabihar.com',
  'tracxn.com',
  'startupranking.com',
  'ambitionbox.com',
  'instafinancials.com',
  'zaubacorp.com',
  'tofler.in',
  'economictimes.com',
  'financialexpress.com',
  'business-standard.com',
  'livemint.com',
  'yourstory.com',
  'inc42.com',
  'entrackr.com',
  'sulekha.com',
  'indiamart.com',
  'tradeindia.com',
  'justdial.com',
  'yellowpages.com',
  'yelp.com',
  'tripadvisor.com',
  'quora.com',
  'medium.com',
  'wikipedia.org',
  'wikimedia.org',
  'reddit.com',
  'tasteofhome.com',
  'allrecipes.com',
  'foodandwine.com',
  'foodnetwork.com',
  'simplyrecipes.com',
  'thepioneerwoman.com',
  'acouplecooks.com',
  'sallysbakingaddiction.com',
  'gourmettraveller.com.au',
  'support.microsoft.com',
  'answers.microsoft.com',
  'blogs.windows.com',
  'blogs.microsoft.com',
  'techcommunity.microsoft.com',
  'support.google.com',
  'community.intel.com',
  'support.apple.com',
  'help.ea.com',
  'kb.vmware.com',
  'nvidia.com',
  'geforcenow.com',
  'store.steampowered.com',
  'epicgames.com',
  'xbox.com',
  'playstation.com',
  'zoom.us',
  'slack.com',
  'github.com',
  'gitlab.com',
  'atlassian.com',
  'theverge.com',
  'techcrunch.com',
  'wired.com',
  'cnet.com',
  'zdnet.com',
  'forbes.com',
  'bloomberg.com',
  'wsj.com',
  'nytimes.com',
  'ndtv.com',
  'timesofindia.com',
  'indiatimes.com',
  'bbc.com',
  'cnn.com',
  'reuters.com',
  'nist.gov',
  'nvd.nist.gov',
  'cve.org',
  'cve.mitre.org',
  'mitre.org',
  'sans.edu',
  'isc.sans.edu',
  'nomoreransom.org',
  'izoologic.com',
  'bleepingcomputer.com',
  'thehackernews.com',
  'threatpost.com',
  'securityfocus.com',
  'packetstormsecurity.com',
  'exploit-db.com',
]);

/**
 * Classifies a search result / candidate into an entity type, distinguishing
 * genuine individual local businesses from articles, listicles, directories,
 * business idea pages, franchise portals, and software documentation.
 */
export function classifyBusinessEntity(
  rawTitle: string,
  url: string,
  snippet?: string,
  source?: string
): EntityClassificationResult {
  if (!rawTitle && !url) {
    return {
      type: 'OTHER_NON_BUSINESS',
      isIndividualBusiness: false,
      rejectionReason: 'missing_title_and_url',
    };
  }

  let hostname = '';
  let pathname = '';
  try {
    const formatted = url.startsWith('http') ? url : `https://${url}`;
    const parsed = new URL(formatted);
    hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
    pathname = parsed.pathname.toLowerCase();
  } catch {
    hostname = (url || '').toLowerCase();
  }

  const titleLower = (rawTitle || '').toLowerCase().trim();
  const snippetLower = (snippet || '').toLowerCase().trim();
  const combinedText = `${titleLower} ${snippetLower}`;

  // 1. Hostname-based classification
  if (EDITORIAL_OR_AGGREGATOR_HOSTS.has(hostname) || Array.from(EDITORIAL_OR_AGGREGATOR_HOSTS).some((h) => hostname.endsWith(`.${h}`))) {
    if (/business-ideas|ideas|startup/i.test(hostname + pathname)) {
      return {
        type: 'BUSINESS_IDEA_PAGE',
        isIndividualBusiness: false,
        rejectionReason: `editorial_domain:${hostname}`,
      };
    }
    if (/franchise/i.test(hostname + pathname)) {
      return {
        type: 'FRANCHISE_PAGE',
        isIndividualBusiness: false,
        rejectionReason: `franchise_portal_domain:${hostname}`,
      };
    }
    if (/justdial|sulekha|indiamart|tradeindia|yellowpages|yelp|tripadvisor|wanderlog|datagemba/i.test(hostname)) {
      return {
        type: 'BUSINESS_DIRECTORY',
        isIndividualBusiness: false,
        rejectionReason: `directory_aggregator_domain:${hostname}`,
      };
    }
    if (/support|answers|kb|help|community|forum|docs/i.test(hostname)) {
      return {
        type: 'SOFTWARE/PRODUCT',
        isIndividualBusiness: false,
        rejectionReason: `support_or_docs_domain:${hostname}`,
      };
    }
    return {
      type: 'ARTICLE',
      isIndividualBusiness: false,
      rejectionReason: `editorial_or_publisher_domain:${hostname}`,
    };
  }

  // 2. URL Path-based classification
  if (/\/(blog|blogs|article|articles|posts?|news|stories|guides?)\//i.test(pathname)) {
    return {
      type: 'BLOG_POST',
      isIndividualBusiness: false,
      rejectionReason: `editorial_url_path:${pathname}`,
    };
  }
  if (/\/(business-ideas?|startup-ideas?|ideas?|small-business-ideas?)\b/i.test(pathname)) {
    return {
      type: 'BUSINESS_IDEA_PAGE',
      isIndividualBusiness: false,
      rejectionReason: `business_ideas_url_path:${pathname}`,
    };
  }
  if (/\/(opportunities|business-opportunities|franchise|franchises|franchise-opportunities)\b/i.test(pathname)) {
    return {
      type: 'FRANCHISE_PAGE',
      isIndividualBusiness: false,
      rejectionReason: `franchise_url_path:${pathname}`,
    };
  }
  if (/\/(companies|businesses|startups|locations?)\/(india|[a-z0-9_-]+)\/(lo|list|\d+)/i.test(pathname)) {
    return {
      type: 'ORGANIZATION_OVERVIEW',
      isIndividualBusiness: false,
      rejectionReason: `company_list_url_path:${pathname}`,
    };
  }
  if (/\/(top-|best-|list-|curated-|collection\/)/i.test(pathname)) {
    return {
      type: 'LISTICLE',
      isIndividualBusiness: false,
      rejectionReason: `listicle_url_path:${pathname}`,
    };
  }
  if (/\/(category|categories|tag|tags|topics?)\//i.test(pathname)) {
    return {
      type: 'BUSINESS_DIRECTORY',
      isIndividualBusiness: false,
      rejectionReason: `directory_category_url_path:${pathname}`,
    };
  }
  if (/\/(search|find|browse)\b/i.test(pathname)) {
    return {
      type: 'SEARCH_RESULT_PAGE',
      isIndividualBusiness: false,
      rejectionReason: `search_result_url_path:${pathname}`,
    };
  }

  // 3. Title-based signals: Business Ideas / Startup Opportunities / Starting a business
  if (
    /\b(?:business|startup|entrepreneurship|small\s+business)\s+(?:ideas?|opportunities|concepts|options|models|prospects)\b/i.test(
      titleLower
    ) ||
    /\b(?:ideas?|opportunities)\s+(?:in|for)\s+[a-z]+/i.test(titleLower) ||
    /\b(?:profitable|lucrative|low\s+investment|best)\s+business\s+ideas?\b/i.test(titleLower) ||
    /\bhow\s+to\s+start\s+(?:a|an)?\s*(?:small\s+)?business\b/i.test(titleLower)
  ) {
    return {
      type: 'BUSINESS_IDEA_PAGE',
      isIndividualBusiness: false,
      rejectionReason: 'business_ideas_or_opportunity_headline',
    };
  }

  // 4. Title-based signals: Franchise portals / aggregators
  if (
    /\b(?:franchise|franchises|franchising)\s+(?:opportunities|business|india|world|bazaar|list|in)\b/i.test(
      titleLower
    ) ||
    /\bbuy\s+a\s+franchise\b/i.test(titleLower)
  ) {
    return {
      type: 'FRANCHISE_PAGE',
      isIndividualBusiness: false,
      rejectionReason: 'franchise_portal_headline',
    };
  }

  // 5. Title-based signals: Listicles & Curated Rankings
  if (
    /\b(?:\d+|top|\d+\s*best|\d+\s*top|top\s*\d+|best\s*\d+|famous|\d+\s*famous|\d+\s*popular)\s+(?:best|top|popular|leading|greatest|most|essential|unique|phenomenal|homemade)?\s*(?:businesses|companies|shops|stores|restaurants|cafes|clinics|places|ideas|startups|franchises|services|retailers|shopping|bakeries|dentists|agencies|contractors|hotels|salons|firms|enterprises|manufacturers|recipes)\b/i.test(
      titleLower
    ) ||
    /\b\d+\s+(?:best|top|greatest|recommended|curated|places\s+to\s+shop|department\s+stores)\b/i.test(titleLower) ||
    /\b(?:the\s+)?\d+\s+(?:best|top)\b/i.test(titleLower) ||
    /\b(?:view|explore|check\s+out)\s+\d+\s+places\b/i.test(titleLower) ||
    /\b\d+\s+places\s+to\s+(?:shop|visit|eat|see)\b/i.test(titleLower)
  ) {
    return {
      type: 'LISTICLE',
      isIndividualBusiness: false,
      rejectionReason: 'listicle_or_curated_ranking_headline',
    };
  }

  // 6. Title-based signals: Editorial Articles, Guides, How-To, City Overview
  if (
    /\b(?:how\s+to|complete\s+guide|beginner['’]?s\s+guide|step\s*by\s*step|ultimate\s+guide|tips\s+for|overview\s+of|everything\s+you\s+need\s+to\s+know)\b/i.test(
      titleLower
    ) ||
    /\b(?:places\s+of\s+shopping|where\s+to\s+shop|things\s+to\s+do|places\s+to\s+visit|shopping\s+in\s+[a-z]+)\b/i.test(
      titleLower
    ) ||
    /\b(?:companies|businesses|startups|shops|stores|services|industries|factories)\s+in\s+[a-z\s]+(?:·|\||-|»)\s*(?:august|september|october|november|december|january|february|march|april|may|june|july|\d{4})\b/i.test(
      titleLower
    ) ||
    /\b(?:companies|businesses|startups|services)\s+in\s+[a-z\s]+[-–|:]\s*(?:f6s|growthromeo|99businessideas|viestories|wanderlog|meraapnabihar|datagemba|franchiseindia|tracxn|crunchbase|ambitionbox|glassdoor|indeed|naukri|quora|reddit|medium|wikipedia)\b/i.test(
      titleLower
    )
  ) {
    return {
      type: 'ARTICLE',
      isIndividualBusiness: false,
      rejectionReason: 'editorial_article_or_guide_headline',
    };
  }

  // 7. Title-based signals: Directory, Aggregator & Search listings
  if (
    /\b(?:best|top|list\s+of|top\s+retail\s+shops)\s+[a-z\s]+(?:near\s+me|in\s+[a-z]+)\s*[-–|:]\s*(?:justdial|sulekha|indiamart|yellowpages|yelp|tripadvisor|tradeindia|magicbricks|99acres|housing|mouthshut|urbanpro|wanderlog|datagemba|meraapnabihar)\b/i.test(
      titleLower
    ) ||
    /\b(?:list\s+of|directory\s+of|catalog\s+of)\s+(?:companies|businesses|shops|stores|dealers|suppliers|manufacturers|exporters)\b/i.test(
      titleLower
    ) ||
    /\b(?:shops|stores|businesses|services|companies|shopping)\s+in\s+[a-z\s]+$/i.test(titleLower)
  ) {
    return {
      type: 'BUSINESS_DIRECTORY',
      isIndividualBusiness: false,
      rejectionReason: 'business_directory_headline',
    };
  }

  // 8. Software / Tech support / Gaming
  if (
    /geforce\s*now/i.test(combinedText) ||
    /windows\s*11\s*(blog|insider|update|release|preview)/i.test(combinedText) ||
    /(hotmail|outlook|microsoft|gmail|google\s*account)\s*(support|help|login|signin|troubleshooting|password)/i.test(
      combinedText
    ) ||
    /(nvidia|geforce|steam|xbox|playstation|epic\s*games)\s*(cloud|gaming|store|launcher)/i.test(combinedText) ||
    /download\s*(windows|driver|app|software|patch|update)/i.test(combinedText) ||
    /how\s*to\s*(fix|install|update|configure|troubleshoot|reset)/i.test(combinedText) ||
    /knowledge\s*base|community\s*forum|customer\s*support\s*portal/i.test(combinedText)
  ) {
    return {
      type: 'SOFTWARE/PRODUCT',
      isIndividualBusiness: false,
      rejectionReason: 'software_product_or_support',
    };
  }

  // 9. Cybersecurity advisories / CVEs / Threat reports / Vulnerability databases
  if (
    /\b(?:cve-\d{4}-\d+|vulnerability|vulnerabilities|malware|ransomware|threat\s+advisory|security\s+bulletin|attack\s+activity|port\s+\d+\s+\(tcp\/udp\)|no\s+more\s+ransom)\b/i.test(
      combinedText
    ) ||
    /nvd\.nist\.gov|cve\.org|sans\.edu|nomoreransom\.org|izoologic\.com/i.test(hostname)
  ) {
    return {
      type: 'OTHER_NON_BUSINESS',
      isIndividualBusiness: false,
      rejectionReason: 'cybersecurity_advisory_or_cve',
    };
  }

  // 10. Generic single-word check
  const cleanName = cleanBusinessName(rawTitle).toLowerCase().trim();
  if (GENERIC_NAMES.has(cleanName) || cleanName.length < 3) {
    return {
      type: 'OTHER_NON_BUSINESS',
      isIndividualBusiness: false,
      rejectionReason: 'generic_single_word_name',
    };
  }

  // 11. Valid Individual Local Business
  return {
    type: 'INDIVIDUAL_LOCAL_BUSINESS',
    isIndividualBusiness: true,
  };
}

/**
 * Evaluates whether a search result is completely irrelevant to a local business search
 * (e.g. software/product pages, support docs, news/blog articles, gaming platforms, login portals).
 */
export function isIrrelevantSearchResult(
  url: string,
  title: string,
  snippet?: string
): { isIrrelevant: boolean; reason?: string } {
  const classification = classifyBusinessEntity(title, url, snippet);
  if (!classification.isIndividualBusiness) {
    return {
      isIrrelevant: true,
      reason: classification.rejectionReason || classification.type,
    };
  }
  return { isIrrelevant: false };
}

/**
 * Calculates a transparent business candidate quality score (0-100).
 * Disqualifies editorial, article, listicle, or directory pages (score = 0).
 * Penalizes generic category names (e.g. "Shops") and rewards distinctive names,
 * detailed local address evidence, and contact completeness.
 */
export function calculateCandidateQuality(
  cand: DiscoveredCandidate,
  locString: string
): {
  score: number;
  isGenericName: boolean;
  reasons: string[];
  breakdown: { nameQuality: number; locationEvidence: number; contactCompleteness: number; sourceQuality: number };
} {
  const cleanNameLower = cand.displayName.toLowerCase().trim();

  // 0. Strict Entity Check: If candidate is an article, listicle, directory, or non-business, score = 0
  const classification = classifyBusinessEntity(cand.displayName, cand.website || '', cand.snippet);
  if (!classification.isIndividualBusiness) {
    return {
      score: 0,
      isGenericName: true,
      reasons: ['editorial_or_directory_disqualified', classification.rejectionReason || classification.type],
      breakdown: { nameQuality: -50, locationEvidence: 0, contactCompleteness: 0, sourceQuality: 0 },
    };
  }

  let score = 20; // Base baseline
  const reasons: string[] = [];

  // 1. Business Name Quality
  let nameQuality = 0;
  const isGenericName =
    GENERIC_NAMES.has(cleanNameLower) ||
    /^(shops?|stores?|services?|restaurants?|cafes?|clinics?|dentists?|gyms?|salons?|businesses?|local\s+(business|shop|store))\s*(\d+)?$/i.test(
      cleanNameLower
    ) ||
    cleanNameLower.length < 3;

  if (isGenericName) {
    nameQuality = -25;
    reasons.push('generic_business_name_penalty');
  } else if (
    cleanNameLower.split(/\s+/).length >= 2 &&
    !/^(home|welcome|services|contact|about)/i.test(cleanNameLower)
  ) {
    nameQuality = 25;
    reasons.push('distinctive_business_name');
  } else {
    nameQuality = 10;
  }

  // 2. Location Evidence
  let locationEvidence = 0;
  if (cand.address && cand.address.length > 12 && cand.address !== locString) {
    locationEvidence = 25;
    reasons.push('detailed_street_address');
  } else if (cand.verifiedLocation) {
    locationEvidence = 15;
    reasons.push('verified_city_location');
  }

  // 3. Contact Completeness (phone, website, email)
  let contactCompleteness = 0;
  if (cand.website && cand.isDirect) {
    contactCompleteness += 15;
    reasons.push('direct_website');
  }
  if (cand.phone && cand.phone.length >= 7) {
    contactCompleteness += 15;
    reasons.push('verified_phone');
  }
  if (cand.email) {
    contactCompleteness += 10;
    reasons.push('contact_email');
  }

  // 4. Source Evidence Quality
  let sourceQuality = 0;
  if (cand.sources.length >= 2) {
    sourceQuality += 15;
    reasons.push('multi_source_confirmation');
  } else if (cand.sources.includes('openstreetmap')) {
    sourceQuality += 10;
    reasons.push('openstreetmap_poi');
  } else {
    sourceQuality += 5;
  }

  const totalScore = Math.max(
    0,
    Math.min(100, score + nameQuality + locationEvidence + contactCompleteness + sourceQuality)
  );

  return {
    score: totalScore,
    isGenericName,
    reasons,
    breakdown: { nameQuality, locationEvidence, contactCompleteness, sourceQuality },
  };
}

/**
 * Cleans a candidate title into a proper business name.
 */
function cleanBusinessName(rawTitle: string): string {
  if (!rawTitle) return 'Local Business';
  let name = rawTitle
    .replace(/<[^>]+>/g, '')
    .replace(/&(?:amp|quot|apos|lt|gt);/g, ' ')
    .replace(/&#\d+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Remove common SEO title suffixes
  name = name
    .replace(
      /\s*[-–|:]\s*(?:Home|Official Site|Official Website|Welcome|Austin TX|Texas|Mumbai|Delhi|Bangalore|Ranchi|Jharkhand|Yelp|Zocdoc|Tripadvisor|Facebook|Instagram|Reviews|Map|Contact Us|About Us|Services).*$/i,
      ''
    )
    .replace(/^(?:THE\s+)?(?:BEST|TOP)\s+\d+\s+(?:BEST\s+)?/i, '')
    .replace(/\s*\(\s*Updated\s*\d{4}\s*\)/i, '')
    .replace(/\s*[-–|:]\s*$/i, '')
    .trim();

  if (name.length < 2) return rawTitle.slice(0, 40).trim();
  return name.slice(0, 60);
}

/**
 * Normalizes domain for robust cross-source deduplication.
 */
function extractNormalizedDomain(url?: string): string {
  if (!url) return '';
  try {
    const formatted = url.startsWith('http') ? url : `https://${url}`;
    const parsed = new URL(formatted);
    return parsed.hostname.replace(/^www\./, '').toLowerCase().trim();
  } catch {
    return url.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].toLowerCase().trim();
  }
}

/**
 * Normalizes phone number digits for deduplication.
 */
function extractNormalizedPhone(phone?: string): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length >= 10) return digits.slice(-10);
  return digits;
}

/**
 * Normalizes business name for deduplication.
 */
function extractNormalizedName(name?: string): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/&(?:amp|quot|apos|lt|gt);/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\b(pvt|ltd|limited|private|llc|inc|co|corp|corporation|services|service|store|stores|shop|shops)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Decodes Bing redirect URLs to get the true destination URL.
 */
function decodeBingUrl(rawUrl: string): string {
  if (!rawUrl) return '';
  const clean = rawUrl.replace(/&amp;/g, '&');
  const match = clean.match(/(?:[?&]|&amp;)u=a1([A-Za-z0-9_-]+)/);
  if (match) {
    try {
      let base64 = match[1].replace(/-/g, '+').replace(/_/g, '/');
      while (base64.length % 4 !== 0) base64 += '=';
      const decoded = Buffer.from(base64, 'base64').toString('utf-8');
      if (decoded.startsWith('http')) return decoded;
    } catch {
      // fallback
    }
  }
  return clean.startsWith('//') ? `https:${clean}` : clean;
}

/**
 * Decodes DuckDuckGo redirect URLs to get the true destination URL.
 */
function extractDuckDuckGoDestinationUrl(rawUrl: string): string {
  if (!rawUrl) return '';
  let url = rawUrl.trim().replace(/&amp;/g, '&');
  if (url.includes('uddg=')) {
    const match = url.match(/uddg=([^&]+)/);
    if (match) {
      try {
        url = decodeURIComponent(match[1]);
      } catch {
        // use fallback
      }
    }
  }
  if (url.startsWith('//')) {
    url = `https:${url}`;
  }
  return url;
}

/**
 * Checks if a domain is a general aggregator / search directory / news portal vs direct business website.
 */
function isDirectoryOrSocial(url: string): boolean {
  if (!url) return true;
  const aggregators = [
    'duckduckgo.com',
    'google.com',
    'bing.com',
    'yahoo.com',
    'wikipedia.org',
    'wikimedia.org',
    'youtube.com',
    'facebook.com',
    'instagram.com',
    'twitter.com',
    'x.com',
    'linkedin.com',
    'reddit.com',
    'pinterest.com',
    'yelp.com',
    'tripadvisor.com',
    'yellowpages.com',
    'bbb.org',
    'mapquest.com',
    'zocdoc.com',
    'healthgrades.com',
    'angieslist.com',
    'thumbtack.com',
    'wiley.com',
    'cambridge.org',
    'dictionary.com',
    'thesaurus.com',
    'merriam-webster.com',
    'smallpdf.com',
    'ilovepdf.com',
    'ndtv.com',
    'ndtv.in',
    'indiatimes.com',
    'timesofindia.com',
    'bbc.com',
    'cnn.com',
    'reuters.com',
    'gov.sg',
    'edu.sg',
    'github.com',
    'gitlab.com',
    'medium.com',
    'quora.com',
    'stackoverflow.com',
    'stackexchange.com',
    'zhihu.com',
    'baidu.com',
    'csdn.net',
  ];
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
    return aggregators.some((agg) => host === agg || host.endsWith(`.${agg}`));
  } catch {
    return true;
  }
}

/**
 * Generates deterministic search query variations for diverse multi-source discovery.
 */
export function generateDiscoveryQueryVariations(
  query: string,
  locString: string,
  isGeneric: boolean
): Array<{ query: string; purpose: string }> {
  const variations: Array<{ query: string; purpose: string }> = [];

  if (/\b(saas|software|crm|startup|startups)\b/i.test(query)) {
    variations.push(
      { query: locString ? `SaaS companies in ${locString}` : 'SaaS companies', purpose: 'saas_companies' },
      { query: locString ? `${query} official website ${locString}` : `${query} official website`, purpose: 'official_website' }
    );
    return variations;
  }

  if (isGeneric && locString) {
    variations.push(
      { query: `small businesses in ${locString}`, purpose: 'small_businesses' },
      { query: `local services in ${locString}`, purpose: 'local_services' },
      { query: `local shops in ${locString}`, purpose: 'local_stores' }
    );
  } else {
    const cleanSearchTerm = query.replace(/,.*$/, '').trim();
    variations.push(
      { query: locString ? `${cleanSearchTerm} in ${locString}` : cleanSearchTerm, purpose: 'primary_query' },
      { query: locString ? `best ${cleanSearchTerm} in ${locString}` : `best ${cleanSearchTerm}`, purpose: 'best_variation' },
      { query: locString ? `top ${cleanSearchTerm} ${locString}` : `top ${cleanSearchTerm}`, purpose: 'top_variation' }
    );
  }

  return variations;
}

/**
 * Discovers businesses autonomously via live public web research.
 * Grounded in verified HTTP/HTTPS fetches with zero third-party search API keys.
 */
export async function discoverBusinessesViaWebResearch(
  params: {
    query: string;
    location?: string;
    limit?: number;
    timeoutMs?: number;
  }
): Promise<WebDiscoveryResult> {
  const normalized = normalizeRequestedLocation(params.location);
  const locString = normalized.normalizedQueryLocation || params.location || '';
  const query = (params.query || '').trim();
  const limit = Math.min(Math.max(params.limit || 5, 1), 20);

  const providerQuery = locString ? `${query} in ${locString}` : query;

  const sourcesFound: string[] = [];
  const candidatePool: DiscoveredCandidate[] = [];
  let httpRequestsPerformed = 0;
  let successfulHttpRequests = 0;
  let candidatePagesDiscovered = 0;
  let mergedCandidatesCount = 0;
  const rejections: Array<{ name: string; reason: string }> = [];

  const queryLower = query.toLowerCase();
  const isSaasOrSoftwareQuery =
    /\b(saas|software|crm|startup|startups)\b/i.test(queryLower);
  const isGeneric =
    !isSaasOrSoftwareQuery &&
    (!query ||
      queryLower.includes('small business') ||
      queryLower.includes('local business'));

  // Generate multi-source discovery queries
  const queryVariations = generateDiscoveryQueryVariations(query, locString, isGeneric);

  // Safe runtime diagnostic log at discovery start
  console.log(
    `[DISCOVERY START]\nquery=${query || 'small businesses'}\nlocation=${locString || '(none)'}\nlimit=${limit}\nqueriesGenerated=${queryVariations
      .map((v) => v.query)
      .join(' | ')}`
  );

  for (const qv of queryVariations) {
    console.log(`[QUERY GENERATED]\nquery="${qv.query}"\npurpose="${qv.purpose}"\ntarget="${locString}"`);
  }

  /**
   * Helper to merge or insert candidate into candidate pool with cross-source deduplication.
   */
  function addOrMergeCandidate(candidate: {
    name: string;
    url?: string;
    address?: string;
    phone?: string;
    email?: string;
    snippet?: string;
    category?: string;
    source: 'openstreetmap' | 'bing' | 'duckduckgo';
    sourceUrl?: string;
  }) {
    const rawName = candidate.name;
    const cleanName = cleanBusinessName(rawName);
    const domain = extractNormalizedDomain(candidate.url);
    const normPhone = extractNormalizedPhone(candidate.phone);
    const normName = extractNormalizedName(cleanName);
    const isDirect = Boolean(candidate.url && !isDirectoryOrSocial(candidate.url));

    const evidence: CandidateEvidence = {
      source: candidate.source,
      sourceUrl: candidate.sourceUrl || candidate.url,
      title: rawName,
      snippet: candidate.snippet,
      address: candidate.address,
      phone: candidate.phone,
      email: candidate.email,
      website: candidate.url,
      category: candidate.category,
    };

    // Find existing candidate by domain, phone, or name
    const existing = candidatePool.find((c) => {
      if (domain && c.domain && domain === c.domain) return true;
      if (normPhone && normPhone.length >= 8 && c.normalizedPhone === normPhone) return true;
      if (normName && normName.length >= 4 && c.normalizedName === normName) return true;
      return false;
    });

    if (existing) {
      mergedCandidatesCount++;
      if (!existing.sources.includes(candidate.source)) {
        existing.sources.push(candidate.source);
      }
      existing.evidence.push(evidence);

      // Merge and enrich fields if existing candidate was missing them
      if (!existing.website && candidate.url && isDirect) {
        existing.website = candidate.url;
        existing.domain = domain;
        existing.isDirect = true;
      }
      if (!existing.phone && candidate.phone) {
        existing.phone = candidate.phone;
        existing.normalizedPhone = normPhone;
      }
      if (!existing.email && candidate.email) {
        existing.email = candidate.email;
      }
      if (!existing.address && candidate.address) {
        existing.address = candidate.address;
      }
      if (!existing.category && candidate.category) {
        existing.category = candidate.category;
      }
      if (candidate.snippet) {
        existing.snippet = existing.snippet ? `${existing.snippet} | ${candidate.snippet}` : candidate.snippet;
      }

      console.log(
        `[CANDIDATE MERGED]\nname="${existing.displayName}"\nsources="${existing.sources.join(', ')}"\nurl="${existing.website || '(none)'}"\naddress="${existing.address || '(none)'}"`
      );
    } else {
      const newCand: DiscoveredCandidate = {
        id: `cand_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
        normalizedName: normName,
        displayName: cleanName,
        domain,
        normalizedPhone: normPhone,
        website: isDirect ? candidate.url : undefined,
        address: candidate.address,
        phone: candidate.phone,
        email: candidate.email,
        category: candidate.category || query,
        snippet: candidate.snippet,
        sources: [candidate.source],
        evidence: [evidence],
        isDirect,
      };

      candidatePool.push(newCand);
      console.log(
        `[CANDIDATE EXTRACTED]\nsource=${candidate.source}\nname="${newCand.displayName}"\nurl="${newCand.website || candidate.url || '(none)'}"\nphone="${newCand.phone || '(none)'}"\naddress="${newCand.address || '(none)'}"`
      );
    }
  }

  // ==========================================
  // SOURCE 1: OpenStreetMap / Nominatim Open Web POI Discovery
  // ==========================================
  try {
    const osmQueries = isSaasOrSoftwareQuery
      ? []
      : isGeneric && locString
      ? [
          `shop in ${locString}`,
          `restaurant in ${locString}`,
          `clinic in ${locString}`,
          `store in ${locString}`,
          `hotel in ${locString}`,
          `services in ${locString}`,
        ]
      : [locString ? `${query} in ${locString}` : query];

    const osmFetches = osmQueries.map(async (osmQ) => {
      // 1A. Photon OpenStreetMap POI Discovery (Highly resilient, fast, structured)
      try {
        const photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(osmQ)}&limit=${isGeneric ? 5 : Math.max(limit * 2, 10)}`;
        sourcesFound.push(photonUrl);

        const photonController = new AbortController();
        const photonTimeout = setTimeout(() => photonController.abort(), 5000);

        httpRequestsPerformed++;
        console.log(`[HTTP REQUEST]\nsource=photon_osm\nmethod=GET\nurl=${photonUrl}\nquery="${osmQ}"`);
        const photonRes = await fetch(photonUrl, {
          method: 'GET',
          headers: {
            'User-Agent': 'SANMine-WebResearchEngine/1.0 (https://sanmine.ai; research@sanmine.ai)',
            Accept: 'application/json',
          },
          signal: photonController.signal,
        });
        clearTimeout(photonTimeout);

        console.log(`[HTTP RESPONSE]\nsource=photon_osm\nstatus=${photonRes.status}\nurl=${photonUrl}`);

        if (photonRes.ok) {
          successfulHttpRequests++;
          const photonData: any = await photonRes.json();
          const features = photonData?.features || [];
          candidatePagesDiscovered += features.length;

          for (const feature of features) {
            const props = feature.properties || {};
            const rawName = props.name;
            if (!rawName) continue;

            const cleanName = cleanBusinessName(rawName);
            const addressParts = [
              props.housenumber,
              props.street,
              props.locality,
              props.city || props.district,
              props.state,
              props.postcode,
              props.country,
            ].filter(Boolean);
            const formattedAddress = addressParts.join(', ') || (locString ? `${cleanName}, ${locString}` : '');

            const classification = classifyBusinessEntity(
              cleanName,
              '',
              formattedAddress,
              'photon_osm'
            );

            console.log(`[ENTITY CLASSIFICATION]\ntype=${classification.type}\nname="${rawName}"`);

            if (!classification.isIndividualBusiness) {
              console.log(
                `[ENTITY REJECTED]\nname="${rawName}"\nreason=NON_BUSINESS_PAGE (${classification.rejectionReason || 'non_business_entity'})`
              );
              continue;
            }

            addOrMergeCandidate({
              name: cleanName,
              address: formattedAddress,
              snippet: `${cleanName} - ${props.osm_value || props.osm_key || 'local business'} in ${props.city || locString || ''}`,
              category: props.osm_value || props.osm_key || query,
              source: 'openstreetmap',
              sourceUrl: photonUrl,
            });
          }
        }
      } catch {
        // Non-blocking
      }

      // 1B. Nominatim OpenStreetMap Discovery
      const nominatimUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
        osmQ
      )}&format=json&addressdetails=1&extratags=1&limit=${isGeneric ? 5 : Math.max(limit * 2, 10)}`;

      sourcesFound.push(nominatimUrl);

      const nomController = new AbortController();
      const nomTimeout = setTimeout(() => nomController.abort(), 5000);

      try {
        httpRequestsPerformed++;
        console.log(`[HTTP REQUEST]\nsource=openstreetmap\nmethod=GET\nurl=${nominatimUrl}\nquery="${osmQ}"`);
        const nomRes = await fetch(nominatimUrl, {
          method: 'GET',
          headers: {
            'User-Agent': 'SANMine-WebResearchEngine/1.0 (https://sanmine.ai; research@sanmine.ai)',
            Accept: 'application/json',
          },
          signal: nomController.signal,
        });
        clearTimeout(nomTimeout);

        console.log(`[HTTP RESPONSE]\nsource=openstreetmap\nstatus=${nomRes.status}\nurl=${nominatimUrl}`);

        if (nomRes.ok) {
          successfulHttpRequests++;
          const places = await nomRes.json();
          if (Array.isArray(places)) {
            candidatePagesDiscovered += places.length;
            for (const item of places) {
              if (
                item.class === 'boundary' ||
                (item.class === 'place' &&
                  (item.type === 'city' ||
                    item.type === 'state' ||
                    item.type === 'country' ||
                    item.type === 'administrative' ||
                    item.type === 'county' ||
                    item.type === 'postcode')) ||
                item.type === 'fire_station' ||
                item.type === 'police' ||
                item.type === 'townhall' ||
                item.type === 'courthouse' ||
                item.type === 'embassy' ||
                item.type === 'prison' ||
                item.type === 'military' ||
                item.type === 'cemetery'
              ) {
                continue;
              }

              const rawName = item.name || item.extratags?.name || item.display_name?.split(',')[0];
              if (!rawName) continue;

              if (
                /\b(?:fire\s+services?|police\s+station|court|jail|prison|collectorate|secretariat|municipal\s+corporation|railway\s+station|bus\s+stand)\b/i.test(
                  rawName
                )
              ) {
                continue;
              }

              const cleanName = cleanBusinessName(rawName);
              const classification = classifyBusinessEntity(
                cleanName,
                item.extratags?.website || item.extratags?.['contact:website'] || '',
                item.display_name,
                'openstreetmap'
              );

              console.log(`[ENTITY CLASSIFICATION]\ntype=${classification.type}\nname="${rawName}"`);

              if (!classification.isIndividualBusiness) {
                console.log(
                  `[ENTITY REJECTED]\nname="${rawName}"\nreason=NON_BUSINESS_PAGE (${classification.rejectionReason || 'non_business_entity'})`
                );
                continue;
              }

              const website = item.extratags?.website || item.extratags?.['contact:website'];
              const phone = item.extratags?.phone || item.extratags?.['contact:phone'];
              const email = item.extratags?.email || item.extratags?.['contact:email'];
              const address = item.display_name || (locString ? `${cleanName}, ${locString}` : '');

              addOrMergeCandidate({
                name: cleanName,
                url: website,
                address,
                phone,
                email,
                snippet: item.display_name,
                category: item.type || item.class || query,
                source: 'openstreetmap',
                sourceUrl: nominatimUrl,
              });
            }
          }
        }
      } catch {
        // Non-blocking
      }
    });

    await Promise.allSettled(osmFetches);
  } catch {
    // Non-blocking fallback to next source
  }

  // ==========================================
  // SOURCE 2: Live Bing Search HTML Parsing
  // ==========================================
  try {
    const bingQueries = isGeneric && locString
      ? [`small businesses in ${locString}`, `local services in ${locString}`]
      : [providerQuery];

    for (const bQuery of bingQueries) {
      const bingUrl = `https://www.bing.com/search?q=${encodeURIComponent(bQuery)}&setmkt=en-US&setlang=en-US&cc=US`;
      sourcesFound.push(bingUrl);

      const bingController = new AbortController();
      const bingTimeout = setTimeout(() => bingController.abort(), 6000);

      try {
        httpRequestsPerformed++;
        console.log(`[HTTP REQUEST]\nsource=bing\nmethod=GET\nurl=${bingUrl}\nquery="${bQuery}"`);
        const bingRes = await fetch(bingUrl, {
          method: 'GET',
          headers: {
            'User-Agent': DEFAULT_USER_AGENT,
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            Cookie: 'SRCHHPGUSR=SRCHLANG=en; _EDGE_S=mkt=en-us;',
          },
          signal: bingController.signal,
        });
        clearTimeout(bingTimeout);

        console.log(`[HTTP RESPONSE]\nsource=bing\nstatus=${bingRes.status}\nurl=${bingUrl}`);

        if (bingRes.ok) {
          successfulHttpRequests++;
          const bingHtml = await bingRes.text();
          const b_algos = bingHtml.split(/<li\b[^>]*class=\"[^\"]*b_algo[^\"]*\"/gi).slice(1);
          candidatePagesDiscovered += b_algos.length;

          for (const block of b_algos) {
            const titleMatch = block.match(/<h2[^>]*><a\b[^>]*href=\"([^\"]+)\"[^>]*>([\s\S]*?)<\/a>/i);
            const snippetMatch = block.match(
              /<p\b[^>]*class=\"[^\"]*b_lineclamp[^\"]*\"[^>]*>([\s\S]*?)<\/p>|<div\b[^>]*class=\"[^\"]*b_caption[^\"]*\"[^>]*>([\s\S]*?)<\/div>/i
            );

            if (!titleMatch) continue;

            const rawUrl = titleMatch[1];
            const destUrl = decodeBingUrl(rawUrl);
            if (!destUrl || !destUrl.startsWith('http')) continue;

            const rawTitle = titleMatch[2];
            const rawSnippet = snippetMatch ? snippetMatch[1] || snippetMatch[2] || '' : '';
            const snippet = rawSnippet.replace(/<[^>]+>/g, '').replace(/&(?:amp|quot|apos|lt|gt);/g, ' ').trim();

            // Business Entity Classification & Relevance Gate
            const classification = classifyBusinessEntity(rawTitle, destUrl, snippet, 'bing');
            console.log(`[ENTITY CLASSIFICATION]\ntype=${classification.type}\nname="${rawTitle}"`);

            if (!classification.isIndividualBusiness) {
              console.log(
                `[ENTITY REJECTED]\nname="${rawTitle}"\nreason=NON_BUSINESS_PAGE (${classification.rejectionReason || 'non_business_page'})`
              );
              continue;
            }

            console.log(`[SEARCH RESULT ACCEPTED]\ntitle="${rawTitle}"\nurl="${destUrl}"`);
            const isDirect = !isDirectoryOrSocial(destUrl);

            if (isDirect) {
              addOrMergeCandidate({
                name: rawTitle,
                url: destUrl,
                snippet,
                category: query,
                source: 'bing',
                sourceUrl: bingUrl,
              });
            }
          }
        }
      } catch {
        // Non-blocking
      }
    }
  } catch {
    // Non-blocking fallback to next source
  }

  // ==========================================
  // SOURCE 3: DuckDuckGo HTML Live Search Parsing
  // ==========================================
  if (candidatePool.length < limit * 2) {
    try {
      const ddgQueries = isGeneric && locString
        ? [`small businesses in ${locString}`, `local shops in ${locString}`]
        : [providerQuery];

      for (const dQuery of ddgQueries) {
        const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(dQuery)}`;
        sourcesFound.push(ddgUrl);

        const ddgController = new AbortController();
        const ddgTimeout = setTimeout(() => ddgController.abort(), 6000);

        try {
          httpRequestsPerformed++;
          console.log(`[HTTP REQUEST]\nsource=duckduckgo\nmethod=GET\nurl=${ddgUrl}\nquery="${dQuery}"`);
          const ddgRes = await fetch(ddgUrl, {
            method: 'GET',
            headers: {
              'User-Agent': DEFAULT_USER_AGENT,
              Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
              'Accept-Language': 'en-US,en;q=0.9',
            },
            signal: ddgController.signal,
          });
          clearTimeout(ddgTimeout);

          console.log(`[HTTP RESPONSE]\nsource=duckduckgo\nstatus=${ddgRes.status}\nurl=${ddgUrl}`);

          if (ddgRes.ok) {
            successfulHttpRequests++;
            const ddgHtml = await ddgRes.text();
            const resultBlocks = ddgHtml.split(/<div\b[^>]*class=\"[^\"]*result\b[^\"]*\"/gi).slice(1);
            candidatePagesDiscovered += resultBlocks.length;

            for (const block of resultBlocks) {
              const titleMatch = block.match(
                /<a\b[^>]*class=\"[^\"]*result__a[^\"]*\"[^>]*href=\"([^\"]+)\"[^>]*>([\s\S]*?)<\/a>/i
              );
              const snippetMatch = block.match(
                /<a\b[^>]*class=\"[^\"]*result__snippet[^\"]*\"[^>]*>([\s\S]*?)<\/a>/i
              );

              if (!titleMatch) continue;

              const destUrl = extractDuckDuckGoDestinationUrl(titleMatch[1]);
              if (!destUrl || !destUrl.startsWith('http')) continue;

              const rawTitle = titleMatch[2];
              const snippet = (snippetMatch ? snippetMatch[1] : '')
                .replace(/<[^>]+>/g, '')
                .replace(/&(?:amp|quot|apos|lt|gt);/g, ' ')
                .trim();

              // Business Entity Classification & Relevance Gate
              const classification = classifyBusinessEntity(rawTitle, destUrl, snippet, 'duckduckgo');
              console.log(`[ENTITY CLASSIFICATION]\ntype=${classification.type}\nname="${rawTitle}"`);

              if (!classification.isIndividualBusiness) {
                console.log(
                  `[ENTITY REJECTED]\nname="${rawTitle}"\nreason=NON_BUSINESS_PAGE (${classification.rejectionReason || 'non_business_page'})`
                );
                continue;
              }

              console.log(`[SEARCH RESULT ACCEPTED]\ntitle="${rawTitle}"\nurl="${destUrl}"`);
              const isDirect = !isDirectoryOrSocial(destUrl);

              if (isDirect) {
                addOrMergeCandidate({
                  name: rawTitle,
                  url: destUrl,
                  snippet,
                  category: query,
                  source: 'duckduckgo',
                  sourceUrl: ddgUrl,
                });
              }
            }
          }
        } catch {
          // Non-blocking
        }
      }
    } catch {
      // Non-blocking
    }
  }

  // ==========================================
  // SOURCE 4: DuckDuckGo Lite POST Parsing
  // ==========================================
  if (candidatePool.length < limit * 2) {
    try {
      const ddgLiteQueries = isGeneric && locString
        ? [`small businesses in ${locString}`, `local services in ${locString}`]
        : [providerQuery];

      for (const dQuery of ddgLiteQueries) {
        const ddgLiteUrl = `https://lite.duckduckgo.com/lite/`;
        sourcesFound.push(`${ddgLiteUrl}?q=${encodeURIComponent(dQuery)}`);

        const ddgLiteController = new AbortController();
        const ddgLiteTimeout = setTimeout(() => ddgLiteController.abort(), 6000);

        try {
          httpRequestsPerformed++;
          console.log(`[HTTP REQUEST]\nsource=duckduckgo_lite\nmethod=POST\nurl=${ddgLiteUrl}\nquery="${dQuery}"`);
          const liteRes = await fetch(ddgLiteUrl, {
            method: 'POST',
            headers: {
              'User-Agent': DEFAULT_USER_AGENT,
              'Content-Type': 'application/x-www-form-urlencoded',
              Accept: 'text/html,application/xhtml+xml',
            },
            body: `q=${encodeURIComponent(dQuery)}`,
            signal: ddgLiteController.signal,
          });
          clearTimeout(ddgLiteTimeout);

          console.log(`[HTTP RESPONSE]\nsource=duckduckgo_lite\nstatus=${liteRes.status}\nurl=${ddgLiteUrl}`);

          if (liteRes.ok) {
            successfulHttpRequests++;
            const liteHtml = await liteRes.text();
            const rows = liteHtml.split(/<tr\b[^>]*>/gi);
            candidatePagesDiscovered += rows.length;

            for (const row of rows) {
              const linkMatch = row.match(
                /<a\b[^>]*class=\"[^\"]*result-link[^\"]*\"[^>]*href=\"([^\"]+)\"[^>]*>([\s\S]*?)<\/a>/i
              );
              const snippetMatch = row.match(
                /<td\b[^>]*class=\"[^\"]*result-snippet[^\"]*\"[^>]*>([\s\S]*?)<\/td>/i
              );

              if (!linkMatch) continue;

              const rawUrl = linkMatch[1];
              const destUrl = extractDuckDuckGoDestinationUrl(rawUrl);
              if (!destUrl || !destUrl.startsWith('http')) continue;

              const rawTitle = linkMatch[2];
              const snippet = (snippetMatch ? snippetMatch[1] : '')
                .replace(/<[^>]+>/g, '')
                .replace(/&(?:amp|quot|apos|lt|gt);/g, ' ')
                .trim();

              const classification = classifyBusinessEntity(rawTitle, destUrl, snippet, 'duckduckgo_lite');
              console.log(`[ENTITY CLASSIFICATION]\ntype=${classification.type}\nname="${rawTitle}"`);

              if (!classification.isIndividualBusiness) {
                console.log(
                  `[ENTITY REJECTED]\nname="${rawTitle}"\nreason=NON_BUSINESS_PAGE (${classification.rejectionReason || 'non_business_page'})`
                );
                continue;
              }

              console.log(`[SEARCH RESULT ACCEPTED]\ntitle="${rawTitle}"\nurl="${destUrl}"`);
              const isDirect = !isDirectoryOrSocial(destUrl);

              if (isDirect) {
                addOrMergeCandidate({
                  name: rawTitle,
                  url: destUrl,
                  snippet,
                  category: query,
                  source: 'duckduckgo',
                  sourceUrl: ddgLiteUrl,
                });
              }
            }
          }
        } catch {
          // Non-blocking
        }
      }
    } catch {
      // Non-blocking
    }
  }

  // Check if all discovery sources failed due to network / access restrictions
  if (httpRequestsPerformed > 0 && successfulHttpRequests === 0) {
    console.log(
      `[DISCOVERY COMPLETE]\nstatus=network_access_failure\nhttpRequestsPerformed=${httpRequestsPerformed}\nsuccessfulHttpRequests=0\nmessage=Live web discovery could not access the available search sources.`
    );
    return {
      query,
      location: locString,
      providerQuery,
      success: false,
      businesses: [],
      sourcesFound,
      totalFound: 0,
      message: 'Live web discovery could not access the available search sources.',
      error: 'Live web discovery could not access the available search sources.',
    };
  }

  // ==========================================
  // STAGE 1: LOCATION & BUSINESS VERIFICATION (BEFORE ANY WEBSITE CRAWL)
  // Invariant: Rejected candidates receive ZERO website crawls!
  // ==========================================
  const verifiedCandidates: DiscoveredCandidate[] = [];

  for (const cand of candidatePool) {
    let isLocationValid = false;
    let matchedLocationDetail = '';
    const candName = cand.displayName;
    const candAddress = cand.address || '';

    if (!locString) {
      isLocationValid = true;
      matchedLocationDetail = 'Unconstrained location';
    } else {
      // 1. Check structured address from OpenStreetMap or query-inferred address
      if (candAddress) {
        const verification = verifyBusinessLocation({ name: candName, address: candAddress }, locString);
        if (verification.verified) {
          isLocationValid = true;
          matchedLocationDetail = verification.matchedDetails || `Verified in ${locString}`;
        }
      }

      // 2. Check title / snippet text
      if (!isLocationValid) {
        const cityLower = (normalized.city || locString).toLowerCase();
        const snippetLower = (cand.snippet || '').toLowerCase();
        const titleLower = candName.toLowerCase();

        if (cityLower && (snippetLower.includes(cityLower) || titleLower.includes(cityLower))) {
          isLocationValid = true;
          matchedLocationDetail = `Verified in ${locString} (search snippet)`;
        }
      }

      // 3. Check postal code prefixes
      if (!isLocationValid && normalized.postalCodePrefixes.length > 0) {
        const combinedText = `${candAddress} ${cand.snippet || ''}`;
        const hasPostal = normalized.postalCodePrefixes.some((p) => combinedText.includes(p));
        if (hasPostal) {
          isLocationValid = true;
          matchedLocationDetail = `Verified via postal zone in ${locString}`;
        }
      }
    }

    if (isLocationValid) {
      cand.verifiedLocation = matchedLocationDetail;

      // Candidate Quality Scoring & Generic Name Evaluation
      const quality = calculateCandidateQuality(cand, locString);
      cand.qualityScore = quality.score;
      cand.acceptanceReason = quality.reasons.join(', ');

      console.log(
        `[CANDIDATE QUALITY]\nname="${candName}"\nscore=${quality.score}/100\ngeneric=${quality.isGenericName}\nbreakdown="name=${quality.breakdown.nameQuality}, loc=${quality.breakdown.locationEvidence}, contact=${quality.breakdown.contactCompleteness}, src=${quality.breakdown.sourceQuality}"\nreasons="${quality.reasons.join(', ')}"`
      );

      // Gate on quality threshold: minimum score 45 to prevent generic single-word entries (e.g. "Shops")
      if (quality.score >= 45) {
        verifiedCandidates.push(cand);
        console.log(`[ENTITY CLASSIFICATION]\ntype=INDIVIDUAL_LOCAL_BUSINESS\nname="${candName}"`);
        console.log(
          `[ENTITY VERIFIED]\nname="${candName}"\naddress="${candAddress || locString}"\nlocation="${matchedLocationDetail}"\nqualityScore=${quality.score}\nsources="${cand.sources.join(', ')}"\nevidence="${cand.sources.join(', ')} | ${matchedLocationDetail}"`
        );
      } else {
        const reason = `insufficient_quality_or_generic_record (score: ${quality.score}/100, generic: ${quality.isGenericName})`;
        rejections.push({ name: candName, reason });
        console.log(`[ENTITY REJECTED]\nname="${candName}"\nreason="${reason}"`);
      }
    } else {
      const reason = 'location_mismatch_or_insufficient_evidence';
      rejections.push({ name: candName, reason });
      console.log(`[ENTITY REJECTED]\nname="${candName}"\nreason="${reason}"`);
    }
  }

  // Rank verified candidates by quality score descending
  verifiedCandidates.sort((a, b) => (b.qualityScore || 0) - (a.qualityScore || 0));

  // ==========================================
  // STAGE 2: SELECT TOP VERIFIED CANDIDATES UP TO REQUESTED LIMIT
  // Never pad or force-fill with weak/rejected candidates!
  // ==========================================
  const selectedCandidates = verifiedCandidates.slice(0, limit);

  // ==========================================
  // STAGE 3: DEEP WEBSITE CRAWL ON SELECTED VERIFIED BUSINESSES ONLY
  // ==========================================
  const verifiedBusinesses: DiscoveredBusiness[] = [];

  const deepResearchPromises = selectedCandidates.map(async (cand) => {
    let finalWebsite = cand.isDirect && cand.website ? cand.website : undefined;
    let finalAddress = cand.address || (locString ? `${cand.displayName}, ${locString}` : 'Local area');
    let finalPhone = cand.phone;
    let finalEmail = cand.email;
    let finalName = cand.displayName;
    let auditData: any = undefined;
    let services = cand.services;
    let description = cand.description;

    // Deep website research only runs for verified, selected candidates
    if (finalWebsite) {
      try {
        httpRequestsPerformed++;
        console.log(`[WEBSITE CRAWL]\nurl=${finalWebsite}\nbusiness="${finalName}"`);
        const research = await conductWebResearch(finalWebsite, {
          maxPages: 2,
          timeoutMs: 3500,
        });

        if (research.success && research.pages.length > 0) {
          const rootPage = research.pages[0];

          if (research.contactEmails.length > 0 && !finalEmail) {
            finalEmail = research.contactEmails[0];
          }
          if (research.phoneNumbers.length > 0 && !finalPhone) {
            finalPhone = research.phoneNumbers[0];
          }
          if (rootPage.title && rootPage.title.length > 3) {
            const refined = cleanBusinessName(rootPage.title);
            if (refined.length > 2) {
              finalName = refined;
            }
          }

          auditData = {
            responseTimeMs: rootPage.responseTimeMs,
            isHttps: rootPage.isHttps,
            hasMobileViewport: rootPage.hasMobileViewport,
            pageTitle: rootPage.title,
          };

          services = research.servicesFound;
          description = rootPage.description || description;
        }
      } catch {
        // Keep graceful grounded fallback
      }
    }

    const businessResult: DiscoveredBusiness = {
      id: cand.id,
      name: finalName,
      address: finalAddress,
      city: locString || undefined,
      phone: finalPhone,
      email: finalEmail,
      website: finalWebsite,
      category: cand.category || query,
      sourceUrl: finalWebsite || cand.evidence[0]?.sourceUrl,
      sources: cand.sources,
      qualityScore: cand.qualityScore,
      acceptanceReason: cand.acceptanceReason,
      description,
      services,
      audit: auditData,
      verifiedLocation: cand.verifiedLocation,
    };

    return businessResult;
  });

  const crawledBusinesses = await Promise.all(deepResearchPromises);
  verifiedBusinesses.push(...crawledBusinesses);

  // Diagnostic completion log
  console.log(
    `[DISCOVERY COMPLETE]\nbusinessesFound=${verifiedBusinesses.length}\nsourcesAttempted=${sourcesFound.length}\nhttpRequestsPerformed=${httpRequestsPerformed}\ncandidatesExtracted=${candidatePool.length}\ncandidatesMerged=${mergedCandidatesCount}\ncandidatesRejected=${rejections.length}`
  );

  const completionMessage =
    verifiedBusinesses.length >= limit
      ? `Web Research discovered ${verifiedBusinesses.length} verified businesses for "${providerQuery}".`
      : verifiedBusinesses.length > 0
      ? `Web Research discovered ${verifiedBusinesses.length} verified businesses in ${locString}. The remaining candidates could not be verified.`
      : `No businesses could be verified in ${locString} after exhausting all configured web discovery sources.`;

  return {
    query,
    location: locString,
    providerQuery,
    success: true,
    businesses: verifiedBusinesses,
    sourcesFound,
    totalFound: verifiedBusinesses.length,
    message: completionMessage,
  };
}
