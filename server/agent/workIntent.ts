/**
 * Work-delegation intent detection and goal parsing for SanMine.
 *
 * SanMine is not a chatbot. Users delegate research / outreach work:
 * find → verify → inspect → extract → (optional) proposal → (optional) Gmail send.
 *
 * Slash (`/`) remains an explicit force-agent hint. Natural-language work
 * goals must also enter Agent Mode without requiring a leading slash.
 */

import { extractLocationCandidate, KNOWN_CITIES } from '../search/location.js';

/**
 * High-level user intent classification used by the agent brain and orchestrator.
 * Kept deterministic (regex based) so intent routing never depends on an LLM call.
 */
export type UserIntentType =
  | 'CONVERSATIONAL'
  | 'RESEARCH'
  | 'DATA_COLLECTION'
  | 'AUTOMATION'
  | 'EXTERNAL_ACTION'
  | 'MULTI_STEP_AGENT_TASK';

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
  /\b((?:send|dispatch|bhejo|bhej|outreach)\b[\s\S]{0,80}\b(?:proposals?|emails?|mails?|pitches?|outreach|gmail)|(?:proposals?|emails?|mails?|pitches?|gmail)\b[\s\S]{0,60}\b(?:send|bhejo|bhej|dispatch))\b/i;

const MARKET_RESEARCH =
  /\b(market research|lead generation|competitor analysis|web research|cold outreach|decision makers?)\b/i;

const COUNTRY_OR_REGION =
  /\b(US|USA|U\.S\.A?|United States|UK|United Kingdom|India|Canada|Australia|Germany|UAE|Singapore|Europe|America)\b/i;

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
 * Classifies the user's message into a high-level intent bucket.
 *
 * - CONVERSATIONAL        → casual chat / explanation, no delegated work.
 * - RESEARCH              → discover / find / compare entities (leads, companies, businesses).
 * - DATA_COLLECTION       → collect / extract / scrape structured fields (emails, phones, pricing).
 * - AUTOMATION            → inspect / analyze / browse a specific site or account.
 * - EXTERNAL_ACTION       → dispatch outreach (send emails / proposals) via Gmail.
 * - MULTI_STEP_AGENT_TASK → a research + proposal + outreach pipeline (or genuinely multi-step work).
 */
export function classifyUserIntent(text: string): UserIntentType {
  const t = typeof text === 'string' ? text.trim() : '';
  if (!t) return 'CONVERSATIONAL';
  const lower = t.toLowerCase();

  if (!isWorkDelegationTask(t)) return 'CONVERSATIONAL';

  const isResearch =
    /\b(find|search|discover|prospect|research|list|compare|qualify|dhoondo|dhundo|khojo|nikalo|nikal)\b/i.test(lower) &&
    /\b(compan(?:y|ies)|leads?|business(?:es)?|prospects?|clients?|startups?|saas|websites?|restaurants?|baker(?:y|ies)|gyms?|dentists?|hotels?|universit(?:y|ies))\b/i.test(lower);
  const isDataCollection =
    /\b(collect|extract|scrape|gather|data|nikalo|emails?|phones?|pricing|contact|founders?)\b/i.test(lower) &&
    !/send|dispatch|bhej|outreach/i.test(lower);
  const isAutomation =
    /\b(inspect|audit|analyze|open|browse|navigate|kholo|jao|website|profile)\b/i.test(lower) &&
    !/\b(find|search|discover)\b/i.test(lower);
  const isExternalAction = /\b(send|dispatch|bhej|bhejo|outreach|gmail)\b/i.test(lower);
  const isProposal = /\b(proposal|pitch|pitches)\b/i.test(lower);

  if (isExternalAction && (isResearch || isProposal || isDataCollection)) {
    return 'MULTI_STEP_AGENT_TASK';
  }
  if (isExternalAction) return 'EXTERNAL_ACTION';
  if (isDataCollection) return 'DATA_COLLECTION';
  if (isAutomation) return 'AUTOMATION';
  if (isResearch) return 'RESEARCH';
  return 'MULTI_STEP_AGENT_TASK';
}

/**
 * Matches a user confirmation to send the prepared proposals / emails.
 * Covers English, Hindi, and Hinglish affirmations.
 */
const AFFIRMATIVE_SEND_PATTERN =
  /^(yes|y|yeah|yep|haan|ha|ok|okay|sure|send|send them|bhej|bhej do|bhejo|go ahead|confirm|do it|please send)\b/i;

/**
 * Matches a user decline to send prepared proposals / emails.
 */
const NEGATIVE_SEND_PATTERN =
  /^(no|nah|nahi|nope|don't|cancel|stop|not now|mat bhejo|mat bhej)\b/i;

/**
 * Returns true when the user explicitly confirms sending the prepared emails/proposals.
 */
export function isAffirmativeSendConfirmation(text: string): boolean {
  if (typeof text !== 'string') return false;
  const t = text.trim();
  if (!t) return false;
  return AFFIRMATIVE_SEND_PATTERN.test(t);
}

/**
 * Returns true when the user explicitly declines sending the prepared emails/proposals.
 */
export function isNegativeConfirmation(text: string): boolean {
  if (typeof text !== 'string') return false;
  const t = text.trim();
  if (!t) return false;
  return NEGATIVE_SEND_PATTERN.test(t);
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

  // Fall back to the shared location extractor + known-city dictionary from
  // server/search/location.ts (Delhi, Bangalore, New York, London, ...).
  if (!location) {
    const candidate = extractLocationCandidate(rawQuery);
    if (candidate) {
      const key = candidate.toLowerCase().trim();
      if (KNOWN_CITIES[key]) {
        location = KNOWN_CITIES[key].city || candidate;
      } else {
        location = candidate;
      }
    }
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
 * Human-readable work plan shown in live chat before tools run.
 */
export function describeWorkPlanForUser(
  prompt: string,
  extras?: {
    quantity?: number;
    location?: string;
    requestedFields?: string[];
    emailActionsRequired?: boolean;
    proposalRequired?: boolean;
  }
): string {
  const goal = parseWorkGoal(prompt, extras?.location);
  const qty = extras?.quantity || goal.quantity || 1;
  const loc = extras?.location || goal.location;
  const fields = extras?.requestedFields?.length ? extras.requestedFields : goal.requestedFields;
  const industry = goal.industry || 'companies';
  const locBit = loc ? ` in ${loc}` : '';
  const fieldBit = fields.length ? ` Extract ${fields.join(', ')}.` : '';
  const extraBits: string[] = [];
  if (extras?.proposalRequired || goal.proposalRequired) extraBits.push('draft proposals');
  if (extras?.emailActionsRequired || goal.emailActionsRequired) extraBits.push('send outreach');
  const extra = extraBits.length ? ` Then ${extraBits.join(' and ')}.` : '';
  return `I'll find ${qty} ${industry}${locBit}, open official websites, and verify contacts.${fieldBit}${extra} Steps: search → open pages → extract → report.`;
}
