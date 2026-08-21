/**
 * Failover & Persistent Memory Comprehensive Test Suite
 *
 * Runs via tsx: `npx tsx server/ai/failoverAndMemory.test.ts`
 *
 * Validates:
 * 1. ProviderHealthManager: Failure classification, backoff calculation, sanitization.
 * 2. FailoverManager: Fallback candidate ordering, transparent failover execution, streaming failover.
 * 3. TaskCheckpointManager: State preservation, deserialization, anti-duplication filter.
 * 4. ContextManager & Memory: Composite prompt injection with sliding window and memory summaries.
 */

import assert from 'assert';
import { providerHealthManager, sanitizeErrorText, classifyFailure } from './providerHealth.js';
import { failoverManager } from './failoverManager.js';
import { taskCheckpointManager } from '../task/checkpointManager.js';
import { contextManager } from './contextManager.js';
import { aiRegistry } from './registry.js';
import { AIProvider } from './types.js';

console.log('[TEST] Starting Failover & Persistent Memory Test Suite...\n');

// =========================================================================
// TEST 1: Provider Failure Classification & Error Sanitization
// =========================================================================
console.log('[TEST 1] Testing Failure Classification & Sanitization...');

providerHealthManager.resetAll();

// 429 Rate Limit
const error429 = new Error('HTTP 429 Too Many Requests: Rate limit reached');
const class429 = classifyFailure(error429);
assert.strictEqual(class429.type, 'RATE_LIMITED');
assert.strictEqual(class429.retryable, true);
assert.strictEqual(class429.immediateFailover, true);

// Quota Exceeded
const quotaErr = new Error('Resource has been exhausted (e.g. check quota)');
const classQuota = classifyFailure(quotaErr);
assert.strictEqual(classQuota.type, 'QUOTA_EXCEEDED');
assert.strictEqual(classQuota.immediateFailover, true);

// Timeout
const timeoutErr = new Error('The operation timed out after 30000ms');
const classTimeout = classifyFailure(timeoutErr);
assert.strictEqual(classTimeout.type, 'TIMEOUT');
assert.strictEqual(classTimeout.retryable, true);

// 503 Server Error
const server503 = new Error('503 Service Unavailable backend overloaded');
const class503 = classifyFailure(server503);
assert.strictEqual(class503.type, 'SERVER_ERROR');
assert.strictEqual(class503.retryable, true);

// Secret Sanitization
const rawError = 'Error at https://api.openai.com with key sk-proj-1234567890abcdef1234567890 and Bearer AIzaSyD9876543210';
const sanitized = sanitizeErrorText(rawError);
assert.ok(!sanitized.includes('sk-proj-1234567890abcdef1234567890'), 'Plaintext API keys must be scrubbed');
assert.ok(!sanitized.includes('AIzaSyD9876543210'), 'Plaintext Google keys must be scrubbed');
assert.ok(sanitized.includes('[REDACTED_API_KEY]'), 'Sanitized string must have [REDACTED_API_KEY]');

console.log('✓ Test 1 Passed: Failure classification and secret sanitization verified.\n');

// =========================================================================
// TEST 2: Provider Health & Progressive Backoff State
// =========================================================================
console.log('[TEST 2] Testing Provider Health & Cooldown Tracking...');

providerHealthManager.resetAll();
assert.strictEqual(providerHealthManager.isAvailable('google'), true);

// Record 1 failure
providerHealthManager.recordFailure('google', new Error('Quota exceeded'));
assert.strictEqual(providerHealthManager.isAvailable('google'), false, 'Provider in cooldown must report unavailable');

const health = providerHealthManager.getHealth('google');
assert.strictEqual(health.consecutiveFailures, 1);
assert.strictEqual(health.lastFailureType, 'QUOTA_EXCEEDED');

// Record success -> recovery
providerHealthManager.recordSuccess('google');
assert.strictEqual(providerHealthManager.isAvailable('google'), true, 'Success must reset provider backoff');
assert.strictEqual(providerHealthManager.getHealth('google').consecutiveFailures, 0);

console.log('✓ Test 2 Passed: Health state and recovery mechanisms verified.\n');

