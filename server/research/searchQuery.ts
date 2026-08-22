/**
 * Deterministic query normalization for web discovery.
 *
 * Search providers should receive a short subject query, never the user's
 * whole instruction. This module deliberately has no LLM or provider
 * dependency so query construction cannot vary by model or leak task prose.
 */

export interface WebSearchQueryOptions {
  location?: string;
  industry?: string;
}

const KNOWN_LOCATIONS = [
  'united states',
  'united kingdom',
  'new york',
  'san francisco',
  'los angeles',
  'hong kong',
  'new delhi',
  'delhi',
  'mumbai',
  'bangalore',
  'bengaluru',
  'hyderabad',
  'chennai',
  'kolkata',
  'pune',
  'ahmedabad',
  'gurugram',
  'gurgaon',
  'noida',
  'jaipur',
  'chandigarh',
  'srinagar',
  'ranchi',
  'london',
  'toronto',
  'singapore',
  'dubai',
  'berlin',
  'sydney',
  'melbourne',
  'canada',
  'india',
  'australia',
  'germany',
  'uae',
  'europe',
  'usa',
  'uk',
];

const LOCATION_STOP_WORDS = new Set([
  'ke',
  'ki',
  'ka',
  'mein',
  'me',
  'se',
  'par',
  'wali',
  'wale',
  'with',
  'who',
  'that',
  'having',
  'for',
  'and',
  'jinki',
  'jin ke',
  'unke',
  'their',
  'decision',
  'maker',
  'makers',
  'email',
  'emails',
  'contact',
  'contacts',
  'official',
  'website',
  'websites',
  'find',
  'karo',
  'nikalo',
]);

const STOP_WORDS = new Set([
  'mujhe',
  'please',
  'find',
  'search',
  'discover',
  'research',
  'list',
  'get',
  'collect',
  'identify',
  'give',
  'show',
  'tell',
  'check',
  'inspect',
  'analyze',
  'browse',
  'open',
  'extract',
  'gather',
  'investigate',
  'karke',
  'karo',
  'karna',
  'karne',
  'nikalo',
  'nikal',
  'dhoondo',
  'dhundo',
  'khojo',
  'batao',
  'banao',
  'likho',
  'bhejo',
  'bhej',
  'do',
  'dena',
  'ke',
  'ki',
  'ka',
  'ko',
  'mein',
  'me',
  'se',
  'par',
  'and',
  'or',
  'their',
  'them',
  'unke',
  'jinki',
  'who',
  'that',
  'with',
  'having',
  'for',
  'from',
  'into',
  'then',
  'also',
  'and',
  'decision',
  'maker',
  'makers',
  'email',
  'emails',
  'mail',
  'contact',
  'contacts',
  'phone',
  'numbers',
  'number',
  'founder',
  'founders',
  'ceo',
  'owner',
  'owners',
  'leadership',
  'website',
  'websites',
  'site',
  'sites',
  'official',
  'public',
  'verified',
  'details',
  'data',
  'please',
  'now',
  'google',
  'bing',
  'duckduckgo',
  'python',
  'react',
  'api',
  'web',
]);

function titleCaseLocation(value: string): string {
  const trimmed = value
    .replace(/["'`]/g, '')
    .replace(/[.,;!?]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!trimmed) return '';

  const lower = trimmed.toLowerCase();
  if (lower === 'usa' || lower === 'u.s.' || lower === 'u.s.a.') return 'United States';
  if (lower === 'uk' || lower === 'u.k.') return 'United Kingdom';
  if (lower === 'us') return 'US';
  if (lower === 'uae') return 'UAE';

  return trimmed
    .split(' ')
    .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase() : part))
    .join(' ');
}

