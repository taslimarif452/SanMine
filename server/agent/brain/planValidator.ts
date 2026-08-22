/**
 * Plan & Decision Validator for Universal Agent Brain
 *
 * Provides schema validation, argument sanitation, and safe repair/fallback mechanisms.
 */

import { BrainTaskPlan, BrainActionDecision, UserIntentType, ActionDecisionType } from './types.js';
import { isToolRegistered, BRAIN_AVAILABLE_TOOLS } from './toolSchemas.js';
import { extractLocationCandidate, extractLocationFromHistory } from '../../agent.js';
import { parseWorkGoal } from '../workIntent.js';
import { buildWebSearchQuery } from '../../research/searchQuery.js';

export class PlanValidator {
  /**
   * Validates and repairs a raw LLM output into a guaranteed valid BrainTaskPlan.
   */
  static validateAndRepairPlan(
    raw: any,
    prompt: string,
    defaultLocation?: string,
    conversationHistory?: Array<{ role: string; content: string }>
  ): BrainTaskPlan {
    if (!raw || typeof raw !== 'object') {
      return this.createFallbackPlan(prompt, defaultLocation, conversationHistory);
    }

    const workGoal = parseWorkGoal(prompt, defaultLocation);

    const goal = typeof raw.goal === 'string' && raw.goal.trim()
      ? raw.goal.trim()
      : `Process request: ${prompt.slice(0, 100)}`;

    const validIntents: UserIntentType[] = [
      'DISCOVERY_AND_EXTRACTION',
      'WEBSITE_INSPECTION',
      'PROFILE_RESEARCH',
      'MULTI_STEP_RESEARCH',
      'SYSTEM_DIAGNOSTIC',
      'DIRECT_CHAT',
      'GENERAL_REASONING',
    ];

    let userIntent: UserIntentType = validIntents.includes(raw.userIntent)
      ? raw.userIntent
      : 'GENERAL_REASONING';

    // Auto-detect intent if fallback was used
    if (userIntent === 'GENERAL_REASONING') {
      const p = prompt.toLowerCase();
      if (/find|search|companies|bakeries|dentists|restaurants|list|leads/i.test(p)) {
        userIntent = 'DISCOVERY_AND_EXTRACTION';
      } else if (/https?:\/\/|\.com|\.in|\.org|website|pricing|about|contact/i.test(p)) {
        userIntent = 'WEBSITE_INSPECTION';
      } else if (/instagram|linkedin|twitter|profile|bio|handle/i.test(p)) {
        userIntent = 'PROFILE_RESEARCH';
      } else if (/system|status|health|diagnostic|uptime/i.test(p)) {
        userIntent = 'SYSTEM_DIAGNOSTIC';
      }
    }

    // Deterministic routing owns discovery intent. The LLM may describe the
    // goal, but it cannot turn a discovery job into a direct answer or choose
    // a search provider/tool.
    const hasDirectUrl = /https?:\/\/[^\s]+|www\.[^\s]+/i.test(prompt);
    if (workGoal.isWorkTask) {
      userIntent = hasDirectUrl && !/\b(find|search|discover|list|companies|businesses|startups|saas)\b/i.test(prompt)
        ? 'WEBSITE_INSPECTION'
        : 'DISCOVERY_AND_EXTRACTION';
    } else if (!hasDirectUrl && userIntent === 'GENERAL_REASONING') {
      userIntent = 'DIRECT_CHAT';
    }

    const entities: string[] = Array.isArray(raw.entities)
      ? raw.entities.filter((e: any) => typeof e === 'string' && e.trim()).map((e: string) => e.trim())
      : [];

    const requestedFields: string[] = Array.isArray(raw.requestedFields)
      ? raw.requestedFields.filter((f: any) => typeof f === 'string' && f.trim()).map((f: string) => f.trim().toLowerCase())
      : [];

    let quantity = typeof raw.quantity === 'number' && raw.quantity > 0 ? Math.min(raw.quantity, 50) : 1;
    // Extract quantity from prompt if not specified in JSON (e.g. "20 companies", "10 bakeries", "5 startups", "3 Instagram clothing stores")
    if (quantity === 1) {
      const qMatch = prompt.match(/\b(\d{1,2})\s*(?:[a-zA-Z_-]+\s+){0,2}(?:companies|leads|businesses|stores|profiles|bakeries|items|results|startups|gyms|restaurants|cafes|dentists|salons|plumbers|websites|tools|apps|agencies|clinics|hotels|entities|shops|accounts)\b/i) ||
        prompt.match(/\b(?:find|search|get|discover|inspect|list|collect|research|audit)\s+(\d{1,2})\b/i);
      if (qMatch && qMatch[1]) {
        const parsed = parseInt(qMatch[1], 10);
        if (parsed > 0 && parsed <= 50) quantity = parsed;
      }
    }
    // The user's explicit quantity is authoritative over a model-produced
    // default. This prevents an LLM plan with quantity=1 from ending a
    // twenty-item job after its first page.
    if (workGoal.quantity > 1) quantity = Math.min(workGoal.quantity, 50);

    // Auto-detect requested fields from prompt if not supplied
    const lowerP = prompt.toLowerCase();
    const detectedFields = new Set<string>(requestedFields);
    if (/\b(phone|call|mobile|number|telephone)\b/i.test(lowerP)) detectedFields.add('phone');
    if (/\b(website|websites|site|url|web)\b/i.test(lowerP)) detectedFields.add('website');
    if (/\b(email|mail|contact)\b/i.test(lowerP)) detectedFields.add('email');
    if (/\b(founder|founders|ceo|owner|leadership|team)\b/i.test(lowerP)) detectedFields.add('founder');
    if (/\b(pricing|price|prices|cost|tier|plans|rate|pricing model)\b/i.test(lowerP)) detectedFields.add('pricing');
    if (/\b(services|service|offerings|products|features|solutions)\b/i.test(lowerP)) detectedFields.add('services');
    if (/\b(bio|biography|about|description)\b/i.test(lowerP)) detectedFields.add('bio');
    if (/\b(followers|following|audience|subscribers)\b/i.test(lowerP)) detectedFields.add('followers');
    if (/\b(outdated|legacy|modern|responsive|mobile-friendly|website status)\b/i.test(lowerP)) detectedFields.add('website_status');
    if (/\b(https|ssl|tls|security|certificate)\b/i.test(lowerP)) detectedFields.add('https');
    if (/\b(proposal|pitch)\b/i.test(lowerP)) detectedFields.add('proposal');

    for (const f of workGoal.requestedFields) detectedFields.add(f);
    const finalRequestedFields = Array.from(detectedFields);

    const noWebsiteRequired =
      workGoal.noWebsiteRequired ||
      /\b(?:no|without|lacking|bina|missing)\s+(?:any\s+)?websites?\b|\bwebsites?\s+nahi\s+hai\b|\bno-websites?\b/i.test(lowerP);
    const emailActionsRequired =
      workGoal.emailActionsRequired ||
      /\b(?:send|dispatch|outreach)\s+(?:outreach\s+)?(?:proposals?|emails?|mails?)\b|\b(?:proposal|email|mail)\s+bhejo\b|\bcold\s+emails?\b|\breach\s+out\b/i.test(lowerP);
    const proposalRequired =
      workGoal.proposalRequired ||
      /\b(?:proposals?|pitch|pitches|personalized\s+proposals?|pitch\s+drafts?)\b|\bproposals?\s+(?:banao|likho)\b/i.test(lowerP) ||
      emailActionsRequired;

    const requiredActions: string[] = [];
    if (/find|search|discover|list|get/i.test(lowerP) || userIntent === 'DISCOVERY_AND_EXTRACTION') {
      requiredActions.push('find_businesses');
    }
    if (noWebsiteRequired) {
      requiredActions.push('verify_website_absence');
    }
    if (finalRequestedFields.includes('email') || emailActionsRequired) {
      requiredActions.push('find_contact');
    }
    requiredActions.push('extract_facts');
    if (proposalRequired) {
      requiredActions.push('generate_proposal');
    }
    if (emailActionsRequired) {
      requiredActions.push('send_email');
    }
    requiredActions.push('record_result');

    const constraints: string[] = Array.isArray(raw.constraints)
      ? raw.constraints.filter((c: any) => typeof c === 'string' && c.trim()).map((c: string) => c.trim())
      : [];

    if (noWebsiteRequired && !constraints.includes('Must NOT have an active website')) {
      constraints.push('Must NOT have an active website');
    }
    if (emailActionsRequired && !constraints.includes('Must send outreach proposal to verified email')) {
      constraints.push('Must send outreach proposal to verified email');
    }

    const sourcePreference = ['google', 'direct_website', 'instagram', 'linkedin', 'twitter', 'auto'].includes(raw.sourcePreference)
      ? raw.sourcePreference
      : 'auto';

    let discoveryStrategy = ['search_first', 'direct_url', 'multi_page_crawl', 'direct_chat'].includes(raw.discoveryStrategy)
      ? raw.discoveryStrategy
      : 'search_first';

    const browserRequired = typeof raw.browserRequired === 'boolean'
      ? raw.browserRequired
      : userIntent !== 'DIRECT_CHAT' && userIntent !== 'SYSTEM_DIAGNOSTIC';

    let toolsRequired: string[] = Array.isArray(raw.toolsRequired)
      ? raw.toolsRequired.filter((t: any) => typeof t === 'string' && isToolRegistered(t))
      : [];

    const expectedOutput = typeof raw.expectedOutput === 'string' && raw.expectedOutput.trim()
      ? raw.expectedOutput.trim()
      : 'Structured response with verified data and citations';

    const completionCriteria = typeof raw.completionCriteria === 'string' && raw.completionCriteria.trim()
      ? raw.completionCriteria.trim()
      : `Verify ${quantity} items meeting all constraints (${requiredActions.join(' -> ')}) with full source evidence.`;

    // Resolve location
    let resolvedLocation = extractLocationCandidate(prompt);
    if (!resolvedLocation && workGoal.location) {
      resolvedLocation = workGoal.location;
    }
    if (!resolvedLocation && defaultLocation) {
      resolvedLocation = defaultLocation;
    }
    if (!resolvedLocation && conversationHistory) {
      resolvedLocation = extractLocationFromHistory(conversationHistory);
    }

    let nextAction = this.validateAndRepairAction(raw.nextAction, prompt, userIntent, resolvedLocation);

    const isSearchDiscovery = workGoal.isWorkTask && !hasDirectUrl && userIntent !== 'DIRECT_CHAT';
    if (isSearchDiscovery) {
      // Discovery plans expose one search primitive. Provider choice and retry
      // sequencing are owned by BrainDecisionEngine, never by the LLM.
      discoveryStrategy = 'search_first';
      toolsRequired = ['search_web', 'analyze_website'];
      if (proposalRequired) toolsRequired.push('generate_proposal');
      if (emailActionsRequired) toolsRequired.push('send_email');
      nextAction = {
        type: 'execute_tool',
        toolName: 'search_web',
        toolArgs: {
          query: buildWebSearchQuery(prompt, { location: resolvedLocation, industry: workGoal.industry }),
          location: resolvedLocation,
          limit: Math.min(Math.max(quantity, 10), 30),
          attempt: 0,
        },
        rationale: 'Start deterministic web discovery with the normalized subject query',
        expectedObservation: 'Candidate official homepage URLs; snippets are not facts',
      };
    } else if (nextAction.toolName === 'google_search' || nextAction.toolName === 'search_businesses') {
      nextAction.toolName = 'search_web';
    }

    if (nextAction.toolName === 'search_web' && !nextAction.toolArgs.limit) {
      nextAction.toolArgs.limit = Math.min(Math.max(quantity, 10), 30);
    }
    if (nextAction.toolName === 'search_web') {
      nextAction.toolArgs.query = buildWebSearchQuery(
        typeof nextAction.toolArgs.query === 'string' ? nextAction.toolArgs.query : prompt,
        { location: resolvedLocation, industry: workGoal.industry }
      );
    }

    // Check if missing required location for local business discovery
    const lowerPrompt = prompt.toLowerCase();
    const isExplicitLocalService = /\b(small business|dentist|dentists|gym|gyms|salon|salons|plumber|plumbers|restaurant|restaurants|cafe|cafes|bakery|bakeries)\b/i.test(lowerPrompt);
    const isProposalOutreach = /\b(leads|send proposal|personalized proposal|proposals|cold outreach)\b/i.test(lowerPrompt);
    const isGeneralWebOrPlatform = /\b(google|instagram|linkedin|twitter|x\.com|http|www\.|\.com|\.io|\.org|\.ai|companies|startups)\b/i.test(lowerPrompt);

    const isLocalDiscovery =
      (isExplicitLocalService || isProposalOutreach) &&
      !isGeneralWebOrPlatform;

    if (isLocalDiscovery && !resolvedLocation && raw.nextAction?.type !== 'ask_clarification') {
      nextAction = {
        type: 'ask_clarification',
        toolName: '',
        toolArgs: {},
        rationale: 'Location is required for local business discovery and proposal generation',
        expectedObservation: 'User specifies target location',
        clarificationQuestion: 'Which location should I target?',
      };
    }

    return {
      goal,
      originalUserRequest: prompt,
      userIntent,
      entities,
      requestedFields: finalRequestedFields,
      quantity,
      location: resolvedLocation,
      constraints,
      sourcePreference,
      discoveryStrategy,
      browserRequired,
      toolsRequired,
      expectedOutput,
      completionCriteria,
      requiredActions,
      externalActionsRequired: emailActionsRequired,
      emailActionsRequired,
      proposalRequired,
      noWebsiteRequired,
      browserActionsRequired: browserRequired,
      nextAction,
      confidence: typeof raw.confidence === 'number' ? raw.confidence : 0.9,
    };
  }

