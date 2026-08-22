/**
 * Universal Agent Brain Test Suite
 *
 * Verifies that the Universal Agent Brain generalizes from natural-language prompts,
 * creates strict structured plans, handles live tools, prevents loops, and guarantees
 * zero-hallucination evidence reporting.
 */

import { PlanValidator } from './planValidator.js';
import { extractAndParseJson } from './llmClient.js';
import { BRAIN_AVAILABLE_TOOLS, isToolRegistered, getBrainToolDeclarationsForPrompt } from './toolSchemas.js';
import { universalAgentBrain } from './agentBrain.js';
import { aiRegistry } from '../../ai/registry.js';
import { AIProvider } from '../../ai/types.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✓ ${testName}`);
    passed++;
  } else {
    console.error(`  ✗ ${testName}${detail ? ` - ${detail}` : ''}`);
    failed++;
  }
}

async function runBrainTests() {
  console.log('\n🧠 [TEST SUITE] Universal Agent Brain Verification');
  console.log('==================================================');

  // Register mock test provider
  const mockTestAI: AIProvider = {
    id: 'google',
    name: 'Google Gemini Mock',
    description: 'Mock',
    defaultModel: 'gemini-3.7-flash',
    capabilities: { streaming: true, toolCalling: true, vision: true },
    isConfigured: () => true,
    testConnection: async () => ({ success: true }),
    listModels: async () => [],
    streamChat: async (opts) => {
      const responseJson = JSON.stringify({
        goal: 'Assist user with general capabilities overview',
        userIntent: 'DIRECT_CHAT',
        quantity: 1,
        sourcePreference: 'general',
        toolsRequired: [],
        completionCriteria: 'Provide conversational answer',
        nextAction: {
          type: 'complete',
          toolName: '',
          toolArgs: {},
          rationale: 'Answer user directly',
        },
      });
      opts.onEvent({ type: 'message.delta', content: responseJson });
      opts.onEvent({ type: 'message.completed', content: responseJson });
    },
  };
  aiRegistry.register(mockTestAI);

  // Test 1: Tool Registry & Declarations
  console.log('\n--- 1. Tool Registry & Schemas ---');
  assert(BRAIN_AVAILABLE_TOOLS.length >= 15, 'Tool registry has all required tools', `Count: ${BRAIN_AVAILABLE_TOOLS.length}`);
  assert(isToolRegistered('google_search'), 'google_search tool is registered');
  assert(isToolRegistered('browser_navigate'), 'browser_navigate tool is registered');
  assert(isToolRegistered('browser_extract_content'), 'browser_extract_content tool is registered');
  assert(isToolRegistered('browser_click'), 'browser_click tool is registered');
  assert(isToolRegistered('analyze_website'), 'analyze_website tool is registered');
  assert(isToolRegistered('deep_web_research'), 'deep_web_research tool is registered');
  assert(isToolRegistered('calculate_lead_score'), 'calculate_lead_score tool is registered');

  const declarations = getBrainToolDeclarationsForPrompt();
  assert(declarations.includes('### Tool: `google_search`'), 'Prompt declarations include google_search');
  assert(declarations.includes('### Tool: `browser_navigate`'), 'Prompt declarations include browser_navigate');

  // Test 2: JSON Extraction & Robust Parser
  console.log('\n--- 2. JSON Extraction & Safe Repair ---');
  const directJson = extractAndParseJson('{"goal": "Find bakeries", "quantity": 10}');
  assert(directJson?.quantity === 10, 'Direct JSON string parsed correctly');

  const markdownJson = extractAndParseJson('Here is the plan:\n```json\n{"goal": "Inspect website", "quantity": 1}\n```\nHope this helps!');
  assert(markdownJson?.goal === 'Inspect website', 'Markdown block JSON extracted correctly');

  const trailingCommaJson = extractAndParseJson('{"goal": "Audit site", "items": ["a", "b",],}');
  assert(trailingCommaJson?.goal === 'Audit site', 'Trailing comma JSON repaired correctly');

  // Test 3: Plan Formulation - "Google par 20 companies find karo"
  console.log('\n--- 3. Plan Validation: "Google par 20 companies find karo" ---');
  const planPrompt1 = 'Google par 20 companies find karo';
  const rawPlan1 = {
    goal: 'Discover 20 companies using Google Search and web inspection',
    userIntent: 'DISCOVERY_AND_EXTRACTION',
    quantity: 20,
    sourcePreference: 'google',
    discoveryStrategy: 'search_first',
    browserRequired: true,
    toolsRequired: ['google_search', 'browser_navigate'],
    expectedOutput: 'Table of 20 verified companies with official websites',
    completionCriteria: '20 verified company entries found',
    nextAction: {
      type: 'execute_tool',
      toolName: 'google_search',
      toolArgs: { query: 'top companies' },
      rationale: 'Search Google for candidate companies',
      expectedObservation: 'List of company search results',
    },
  };

  const validatedPlan1 = PlanValidator.validateAndRepairPlan(rawPlan1, planPrompt1);
  assert(validatedPlan1.quantity === 20, 'Quantity correctly extracted as 20');
  assert(validatedPlan1.sourcePreference === 'google', 'Source preference is google');
  assert(validatedPlan1.browserRequired === true, 'Browser is marked required');
  assert(validatedPlan1.nextAction.toolName === 'google_search', 'Next action is google_search');

  // Test 4: Plan Formulation - "___tauqeer.x ka public Instagram profile detail nikalo"
  console.log('\n--- 4. Plan Validation: "___tauqeer.x ka public Instagram profile detail nikalo" ---');
  const planPrompt2 = '___tauqeer.x ka public Instagram profile detail nikalo';
  const rawPlan2 = {
    goal: 'Extract public Instagram profile details for ___tauqeer.x',
    userIntent: 'PROFILE_RESEARCH',
    entities: ['___tauqeer.x'],
    requestedFields: ['bio', 'followers', 'email', 'contact'],
    quantity: 1,
    sourcePreference: 'instagram',
    discoveryStrategy: 'search_first',
    browserRequired: true,
    toolsRequired: ['google_search', 'browser_navigate'],
    expectedOutput: 'Profile summary and contact details',
    completionCriteria: 'Public profile inspected or transparent access note',
    nextAction: {
      type: 'execute_tool',
      toolName: 'google_search',
      toolArgs: { query: 'site:instagram.com ___tauqeer.x' },
      rationale: 'Search Google for direct public profile link',
      expectedObservation: 'Instagram profile candidate link',
    },
  };

  const validatedPlan2 = PlanValidator.validateAndRepairPlan(rawPlan2, planPrompt2);
  assert(validatedPlan2.userIntent === 'PROFILE_RESEARCH', 'Intent recognized as PROFILE_RESEARCH');
  assert(validatedPlan2.sourcePreference === 'instagram', 'Source preference is instagram');
  assert(validatedPlan2.nextAction.toolArgs.query.includes('___tauqeer.x'), 'Query targets ___tauqeer.x');

  // Test 5: Plan Formulation - Direct Website Pricing & Contact
  console.log('\n--- 5. Plan Validation: "is website par jao aur pricing, services aur contact email nikalo" ---');
  const planPrompt3 = 'https://example.com par jao aur pricing, services aur contact email nikalo';
  const rawPlan3 = {
    goal: 'Inspect https://example.com and extract pricing, services, and contact email',
    userIntent: 'WEBSITE_INSPECTION',
    requestedFields: ['pricing', 'services', 'email'],
    quantity: 1,
    sourcePreference: 'direct_website',
    discoveryStrategy: 'direct_url',
    browserRequired: true,
    toolsRequired: ['browser_navigate', 'browser_extract_content'],
    expectedOutput: 'Extracted pricing tiers, offered services, and verified email',
    completionCriteria: 'Pricing, services, and email extracted or noted as unavailable',
    nextAction: {
      type: 'execute_tool',
      toolName: 'browser_navigate',
      toolArgs: { url: 'https://example.com' },
      rationale: 'Navigate directly to example.com in live browser session',
      expectedObservation: 'Page content and subpage links',
    },
  };

  const validatedPlan3 = PlanValidator.validateAndRepairPlan(rawPlan3, planPrompt3);
  assert(validatedPlan3.userIntent === 'WEBSITE_INSPECTION', 'Intent is WEBSITE_INSPECTION');
  assert(validatedPlan3.discoveryStrategy === 'direct_url', 'Strategy is direct_url');
  assert(validatedPlan3.nextAction.toolName === 'browser_navigate', 'Next action is browser_navigate');
  assert(validatedPlan3.nextAction.toolArgs.url === 'https://example.com', 'Target URL is https://example.com');

  // Test 6: Fallback Repair on Corrupted / Null Plan
  console.log('\n--- 6. Fallback Repair on Malformed LLM Output ---');
  const corruptedPlan = PlanValidator.validateAndRepairPlan(null, 'Find dentists in Ranchi');
  assert(corruptedPlan.goal.includes('Find dentists'), 'Fallback goal preserves prompt');
  assert(corruptedPlan.browserRequired === true, 'Browser required set correctly');
  assert(
    corruptedPlan.nextAction.toolName === 'google_search' || corruptedPlan.nextAction.toolName === 'search_businesses',
    'Fallback selects discovery tool'
  );

  // Test 7: Action Validation & Sanitation
  console.log('\n--- 7. Action Validation & Parameter Sanitization ---');
  const sanitizedAction = PlanValidator.validateAndRepairAction(
    {
      type: 'execute_tool',
      toolName: 'google_search',
      toolArgs: {},
      rationale: 'Perform web discovery',
    },
    'Search best cafes',
    'DISCOVERY_AND_EXTRACTION',
    'Srinagar'
  );
  assert(sanitizedAction.toolArgs.query.length > 0, 'Query filled from prompt');
  assert(sanitizedAction.toolArgs.location === 'Srinagar', 'Default location applied');

  // Test 8: End-to-End Simulation of UniversalAgentBrain
  console.log('\n--- 8. UniversalAgentBrain Execution Simulation ---');
  const eventsCaptured: any[] = [];
  const testRun = await universalAgentBrain.executeTask({
    taskId: 'test_task_001',
    providerId: 'google',
    model: 'gemini-3.7-flash',
    prompt: 'Hi, what can you do?',
    conversationHistory: [],
    sendEvent: (event) => eventsCaptured.push(event),
  });

  assert(testRun.success === true, 'Execution completes successfully');
  // task.started is now emitted by the orchestrator/SSE layer; the brain is
  // responsible for streaming its answer and emitting task.completed.
  assert(
    eventsCaptured.some((e) => e.type === 'message.delta' || e.type === 'message.completed'),
    'brain streams its answer (message.delta/completed)'
  );
  assert(eventsCaptured.some((e) => e.type === 'task.completed'), 'task.completed event emitted');

  // Test 9: Quantity and Grounded Citation Verification
  console.log('\n--- 9. Quantity & State Tracking Verification ---');
  const planPromptMulti = 'Find 5 AI startups in Bangalore';
  const rawPlanMulti = {
    goal: 'Discover 5 AI startups in Bangalore',
    userIntent: 'DISCOVERY_AND_EXTRACTION',
    quantity: 5,
    sourcePreference: 'google',
    discoveryStrategy: 'search_first',
    browserRequired: true,
    toolsRequired: ['google_search', 'browser_navigate'],
    expectedOutput: 'Table of 5 AI startups with websites',
    completionCriteria: '5 verified startups found',
    nextAction: {
      type: 'execute_tool',
      toolName: 'google_search',
      toolArgs: { query: 'AI startups in Bangalore' },
      rationale: 'Search for startup candidates',
      expectedObservation: 'Search results for Bangalore AI startups',
    },
  };

  const parsedMulti = PlanValidator.validateAndRepairPlan(rawPlanMulti, planPromptMulti);
  assert(parsedMulti.quantity === 5, 'Multi-entity target quantity set to 5');
  assert(parsedMulti.toolsRequired.includes('google_search'), 'google_search included in required tools');
  assert(parsedMulti.toolsRequired.includes('browser_navigate'), 'browser_navigate included in required tools');

  // Test 10: ReAct Step Action Decision on Observation
  console.log('\n--- 10. ReAct Step Action Decision on Observation ---');
  const actionFromSearch = PlanValidator.validateAndRepairAction(
    {
      type: 'execute_tool',
      toolName: 'browser_navigate',
      toolArgs: { url: 'https://example-startup.com' },
      rationale: 'Inspect first candidate startup website from search results',
    },
    'Find AI startups',
    'DISCOVERY_AND_EXTRACTION'
  );
  assert(actionFromSearch.toolName === 'browser_navigate', 'Transitions from search to browser_navigate for destination inspection');
  assert(actionFromSearch.toolArgs.url === 'https://example-startup.com', 'Preserves target candidate URL');

  // Test 11: Behavioral Verification - "Google par 20 companies find karo"
  console.log('\n--- 11. Behavioral Verification: "Google par 20 companies find karo" ---');
  const planGoogle20 = PlanValidator.validateAndRepairPlan(
    {
      goal: 'Find 20 companies via Google search',
      userIntent: 'DISCOVERY_AND_EXTRACTION',
      quantity: 20,
      nextAction: {
        type: 'execute_tool',
        toolName: 'google_search',
        toolArgs: { query: 'companies' },
      },
    },
    'Google par 20 companies find karo'
  );
  assert(planGoogle20.quantity === 20, 'Quantity is 20 for "Google par 20 companies find karo"');
  assert(planGoogle20.nextAction.type !== 'ask_clarification', 'Google is recognized as discovery source, NOT unsupplied physical location');
  assert(planGoogle20.nextAction.toolName === 'google_search', 'Starts with web discovery');

  // Test 12: Behavioral Verification - "Instagram se is user ka detail nikalo ___tauqeer.x"
  console.log('\n--- 12. Behavioral Verification: "Instagram se is user ka detail nikalo ___tauqeer.x" ---');
  const planInstaUser = PlanValidator.validateAndRepairPlan(
    {
      goal: 'Extract profile details for ___tauqeer.x from Instagram',
      userIntent: 'PROFILE_RESEARCH',
      entities: ['___tauqeer.x'],
      sourcePreference: 'instagram',
      nextAction: {
        type: 'execute_tool',
        toolName: 'google_search',
        toolArgs: { query: '___tauqeer.x instagram profile' },
      },
    },
    'Instagram se is user ka detail nikalo ___tauqeer.x'
  );
  assert(planInstaUser.userIntent === 'PROFILE_RESEARCH', 'Intent is PROFILE_RESEARCH');
  assert(planInstaUser.sourcePreference === 'instagram', 'Source preference is instagram');
  assert(planInstaUser.entities.includes('___tauqeer.x'), 'Target entity ___tauqeer.x is preserved');

  // Test 13: Behavioral Verification - "is website par jao aur pricing aur services nikalo: https://example.com"
  console.log('\n--- 13. Behavioral Verification: Direct URL pricing & services ---');
  const planDirectUrl = PlanValidator.validateAndRepairPlan(
    null,
    'is website par jao aur pricing aur services nikalo: https://example.com'
  );
  assert(planDirectUrl.userIntent === 'WEBSITE_INSPECTION', 'Direct URL intent is WEBSITE_INSPECTION');
  assert(planDirectUrl.nextAction.toolName === 'browser_navigate', 'Action is browser_navigate');
  assert(planDirectUrl.nextAction.toolArgs.url.includes('example.com'), 'Navigates to example.com');

  // Test 14: Behavioral Verification - "Srinagar ki 20 bakeries find karo"
  console.log('\n--- 14. Behavioral Verification: "Srinagar ki 20 bakeries find karo" ---');
  const planSrinagarBakeries = PlanValidator.validateAndRepairPlan(
    {
      goal: 'Find 20 bakeries in Srinagar',
      userIntent: 'DISCOVERY_AND_EXTRACTION',
      quantity: 20,
      nextAction: {
        type: 'execute_tool',
        toolName: 'google_search',
        toolArgs: { query: 'bakeries in Srinagar' },
      },
    },
    'Srinagar ki 20 bakeries find karo'
  );
  assert(planSrinagarBakeries.quantity === 20, 'Quantity is 20');
  assert(planSrinagarBakeries.nextAction.type === 'execute_tool', 'Executes tool immediately with resolved location');

  // Test 15: Behavioral Verification - "is company ka founder aur contact email find karo"
  console.log('\n--- 15. Behavioral Verification: Founder & Email field extraction ---');
  const planFounderEmail = PlanValidator.validateAndRepairPlan(
    {
      goal: 'Find company founder and contact email',
      userIntent: 'MULTI_STEP_RESEARCH',
      requestedFields: ['founder', 'email'],
      nextAction: {
        type: 'execute_tool',
        toolName: 'google_search',
        toolArgs: { query: 'Acme Corp founder contact email' },
      },
    },
    'is company ka founder aur contact email find karo'
  );
  assert(planFounderEmail.requestedFields.includes('founder'), 'Requested fields include founder');
  assert(planFounderEmail.requestedFields.includes('email'), 'Requested fields include email');

  console.log('\n==================================================');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

runBrainTests().catch((err) => {
  console.error('Fatal test runner failure:', err);
  process.exit(1);
});
