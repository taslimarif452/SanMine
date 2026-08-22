export interface NormalizedLocation {
  raw: string;
  city: string;
  state?: string;
  country?: string;
  countryCode?: string; // ISO 2-letter country code (e.g. 'in', 'us', 'gb')
  normalizedQueryLocation: string;
  postalCodePrefixes: string[];
  tokens: string[];
}

export const KNOWN_CITIES: Record<string, Partial<NormalizedLocation>> = {
  ranchi: {
    city: 'Ranchi',
    state: 'Jharkhand',
    country: 'India',
    countryCode: 'in',
    normalizedQueryLocation: 'Ranchi, Jharkhand, India',
    postalCodePrefixes: ['834', '835'],
    tokens: ['ranchi', 'jharkhand', 'india', '834'],
  },
  bangalore: {
    city: 'Bangalore',
    state: 'Karnataka',
    country: 'India',
    countryCode: 'in',
    normalizedQueryLocation: 'Bangalore, Karnataka, India',
    postalCodePrefixes: ['560'],
    tokens: ['bangalore', 'bengaluru', 'karnataka', 'india', '560'],
  },
  bengaluru: {
    city: 'Bengaluru',
    state: 'Karnataka',
    country: 'India',
    countryCode: 'in',
    normalizedQueryLocation: 'Bengaluru, Karnataka, India',
    postalCodePrefixes: ['560'],
    tokens: ['bangalore', 'bengaluru', 'karnataka', 'india', '560'],
  },
  mumbai: {
    city: 'Mumbai',
    state: 'Maharashtra',
    country: 'India',
    countryCode: 'in',
    normalizedQueryLocation: 'Mumbai, Maharashtra, India',
    postalCodePrefixes: ['400'],
    tokens: ['mumbai', 'bombay', 'maharashtra', 'india', '400'],
  },
  delhi: {
    city: 'Delhi',
    state: 'Delhi',
    country: 'India',
    countryCode: 'in',
    normalizedQueryLocation: 'Delhi, India',
    postalCodePrefixes: ['110'],
    tokens: ['delhi', 'new delhi', 'india', '110'],
  },
  kolkata: {
    city: 'Kolkata',
    state: 'West Bengal',
    country: 'India',
    countryCode: 'in',
    normalizedQueryLocation: 'Kolkata, West Bengal, India',
    postalCodePrefixes: ['700'],
    tokens: ['kolkata', 'calcutta', 'west bengal', 'india', '700'],
  },
  chennai: {
    city: 'Chennai',
    state: 'Tamil Nadu',
    country: 'India',
    countryCode: 'in',
    normalizedQueryLocation: 'Chennai, Tamil Nadu, India',
    postalCodePrefixes: ['600'],
    tokens: ['chennai', 'madras', 'tamil nadu', 'india', '600'],
  },
  hyderabad: {
    city: 'Hyderabad',
    state: 'Telangana',
    country: 'India',
    countryCode: 'in',
    normalizedQueryLocation: 'Hyderabad, Telangana, India',
    postalCodePrefixes: ['500'],
    tokens: ['hyderabad', 'telangana', 'india', '500'],
  },
  pune: {
    city: 'Pune',
    state: 'Maharashtra',
    country: 'India',
    countryCode: 'in',
    normalizedQueryLocation: 'Pune, Maharashtra, India',
    postalCodePrefixes: ['411', '412'],
    tokens: ['pune', 'maharashtra', 'india', '411'],
  },
  jamshedpur: {
    city: 'Jamshedpur',
    state: 'Jharkhand',
    country: 'India',
    countryCode: 'in',
    normalizedQueryLocation: 'Jamshedpur, Jharkhand, India',
    postalCodePrefixes: ['831'],
    tokens: ['jamshedpur', 'jharkhand', 'india', '831'],
  },
  patna: {
    city: 'Patna',
    state: 'Bihar',
    country: 'India',
    countryCode: 'in',
    normalizedQueryLocation: 'Patna, Bihar, India',
    postalCodePrefixes: ['800'],
    tokens: ['patna', 'bihar', 'india', '800'],
  },
  srinagar: {
    city: 'Srinagar',
    state: 'Jammu and Kashmir',
    country: 'India',
    countryCode: 'in',
    normalizedQueryLocation: 'Srinagar, Jammu and Kashmir, India',
    postalCodePrefixes: ['190'],
    tokens: ['srinagar', 'kashmir', 'jammu and kashmir', 'india', '190'],
  },
  easton: {
    city: 'Easton',
    state: 'PA',
    country: 'United States',
    countryCode: 'us',
    normalizedQueryLocation: 'Easton, PA, USA',
    postalCodePrefixes: ['18042', '18040'],
    tokens: ['easton', 'pennsylvania', 'pa', 'united states', 'usa'],
  },
  phillipsburg: {
    city: 'Phillipsburg',
    state: 'NJ',
    country: 'United States',
    countryCode: 'us',
    normalizedQueryLocation: 'Phillipsburg, NJ, USA',
    postalCodePrefixes: ['08865'],
    tokens: ['phillipsburg', 'new jersey', 'nj', 'united states', 'usa'],
  },
  'new york': {
    city: 'New York',
    state: 'NY',
    country: 'United States',
    countryCode: 'us',
    normalizedQueryLocation: 'New York, NY, USA',
    postalCodePrefixes: ['100', '101', '102', '103', '104', '111', '112', '113', '114'],
    tokens: ['new york', 'ny', 'nyc', 'manhattan', 'brooklyn', 'queens', 'bronx', 'usa', 'united states'],
  },
  chicago: {
    city: 'Chicago',
    state: 'IL',
    country: 'United States',
    countryCode: 'us',
    normalizedQueryLocation: 'Chicago, IL, USA',
    postalCodePrefixes: ['606', '607'],
    tokens: ['chicago', 'illinois', 'il', 'usa', 'united states'],
  },
  austin: {
    city: 'Austin',
    state: 'TX',
    country: 'United States',
    countryCode: 'us',
    normalizedQueryLocation: 'Austin, TX, USA',
    postalCodePrefixes: ['787', '786'],
    tokens: ['austin', 'texas', 'tx', 'travis county', 'usa', 'united states', '787'],
  },
  houston: {
    city: 'Houston',
    state: 'TX',
    country: 'United States',
    countryCode: 'us',
    normalizedQueryLocation: 'Houston, TX, USA',
    postalCodePrefixes: ['770', '772'],
    tokens: ['houston', 'texas', 'tx', 'harris county', 'usa', 'united states', '770'],
  },
  dallas: {
    city: 'Dallas',
    state: 'TX',
    country: 'United States',
    countryCode: 'us',
    normalizedQueryLocation: 'Dallas, TX, USA',
    postalCodePrefixes: ['752', '753'],
    tokens: ['dallas', 'texas', 'tx', 'usa', 'united states', '752'],
  },
  seattle: {
    city: 'Seattle',
    state: 'WA',
    country: 'United States',
    countryCode: 'us',
    normalizedQueryLocation: 'Seattle, WA, USA',
    postalCodePrefixes: ['981'],
    tokens: ['seattle', 'washington', 'wa', 'king county', 'usa', 'united states', '981'],
  },
  'san francisco': {
    city: 'San Francisco',
    state: 'CA',
    country: 'United States',
    countryCode: 'us',
    normalizedQueryLocation: 'San Francisco, CA, USA',
    postalCodePrefixes: ['941'],
    tokens: ['san francisco', 'sf', 'california', 'ca', 'bay area', 'usa', 'united states', '941'],
  },
  'los angeles': {
    city: 'Los Angeles',
    state: 'CA',
    country: 'United States',
    countryCode: 'us',
    normalizedQueryLocation: 'Los Angeles, CA, USA',
    postalCodePrefixes: ['900', '902'],
    tokens: ['los angeles', 'la', 'california', 'ca', 'usa', 'united states', '900'],
  },
  london: {
    city: 'London',
    state: 'England',
    country: 'United Kingdom',
    countryCode: 'gb',
    normalizedQueryLocation: 'London, UK',
    postalCodePrefixes: ['ec', 'wc', 'e1', 'n1', 'nw', 'se', 'sw', 'w1'],
    tokens: ['london', 'uk', 'united kingdom', 'england'],
  },
  ahmedabad: {
    city: 'Ahmedabad',
    state: 'Gujarat',
    country: 'India',
    countryCode: 'in',
    normalizedQueryLocation: 'Ahmedabad, Gujarat, India',
    postalCodePrefixes: ['380'],
    tokens: ['ahmedabad', 'gujarat', 'india', '380'],
  },
  jaipur: {
    city: 'Jaipur',
    state: 'Rajasthan',
    country: 'India',
    countryCode: 'in',
    normalizedQueryLocation: 'Jaipur, Rajasthan, India',
    postalCodePrefixes: ['302'],
    tokens: ['jaipur', 'rajasthan', 'india', '302'],
  },
  chandigarh: {
    city: 'Chandigarh',
    state: 'Punjab/Haryana',
    country: 'India',
    countryCode: 'in',
    normalizedQueryLocation: 'Chandigarh, India',
    postalCodePrefixes: ['160'],
    tokens: ['chandigarh', 'punjab', 'haryana', 'india', '160'],
  },
  lucknow: {
    city: 'Lucknow',
    state: 'Uttar Pradesh',
    country: 'India',
    countryCode: 'in',
    normalizedQueryLocation: 'Lucknow, Uttar Pradesh, India',
    postalCodePrefixes: ['226'],
    tokens: ['lucknow', 'uttar pradesh', 'up', 'india', '226'],
  },
  surat: {
    city: 'Surat',
    state: 'Gujarat',
    country: 'India',
    countryCode: 'in',
    normalizedQueryLocation: 'Surat, Gujarat, India',
    postalCodePrefixes: ['395'],
    tokens: ['surat', 'gujarat', 'india', '395'],
  },
  kanpur: {
    city: 'Kanpur',
    state: 'Uttar Pradesh',
    country: 'India',
    countryCode: 'in',
    normalizedQueryLocation: 'Kanpur, Uttar Pradesh, India',
    postalCodePrefixes: ['208'],
    tokens: ['kanpur', 'uttar pradesh', 'india', '208'],
  },
  indore: {
    city: 'Indore',
    state: 'Madhya Pradesh',
    country: 'India',
    countryCode: 'in',
    normalizedQueryLocation: 'Indore, Madhya Pradesh, India',
    postalCodePrefixes: ['452'],
    tokens: ['indore', 'madhya pradesh', 'india', '452'],
  },
  nagpur: {
    city: 'Nagpur',
    state: 'Maharashtra',
    country: 'India',
    countryCode: 'in',
    normalizedQueryLocation: 'Nagpur, Maharashtra, India',
    postalCodePrefixes: ['440'],
    tokens: ['nagpur', 'maharashtra', 'india', '440'],
  },
  bhopal: {
    city: 'Bhopal',
    state: 'Madhya Pradesh',
    country: 'India',
    countryCode: 'in',
    normalizedQueryLocation: 'Bhopal, Madhya Pradesh, India',
    postalCodePrefixes: ['462'],
    tokens: ['bhopal', 'madhya pradesh', 'india', '462'],
  },
  toronto: {
    city: 'Toronto',
    state: 'Ontario',
    country: 'Canada',
    countryCode: 'ca',
    normalizedQueryLocation: 'Toronto, ON, Canada',
    postalCodePrefixes: ['m4', 'm5', 'm6'],
    tokens: ['toronto', 'ontario', 'canada'],
  },
  sydney: {
    city: 'Sydney',
    state: 'NSW',
    country: 'Australia',
    countryCode: 'au',
    normalizedQueryLocation: 'Sydney, NSW, Australia',
    postalCodePrefixes: ['2000'],
    tokens: ['sydney', 'nsw', 'australia'],
  },
};