  /**
   * Validates and repairs an Action Decision.
   */
  static validateAndRepairAction(
    raw: any,
    prompt: string,
    intent?: UserIntentType,
    defaultLocation?: string
  ): BrainActionDecision {
    if (!raw || typeof raw !== 'object') {
      return this.createFallbackAction(prompt, intent, defaultLocation);
    }

    const validTypes: ActionDecisionType[] = [
      'execute_tool',
      'replan',
      'complete',
      'ask_clarification',
      'report_unavailable',
    ];

    const type: ActionDecisionType = validTypes.includes(raw.type) ? raw.type : 'execute_tool';

    let toolName = typeof raw.toolName === 'string' ? raw.toolName.trim() : '';
    // Keep old checkpoints readable, but collapse all discovery actions onto
    // the single canonical search_web router. Deep research is not a second
    // discovery path in the brain.
    if (toolName === 'google_search' || toolName === 'search_businesses') {
      toolName = 'search_web';
    } else if (toolName === 'deep_web_research') {
      toolName = /https?:\/\/[^\s]+|www\.[^\s]+/i.test(prompt) ? 'analyze_website' : 'search_web';
    }
    if (type === 'execute_tool' && (!toolName || !isToolRegistered(toolName))) {
      // Choose best fitting tool
      if (intent === 'SYSTEM_DIAGNOSTIC') {
        toolName = 'get_system_status';
      } else if (intent === 'WEBSITE_INSPECTION') {
        const urlMatch = prompt.match(/https?:\/\/[^\s]+|[a-zA-Z0-9-]+\.(?:com|org|net|io|in|co|ai)[^\s]*/i);
        toolName = urlMatch ? 'browser_navigate' : 'search_web';
      } else {
        toolName = 'search_web';
      }
    }

    const toolArgs = typeof raw.toolArgs === 'object' && raw.toolArgs !== null ? raw.toolArgs : {};
    this.sanitizeToolArgs(toolName, toolArgs, prompt, defaultLocation);

    const rationale = typeof raw.rationale === 'string' && raw.rationale.trim()
      ? raw.rationale.trim()
      : `Executing ${toolName} to satisfy user goal`;

    const expectedObservation = typeof raw.expectedObservation === 'string' && raw.expectedObservation.trim()
      ? raw.expectedObservation.trim()
      : `Observe output from ${toolName}`;

    return {
      type,
      toolName,
      toolArgs,
      rationale,
      expectedObservation,
      fallbackStrategy: raw.fallbackStrategy,
      clarificationQuestion: raw.clarificationQuestion,
      unavailableReason: raw.unavailableReason,
    };
  }