function extractLocation(input: string, explicitLocation?: string): string {
  if (explicitLocation?.trim()) return titleCaseLocation(explicitLocation);

  const text = (input || '').replace(/https?:\/\/\S+|www\.\S+/gi, ' ');
  const known = [...KNOWN_LOCATIONS].sort((a, b) => b.length - a.length);
  const lower = text.toLowerCase();
  for (const location of known) {
    const pattern = new RegExp(`\\b${location.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\b`, 'i');
    if (pattern.test(lower)) return titleCaseLocation(location);
  }

  // English prepositions: "companies in Delhi", "startups near New York".
  const englishMatch = text.match(
    /\b(?:in|near|around|within|at|from)\s+([A-Za-z][A-Za-z .'-]{1,40})/i
  );
  if (englishMatch?.[1]) {
    const parts = englishMatch[1]
      .split(/\s+(?=with\b|who\b|that\b|and\b|for\b|having\b|to\b|find\b|search\b|extract\b)/i)[0]
      .trim()
      .split(/\s+/)
      .filter((part) => !LOCATION_STOP_WORDS.has(part.toLowerCase()))
      .slice(0, 4);
    if (parts.length) return titleCaseLocation(parts.join(' '));
  }

  // Hinglish postpositions: "Delhi ke 20 SaaS businesses", "Mumbai mein startups".
  const hinglishMatch = text.match(
    /\b([A-Za-z][A-Za-z'-]{1,24}(?:\s+[A-Za-z][A-Za-z'-]{1,24}){0,2})\s+(?:ke|ki|ka|mein|me|se|par|wali|wale)\b/i
  );
  if (hinglishMatch?.[1]) {
    const parts = hinglishMatch[1]
      .split(/\s+/)
      .filter((part) => !/^\d+$/.test(part) && !STOP_WORDS.has(part.toLowerCase()))
      .slice(-3);
    if (parts.length) return titleCaseLocation(parts.join(' '));
  }

  return '';
}

function detectIndustry(input: string, explicitIndustry?: string): string {
  if (explicitIndustry?.trim()) {
    const normalized = explicitIndustry.trim().toLowerCase();
    if (/\bsaas\b/.test(normalized)) return /\bai\b/.test(normalized) ? 'AI SaaS companies' : 'SaaS companies';
    if (/software/.test(normalized)) return 'software companies';
    if (/startup/.test(normalized)) return 'startups';
    return explicitIndustry.trim();
  }

  const lower = (input || '').toLowerCase();
  const hasAi = /\bai\b|artificial intelligence/.test(lower);
  if (/\bsaas\b/.test(lower)) return hasAi ? 'AI SaaS companies' : 'SaaS companies';
  if (/\bsoftware\b/.test(lower)) return hasAi ? 'AI software companies' : 'software companies';
  if (/\bstartups?\b/.test(lower)) return hasAi ? 'AI startups' : 'startups';
  if (/\b(compan(?:y|ies))\b/.test(lower)) return hasAi ? 'AI companies' : 'companies';
  if (/\bbusiness(?:es)?\b/.test(lower)) return hasAi ? 'AI businesses' : 'businesses';

  const categoryPatterns: Array<[RegExp, string]> = [
    [/\brestaurants?\b/, 'restaurants'],
    [/\bbaker(?:y|ies)\b/, 'bakeries'],
    [/\bhotels?\b/, 'hotels'],
    [/\bdentists?\b/, 'dentists'],
    [/\bgyms?\b/, 'gyms'],
    [/\bsalons?\b/, 'salons'],
    [/\bcafes?\b/, 'cafes'],
    [/\bagenc(?:y|ies)\b/, 'agencies'],
    [/\bclinics?\b/, 'clinics'],
    [/\bshops?\b/, 'shops'],
    [/\bstores?\b/, 'stores'],
  ];
  for (const [pattern, label] of categoryPatterns) {
    if (pattern.test(lower)) return label;
  }

  // Last-resort noun extraction is intentionally conservative. It is better
  // to issue a short broad query than to send task instructions to a provider.
  const tokens = (input || '')
    .replace(/https?:\/\/\S+|www\.\S+/gi, ' ')
    .replace(/[^A-Za-z0-9 -]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => !/^\d+$/.test(token) && !STOP_WORDS.has(token.toLowerCase()));
  const nouns = tokens.filter((token) => token.length > 2).slice(0, 4);
  return nouns.join(' ') || 'companies';
}

/**
 * Converts a natural-language task into a compact provider query.
 *
 * Example:
 *   "Mujhe Delhi ke 20 SaaS businesses find karke unke decision makers ke emails nikalo"
 *   -> "SaaS companies Delhi"
 */
export function buildWebSearchQuery(
  input: string,
  options: WebSearchQueryOptions = {}
): string {
  const raw = typeof input === 'string' ? input.trim() : '';
  if (!raw && !options.industry) return '';

  const location = extractLocation(raw, options.location);
  const industry = detectIndustry(raw, options.industry);
  const query = [industry, location]
    .map((part) => part.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\b(United States)\b/gi, 'United States')
    .trim();

  return query.slice(0, 160);
}

export function extractWebSearchLocation(input: string, explicitLocation?: string): string {
  return extractLocation(input, explicitLocation);
}

export function extractWebSearchIndustry(input: string, explicitIndustry?: string): string {
  return detectIndustry(input, explicitIndustry);
}
