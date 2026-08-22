/**
 * Work-delegation intent detection and goal parsing for SanMine.
 *
 * SanMine is not a chatbot. Users delegate research / outreach work:
 * find → verify → inspect → extract → (optional) proposal → (optional) Gmail send.
 *
 * Slash (`/`) remains an explicit force-agent hint. Natural-language work
 * goals must also enter Agent Mode without requiring a leading slash.
 */

export interface WorkGoal {
  isWorkTask: boolean;
  quantity: number;
  location: string;
  industry: string;
  constraints: string[];
  requestedFields: string[];
  proposalRequired: boolean;
  emailActionsRequired: boolean;
  noWebsiteRequired: boolean;
  searchQuery: string;
  entities: string[];
  rawQuery: string;
}

const CHAT_ONLY_PREFIX =
  /^(hi|hello|hey|thanks|thank you|ok|okay|good morning|good afternoon|good evening|kya haal hai|kaise ho)\b/i;

const EXPLAIN_OR_CHAT_PREFIX =
  /^(what is|what's|whats|who are you|what can you do|explain|how does|how do i|how to|write a paragraph|help me write an email|tell me about|mujhe .+ samjhao)\b/i;

const WORK_VERBS =
  /\b(find|search|discover|research|inspect|audit|scrape|collect|list|prospect|compare|qualify|extract|investigate|browse|navigate|open|analyze|identify|gather|nikalo|nikal|dhoondo|dhundo|khojo|karo|bhejo|dekho|check)\b/i;

const WORK_NOUNS =
  /\b(compan(?:y|ies)|leads?|business(?:es)?|websites?|restaurants?|baker(?:y|ies)|hotels?|universit(?:y|ies)|competitors?|startups?|saas|clients?|prospects?|agenc(?:y|ies)|founders?|decision[- ]makers?|contacts?|proposal|outreach|pitch|clinics?|dentists?|gyms?|salons?|stores?|shops?|cafes?)\b/i;

const QUANTITY_TASK =
  /\b(\d{1,3})\s+(?:[a-zA-Z-]+\s+){0,3}(?:compan(?:y|ies)|leads?|business(?:es)?|hotels?|universit(?:y|ies)|restaurants?|baker(?:y|ies)|startups?|saas|clients?|prospects?|agenc(?:y|ies)|websites?|stores?|shops?|profiles?|accounts?|clinics?|dentists?|gyms?|salons?|cafes?|entities)\b/i;

const SEND_OUTREACH =
  /\b((?:send|dispatch|bhejo|bhej|outreach)\b[\s\S]{0,80}\b(?:proposal|email|mail|pitch|outreach|gmail)|(?:proposal|email|mail|pitch|gmail)\b[\s\S]{0,60}\b(?:send|bhejo|bhej|dispatch))\b/i;

const MARKET_RESEARCH =
  /\b(market research|lead generation|competitor analysis|web research|cold outreach|decision makers?)\b/i;

const COUNTRY_OR_REGION =
  /\b(US|USA|U\.S\.A?|United States|UK|United Kingdom|India|Canada|Australia|Germany|UAE|Singapore|Europe|America)\b/i;

// Major Indian & international cities so Hinglish prompts like "Delhi me",
// "Bangalore mein", "Mumbai me" resolve a location without a country keyword.
const KNOWN_CITIES =
  /\b(delhi|new delhi|mumbai|bangalore|bengaluru|hyderabad|chennai|kolkata|pune|ahmedabad|jaipur|lucknow|kanpur|nagpur|indore|bhopal|patna|ranchi|srinagar|chandigarh|gurgaon|gurugram|noida|faridabad|ghaziabad|surat|vadodara|kochi|kozhikode|trivandrum|thiruvananthapuram|visakhapatnam|coimbatore|mysore|madurai|bhubaneswar|guwahati|dehradun|amritsar|jodhpur|udaipur|indore|london|new york|san francisco|austin|toronto|berlin|dubai|singapore|sydney)\b/i;

function extractLocationFromWorkPrompt(rawQuery: string): string {
  if (!rawQuery) return '';
  // "X mein/me/ki" Hinglish postposition pattern
  const hindiPost = rawQuery.match(/\b([A-Za-z][A-Za-z.\-]{2,25})\s+(?:mein|me|ki|ke|ka|se|par)\b/i);
  if (hindiPost && hindiPost[1]) {
    const candidate = hindiPost[1];
    if (KNOWN_CITIES.test(candidate) || COUNTRY_OR_REGION.test(candidate)) {
      return candidate.charAt(0).toUpperCase() + candidate.slice(1).toLowerCase();
    }
  }
  // "in <City>" / "near <City>" English pattern
  const englishPrep = rawQuery.match(/\b(?:in|near|around|at)\s+([A-Za-z][A-Za-z.\-]{2,25})\b/i);
  if (englishPrep && englishPrep[1]) {
    const candidate = englishPrep[1];
    if (KNOWN_CITIES.test(candidate) || COUNTRY_OR_REGION.test(candidate)) {
      return candidate.charAt(0).toUpperCase() + candidate.slice(1).toLowerCase();
    }
  }
  // Bare known city anywhere in the prompt
  const bare = rawQuery.match(KNOWN_CITIES);
  if (bare && bare[0]) {
    const c = bare[0];
    return c.split(/[\s-]/).map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
  }
  return '';
}

/**
 * True when the message is a work / research / outreach delegation, not casual chat.
 */
export function isWorkDelegationTask(text: string): boolean {
  if (typeof text !== 'string') return false;
  const t = text.trim();
  if (!t) return false;

  if (CHAT_ONLY_PREFIX.test(t) && t.length < 48) return false;
  if (EXPLAIN_OR_CHAT_PREFIX.test(t.toLowerCase())) return false;

  // Bare URL with no inspection verb is conversation (e.g. "I found https://x.com in the docs")
  const hasUrl = /https?:\/\/\S+|www\.\S+/i.test(t);
  const inspectVerb = /\b(inspect|audit|pricing|founder|email|contact|nikalo|open|kholo|analyze|extract|services|jao)\b/i.test(t);
  if (hasUrl && inspectVerb) return true;

  if (QUANTITY_TASK.test(t)) return true;
  if (SEND_OUTREACH.test(t)) return true;
  if (MARKET_RESEARCH.test(t)) return true;
  if (WORK_VERBS.test(t) && WORK_NOUNS.test(t)) return true;

  return false;
}

/**
 * Pulls a structured work goal out of an arbitrary English / Hindi / Hinglish prompt.
 */
export function parseWorkGoal(prompt: string, defaultLocation?: string): WorkGoal {
  const rawQuery = typeof prompt === 'string' ? prompt.trim() : '';
  const lower = rawQuery.toLowerCase();
  const isWorkTask = isWorkDelegationTask(rawQuery);

  let quantity = 1;
  const qMatch =
    rawQuery.match(QUANTITY_TASK) ||
    rawQuery.match(/\b(?:find|search|get|discover|inspect|list|collect|research|audit)\s+(\d{1,3})\b/i);
  if (qMatch && qMatch[1]) {
    const parsed = parseInt(qMatch[1], 10);
    if (parsed > 0 && parsed <= 50) quantity = parsed;
  }

  let location = '';
  const country = rawQuery.match(COUNTRY_OR_REGION);
  if (country && country[1]) {
    const raw = country[1];
    if (/^(US|USA|U\.S\.A?|United States|America)$/i.test(raw)) location = 'United States';
    else if (/^(UK|United Kingdom)$/i.test(raw)) location = 'United Kingdom';
    else location = raw;
  }
  if (!location) {
    location = extractLocationFromWorkPrompt(rawQuery);
  }
  if (!location && defaultLocation) location = defaultLocation.trim();

  const requestedFields = new Set<string>();
  if (/\b(phone|call|mobile|number|telephone)\b/i.test(lower)) requestedFields.add('phone');
  if (/\b(website|websites|site|url|official website)\b/i.test(lower)) requestedFields.add('website');
  if (/\b(email|mail|contact)\b/i.test(lower)) requestedFields.add('email');
  if (/\b(founder|founders|ceo|owner|leadership|team|decision[- ]maker)\b/i.test(lower)) requestedFields.add('founder');
  if (/\b(pricing|price|prices|cost|tier|plans|rate)\b/i.test(lower)) requestedFields.add('pricing');
  if (/\b(services|service|offerings|products|features|solutions)\b/i.test(lower)) requestedFields.add('services');
  if (/\b(employees?|headcount|team size)\b/i.test(lower)) requestedFields.add('employees');
  if (/\b(proposal|pitch)\b/i.test(lower)) requestedFields.add('proposal');

  const noWebsiteRequired =
    /\b(?:no|without|lacking|bina|missing)\s+(?:any\s+)?websites?\b|\bwebsites?\s+nahi\s+hai\b|\boutdated\s+websites?\b/i.test(
      lower
    );
  const emailActionsRequired = SEND_OUTREACH.test(rawQuery);
  const proposalRequired =
    /\b(?:proposals?|pitch|pitches|personalized\s+proposals?)\b|\bproposals?\s+(?:banao|likho|bhejo)\b/i.test(lower) ||
    emailActionsRequired;

  const constraints: string[] = [];
  if (location) constraints.push(`Must match location: ${location}`);
  if (noWebsiteRequired && /outdated/i.test(lower)) {
    constraints.push('Website must appear outdated or poorly maintained');
  } else if (noWebsiteRequired) {
    constraints.push('Must NOT have an active website');
  }
  if (/\b(ai|artificial intelligence)\b/i.test(lower)) constraints.push('Must use or relate to AI');
  if (/\bsaas\b/i.test(lower)) constraints.push('Must be a SaaS / software company');
  const empMatch = rawQuery.match(/\b(\d{1,4})\s*[–-]\s*(\d{1,4})\s*employees?\b/i);
  if (empMatch) constraints.push(`Employee range ${empMatch[1]}-${empMatch[2]}`);

  let industry = '';
  if (/\bsaas\b/i.test(lower)) industry = 'SaaS';
  else if (/\bstartups?\b/i.test(lower)) industry = 'startups';
  else if (/\bbaker(?:y|ies)\b/i.test(lower)) industry = 'bakeries';
  else if (/\brestaurants?\b/i.test(lower)) industry = 'restaurants';
  else if (/\bhotels?\b/i.test(lower)) industry = 'hotels';
  else if (/\bdentists?\b/i.test(lower)) industry = 'dentists';
  else if (/\bgyms?\b/i.test(lower)) industry = 'gyms';
  else if (/\bcompan(?:y|ies)\b/i.test(lower)) industry = 'companies';
  else if (/\bbusiness(?:es)?\b/i.test(lower)) industry = 'businesses';

  const entities: string[] = [];
  if (industry) entities.push(industry);

  const searchParts = [industry || 'companies', location, /\bai\b/i.test(lower) ? 'AI' : '']
    .filter(Boolean)
    .join(' ')
    .trim();

  return {
    isWorkTask,
    quantity,
    location,
    industry,
    constraints,
    requestedFields: Array.from(requestedFields),
    proposalRequired,
    emailActionsRequired,
    noWebsiteRequired,
    searchQuery: searchParts || rawQuery.slice(0, 120),
    entities,
    rawQuery,
  };
}

/**
 * Lightweight user-facing intent classification used to pick the spoken
 * "Understanding request" plan. Returns 'work' for delegated research /
 * outreach and 'chat' for plain conversation or explanations.
 */
export function classifyUserIntent(text: string): 'work' | 'chat' {
  return isWorkDelegationTask(text) ? 'work' : 'chat';
}

export interface SpokenWorkPlan {
  /** One-line headline shown while the agent starts (never "Agent is working"). */
  headline: string;
  /** Short human-readable plan of what the agent will do. */
  plan: string;
}

/**
 * Produces a short, deterministic spoken plan for the activity header.
 *
 * Returns an object `{ headline, plan }` so call sites can render both a
 * concise headline and a slightly more descriptive plan without any LLM call.
 * `classifyUserIntent` should be consulted first: for casual chat this is not
 * used (the normal chat path streams directly).
 */
export function describeWorkPlanForUser(
  prompt: string,
  defaultLocation?: string
): SpokenWorkPlan {
  const goal = parseWorkGoal(prompt, defaultLocation);
  const subject =
    goal.industry ||
    (goal.entities && goal.entities.length > 0 ? goal.entities.join(', ') : '') ||
    'companies';
  const where = goal.location || defaultLocation || '';

  const fieldLabels: string[] = [];
  if (goal.requestedFields.includes('founder')) fieldLabels.push('decision makers');
  if (goal.requestedFields.includes('email')) fieldLabels.push('contact emails');
  if (goal.requestedFields.includes('phone')) fieldLabels.push('phone numbers');
  if (goal.requestedFields.includes('pricing')) fieldLabels.push('pricing');
  if (goal.requestedFields.includes('services')) fieldLabels.push('services');
  if (goal.requestedFields.includes('website')) fieldLabels.push('websites');

  const qty = goal.quantity > 1 ? goal.quantity : '';
  const locationPhrase = where ? ` in ${where}` : '';
  const targetPhrase = [qty, subject].filter(Boolean).join(' ').trim();
  const targetWithLocation = `${targetPhrase}${locationPhrase}`.trim();

  let headline: string;
  if (goal.emailActionsRequired) {
    headline = `Researching ${targetWithLocation} and preparing outreach`;
  } else if (goal.proposalRequired) {
    headline = `Researching ${targetWithLocation} and drafting proposals`;
  } else {
    headline = `Researching ${targetWithLocation}`;
  }

  const steps: string[] = [];
  steps.push(`Search the live web for ${targetPhrase}`);
  steps.push('Open and inspect official pages');
  if (fieldLabels.length > 0) {
    steps.push(`Extract verified ${fieldLabels.join(', ')}`);
  } else {
    steps.push('Extract verified findings');
  }
  if (goal.proposalRequired) steps.push('Draft grounded proposals');
  if (goal.emailActionsRequired) steps.push('Send via connected Gmail (with confirmation)');
  steps.push('Compile a sourced findings table');

  return {
    headline,
    plan: steps.join(' → '),
  };
}