  /**
   * Sanitizes tool arguments to ensure type safety and prevent missing required keys.
   */
  static sanitizeToolArgs(toolName: string, args: Record<string, any>, prompt: string, defaultLocation?: string) {
    if (toolName === 'google_search' || toolName === 'search_businesses' || toolName === 'search_web') {
      args.query = buildWebSearchQuery(
        typeof args.query === 'string' ? args.query : prompt,
        { location: typeof args.location === 'string' ? args.location : defaultLocation }
      );
      if (!args.location && defaultLocation) {
        args.location = defaultLocation;
      }
    } else if (toolName === 'browser_navigate') {
      if (!args.url || typeof args.url !== 'string') {
        const urlMatch = prompt.match(/https?:\/\/[^\s]+|[a-zA-Z0-9-]+\.(?:com|org|net|io|in|co|ai)[^\s]*/i);
        args.url = urlMatch ? urlMatch[0] : 'https://www.google.com';
      }
      if (!args.url.startsWith('http://') && !args.url.startsWith('https://')) {
        args.url = `https://${args.url}`;
      }
    } else if (toolName === 'search_businesses') {
      if (!args.query || typeof args.query !== 'string') {
        args.query = prompt.slice(0, 80);
      }
      if (!args.location && defaultLocation) {
        args.location = defaultLocation;
      }
    } else if (toolName === 'analyze_website') {
      if (!args.url || typeof args.url !== 'string') {
        const urlMatch = prompt.match(/https?:\/\/[^\s]+|[a-zA-Z0-9-]+\.(?:com|org|net|io|in|co|ai)[^\s]*/i);
        args.url = urlMatch ? urlMatch[0] : 'https://example.com';
      }
    } else if (toolName === 'get_system_status') {
      if (!args.checkType) args.checkType = 'overview';
    }
  }