/**
 * Normalizes a requested location string into structured geographical data.
 */
export function normalizeRequestedLocation(rawLocation?: string): NormalizedLocation {
  const raw = (rawLocation || '').trim();
  if (!raw) {
    return {
      raw: '',
      city: '',
      normalizedQueryLocation: '',
      postalCodePrefixes: [],
      tokens: [],
    };
  }

  const clean = raw.replace(/[.,;:!?]+$/, '').trim();
  const lower = clean.toLowerCase();

  // Check known city dictionary
  for (const [key, meta] of Object.entries(KNOWN_CITIES)) {
    if (lower === key || lower.startsWith(`${key},`) || lower.includes(` ${key} `) || lower.endsWith(` ${key}`)) {
      return {
        raw: clean,
        city: meta.city || clean,
        state: meta.state,
        country: meta.country,
        countryCode: meta.countryCode,
        normalizedQueryLocation: meta.normalizedQueryLocation || clean,
        postalCodePrefixes: meta.postalCodePrefixes || [],
        tokens: meta.tokens || [key],
      };
    }
  }

  // Handle general comma-separated location (e.g. "Austin, Texas, USA" or "Munich, Germany")
  const parts = clean.split(',').map((p) => p.trim()).filter(Boolean);
  const city = parts[0] || clean;
  const state = parts.length > 2 ? parts[1] : undefined;
  const country = parts.length > 1 ? parts[parts.length - 1] : undefined;

  let countryCode: string | undefined;
  const lowerCountry = (country || '').toLowerCase();
  if (lowerCountry.includes('india')) countryCode = 'in';
  else if (lowerCountry.includes('usa') || lowerCountry.includes('united states') || lowerCountry === 'us') countryCode = 'us';
  else if (lowerCountry.includes('uk') || lowerCountry.includes('united kingdom') || lowerCountry === 'gb') countryCode = 'gb';
  else if (lowerCountry.includes('canada') || lowerCountry === 'ca') countryCode = 'ca';
  else if (lowerCountry.includes('australia') || lowerCountry === 'au') countryCode = 'au';

  const tokens = [city.toLowerCase()];
  if (state) tokens.push(state.toLowerCase());
  if (country) tokens.push(country.toLowerCase());

  return {
    raw: clean,
    city,
    state,
    country,
    countryCode,
    normalizedQueryLocation: clean,
    postalCodePrefixes: [],
    tokens,
  };
}