// =========================================================================
// TEST 3: FailoverManager Execution with Automatic Recovery
// =========================================================================
console.log('[TEST 3] Testing FailoverManager Automatic Execution Failover...');

providerHealthManager.resetAll();

// Register mock providers
const mockCalls: string[] = [];

const mockGoogle: AIProvider = {
  id: 'google',
  name: 'Mock Google',
  description: 'Mock',
  defaultModel: 'gemini-2.5-flash',
  capabilities: { streaming: true, toolCalling: true, vision: true },
  isConfigured: () => true,
  testConnection: async () => ({ success: true }),
  listModels: async () => [],
  streamChat: async () => {
    throw new Error('429 Resource has been exhausted (quota limit reached)');
  },
};

const mockOpenAI: AIProvider = {
  id: 'openai',
  name: 'Mock OpenAI',
  description: 'Mock',
  defaultModel: 'gpt-4o',
  capabilities: { streaming: true, toolCalling: true, vision: true },
  isConfigured: () => true,
  testConnection: async () => ({ success: true }),
  listModels: async () => [],
  streamChat: async (opts) => {
    opts.onEvent({ type: 'message.delta', content: 'Response from fallback OpenAI' });
    opts.onEvent({ type: 'message.completed', content: 'Response from fallback OpenAI' });
  },
};

aiRegistry.register(mockGoogle);
aiRegistry.register(mockOpenAI);

let failoverEventFired = false;
const { result, providerId } = await failoverManager.executeWithFailover(
  async (pId, model) => {
    mockCalls.push(pId);
    if (pId === 'google') {
      throw new Error('429 Resource has been exhausted (quota limit reached)');
    }
    return `Output from ${pId} (${model})`;
  },
  {
    preferredProviderId: 'google',
    preferredModel: 'gemini-2.5-flash',
    onFailover: (ev) => {
      failoverEventFired = true;
      assert.strictEqual(ev.previousProvider, 'google');
      assert.strictEqual(ev.newProvider, 'openai');
    },
  }
);

assert.ok(mockCalls.includes('google'), 'Should attempt primary provider first');
assert.strictEqual(providerId, 'openai', 'Should switch to healthy openai backup');
assert.ok(result.startsWith('Output from openai'), 'Result should be from openai fallback');
assert.strictEqual(failoverEventFired, true, 'Failover event callback must be called');

console.log('✓ Test 3 Passed: Transparent LLM call failover verified.\n');

// =========================================================================
// TEST 4: Streaming Failover Seamless Continuity
// =========================================================================
console.log('[TEST 4] Testing StreamChat Failover Continuity...');

providerHealthManager.resetAll();

const streamedEvents: any[] = [];
await failoverManager.streamChatWithFailover({
  taskId: 'test_stream_task',
  preferredProviderId: 'google',
  preferredModel: 'gemini-2.5-flash',
  messages: [{ role: 'user', content: 'Hello' }],
  onEvent: (event) => {
    streamedEvents.push(event);
  },
});

const hasFailoverNotice = streamedEvents.some((e) => e.type === 'provider.failover');
const hasCompletedMessage = streamedEvents.some((e) => e.type === 'message.completed');

assert.ok(hasFailoverNotice, 'Stream must notify client of transparent provider switch');
assert.ok(hasCompletedMessage, 'Stream must successfully complete from backup provider');

console.log('✓ Test 4 Passed: Streaming failover continuity verified.\n');

// =========================================================================
// TEST 5: Task Checkpointing & Anti-Duplication Filtering
// =========================================================================
console.log('[TEST 5] Testing Task Checkpointing & Candidate Filtering...');