  private static createFallbackPlan(
    prompt: string,
    defaultLocation?: string,
    conversationHistory?: Array<{ role: string; content: string }>
  ): BrainTaskPlan {
    const workGoal = parseWorkGoal(prompt, defaultLocation);
    const hasUrl = /https?:\/\/[^\s]+|www\.[^\s]+/i.test(prompt);
    const hasProfile = /instagram|linkedin|twitter|profile|bio|handle/i.test(prompt);
    const lowerP = prompt.toLowerCase();
    const isChat = !workGoal.isWorkTask && !hasUrl && !hasProfile;

    let userIntent: UserIntentType = 'DISCOVERY_AND_EXTRACTION';
    if (isChat) userIntent = 'DIRECT_CHAT';
    else if (hasUrl && !/\b(find|search|discover|list|companies|businesses|startups|saas)\b/i.test(prompt)) {
      userIntent = 'WEBSITE_INSPECTION';
    } else if (hasProfile && !workGoal.isWorkTask) {
      userIntent = 'PROFILE_RESEARCH';
    }

    const quantity = Math.min(Math.max(workGoal.quantity || 1, 1), 50);
    const fallbackFields = new Set<string>(workGoal.requestedFields);
    if (/\b(phone|call|mobile|number|telephone)\b/i.test(lowerP)) fallbackFields.add('phone');
    if (/\b(website|websites|site|url|web)\b/i.test(lowerP)) fallbackFields.add('website');
    if (/\b(email|mail|contact)\b/i.test(lowerP)) fallbackFields.add('email');
    if (/\b(founder|founders|ceo|owner|leadership|team|decision[- ]maker)\b/i.test(lowerP)) fallbackFields.add('founder');
    if (/\b(pricing|price|prices|cost|tier|plans|rate|pricing model)\b/i.test(lowerP)) fallbackFields.add('pricing');
    if (/\b(services|service|offerings|products|features|solutions)\b/i.test(lowerP)) fallbackFields.add('services');
    if (/\b(bio|biography|about|description)\b/i.test(lowerP)) fallbackFields.add('bio');
    if (/\b(followers|following|audience|subscribers)\b/i.test(lowerP)) fallbackFields.add('followers');
    if (/\b(outdated|legacy|modern|responsive|mobile-friendly|website status)\b/i.test(lowerP)) fallbackFields.add('website_status');
    if (/\b(https|ssl|tls|security|certificate)\b/i.test(lowerP)) fallbackFields.add('https');

    let resolvedLocation = workGoal.location || (workGoal.isWorkTask ? extractLocationCandidate(prompt) : '');
    if (!resolvedLocation && conversationHistory) resolvedLocation = extractLocationFromHistory(conversationHistory);
    if (!resolvedLocation && defaultLocation) resolvedLocation = defaultLocation;

    const noWebsiteRequired = workGoal.noWebsiteRequired;
    const emailActionsRequired = workGoal.emailActionsRequired;
    const proposalRequired = workGoal.proposalRequired;
    const requiredActions: string[] = [];
    if (workGoal.isWorkTask || userIntent === 'DISCOVERY_AND_EXTRACTION') requiredActions.push('search_web');
    if (noWebsiteRequired) requiredActions.push('verify_website_absence');
    if (fallbackFields.has('email') || emailActionsRequired) requiredActions.push('inspect_official_page_for_contact');
    requiredActions.push('extract_facts');
    if (proposalRequired) requiredActions.push('generate_proposal');
    if (emailActionsRequired) requiredActions.push('send_email');
    requiredActions.push('record_result');

    let nextAction = this.createFallbackAction(prompt, userIntent, resolvedLocation);
    if (workGoal.isWorkTask && !hasUrl && userIntent !== 'DIRECT_CHAT') {
      const isLocalWithoutLocation =
        /\b(small businesses?|restaurants?|baker(?:y|ies)|dentists?|gyms?|salons?|plumbers?|cafes?|hotels?)\b/i.test(prompt) &&
        !resolvedLocation;
      nextAction = isLocalWithoutLocation
        ? {
            type: 'ask_clarification',
            toolName: '',
            toolArgs: {},
            rationale: 'Location is required for local discovery',
            expectedObservation: 'User specifies target location',
            clarificationQuestion: 'Which location should I target?',
          }
        : {
            type: 'execute_tool',
            toolName: 'search_web',
            toolArgs: {
              query: buildWebSearchQuery(prompt, { location: resolvedLocation, industry: workGoal.industry }),
              location: resolvedLocation,
              limit: Math.min(Math.max(quantity, 10), 30),
              attempt: 0,
            },
            rationale: 'Start deterministic web discovery with a normalized subject query',
            expectedObservation: 'Candidate official homepage URLs; snippets are not facts',
          };
    }

    return {
      goal: prompt,
      originalUserRequest: prompt,
      userIntent,
      entities: workGoal.entities,
      requestedFields: Array.from(fallbackFields),
      quantity,
      location: resolvedLocation,
      constraints: workGoal.constraints,
      sourcePreference: hasUrl ? 'direct_website' : hasProfile ? 'auto' : 'auto',
      discoveryStrategy: isChat ? 'direct_chat' : hasUrl ? 'direct_url' : 'search_first',
      browserRequired: !isChat,
      toolsRequired: isChat
        ? []
        : hasUrl
        ? ['analyze_website']
        : ['search_web', 'analyze_website', ...(proposalRequired ? ['generate_proposal'] : []), ...(emailActionsRequired ? ['send_email'] : [])],
      expectedOutput: 'Grounded response with a Result table, evidence, sources, and limitations',
      completionCriteria: `Verify ${quantity} items (${requiredActions.join(' -> ')}) with full source evidence.`,
      requiredActions,
      externalActionsRequired: emailActionsRequired,
      emailActionsRequired,
      proposalRequired,
      noWebsiteRequired,
      browserActionsRequired: !isChat,
      nextAction,
      confidence: 0.8,
    };
  }