/**
 * Known localities and landmarks in Ranchi for strict verification.
 */
const RANCHI_LOCALITIES = [
  'ranchi',
  'jharkhand',
  'harmu',
  'lalpur',
  'doranda',
  'kanke',
  'morabadi',
  'bariatu',
  'hinnoo',
  'main road',
  'ratu road',
  'kadru',
  'kokar',
  'ashok nagar',
  'namkum',
  'chutia',
  'hehal',
  'dhwa',
  'tatisilwai',
  'hinoo',
  'kantatoli',
  'tharpakhna',
  'bariyatu',
  'pundag',
  'tupudana',
  'argora',
  'bundu',
  'ormanjhi',
  'mesra',
  'siramtoli',
];

/**
 * Foreign / non-target location markers that strictly invalidate a Ranchi match.
 */
const NON_RANCHI_CONFLICT_PATTERNS = [
  /\beaston\b/i,
  /\bphillipsburg\b/i,
  /\bpennsylvania\b/i,
  /,\s*pa\b/i,
  /\bpa\s+\d{5}\b/i,
  /\bnew jersey\b/i,
  /,\s*nj\b/i,
  /\bnj\s+\d{5}\b/i,
  /\bunited states\b/i,
  /\busa\b/i,
  /\bcalifornia\b/i,
  /,\s*ca\b/i,
  /\bnew york\b/i,
  /,\s*ny\b/i,
  /\btexas\b/i,
  /,\s*tx\b/i,
  /\bflorida\b/i,
  /,\s*fl\b/i,
  /\billinois\b/i,
  /,\s*il\b/i,
  /\bohio\b/i,
  /,\s*oh\b/i,
  /\bgeorgia\b/i,
  /,\s*ga\b/i,
  /\bcanada\b/i,
  /\baustralia\b/i,
  /\bunited kingdom\b/i,
  /\buk\b/i,
];

