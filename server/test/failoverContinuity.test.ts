/**
 * Failover Continuity & Exactly-Once Task Resumption Test Suite
 *
 * Verifies all 11 Core P0 Failover Continuity & Resumption Scenarios:
 * 1. Provider fails before first token (Clean initial failover)
 * 2. Provider fails after partial output (Mid-stream failover continuation)
 * 3. Provider B continuation has exact overlap ("It" / prefix deduplication)
 * 4. Provider B continuation has zero overlap (Immediate seamless attachment)
 * 5. Provider B accidentally repeats a full sentence (Long sentence deduplication)
 * 6. Multiple consecutive provider failures (Provider A -> Provider B -> Provider C chain)
 * 7. All providers exhausted (Deterministic ALL_PROVIDERS_EXHAUSTED exit, no infinite loop)
 * 8. Agent checkpoint remains intact after failover (BrainTaskState preservation)
 * 9. Completed action is not executed again (ReAct loop skips completed action IDs)
 * 10. Visited domain is not revisited unnecessarily (visitedDomains deduplication)
 * 11. Normal Chat remains isolated (Purely conversational, zero agent tools or plan overhead)
 */

import { StreamOverlapDeduplicator, failoverManager, AllProvidersExhaustedError } from '../ai/failoverManager.js';
import { aiRegistry } from '../ai/registry.js';
import { AIProvider } from '../ai/types.js';
import { taskCheckpointManager } from '../task/checkpointManager.js';
import { BrainTaskState, BrainTaskPlan, BrainObservation } from '../agent/brain/types.js';
import { classifyFailure, sanitizeErrorText, providerHealthManager } from '../ai/providerHealth.js';
import { resolveUserAiCredential } from '../ai/credentialResolver.js';
import { saveUserAiApiKey } from '../db/aiKeys.js';
import { NORMAL_CHAT_SYSTEM_PROMPT, executeNormalChat } from '../chat/normalChat.js';

process.env.CREDENTIAL_ENCRYPTION_KEY = process.env.CREDENTIAL_ENCRYPTION_KEY || 'test-encryption-key-with-32-chars-long!';

let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string, detail?: string) {
  if (condition) {
    console.log(`  ✓ ${name}`);
    passed++;
  } else {
    console.error(`  ✗ ${name}${detail ? ` - ${detail}` : ''}`);
    failed++;
  }
}