  private static createFallbackAction(prompt: string, intent?: UserIntentType, defaultLocation?: string): BrainActionDecision {
    if (intent === 'DIRECT_CHAT') {
      return {
        type: 'complete',
        toolName: '',
        toolArgs: {},
        rationale: 'Direct conversational response',
        expectedObservation: 'User dialogue',
      };
    }

    const lowerPrompt = prompt.toLowerCase();
    const isExplicitLocalService = /\b(small business|small businesses|dentist|dentists|gym|gyms|salon|salons|plumber|plumbers|restaurant|restaurants|cafe|cafes|bakery|bakeries)\b/i.test(lowerPrompt);
    const isProposalOutreach = /\b(leads|send proposal|personalized proposal|proposals|cold outreach)\b/i.test(lowerPrompt);
    const isGeneralWebOrPlatform = /\b(google|instagram|linkedin|twitter|x\.com|http|www\.|\.com|\.io|\.org|\.ai|companies|startups)\b/i.test(lowerPrompt);

    const isLocalDiscovery =
      (isExplicitLocalService || isProposalOutreach) &&
      !isGeneralWebOrPlatform;

    if (isLocalDiscovery && !defaultLocation) {
      return {
        type: 'ask_clarification',
        toolName: '',
        toolArgs: {},
        rationale: 'Location is required for local business discovery and proposal generation',
        expectedObservation: 'User specifies target location',
        clarificationQuestion: 'Which location should I target?',
      };
    }

    if (isLocalDiscovery && defaultLocation) {
      const q = prompt.toLowerCase().includes('business') || prompt.toLowerCase().includes('proposal')
        ? 'small businesses'
        : prompt.slice(0, 80);
      return {
        type: 'execute_tool',
        toolName: 'search_web',
        toolArgs: { query: q, location: defaultLocation },
        rationale: `Search local businesses in ${defaultLocation}`,
        expectedObservation: `List of verified businesses in ${defaultLocation}`,
      };
    }

    const urlMatch = prompt.match(/https?:\/\/[^\s]+|[a-zA-Z0-9-]+\.(?:com|org|net|io|in|co|ai)[^\s]*/i);
    if (urlMatch) {
      let url = urlMatch[0];
      if (!url.startsWith('http://') && !url.startsWith('https://')) url = `https://${url}`;
      return {
        type: 'execute_tool',
        toolName: 'browser_navigate',
        toolArgs: { url },
        rationale: `Direct navigation to inspect requested URL: ${url}`,
        expectedObservation: 'Inspect webpage headings, text, pricing, and contacts',
      };
    }

    if (/\b(saas|software|crm|startup|startups)\b/i.test(prompt)) {
      const loc = defaultLocation ? ` in ${defaultLocation}` : '';
      return {
        type: 'execute_tool',
        toolName: 'search_web',
        toolArgs: {
          query: `${prompt.slice(0, 80)} official website`.trim(),
          location: defaultLocation,
        },
        rationale: `Search official SaaS/software company websites${loc}`,
        expectedObservation: 'Official company websites to inspect',
      };
    }

    return {
      type: 'execute_tool',
      toolName: 'search_web',
      toolArgs: { query: buildWebSearchQuery(prompt, { location: defaultLocation }) },
      rationale: 'Search web for candidate entities and live sources',
      expectedObservation: 'List of relevant candidate websites to inspect',
    };
  }
}