export interface LocationVerificationResult {
  verified: boolean;
  reason?: string;
  matchedDetails?: string;
}

/**
 * Strictly verifies whether a business belongs to the requested location
 * based on provider formatted address, city, state, country, and place metadata.
 * 
 * NEVER uses website domain names as proof.
 * NEVER assumes a result belongs to the location merely because it appeared in search.
 */
export function verifyBusinessLocation(
  business: {
    name?: string;
    address?: string;
    city?: string;
    formattedAddress?: string;
  },
  requestedLocation: string
): LocationVerificationResult {
  const norm = normalizeRequestedLocation(requestedLocation);
  const targetCity = norm.city.toLowerCase();

  const address = (business.address || business.formattedAddress || business.city || '').trim();
  if (!address) {
    return {
      verified: false,
      reason: 'missing_address_metadata',
    };
  }

  const lowerAddr = address.toLowerCase();

  // SPECIAL CASE: Ranchi, Jharkhand, India
  if (targetCity === 'ranchi' || norm.tokens.includes('ranchi')) {
    // 1. Check for conflicting non-Ranchi locations (e.g. Easton PA, Phillipsburg NJ, US states)
    for (const pattern of NON_RANCHI_CONFLICT_PATTERNS) {
      if (pattern.test(lowerAddr)) {
        return {
          verified: false,
          reason: 'location_mismatch',
        };
      }
    }

    // 2. Check for positive Ranchi proof
    const hasRanchiWord = /\branchi\b/i.test(lowerAddr);
    const hasJharkhand = /\bjharkhand\b/i.test(lowerAddr);
    const hasRanchiPin = /\b834\d{3}\b/.test(lowerAddr) || /\b835\d{3}\b/.test(lowerAddr);
    const hasRanchiLocality = RANCHI_LOCALITIES.some((loc) =>
      new RegExp(`\\b${loc}\\b`, 'i').test(lowerAddr)
    );

    if (hasRanchiWord || (hasJharkhand && (hasRanchiPin || hasRanchiLocality)) || hasRanchiPin) {
      return {
        verified: true,
        matchedDetails: 'Verified in Ranchi, Jharkhand, India',
      };
    }

    // Fallback: If address has Jharkhand and India but not explicit other city
    if (hasJharkhand && /\bindia\b/i.test(lowerAddr) && !/\b(jamshedpur|dhanbad|bokaro|deoghar|hazaribagh)\b/i.test(lowerAddr)) {
      return {
        verified: true,
        matchedDetails: 'Verified in Jharkhand, India (Ranchi region)',
      };
    }

    return {
      verified: false,
      reason: 'location_mismatch',
    };
  }

  // GENERAL CASE: Any other location
  // 1. Direct city match in address
  const cityRegex = new RegExp(`\\b${targetCity}\\b`, 'i');
  if (cityRegex.test(lowerAddr)) {
    // Check if state/country conflict exists
    if (norm.countryCode === 'us') {
      if (/\bindia\b/i.test(lowerAddr) || /\buk\b/i.test(lowerAddr)) {
        return { verified: false, reason: 'location_mismatch' };
      }
    } else if (norm.countryCode === 'in') {
      if (/\busa\b/i.test(lowerAddr) || /\bunited states\b/i.test(lowerAddr)) {
        return { verified: false, reason: 'location_mismatch' };
      }
    }
    return {
      verified: true,
      matchedDetails: `Verified in ${norm.city}`,
    };
  }

  // 2. Token match (e.g. postal code or region)
  if (norm.postalCodePrefixes.length > 0) {
    const hasPostal = norm.postalCodePrefixes.some((p) => lowerAddr.includes(p));
    if (hasPostal) {
      return {
        verified: true,
        matchedDetails: `Verified in ${norm.city} postal zone`,
      };
    }
  }

  return {
    verified: false,
    reason: 'location_mismatch',
  };
}

