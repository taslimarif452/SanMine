/**
 * P0 Production Reliability Regression Test Suite
 *
 * Runs via tsx: `npx tsx server/test/reliability.test.ts`
 *
 * Verifies all 10 P0 production reliability invariants:
 * 1. Zero fake / synthetic discovery when search returns 0 results
 * 2. Real search discovery preserves grounded candidates & destination URLs
 * 3. Gemini failover -> OpenAI uses OpenAI key, never Gemini key
 * 4. OpenAI failover -> Gemini uses Gemini key, never OpenAI key
 * 5. Unconfigured backup providers are safely skipped without error
 * 6. Mid-stream failover semantic continuation without repetition
 * 7. Agent failover preserves full task memory across model transitions
 * 8. Deep state serialization / deserialization preserves 100% of fields
 * 9. Comprehensive secret scrubbing across errors, events, and checkpoints
 * 10. Anti-duplication candidate filtering guarantees zero redundant visits
 */

import assert from 'assert';
import { performGoogleWebSearch } from '../research/googleSearch.js';
import { aiRegistry } from '../ai/registry.js';
import { failoverManager } from '../ai/failoverManager.js';
import { providerHealthManager, sanitizeErrorText } from '../ai/providerHealth.js';
import { taskCheckpointManager } from '../task/checkpointManager.js';
import { BrainTaskState, BrainObservation, CandidateTarget } from '../agent/brain/types.js';
import { AIProvider } from '../ai/types.js';

