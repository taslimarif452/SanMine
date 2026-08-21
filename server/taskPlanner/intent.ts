/**
 * Universal Task Planner — Intent & Objective Understanding Engine
 *
 * Translates arbitrary user prompts (English, Hindi, Hinglish, Multilingual)
 * into a structured, typed Task definition with normalized objectives,
 * required fields, constraints, target entities, and location resolutions.
 * Supports both LLM-powered understanding and deterministic heuristic fallbacks.
 */

import { Task, TaskIntentType, TaskState, ExecutionPlan, CompletionCriteria } from './types.js';
import { extractLocationCandidate, extractLocationFromHistory } from '../search/location.js';
import { aiRegistry } from '../ai/registry.js';
import { AIProvider } from '../ai/types.js';

export interface UnderstandTaskOptions {
  taskId?: string;
  defaultLocation?: string;
  conversationHistory?: Array<{ role: string; content: string }>;
  providerId?: string;
  model?: string;
  userApiKey?: string;
  abortSignal?: AbortSignal;
}

/**
 * Heuristic/Deterministic understanding engine (works with zero API key / offline).
 */
export function understandTaskObjectiveHeuristics(
  prompt: string,
  options?: UnderstandTaskOptions
): Task {
  let text = (prompt || '').trim();

  // Multi-turn context resolution: if user provides a short response (e.g. location) after an assistant question
  if (options?.conversationHistory && options.conversationHistory.length > 0) {
    const lastAssistant = [...options.conversationHistory].reverse().find((m) => m.role === 'assistant');
    if (lastAssistant && (/location/i.test(lastAssistant.content) || /where/i.test(lastAssistant.content) || /target/i.test(lastAssistant.content))) {
      const prevUser = [...options.conversationHistory].reverse().find((m) => m.role === 'user' && m.content !== prompt);
      if (prevUser) {
        text = `${prevUser.content} in ${text}`;
      }
    }
  }

  const lower = text.toLowerCase();
  const taskId = options?.taskId || `task_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const now = new Date().toISOString();

  // 1. DIRECT URL EXTRACTION
  const urlMatch = text.match(/(https?:\/\/[^\s]+|www\.[^\s]+)/i);
  let targetUrl: string | undefined = undefined;
  if (urlMatch) {
    targetUrl = urlMatch[1].startsWith('www.') ? `https://${urlMatch[1]}` : urlMatch[1];
    targetUrl = targetUrl.replace(/[.,;:!?)]+$/, '');
  }

  // Explicit Source / Platform Detection
  let explicitSource: string | undefined = undefined;
  if (/\b(google|google par|google pe|google search|on google)\b/i.test(lower)) {
    explicitSource = 'Google Search';
  } else if (targetUrl) {
    explicitSource = targetUrl;
  }

  // 2. SOCIAL MEDIA PLATFORM DETECTION & USERNAME/HANDLE EXTRACTION
  const platforms: string[] = [];
  let socialHandle: string | undefined = undefined;

  if (/\b(instagram|insta|ig profile|ig)\b/i.test(lower)) platforms.push('instagram');
  if (/\b(linkedin|linked in)\b/i.test(lower)) platforms.push('linkedin');
  if (/\b(twitter|x\.com|tweets)\b/i.test(lower)) platforms.push('twitter');
  if (/\b(facebook|fb page)\b/i.test(lower)) platforms.push('facebook');
  if (/\b(youtube|yt channel)\b/i.test(lower)) platforms.push('youtube');
  if (/\b(github|repo)\b/i.test(lower)) platforms.push('github');

  if (platforms.length > 0 && !explicitSource) {
    explicitSource = platforms[0].charAt(0).toUpperCase() + platforms[0].slice(1);
  }

  // Check for social handles (e.g. "___tauqeer.x", "@username", "tauqeer.x")
  const handleMatch = text.match(/(?:@|se\s+|profile\s+|account\s+|handle\s+)?([a-zA-Z0-9_.]+(?:___[a-zA-Z0-9_.]+)?)/i);
  if (platforms.length > 0) {
    const handleCandidates = text.match(/([a-zA-Z0-9_.]*___[a-zA-Z0-9_.]+|@[a-zA-Z0-9_.]+)/);
    if (handleCandidates) {
      socialHandle = handleCandidates[0].replace(/^@/, '');
    } else {
      // Find candidate username after platform name
      const platformWord = platforms[0];
      const afterPlatform = text.slice(text.toLowerCase().indexOf(platformWord) + platformWord.length);
      const afterMatch = afterPlatform.match(/(?:se|pe|of|profile|for|account)?\s*([a-zA-Z0-9_.]+)/i);
      if (afterMatch && afterMatch[1] && !['se', 'pe', 'ka', 'ki', 'ke', 'details', 'public', 'profile'].includes(afterMatch[1].toLowerCase())) {
        socialHandle = afterMatch[1];
      }
    }
  }

  // 3. TARGET FIELDS EXTRACTION
  const requiredFields: string[] = [];
  if (/\b(founder|founders|ceo|co-founder|co-founders|leadership|owner|owners|director|directors|malik|team)\b/i.test(lower)) {
    requiredFields.push('founder');
  }
  if (/\b(email|emails|mail|gmail|contact email|id)\b/i.test(lower)) {
    requiredFields.push('email');
  }
  if (/\b(phone|phone number|phone numbers|number|numbers|mobile|call|contact number|tele|contact)\b/i.test(lower)) {
    requiredFields.push('phone');
  }
  if (/\b(website|websites|url|link|domain|web page|site)\b/i.test(lower)) {
    requiredFields.push('website');
  }
  if (/\b(no website|without website|jin ki website nahi hai|website nahi hai|unlisted website)\b/i.test(lower)) {
    if (!requiredFields.includes('website_status')) requiredFields.push('website_status');
  }
  if (/\b(pricing|price|prices|cost|costs|rate|rates|plans|subscription|fees)\b/i.test(lower)) {
    requiredFields.push('pricing');
  }
  if (/\b(service|services|offering|offerings|product|products|feature|features|what they do|kaam|services batao)\b/i.test(lower)) {
    requiredFields.push('services');
  }
  if (/\b(about|about us|company profile|overview)\b/i.test(lower)) {
    if (!requiredFields.includes('about')) requiredFields.push('about');
  }
  if (/\b(contact|contact us|get in touch)\b/i.test(lower)) {
    if (!requiredFields.includes('email') && !requiredFields.includes('phone')) {
      requiredFields.push('email', 'phone');
    }
  }
  if (/\b(address|location|headquarters|office|pata)\b/i.test(lower)) {
    requiredFields.push('address');
  }
  if (/\b(rating|ratings|review|reviews|score|stars)\b/i.test(lower)) {
    requiredFields.push('rating');
  }
  if (platforms.length > 0) {
    if (/\b(bio|followers|following|posts|display name|profile detail|details)\b/i.test(lower)) {
      if (!requiredFields.includes('bio')) requiredFields.push('bio', 'followers', 'display_name');
    }
  }

  // 4. QUANTITY & TARGET ENTITY EXTRACTION (e.g. 20 companies, 5 gyms, 10 cafes)
  let quantity: number | undefined = undefined;
  let targetConcept: string | undefined = undefined;

  const countMatch = text.match(/\b(?:find|search|discover|get|fetch|list|collect|prospect|audit|top|scrape|gather|nikalo|dhoondo|batao)?\s*(\d+)\s+(companies|businesses|leads|prospects|gyms|dentists|restaurants|cafes|bakeries|salons|clinics|hotels|shops|stores|firms|accounts|profiles|items|services|people|startups|agencies)?\b/i);
  if (countMatch && parseInt(countMatch[1], 10) > 0) {
    quantity = Math.min(50, Math.max(1, parseInt(countMatch[1], 10)));
    if (countMatch[2]) {
      targetConcept = countMatch[2].toLowerCase();
    }
  } else {
    const directNumMatch = text.match(/\b(\d+)\b/);
    if (directNumMatch && parseInt(directNumMatch[1], 10) > 0 && parseInt(directNumMatch[1], 10) <= 50) {
      quantity = parseInt(directNumMatch[1], 10);
    }
  }

  if (!targetConcept) {
    const entityMatch = text.match(/\b(companies|company|startups|startup|bakeries|bakery|gyms|gym|restaurants|restaurant|cafes|cafe|dentists|dentist|salons|salon|plumbers|lawyers|clinics|hotels|shops|stores|businesses|business|firms|agencies)\b/i);
    if (entityMatch) {
      targetConcept = entityMatch[1].toLowerCase();
    }
  }

  // 5. LOCATION EXTRACTION
  let location = extractLocationCandidate(text);
  if (!location && options?.defaultLocation && options.defaultLocation.trim()) {
    location = options.defaultLocation.trim();
  }
  if (!location && options?.conversationHistory) {
    location = extractLocationFromHistory(options.conversationHistory);
  }

  // 6. INTENT CLASSIFICATION
  let intent: TaskIntentType = 'GENERAL_TASK';
  let preferredOutput: 'table' | 'proposals' | 'report' | 'list' | 'conversational' = 'conversational';
  let clarificationPrompt: string | undefined = undefined;

  const isSystemStatus =
    /\b(check|show|get|view|what is|display)?\s*(sanmine\s*|saneye\s*|agentos\s*)?(system\s*status|runtime\s*status|integration\s*status|status\s*check|status\s*report)\b/i.test(lower) &&
    !/\b(gym|dentist|restaurant|company|lead)\b/i.test(lower);

  const isAuditRequest =
    Boolean(targetUrl) ||
    /\b(audit|analyze|analysis|inspect|diagnose|check|review|performance|speed|score|seo|pricing|services|founder)\b/i.test(lower) && Boolean(targetUrl);

  const isProposalRequest =
    /\b(proposal|proposals|pitch|send proposal|draft proposal|prepare proposal)\b/i.test(lower);

  const isSocialRequest =
    platforms.length > 0 ||
    Boolean(socialHandle) ||
    (/\b(profile|account|bio|handle|posts|details|nikalo|find|search)\b/i.test(lower) && platforms.length > 0);

  const isDiscoveryRequest =
    /\b(find|search|discover|look for|get|fetch|gather|scrape|list|collect|prospect|dhoondo|nikalo|batao|karo)\b/i.test(lower) &&
    /\b(companies|company|businesses|business|leads|lead|prospects|gyms|gym|dentists|dentist|restaurants|restaurant|cafes|cafe|bakeries|bakery|salons|salon|plumbers|lawyers|clinics|hotels|shops|stores|founders|emails|startups|agencies)\b/i.test(lower);

  const isCompareOrResearch =
    /\b(research|compare|comparison|sources|sources ke saath|information compare|websites open karo|relevant websites)\b/i.test(lower);

  const isChatOnly =
    !targetUrl &&
    !isDiscoveryRequest &&
    !isAuditRequest &&
    !isSocialRequest &&
    !isSystemStatus &&
    !isProposalRequest &&
    !isCompareOrResearch &&
    (
      /^(hi|hello|hey|greetings|help|who are you|what can you do|kya kar sakte ho|namaste)\b/i.test(text) ||
      (text.length < 40 && !requiredFields.length && !quantity)
    );

  if (isSystemStatus) {
    intent = 'SYSTEM_DIAGNOSTIC';
    preferredOutput = 'report';
  } else if (isProposalRequest && (isDiscoveryRequest || quantity || location)) {
    intent = 'PROPOSAL_SYNTHESIS';
    preferredOutput = 'proposals';
  } else if (isSocialRequest) {
    intent = 'SOCIAL_PROFILE_RESEARCH';
    preferredOutput = 'report';
  } else if (isAuditRequest && targetUrl) {
    intent = 'URL_INSPECTION_AND_AUDIT';
    preferredOutput = isProposalRequest ? 'proposals' : 'report';
  } else if (targetUrl) {
    intent = 'URL_INSPECTION_AND_AUDIT';
    preferredOutput = 'report';
  } else if (isDiscoveryRequest) {
    intent = 'DISCOVERY_AND_EXTRACTION';
    preferredOutput = quantity && quantity > 1 ? 'table' : 'report';
  } else if (isCompareOrResearch) {
    intent = 'DEEP_WEB_RESEARCH';
    preferredOutput = 'report';
  } else if (isChatOnly) {
    intent = 'DIRECT_CHAT';
    preferredOutput = 'conversational';
  } else {
    intent = 'DEEP_WEB_RESEARCH';
    preferredOutput = 'report';
  }

  // Location Clarification Check: ONLY for hyper-local discovery queries without location and without explicit source
  const isLocalBusinessDiscovery =
    intent === 'DISCOVERY_AND_EXTRACTION' || intent === 'PROPOSAL_SYNTHESIS';
  const mentionsLocalServiceNiche =
    /\b(small businesses|local businesses|gyms|dentists|restaurants|cafes|bakeries|salons|plumbers|shops|stores)\b/i.test(lower);

  const isGlobalOrSearchExempt =
    /\b(companies|startups|agencies|firms|ai|saas|software|crypto|fintech|tools|websites|online|global|open source)\b/i.test(lower) ||
    Boolean(explicitSource && explicitSource.includes('Google')) ||
    Boolean(targetUrl) ||
    platforms.length > 0;

  if (isLocalBusinessDiscovery && mentionsLocalServiceNiche && !location && !isGlobalOrSearchExempt) {
    clarificationPrompt = 'Which location should I target?';
  }

  // 7. CONSTRUCT NORMALIZED OBJECTIVE
  let normalizedObjective = `Fulfill user request: "${text}"`;
  if (intent === 'URL_INSPECTION_AND_AUDIT' && targetUrl) {
    normalizedObjective = `Inspect and extract ${requiredFields.length ? requiredFields.join(', ') : 'key findings'} from ${targetUrl}`;
  } else if (intent === 'DISCOVERY_AND_EXTRACTION') {
    const qtyStr = quantity ? `${quantity} ` : '';
    const conceptStr = targetConcept || 'companies/businesses';
    const locStr = location ? ` in ${location}` : '';
    const srcStr = explicitSource ? ` through ${explicitSource}` : '';
    const fieldsStr = requiredFields.length ? ` with verified ${requiredFields.join(', ')}` : '';
    normalizedObjective = `Discover ${qtyStr}${conceptStr}${locStr}${srcStr}${fieldsStr}`;
  } else if (intent === 'SOCIAL_PROFILE_RESEARCH') {
    const handleStr = socialHandle ? ` "${socialHandle}"` : '';
    normalizedObjective = `Research public profile details${handleStr} on ${platforms.join('/') || 'social media'}`;
  } else if (intent === 'DEEP_WEB_RESEARCH') {
    normalizedObjective = `Research topic "${text}" with verified sources and citations`;
  }

  // Calculate dynamic iteration limit based on required quantity
  const calculatedMaxIterations = Math.min(60, Math.max(12, Math.ceil((quantity || 1) * 2.5)));

  const initialPlan: ExecutionPlan = {
    id: `plan_${taskId}`,
    version: 1,
    goal: normalizedObjective,
    subtasks: [],
    activeSubtaskIndex: 0,
    fallbackStrategies: [
      'Modify search queries if initial results are insufficient',
      'Follow internal subpages (About, Team, Contact, Pricing) for missing fields',
      'Inspect secondary public sources when primary site is missing data',
    ],
    estimatedSteps: Math.min(quantity ? quantity + 3 : 5, 20),
    updatedAt: now,
  };

  const completionCriteria: CompletionCriteria = {
    requiredQuantity: quantity || (intent === 'DISCOVERY_AND_EXTRACTION' ? 5 : 1),
    minimumVerifiedEntities: quantity || (intent === 'DISCOVERY_AND_EXTRACTION' ? 5 : 1),
    requiredFields,
    requirePublicVerification: true,
    minConfidence: 0.8,
    maxIterations: calculatedMaxIterations,
    allowPartial: true,
  };

  const currentState: TaskState = {
    currentIteration: 0,
    progressPercentage: 0,
    totalToolsExecuted: 0,
    totalAiCalls: 0,
    isComplete: false,
  };

  const needsBrowser = intent !== 'DIRECT_CHAT' && intent !== 'SYSTEM_DIAGNOSTIC';
  const followRelevantLinks = requiredFields.some((f) => ['founder', 'email', 'phone', 'pricing', 'services', 'contact'].includes(f));

  return {
    id: taskId,
    originalPrompt: text,
    normalizedObjective,
    intent,
    target: targetUrl || socialHandle || targetConcept || location || undefined,
    entities: socialHandle ? [socialHandle] : (targetConcept ? [targetConcept] : []),
    source: explicitSource || targetUrl || (platforms.length ? platforms[0] : undefined),
    platforms,
    location: location || undefined,
    quantity,
    requiredFields,
    constraints: [
      'Zero invented data or synthetic placeholders',
      'Require direct observation or live page citations',
      'Strict anti-loop protection on duplicate URLs and queries',
    ],
    accessRequirements: ['Public web inspection without authenticated bypass'],
    needsBrowser,
    followRelevantLinks,
    preferredOutput,
    language: detectLanguage(text),
    subtasks: [],
    executionPlan: initialPlan,
    completionCriteria,
    currentState,
    status: clarificationPrompt ? 'WAITING_FOR_INPUT' : 'PLANNING',
    clarificationPrompt,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * LLM-Powered Task Understanding (converts arbitrary prompts into structured Task).
 * Falls back safely to deterministic heuristics if no provider is configured or on error.
 */
export async function understandTaskObjectiveWithLLM(
  prompt: string,
  options?: UnderstandTaskOptions
): Promise<Task> {
  const baseTask = understandTaskObjectiveHeuristics(prompt, options);

  if (!options?.providerId) {
    return baseTask;
  }

  const provider = aiRegistry.get(options.providerId as any);
  if (!provider || !provider.isConfigured()) {
    return baseTask;
  }

  try {
    const systemPrompt = `You are the Universal Task Planner Intent Analyzer for SanMine Space.
Analyze the user's prompt (which may be in English, Hindi, or Hinglish) and return a strict JSON object specifying the structured task objective.

Return ONLY valid JSON matching this schema:
{
  "normalizedObjective": "Concise, precise goal in English",
  "intent": "DISCOVERY_AND_EXTRACTION" | "URL_INSPECTION_AND_AUDIT" | "SOCIAL_PROFILE_RESEARCH" | "DEEP_WEB_RESEARCH" | "PROPOSAL_SYNTHESIS" | "SYSTEM_DIAGNOSTIC" | "DIRECT_CHAT" | "GENERAL_TASK",
  "target": "target URL, username, company, or null",
  "platforms": ["instagram", "linkedin", "twitter", "facebook", "youtube", "github"],
  "location": "location name or null",
  "quantity": number or null,
  "requiredFields": ["founder", "email", "phone", "website", "pricing", "services", "address", "rating", "website_status", "bio", "followers", "display_name"],
  "preferredOutput": "table" | "proposals" | "report" | "list" | "conversational",
  "needsBrowser": boolean,
  "followRelevantLinks": boolean,
  "requiresLocationClarification": boolean
}`;

    let accumulatedResponse = '';
    const conversationMessages = options.conversationHistory?.map((m) => ({
      role: m.role as any,
      content: m.content,
    })) || [];

    await provider.streamChat({
      apiKey: options.userApiKey,
      model: options.model || provider.defaultModel,
      temperature: 0.1,
      messages: [
        { role: 'system', content: systemPrompt },
        ...conversationMessages,
        { role: 'user', content: prompt },
      ],
      onEvent: (event) => {
        if (event.type === 'message.delta' && event.content) {
          accumulatedResponse += event.content;
        }
      },
      abortSignal: options.abortSignal,
    });

    if (!accumulatedResponse.trim()) {
      return baseTask;
    }

    // Clean JSON markdown fences
    let cleanJson = accumulatedResponse.trim();
    if (cleanJson.startsWith('```')) {
      cleanJson = cleanJson.replace(/^```[a-zA-Z]*\s*/, '').replace(/```\s*$/, '').trim();
    }

    const parsed = JSON.parse(cleanJson);
    if (parsed && typeof parsed === 'object') {
      const quantity = typeof parsed.quantity === 'number' && parsed.quantity > 0 ? parsed.quantity : baseTask.quantity;
      const calculatedMaxIterations = Math.min(60, Math.max(12, Math.ceil((quantity || 1) * 2.5)));

      const finalLocation = parsed.location || baseTask.location;
      const requiresClarification = parsed.requiresLocationClarification && !finalLocation;

      return {
        ...baseTask,
        normalizedObjective: parsed.normalizedObjective || baseTask.normalizedObjective,
        intent: (parsed.intent as TaskIntentType) || baseTask.intent,
        target: parsed.target || baseTask.target,
        platforms: Array.isArray(parsed.platforms) && parsed.platforms.length ? parsed.platforms : baseTask.platforms,
        location: finalLocation,
        quantity,
        requiredFields: Array.isArray(parsed.requiredFields) && parsed.requiredFields.length ? parsed.requiredFields : baseTask.requiredFields,
        preferredOutput: parsed.preferredOutput || baseTask.preferredOutput,
        needsBrowser: parsed.needsBrowser !== undefined ? parsed.needsBrowser : baseTask.needsBrowser,
        followRelevantLinks: parsed.followRelevantLinks !== undefined ? parsed.followRelevantLinks : baseTask.followRelevantLinks,
        completionCriteria: {
          ...baseTask.completionCriteria,
          requiredQuantity: quantity || baseTask.completionCriteria.requiredQuantity,
          minimumVerifiedEntities: quantity || baseTask.completionCriteria.minimumVerifiedEntities,
          maxIterations: calculatedMaxIterations,
        },
        status: requiresClarification ? 'WAITING_FOR_INPUT' : baseTask.status,
        clarificationPrompt: requiresClarification ? 'Which location should I target?' : baseTask.clarificationPrompt,
      };
    }
  } catch (err: any) {
    console.warn('[Intent Analyzer] LLM intent parse notice (using heuristics):', err.message);
  }

  return baseTask;
}

/**
 * Universal Intent Entry Point: synchronous heuristic by default, supports async LLM via options.
 */
export function understandTaskObjective(
  prompt: string,
  options?: UnderstandTaskOptions
): Task {
  return understandTaskObjectiveHeuristics(prompt, options);
}

function detectLanguage(text: string): string {
  const lower = text.toLowerCase();
  if (/[\u0900-\u097F]/.test(text)) return 'Hindi (Devanagari)';
  if (/\b(karo|dhoondo|nikalo|batao|chahiye|unka|inka|mujhe|aur|hai|hain|pe|par|kaise)\b/i.test(lower)) {
    return 'Hinglish';
  }
  return 'English';
}