const brainState: any = {
  taskId: 'task_checkpoint_test_01',
  userId: 'user_123',
  userPrompt: 'Find top marketing agencies in Seattle',
  plan: {
    goal: 'Find top marketing agencies in Seattle',
    userIntent: 'DISCOVERY_AND_EXTRACTION',
    quantity: 5,
    entities: ['Seattle Agencies'],
    requestedFields: ['name', 'website'],
    toolsRequired: ['search_businesses'],
    constraints: [],
    sourcePreference: 'auto',
    discoveryStrategy: 'search_first',
    browserRequired: true,
    expectedOutput: 'JSON array',
    completionCriteria: '5 agencies verified',
    nextAction: {
      type: 'execute_tool',
      toolName: 'search_businesses',
      toolArgs: { query: 'marketing agencies Seattle' },
      rationale: 'Initial search',
      expectedObservation: 'List of Seattle agencies',
    },
  },
  currentIteration: 3,
  maxIterations: 10,
  visitedUrls: new Set(['https://agency-a.com', 'https://agency-b.com']),
  visitedDomains: new Set(['agency-a.com', 'agency-b.com']),
  discoveredCandidates: [
    { url: 'https://agency-a.com', title: 'Agency A' },
    { url: 'https://agency-c.com', title: 'Agency C' },
  ],
  observations: [],
  extractedFacts: [],
  evidence: [],
  verifiedEntities: [{ name: 'Agency A', website: 'https://agency-a.com' }],
  failedActions: [],
  status: 'EXECUTING',
  replanCount: 0,
  remainingWork: 'Find 4 more agencies',
};

const serialized = taskCheckpointManager.serializeBrainState(brainState, {
  lastProvider: 'google',
  lastModel: 'gemini-2.5-flash',
});

assert.strictEqual(serialized.taskId, 'task_checkpoint_test_01');
assert.deepStrictEqual(serialized.visitedUrls, ['https://agency-a.com', 'https://agency-b.com']);
assert.strictEqual(serialized.lastProvider, 'google');

const deserialized = taskCheckpointManager.deserializeBrainState(serialized);
assert.ok(deserialized.visitedUrls instanceof Set, 'visitedUrls must be deserialized as a Set');
assert.ok(deserialized.visitedUrls.has('https://agency-a.com'));
assert.strictEqual(deserialized.verifiedEntities.length, 1);

// Anti-duplication candidate filter test
const candidates = [
  { url: 'https://agency-a.com', title: 'Agency A' }, // visited
  { url: 'https://agency-b.com', title: 'Agency B' }, // visited
  { url: 'https://agency-c.com', title: 'Agency C' }, // unvisited
  { url: 'https://agency-d.com', title: 'Agency D' }, // unvisited
];

const unvisited = taskCheckpointManager.filterUnvisitedCandidates(
  candidates,
  brainState.visitedUrls,
  brainState.verifiedEntities
);

assert.strictEqual(unvisited.length, 2, 'Should only return unvisited candidates');
assert.strictEqual(unvisited[0].url, 'https://agency-c.com');
assert.strictEqual(unvisited[1].url, 'https://agency-d.com');

console.log('✓ Test 5 Passed: Checkpoint serialization and anti-duplication verified.\n');

// =========================================================================
// TEST 6: ContextManager Composite Memory Assembly
// =========================================================================
console.log('[TEST 6] Testing ContextManager Composite Memory Assembly...');

const systemPrompt = contextManager.buildSystemPrompt({
  systemPrompt: 'You are SanMine Space.',
  conversationSummary: 'User is a fintech founder in New York exploring merchant processing integrations.',
  defaultLocation: 'New York, NY',
});

assert.ok(systemPrompt.includes('fintech founder in New York'));
assert.ok(systemPrompt.includes('New York, NY'));

const assembled = contextManager.buildContext({
  systemPrompt: 'You are SanMine Space.',
  conversationSummary: 'User is a fintech founder in New York exploring merchant processing integrations.',
  defaultLocation: 'New York, NY',
  recentMessages: [
    { role: 'user', content: 'What were the interchange fees we discussed?' },
    { role: 'assistant', content: 'We discussed average fees around 1.5% to 2.9% + 30c.' },
    { role: 'user', content: 'Can we optimize this for debit transactions?' },
  ],
});

assert.strictEqual(assembled.length, 3);
assert.strictEqual(assembled[0].content, 'What were the interchange fees we discussed?');
assert.strictEqual(assembled[2].content, 'Can we optimize this for debit transactions?');

console.log('✓ Test 6 Passed: ContextManager composite memory assembly verified.\n');

console.log('🎉 ALL FAILOVER & PERSISTENT MEMORY TESTS PASSED PERFECTLY!\n');