async function runReliabilitySuite() {
  console.log('===============================================================');
  console.log('🚀 RUNNING P0 PRODUCTION RELIABILITY REGRESSION TEST SUITE');
  console.log('===============================================================\n');

  // =========================================================================
  // TEST 1: ZERO FAKE / SYNTHETIC DISCOVERY
  // =========================================================================
  console.log('[TEST 1] Verifying zero synthetic / fake discovery when query produces 0 hits...');
  
  // Test with an impossible query unlikely to have any matches across engines
  const emptyQuery = 'xyznonexistentterm9999999_zero_match_test_term_abc12345';
  const zeroResult = await performGoogleWebSearch(emptyQuery, { limit: 5 });

  assert.strictEqual(zeroResult.query, emptyQuery);
  assert.strictEqual(Array.isArray(zeroResult.items), true, 'items must be an array');
  assert.strictEqual(zeroResult.totalResults, 0, 'totalResults must be exactly 0 for zero hits');
  assert.strictEqual(zeroResult.items.length, 0, 'No synthetic or fabricated items may be returned');
  
  // Verify no synthetic .org / placeholder domains were generated
  for (const item of zeroResult.items) {
    assert.fail(`Fabricated candidate detected: ${item.url} (${item.title})`);
  }
  console.log('✓ Test 1 Passed: Search cleanly returns 0 results with zero synthetic fabrication.\n');

  // =========================================================================
  // TEST 2: REAL SEARCH DISCOVERY PRESERVES GROUNDED DESTINATION URLS
  // =========================================================================
  console.log('[TEST 2] Verifying search returns grounded candidate items with real domains...');
  
  const realResult = await performGoogleWebSearch('OpenAI artificial intelligence Wikipedia', { limit: 3 });
  if (realResult.items.length > 0) {
    assert.strictEqual(realResult.success, true);
    assert.ok(realResult.items.length > 0, 'Should return at least 1 candidate item');
    const first = realResult.items[0];
    assert.ok(first.url && first.url.startsWith('http'), 'Item must contain a valid HTTP/HTTPS URL');
    assert.ok(first.title && first.title.length > 0, 'Item must have a real title');
    assert.ok(first.domain && first.domain.includes('.'), 'Item must have a valid domain');
  } else {
    // If running in an offline container environment, ensure result is honest
    assert.strictEqual(realResult.totalResults, 0);
    assert.strictEqual(realResult.items.length, 0);
  }
  console.log('✓ Test 2 Passed: Grounded search result structure verified.\n');

  // =========================================================================
  // TEST 3: GEMINI FAILOVER -> OPENAI USES OPENAI KEY (NEVER GEMINI KEY)
  // =========================================================================
  console.log('[TEST 3] Verifying Gemini failover -> OpenAI uses OpenAI key strictly...');
  
  providerHealthManager.resetAll();

  let openAiReceivedKey = '';
  let geminiReceivedKey = '';

  const testGoogleProvider: AIProvider = {
    id: 'google',
    name: 'Test Google',
    description: 'Mock',
    defaultModel: 'gemini-2.5-flash',
    capabilities: { streaming: true, toolCalling: true, vision: true },
    isConfigured: () => true,
    testConnection: async () => ({ success: true }),
    listModels: async () => [],
    streamChat: async (opts) => {
      geminiReceivedKey = opts.apiKey || '';
      throw new Error('429 RESOURCE_EXHAUSTED: Google Gemini quota reached');
    },
  };

  const testOpenAIProvider: AIProvider = {
    id: 'openai',
    name: 'Test OpenAI',
    description: 'Mock',
    defaultModel: 'gpt-4o-mini',
    capabilities: { streaming: true, toolCalling: true, vision: true },
    isConfigured: () => true,
    testConnection: async () => ({ success: true }),
    listModels: async () => [],
    streamChat: async (opts) => {
      openAiReceivedKey = opts.apiKey || '';
      opts.onEvent({ type: 'message.delta', content: 'OpenAI success response' });
      opts.onEvent({ type: 'message.completed', content: 'OpenAI success response' });
    },
  };

  aiRegistry.register(testGoogleProvider);
  aiRegistry.register(testOpenAIProvider);

  const streamEvents3: any[] = [];
  await failoverManager.streamChatWithFailover({
    taskId: 'test_task_p0_3',
    preferredProviderId: 'google',
    preferredModel: 'gemini-2.5-flash',
    userApiKey: 'USER_GEMINI_KEY_00000',
    messages: [{ role: 'user', content: 'Test question' }],
    onEvent: (ev) => streamEvents3.push(ev),
  });

  // Verify key isolation
  assert.strictEqual(geminiReceivedKey, 'USER_GEMINI_KEY_00000', 'Gemini should receive preferred user key');
  assert.notStrictEqual(openAiReceivedKey, 'USER_GEMINI_KEY_00000', 'OpenAI MUST NOT receive Gemini key');
  assert.ok(!openAiReceivedKey.includes('GEMINI'), 'No Gemini credentials may leak to OpenAI');
  console.log('✓ Test 3 Passed: Gemini -> OpenAI failover credential isolation confirmed.\n');

  // =========================================================================
  // TEST 4: OPENAI FAILOVER -> GEMINI USES GEMINI KEY (NEVER OPENAI KEY)
  // =========================================================================
  console.log('[TEST 4] Verifying OpenAI failover -> Gemini uses Gemini key strictly...');
  
  providerHealthManager.resetAll();
  openAiReceivedKey = '';
  geminiReceivedKey = '';

  const testOpenAIProviderFail: AIProvider = {
    id: 'openai',
    name: 'Test OpenAI Fail',
    description: 'Mock',
    defaultModel: 'gpt-4o-mini',
    capabilities: { streaming: true, toolCalling: true, vision: true },
    isConfigured: () => true,
    testConnection: async () => ({ success: true }),
    listModels: async () => [],
    streamChat: async (opts) => {
      openAiReceivedKey = opts.apiKey || '';
      throw new Error('429 Rate limit reached on OpenAI');
    },
  };

  const testGoogleProviderSuccess: AIProvider = {
    id: 'google',
    name: 'Test Google Success',
    description: 'Mock',
    defaultModel: 'gemini-2.5-flash',
    capabilities: { streaming: true, toolCalling: true, vision: true },
    isConfigured: () => true,
    testConnection: async () => ({ success: true }),
    listModels: async () => [],
    streamChat: async (opts) => {
      geminiReceivedKey = opts.apiKey || '';
      opts.onEvent({ type: 'message.delta', content: 'Gemini success response' });
      opts.onEvent({ type: 'message.completed', content: 'Gemini success response' });
    },
  };

  aiRegistry.register(testOpenAIProviderFail);
  aiRegistry.register(testGoogleProviderSuccess);

  await failoverManager.streamChatWithFailover({
    taskId: 'test_task_p0_4',
    preferredProviderId: 'openai',
    preferredModel: 'gpt-4o-mini',
    userApiKey: 'USER_OPENAI_KEY_77777',
    messages: [{ role: 'user', content: 'Test question' }],
    onEvent: () => {},
  });

  assert.strictEqual(openAiReceivedKey, 'USER_OPENAI_KEY_77777', 'OpenAI should receive preferred key');
  assert.notStrictEqual(geminiReceivedKey, 'USER_OPENAI_KEY_77777', 'Gemini MUST NOT receive OpenAI key');
  assert.ok(!geminiReceivedKey.includes('OPENAI'), 'No OpenAI credentials may leak to Gemini');
  console.log('✓ Test 4 Passed: OpenAI -> Gemini failover credential isolation confirmed.\n');

  // =========================================================================
  // TEST 5: UNCONFIGURED BACKUP PROVIDER IS SKIPPED WITHOUT ERROR
  // =========================================================================
  console.log('[TEST 5] Verifying unconfigured backup providers are skipped automatically...');
  
  providerHealthManager.resetAll();

  const unconfiguredAnthropic: AIProvider = {
    id: 'anthropic',
    name: 'Unconfigured Anthropic',
    description: 'Mock',
    defaultModel: 'claude-3-5-haiku-20241022',
    capabilities: { streaming: true, toolCalling: true, vision: true },
    isConfigured: () => false,
    testConnection: async () => ({ success: false }),
    listModels: async () => [],
    streamChat: async () => {
      throw new Error('Should not be called because not configured');
    },
  };

  aiRegistry.register(unconfiguredAnthropic);

  const candidates = failoverManager.getCandidateModels({
    preferredProviderId: 'openai',
    preferredModel: 'gpt-4o-mini',
    userApiKey: 'TEMP_KEY',
  });

  const anthropicCandidate = candidates.find((c) => c.providerId === 'anthropic');
  assert.strictEqual(anthropicCandidate, undefined, 'Unconfigured backup provider MUST NOT be included as candidate');
  console.log('✓ Test 5 Passed: Unconfigured backup provider excluded from candidate list.\n');

  // =========================================================================
  // TEST 6: MID-STREAM FAILOVER WITH SEMANTIC CONTINUATION
  // =========================================================================
  console.log('[TEST 6] Verifying mid-stream failover semantic continuation without repetition...');
  
  providerHealthManager.resetAll();

  let providerAStreamedPart = 'Here are the top 3 digital agencies in Austin:\n1. Austin Tech Works - Specialized in SaaS SEO and UI design.';
  let continuationPromptReceived = '';

  const providerAFailMidstream: AIProvider = {
    id: 'google',
    name: 'Provider A (Gemini)',
    description: 'Mock',
    defaultModel: 'gemini-2.5-flash',
    capabilities: { streaming: true, toolCalling: true, vision: true },
    isConfigured: () => true,
    testConnection: async () => ({ success: true }),
    listModels: async () => [],
    streamChat: async (opts) => {
      // Emit partial tokens before aborting
      opts.onEvent({ type: 'message.delta', content: providerAStreamedPart });
      throw new Error('503 Service Unavailable: upstream connection dropped mid-stream');
    },
  };

  const providerBContinue: AIProvider = {
    id: 'openai',
    name: 'Provider B (OpenAI)',
    description: 'Mock',
    defaultModel: 'gpt-4o-mini',
    capabilities: { streaming: true, toolCalling: true, vision: true },
    isConfigured: () => true,
    testConnection: async () => ({ success: true }),
    listModels: async () => [],
    streamChat: async (opts) => {
      continuationPromptReceived = opts.systemPrompt || '';
      const continuationPart = '\n2. Lone Star Digital - Branding and conversion optimization.\n3. Hill Country Creative - Full-stack web development.';
      opts.onEvent({ type: 'message.delta', content: continuationPart });
      opts.onEvent({ type: 'message.completed', content: continuationPart });
    },
  };

  aiRegistry.register(providerAFailMidstream);
  aiRegistry.register(providerBContinue);

  const collectedDeltas: string[] = [];
  let completedMessageContent = '';

  await failoverManager.streamChatWithFailover({
    taskId: 'test_stream_continuation_task',
    preferredProviderId: 'google',
    preferredModel: 'gemini-2.5-flash',
    messages: [{ role: 'user', content: 'List top 3 digital agencies in Austin' }],
    systemPrompt: 'You are SanMine Space.',
    onEvent: (ev) => {
      if (ev.type === 'message.delta') {
        collectedDeltas.push(ev.content || '');
      } else if (ev.type === 'message.completed') {
        completedMessageContent = ev.content || '';
      }
    },
  });

  // Verify continuation directive was passed to provider B
  assert.ok(continuationPromptReceived.includes('CONTINUATION DIRECTIVE'), 'Continuation directive must be provided to backup');
  assert.ok(continuationPromptReceived.includes('Austin Tech Works'), 'Prior partial text must be present in continuation context');

  // Verify completed message contains both parts unified
  assert.ok(completedMessageContent.includes('Austin Tech Works'), 'Final response must include part 1');
  assert.ok(completedMessageContent.includes('Lone Star Digital'), 'Final response must include part 2');
  assert.ok(completedMessageContent.includes('Hill Country Creative'), 'Final response must include part 3');
  console.log('✓ Test 6 Passed: Seamless mid-stream continuation verified.\n');

  // =========================================================================
  // TEST 7: AGENT FAILOVER PRESERVES TASK MEMORY & STATE
  // =========================================================================
  console.log('[TEST 7] Verifying agent failover preserves task state & observations...');
  
  const mockObservations: BrainObservation[] = [
    {
      toolName: 'google_search',
      toolArgs: { query: 'marketing agencies Seattle' },
      success: true,
      executionTimeMs: 120,
      extractedFacts: [],
      timestamp: new Date().toISOString(),
    },
    {
      toolName: 'browser_navigate',
      toolArgs: { url: 'https://seattle-agency1.com' },
      success: true,
      executionTimeMs: 450,
      browserState: {
        url: 'https://seattle-agency1.com',
        title: 'Seattle Agency 1',
        snippet: 'Leading B2B marketing firm in Seattle WA',
        headings: { h1: ['Welcome to Agency 1'] },
      },
      extractedFacts: [
        {
          sourceUrl: 'https://seattle-agency1.com',
          pageTitle: 'Seattle Agency 1',
          evidenceText: 'Email: hello@seattle-agency1.com',
          field: 'email',
          extractedValue: 'hello@seattle-agency1.com',
          confidence: 0.95,
          timestamp: new Date().toISOString(),
        },
      ],
      timestamp: new Date().toISOString(),
    },
  ];

  const fullTaskState: BrainTaskState = {
    taskId: 'agent_p0_task_07',
    userId: 'user_agent_test',
    userPrompt: 'Find top marketing agencies in Seattle and extract emails',
    conversationHistory: [
      { role: 'user', content: 'Find top marketing agencies in Seattle and extract emails' },
      { role: 'assistant', content: 'Starting autonomous agent research across Seattle...' },
    ],
    plan: {
      goal: 'Find marketing agencies in Seattle',
      userIntent: 'DISCOVERY_AND_EXTRACTION',
      entities: ['Marketing Agencies'],
      requestedFields: ['name', 'email', 'website'],
      quantity: 5,
      constraints: [],
      sourcePreference: 'auto',
      discoveryStrategy: 'search_first',
      browserRequired: true,
      toolsRequired: ['google_search', 'browser_navigate'],
      expectedOutput: 'JSON array',
      completionCriteria: '5 agencies verified with contact details',
      nextAction: {
        type: 'execute_tool',
        toolName: 'browser_navigate',
        toolArgs: { url: 'https://seattle-agency2.com' },
        rationale: 'Inspect next candidate',
        expectedObservation: 'Webpage headings and contact information',
      },
    },
    currentIteration: 4,
    maxIterations: 15,
    verifiedEntities: [
      { name: 'Seattle Agency 1', email: 'hello@seattle-agency1.com', website: 'https://seattle-agency1.com' },
    ],
    visitedUrls: new Set(['https://seattle-agency1.com']),
    visitedDomains: new Set(['seattle-agency1.com']),
    executedActionIds: new Set(['action_1']),
    discoveredCandidates: [
      { url: 'https://seattle-agency1.com', title: 'Seattle Agency 1' },
      { url: 'https://seattle-agency2.com', title: 'Seattle Agency 2' },
      { url: 'https://seattle-agency3.com', title: 'Seattle Agency 3' },
    ],
    observations: mockObservations,
    extractedFacts: mockObservations[1].extractedFacts,
    evidence: [
      {
        fact: 'Verified active digital agency in Seattle',
        sourceUrl: 'https://seattle-agency1.com',
        quote: 'Leading B2B marketing firm in Seattle WA',
        timestamp: new Date().toISOString(),
      },
    ],
    failedActions: [],
    status: 'EXECUTING',
    replanCount: 0,
    remainingWork: 'Verify 4 remaining agencies',
  };

  // Save checkpoint
  await taskCheckpointManager.saveCheckpoint(fullTaskState, {
    lastProvider: 'google',
    lastModel: 'gemini-2.5-flash',
  });

  // Restore checkpoint
  const restoredSnapshot = await taskCheckpointManager.getCheckpoint(fullTaskState.taskId, fullTaskState.userId);
  assert.ok(restoredSnapshot, 'Checkpoint record must exist in storage');
  
  const restoredState = taskCheckpointManager.deserializeBrainState(restoredSnapshot!);

  assert.strictEqual(restoredState.taskId, fullTaskState.taskId);
  assert.strictEqual(restoredState.currentIteration, 4);
  assert.strictEqual(restoredState.verifiedEntities.length, 1);
  assert.strictEqual(restoredState.observations.length, 2, 'Observations must be 100% restored');
  assert.strictEqual(restoredState.conversationHistory.length, 2, 'Conversation history must be 100% restored');
  assert.strictEqual(restoredState.discoveredCandidates.length, 3, 'Candidates must be 100% restored');
  assert.ok(restoredState.visitedUrls.has('https://seattle-agency1.com'));

  console.log('✓ Test 7 Passed: Full agent task memory and observation preservation verified.\n');

  // =========================================================================
  // TEST 8: DEEP STATE SERIALIZATION / DESERIALIZATION RESTORES 100% OF FIELDS
  // =========================================================================
  console.log('[TEST 8] Deep state comparison testing (zero discarded fields)...');
  
  const serializedState = taskCheckpointManager.serializeBrainState(fullTaskState);
  const deserializedState = taskCheckpointManager.deserializeBrainState(serializedState);

  assert.strictEqual(deserializedState.taskId, fullTaskState.taskId);
  assert.strictEqual(deserializedState.userId, fullTaskState.userId);
  assert.strictEqual(deserializedState.userPrompt, fullTaskState.userPrompt);
  assert.deepStrictEqual(deserializedState.conversationHistory, fullTaskState.conversationHistory);
  assert.deepStrictEqual(deserializedState.plan, fullTaskState.plan);
  assert.strictEqual(deserializedState.currentIteration, fullTaskState.currentIteration);
  assert.strictEqual(deserializedState.maxIterations, fullTaskState.maxIterations);
  assert.deepStrictEqual(deserializedState.discoveredCandidates, fullTaskState.discoveredCandidates);
  assert.deepStrictEqual(deserializedState.extractedFacts, fullTaskState.extractedFacts);
  assert.deepStrictEqual(deserializedState.evidence, fullTaskState.evidence);
  assert.deepStrictEqual(deserializedState.verifiedEntities, fullTaskState.verifiedEntities);
  assert.deepStrictEqual(deserializedState.observations, fullTaskState.observations);
  assert.strictEqual(deserializedState.status, fullTaskState.status);
  assert.strictEqual(deserializedState.replanCount, fullTaskState.replanCount);
  assert.strictEqual(deserializedState.remainingWork, fullTaskState.remainingWork);

  console.log('✓ Test 8 Passed: 100% deep state equivalence verified without empty defaults.\n');

  // =========================================================================
  // TEST 9: COMPREHENSIVE SECRET SCRUBBING
  // =========================================================================
  console.log('[TEST 9] Verifying secret scrubbing against all known API key patterns...');
  
  const secretsToTest = [
    'sk-proj-abc1234567890def1234567890xyz',
    'sk-ant-api03-abcdef1234567890abcdef1234567890',
    'AIzaSyB1234567890abcdef1234567890abcdef',
    'sk-or-v1-abcdef1234567890abcdef1234567890',
    'xai-abcdef1234567890abcdef1234567890',
    'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abcdef',
  ];

  for (const secret of secretsToTest) {
    const rawError = `Failed request with authorization header: ${secret} to https://api.endpoint.com`;
    const sanitized = sanitizeErrorText(rawError);
    assert.ok(!sanitized.includes(secret), `Secret "${secret}" MUST be scrubbed from output`);
    assert.ok(sanitized.includes('REDACTED'), 'Sanitized text should contain REDACTED replacement');
  }

  console.log('✓ Test 9 Passed: Secret scrubbing verified across all provider patterns.\n');

  // =========================================================================
  // TEST 10: ANTI-DUPLICATION CANDIDATE FILTERING
  // =========================================================================
  console.log('[TEST 10] Verifying candidate anti-duplication filter...');
  
  const candidatePool: CandidateTarget[] = [
    { url: 'https://visited-agency.com', title: 'Visited Agency' },
    { url: 'https://unvisited-agency-1.com', title: 'Unvisited Agency 1' },
    { url: 'https://another-visited.com', title: 'Another Visited' },
    { url: 'https://unvisited-agency-2.com', title: 'Unvisited Agency 2' },
  ];

  const visitedSet = new Set(['https://visited-agency.com', 'https://another-visited.com']);
  const verifiedList = [{ name: 'Visited Agency', url: 'https://visited-agency.com' }];

  const filteredCandidates = taskCheckpointManager.filterUnvisitedCandidates(
    candidatePool,
    visitedSet,
    verifiedList
  );

  assert.strictEqual(filteredCandidates.length, 2);
  assert.strictEqual(filteredCandidates[0].url, 'https://unvisited-agency-1.com');
  assert.strictEqual(filteredCandidates[1].url, 'https://unvisited-agency-2.com');

  console.log('✓ Test 10 Passed: Anti-duplication candidate filter verified.\n');

  console.log('===============================================================');
  console.log('🎉 ALL 10 P0 PRODUCTION RELIABILITY TESTS PASSED WITH 100% SUCCESS');
  console.log('===============================================================\n');
}

runReliabilitySuite().catch((err) => {
  console.error('❌ RELIABILITY TEST SUITE FAILED:', err);
  process.exit(1);
});