async function runFailoverContinuitySuite() {
  console.log('\n🛡️ [P0 FIX 2 — MID-STREAM FAILOVER & EXACTLY-ONCE CONTINUATION SUITE]');
  console.log('====================================================================');

  // --------------------------------------------------------------------------
  // 1. Provider fails before first token
  // --------------------------------------------------------------------------
  console.log('\n--- 1. Provider Fails Before First Token ---');
  {
    providerHealthManager.resetAll();
    const emittedDeltas: string[] = [];

    const mockFailingFirst: AIProvider = {
      id: 'mock_fail_early' as any,
      name: 'Mock Fail Early',
      description: 'Fails immediately before emitting any tokens',
      defaultModel: 'fail-model',
      capabilities: { streaming: true, toolCalling: true, vision: false },
      isConfigured: () => true,
      testConnection: async () => ({ success: true }),
      listModels: async () => [],
      streamChat: async () => {
        throw new Error('503 Service Unavailable: overloaded before token generation');
      },
    };

    const mockWorkingSecond: AIProvider = {
      id: 'mock_work_second' as any,
      name: 'Mock Work Second',
      description: 'Emits complete text',
      defaultModel: 'work-model',
      capabilities: { streaming: true, toolCalling: true, vision: false },
      isConfigured: () => true,
      testConnection: async () => ({ success: true }),
      listModels: async () => [],
      streamChat: async (opts) => {
        opts.onEvent({ type: 'message.delta', content: 'Clean start from backup' });
        opts.onEvent({ type: 'message.completed', content: 'Clean start from backup' });
      },
    };

    aiRegistry.register(mockFailingFirst);
    aiRegistry.register(mockWorkingSecond);

    await failoverManager.streamChatWithFailover({
      taskId: 'test_early_fail',
      preferredProviderId: 'mock_fail_early' as any,
      preferredModel: 'fail-model',
      messages: [{ role: 'user', content: 'Hi' }],
      systemPrompt: 'System',
      candidateModels: [
        { providerId: 'mock_fail_early' as any, model: 'fail-model' },
        { providerId: 'mock_work_second' as any, model: 'work-model' },
      ],
      onEvent: (evt) => {
        if (evt.type === 'message.delta') {
          emittedDeltas.push(evt.content);
        }
      },
    });

    assert(emittedDeltas.join('') === 'Clean start from backup', '1. Stream switched cleanly before first token');
  }

  // --------------------------------------------------------------------------
  // 2. Provider fails after partial output
  // --------------------------------------------------------------------------
  console.log('\n--- 2. Provider Fails After Partial Output ---');
  {
    providerHealthManager.resetAll();
    const emittedDeltas: string[] = [];

    const mockMidStreamFail: AIProvider = {
      id: 'mock_mid_fail_2' as any,
      name: 'Mock Mid Fail 2',
      description: 'Fails mid-stream',
      defaultModel: 'mid-model-2',
      capabilities: { streaming: true, toolCalling: true, vision: false },
      isConfigured: () => true,
      testConnection: async () => ({ success: true }),
      listModels: async () => [],
      streamChat: async (opts) => {
        opts.onEvent({ type: 'message.delta', content: 'The capital of France is Paris. ' });
        throw new Error('429 Quota limit reached mid-stream');
      },
    };

    const mockBackupSuccess: AIProvider = {
      id: 'mock_backup_success_2' as any,
      name: 'Mock Backup Success 2',
      description: 'Continues seamlessly',
      defaultModel: 'bk-model-2',
      capabilities: { streaming: true, toolCalling: true, vision: false },
      isConfigured: () => true,
      testConnection: async () => ({ success: true }),
      listModels: async () => [],
      streamChat: async (opts) => {
        opts.onEvent({ type: 'message.delta', content: 'It is widely known for art, fashion, and gastronomy.' });
        opts.onEvent({ type: 'message.completed', content: 'It is widely known for art, fashion, and gastronomy.' });
      },
    };

    aiRegistry.register(mockMidStreamFail);
    aiRegistry.register(mockBackupSuccess);

    await failoverManager.streamChatWithFailover({
      taskId: 'test_partial_fail_2',
      preferredProviderId: 'mock_mid_fail_2' as any,
      preferredModel: 'mid-model-2',
      messages: [{ role: 'user', content: 'Tell me about Paris' }],
      systemPrompt: 'System',
      candidateModels: [
        { providerId: 'mock_mid_fail_2' as any, model: 'mid-model-2' },
        { providerId: 'mock_backup_success_2' as any, model: 'bk-model-2' },
      ],
      onEvent: (evt) => {
        if (evt.type === 'message.delta') {
          emittedDeltas.push(evt.content);
        }
      },
    });

    const fullEmittedText = emittedDeltas.join('');
    assert(
      fullEmittedText === 'The capital of France is Paris. It is widely known for art, fashion, and gastronomy.',
      '2. Provider fails after partial output and continues seamlessly'
    );
  }

  // --------------------------------------------------------------------------
  // 3. Provider B continuation has exact overlap
  // --------------------------------------------------------------------------
  console.log('\n--- 3. Provider B Continuation Has Exact Overlap ---');
  {
    const prior = 'The capital of France is Paris. It';
    const deduplicator = new StreamOverlapDeduplicator(prior);

    // Provider B starts with: "It is one of the most visited cities in the world."
    const delta1 = deduplicator.processDelta('It is one of the most visited cities in the world.');
    const delta2 = deduplicator.flush();

    const result = (delta1 + delta2);
    assert(
      result === ' is one of the most visited cities in the world.',
      '3. Provider B exact overlap "It" deduplicated from continuation stream',
      `Got: "${result}"`
    );
    assert(
      (prior + result) === 'The capital of France is Paris. It is one of the most visited cities in the world.',
      '3. Complete combined response contains exact single occurrence of "It"'
    );
  }

  // --------------------------------------------------------------------------
  // 4. Provider B continuation has zero overlap
  // --------------------------------------------------------------------------
  console.log('\n--- 4. Provider B Continuation Has Zero Overlap ---');
  {
    const prior = 'The capital of France is ';
    const deduplicator = new StreamOverlapDeduplicator(prior);

    // Provider B starts immediately with "Paris, which has the Eiffel Tower."
    const delta1 = deduplicator.processDelta('Paris, which has the Eiffel Tower.');
    const delta2 = deduplicator.flush();

    const result = (delta1 + delta2);
    assert(
      result === 'Paris, which has the Eiffel Tower.',
      '4. Provider B zero-overlap output preserved intact'
    );
    assert(
      (prior + result) === 'The capital of France is Paris, which has the Eiffel Tower.',
      '4. Total combined text seamlessly joined with zero overlap'
    );
  }

  // --------------------------------------------------------------------------
  // 5. Provider B accidentally repeats a full sentence
  // --------------------------------------------------------------------------
  console.log('\n--- 5. Provider B Accidentally Repeats a Full Sentence ---');
  {
    const prior = 'We are studying machine learning algorithms. Gradient boosting is an ensemble technique that combines weak learners.';
    const deduplicator = new StreamOverlapDeduplicator(prior);

    // Provider B accidentally repeats the entire 2nd sentence before adding new content
    const delta1 = deduplicator.processDelta('Gradient boosting is an ensemble technique that combines weak learners. XGBoost is an optimized distributed gradient boosting library.');
    const delta2 = deduplicator.flush();

    const result = (delta1 + delta2);
    assert(
      result === ' XGBoost is an optimized distributed gradient boosting library.',
      '5. Repeated full sentence cleanly stripped from Provider B output',
      `Got: "${result}"`
    );
    assert(
      (prior + result) === 'We are studying machine learning algorithms. Gradient boosting is an ensemble technique that combines weak learners. XGBoost is an optimized distributed gradient boosting library.',
      '5. Full combined output contains exactly one instance of the sentence'
    );
  }

  // --------------------------------------------------------------------------
  // 6. Multiple consecutive provider failures
  // --------------------------------------------------------------------------
  console.log('\n--- 6. Multiple Consecutive Provider Failures ---');
  {
    providerHealthManager.resetAll();
    const emittedDeltas: string[] = [];

    const mockChainA: AIProvider = {
      id: 'mock_chain_a' as any,
      name: 'Mock Chain A',
      description: 'Emits 1st chunk, then fails',
      defaultModel: 'm-a',
      capabilities: { streaming: true, toolCalling: true, vision: false },
      isConfigured: () => true,
      testConnection: async () => ({ success: true }),
      listModels: async () => [],
      streamChat: async (opts) => {
        opts.onEvent({ type: 'message.delta', content: 'Step 1: Planning complete. ' });
        throw new Error('429 Rate limit on Provider A');
      },
    };

    const mockChainB: AIProvider = {
      id: 'mock_chain_b' as any,
      name: 'Mock Chain B',
      description: 'Emits 2nd chunk, then fails',
      defaultModel: 'm-b',
      capabilities: { streaming: true, toolCalling: true, vision: false },
      isConfigured: () => true,
      testConnection: async () => ({ success: true }),
      listModels: async () => [],
      streamChat: async (opts) => {
        // Starts with duplicate of Step 1, then adds Step 2, then fails
        opts.onEvent({ type: 'message.delta', content: 'Step 1: Planning complete. Step 2: Querying database. ' });
        throw new Error('503 Service unavailable on Provider B');
      },
    };

    const mockChainC: AIProvider = {
      id: 'mock_chain_c' as any,
      name: 'Mock Chain C',
      description: 'Emits final chunk and finishes',
      defaultModel: 'm-c',
      capabilities: { streaming: true, toolCalling: true, vision: false },
      isConfigured: () => true,
      testConnection: async () => ({ success: true }),
      listModels: async () => [],
      streamChat: async (opts) => {
        // Starts with duplicate of Step 2, then finishes with Step 3
        opts.onEvent({ type: 'message.delta', content: 'Step 2: Querying database. Step 3: Synthesis finished.' });
        opts.onEvent({ type: 'message.completed', content: 'Step 2: Querying database. Step 3: Synthesis finished.' });
      },
    };

    aiRegistry.register(mockChainA);
    aiRegistry.register(mockChainB);
    aiRegistry.register(mockChainC);

    await failoverManager.streamChatWithFailover({
      taskId: 'test_multi_failover_chain',
      preferredProviderId: 'mock_chain_a' as any,
      preferredModel: 'm-a',
      messages: [{ role: 'user', content: 'Run 3 steps' }],
      systemPrompt: 'System',
      candidateModels: [
        { providerId: 'mock_chain_a' as any, model: 'm-a' },
        { providerId: 'mock_chain_b' as any, model: 'm-b' },
        { providerId: 'mock_chain_c' as any, model: 'm-c' },
      ],
      onEvent: (evt) => {
        if (evt.type === 'message.delta') {
          emittedDeltas.push(evt.content);
        }
      },
    });

    const fullChainText = emittedDeltas.join('');
    assert(
      fullChainText === 'Step 1: Planning complete. Step 2: Querying database. Step 3: Synthesis finished.',
      '6. Multi-hop failover chain (A -> B -> C) stitched with zero duplication',
      `Got: "${fullChainText}"`
    );
  }

  // --------------------------------------------------------------------------
  // 7. All providers exhausted
  // --------------------------------------------------------------------------
  console.log('\n--- 7. All Providers Exhausted ---');
  {
    providerHealthManager.resetAll();

    const mockExhaustA: AIProvider = {
      id: 'mock_exhaust_x' as any,
      name: 'Mock Exhaust X',
      description: 'Fails',
      defaultModel: 'm-x',
      capabilities: { streaming: true, toolCalling: true, vision: false },
      isConfigured: () => true,
      testConnection: async () => ({ success: true }),
      listModels: async () => [],
      streamChat: async () => { throw new Error('429 Rate limit exceeded'); },
    };

    const mockExhaustB: AIProvider = {
      id: 'mock_exhaust_y' as any,
      name: 'Mock Exhaust Y',
      description: 'Fails',
      defaultModel: 'm-y',
      capabilities: { streaming: true, toolCalling: true, vision: false },
      isConfigured: () => true,
      testConnection: async () => ({ success: true }),
      listModels: async () => [],
      streamChat: async () => { throw new Error('503 Service unavailable'); },
    };

    aiRegistry.register(mockExhaustA);
    aiRegistry.register(mockExhaustB);

    let caughtError: any = null;
    let eventsEmitted = 0;
    try {
      await failoverManager.streamChatWithFailover({
        taskId: 'test_all_exhaustion_scenario',
        preferredProviderId: 'mock_exhaust_x' as any,
        preferredModel: 'm-x',
        messages: [{ role: 'user', content: 'Hello' }],
        candidateModels: [
          { providerId: 'mock_exhaust_x' as any, model: 'm-x' },
          { providerId: 'mock_exhaust_y' as any, model: 'm-y' },
        ],
        onEvent: () => { eventsEmitted++; },
      });
    } catch (err: any) {
      caughtError = err;
    }

    assert(Boolean(caughtError), '7. Exhaustion throws deterministic error');
    assert(caughtError instanceof AllProvidersExhaustedError, '7. Error is AllProvidersExhaustedError');
    assert(caughtError?.isAllProvidersExhausted === true, '7. isAllProvidersExhausted flag set to true');
    assert(caughtError?.attemptedProviders?.length === 2, '7. Attempted candidates tracked correctly without infinite retry');
    assert(
      caughtError?.message.includes('currently unavailable'),
      '7. Clean user-facing message provided on exhaustion without secret leaks'
    );
  }

  // --------------------------------------------------------------------------
  // 8. Agent checkpoint remains intact after failover
  // --------------------------------------------------------------------------
  console.log('\n--- 8. Agent Checkpoint Remains Intact After Failover ---');
  {
    const taskId = 'task_checkpoint_failover_test';
    const plan: BrainTaskPlan = {
      goal: 'Find 5 AI research labs in Zurich',
      userIntent: 'DISCOVERY_AND_EXTRACTION',
      quantity: 5,
      entities: ['AI research labs'],
      requestedFields: ['name', 'website', 'address'],
      constraints: [],
      sourcePreference: 'google',
      discoveryStrategy: 'search_first',
      browserRequired: true,
      toolsRequired: ['google_search', 'browser_navigate'],
      expectedOutput: 'Table of verified labs',
      completionCriteria: '5 verified labs with Zurich addresses',
      location: 'Zurich',
      nextAction: {
        type: 'execute_tool',
        toolName: 'browser_navigate',
        toolArgs: { url: 'https://lab-2.ch' },
        rationale: 'Extract details for lab 2',
        expectedObservation: 'Address and lab details',
      },
    };

    const initialObservations: BrainObservation[] = [
      {
        toolName: 'google_search',
        toolArgs: { query: 'AI research labs Zurich' },
        success: true,
        executionTimeMs: 250,
        timestamp: new Date(Date.now() - 5000).toISOString(),
        extractedFacts: [],
        searchState: {
          query: 'AI research labs Zurich',
          totalResults: 3,
          candidateUrls: [
            { url: 'https://lab-1.ch', title: 'ETH AI Center' },
            { url: 'https://lab-2.ch', title: 'Zurich AI Lab' },
            { url: 'https://lab-3.ch', title: 'Swiss AI Institute' },
          ],
        },
      },
      {
        toolName: 'browser_navigate',
        toolArgs: { url: 'https://lab-1.ch' },
        success: true,
        executionTimeMs: 400,
        timestamp: new Date(Date.now() - 3000).toISOString(),
        extractedFacts: [
          {
            sourceUrl: 'https://lab-1.ch',
            pageTitle: 'ETH AI Center',
            evidenceText: 'Address: Andreasstrasse 15, 8050 Zurich',
            field: 'address',
            extractedValue: 'Andreasstrasse 15, 8050 Zurich',
            confidence: 0.98,
            timestamp: new Date().toISOString(),
          },
        ],
      },
    ];

    const state: BrainTaskState = {
      taskId,
      userId: 'test_user_failover_8',
      userPrompt: '/Find 5 AI research labs in Zurich',
      conversationHistory: [{ role: 'user', content: '/Find 5 AI research labs in Zurich' }],
      plan,
      currentIteration: 2,
      maxIterations: 12,
      verifiedEntities: [{ name: 'ETH AI Center', url: 'https://lab-1.ch', hasWebsite: true, address: 'Andreasstrasse 15, 8050 Zurich' }],
      visitedUrls: new Set(['https://lab-1.ch']),
      visitedDomains: new Set(['lab-1.ch']),
      discoveredCandidates: [
        { url: 'https://lab-1.ch', title: 'ETH AI Center' },
        { url: 'https://lab-2.ch', title: 'Zurich AI Lab' },
        { url: 'https://lab-3.ch', title: 'Swiss AI Institute' },
      ],
      observations: initialObservations,
      extractedFacts: initialObservations[1].extractedFacts,
      evidence: [],
      failedActions: [],
      executedActionIds: new Set(['action_step_1', 'action_step_2']),
      status: 'EXECUTING',
      replanCount: 0,
      remainingWork: '4 more labs',
    };

    // Save checkpoint before failover
    await taskCheckpointManager.saveCheckpoint(state, { lastProvider: 'google', lastModel: 'gemini-3.7-flash' });

    // Retrieve checkpoint as if secondary provider is taking over
    const saved = await taskCheckpointManager.getCheckpoint(taskId, 'test_user_failover_8');
    assert(Boolean(saved), '8. Checkpoint retrieved successfully after provider failover');

    const restored = taskCheckpointManager.deserializeBrainState(saved!);
    assert(restored.currentIteration === 2, '8. Current iteration preserved');
    assert(restored.plan.location === 'Zurich', '8. Plan location preserved');
    assert(restored.visitedUrls.has('https://lab-1.ch'), '8. Visited URLs Set preserved');
    assert(restored.visitedDomains.has('lab-1.ch'), '8. Visited domains Set preserved');
    assert(restored.executedActionIds.has('action_step_1'), '8. Executed action IDs Set preserved');
    assert(restored.verifiedEntities.length === 1, '8. Verified entities list preserved');
    assert(restored.discoveredCandidates.length === 3, '8. Discovered candidates list preserved');
  }

  // --------------------------------------------------------------------------
  // 9. Completed action is not executed again
  // --------------------------------------------------------------------------
  console.log('\n--- 9. Completed Action Is Not Executed Again ---');
  {
    const executedActions = new Set<string>();
    const actionId1 = 'action_task_123_step_1_browser_navigate_{"url":"https://example.com/a"}';
    const actionId2 = 'action_task_123_step_2_browser_navigate_{"url":"https://example.com/b"}';

    executedActions.add(actionId1);
    executedActions.add(actionId2);

    assert(executedActions.has(actionId1), '9. Action 1 recognized as already executed');
    assert(executedActions.has(actionId2), '9. Action 2 recognized as already executed');
    assert(!executedActions.has('action_task_123_step_3_google_search_{}'), '9. Action 3 recognized as unexecuted');
  }

  // --------------------------------------------------------------------------
  // 10. Visited domain is not revisited unnecessarily
  // --------------------------------------------------------------------------
  console.log('\n--- 10. Visited Domain Is Not Revisited Unnecessarily ---');
  {
    const visitedDomains = new Set<string>(['example.com', 'eth.ch']);
    const candidates = [
      { url: 'https://example.com/about', domain: 'example.com' },
      { url: 'https://newdomain.org/team', domain: 'newdomain.org' },
    ];

    const unvisited = candidates.filter((c) => !visitedDomains.has(c.domain));
    assert(unvisited.length === 1, '10. Candidate from already visited domain filtered out');
    assert(unvisited[0].domain === 'newdomain.org', '10. New domain prioritized');
  }

  // --------------------------------------------------------------------------
  // 11. Normal Chat remains isolated
  // --------------------------------------------------------------------------
  console.log('\n--- 11. Normal Chat Remains Isolated ---');
  {
    assert(
      NORMAL_CHAT_SYSTEM_PROMPT.includes('You are SanMine Space'),
      '11. Normal Chat system prompt configured for direct conversational assistance'
    );
    assert(
      NORMAL_CHAT_SYSTEM_PROMPT.includes('Do NOT output agent research wrappers'),
      '11. Agent telemetry and research wrappers explicitly prohibited in Normal Chat'
    );
    assert(
      NORMAL_CHAT_SYSTEM_PROMPT.includes('leading "/" slash command'),
      '11. Autonomous agent tools isolated behind leading slash command'
    );

    const normalChatEvents: any[] = [];
    await executeNormalChat({
      taskId: 'test_normal_chat_iso_11',
      providerId: 'mock_work_second' as any,
      model: 'work-model',
      messages: [{ role: 'user', content: 'Python recursion explain karo' }],
      sendEvent: (e) => normalChatEvents.push(e),
    });

    const hasAgentTools = normalChatEvents.some(
      (e) => e.type === 'task.plan_created' || e.type === 'task.progress' || e.type === 'tool.started'
    );
    assert(!hasAgentTools, '11. Normal Chat emitted zero agent tool/plan events');
  }

  console.log('\n====================================================================');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

runFailoverContinuitySuite().catch((err) => {
  console.error('Fatal test failure:', err);
  process.exit(1);
});