/**
 * Extracts a candidate location string from text using prepositions, known cities, or short geographic answers.
 */
export function extractLocationCandidate(text: string): string {
  if (!text) return '';
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();

  // 1. Check preposition patterns: "in Delhi", "near Bangalore", "around Mumbai", "at Ranchi", "for New York"
  const prepMatch = trimmed.match(/\b(?:in|near|around|at|for|within)\s+([A-Za-z\s,-]+?)(?:\s+(?:with|and|having|who|that|for|to|\.|$)|[.,;!?]|$)/i);
  if (prepMatch && prepMatch[1]) {
    const cand = prepMatch[1].trim().replace(/\b(with|and|having|who|that|for|to)\b.*$/i, '').trim();
    if (cand.length > 1 && !['the', 'all', 'some', 'any', 'my', 'our', 'a', 'them', 'these', 'those'].includes(cand.toLowerCase())) {
      return cand;
    }
  }

  // 2. Match against known cities directly
  const knownCityNames = Object.keys(KNOWN_CITIES);
  for (const cityKey of knownCityNames) {
    const reg = new RegExp(`\\b${cityKey}\\b`, 'i');
    if (reg.test(lower)) {
      return KNOWN_CITIES[cityKey].city || cityKey;
    }
  }

  // 3. Check Hindi / Hinglish post-positions: "Srinagar ki", "Delhi me", "Mumbai se", "Ranchi ke"
  const hindiPostMatch = trimmed.match(/\b([A-Za-z]{3,25})\s+(?:ki|ke|ka|me|mein|se|par|wali|wale)\b/i);
  if (hindiPostMatch && hindiPostMatch[1]) {
    const word = hindiPostMatch[1].trim();
    const nonLocationWords = [
      'company', 'website', 'business', 'store', 'page', 'profile', 'product', 'item', 'services',
      'pricing', 'founder', 'email', 'phone', 'contact', 'info', 'details', 'sab', 'aaj', 'kal',
      'kuch', 'aise', 'unka', 'inka', 'mera', 'apna', 'ye', 'wo',
      'google', 'bing', 'duckduckgo', 'python', 'react', 'api', 'online', 'web', 'search'
    ];
    if (!nonLocationWords.includes(word.toLowerCase())) {
      return word.charAt(0).toUpperCase() + word.slice(1);
    }
  }

  // 4. Check if the text itself is an isolated city response (e.g. "Delhi", "Delhi, India", "Target Bangalore", "Austin, TX")
  const nonCityKeywords = [
    'find', 'search', 'get', 'send', 'proposal', 'proposals', 'leads', 'lead',
    'business', 'businesses', 'gym', 'gyms', 'restaurant', 'restaurants', 'dentist', 'dentists',
    'audit', 'analyze', 'check', 'status'
  ];
  const words = lower.split(/\s+/);
  const containsActionVerb = words.some((w) => nonCityKeywords.includes(w));
  if (!containsActionVerb && words.length <= 4 && trimmed.length >= 2) {
    const clean = trimmed.replace(/^(in|near|at|around|for|target)\s+/i, '').replace(/[.,;!?]+$/, '').trim();
    if (clean.length >= 2) {
      return clean;
    }
  }

  return '';
}

/**
 * Searches back through conversation history to find a previously mentioned location.
 */
export function extractLocationFromHistory(messages: Array<{ role: string; content: string }>): string {
  if (!Array.isArray(messages) || messages.length === 0) return '';
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === 'user' && typeof msg.content === 'string') {
      const loc = extractLocationCandidate(msg.content);
      if (loc) return loc;
    }
  }
  return '';
}

