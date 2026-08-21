/**
 * P0-4: Persistent Conversation Memory & Context Continuity Tests
 *
 * Validates:
 * 1. User & Chat Scoping (Isolation between tenants and chats)
 * 2. Multi-turn memory persistence and session continuity
 * 3. Rolling summary persistence in DB and retrieval
 * 4. Context assembly deterministic token limits & sliding window
 * 5. Normal chat isolation (zero agent/browser/telemetry pollution)
 * 6. Deleted chat memory removal (immediate cessation of context contribution)
 */

import assert from 'assert';
import { conversationMemoryManager } from '../memory/conversationMemory.js';
import { conversationSummarizer } from '../memory/conversationSummarizer.js';
import { contextManager } from '../ai/contextManager.js';
import {
  createChat,
  saveMessage,
  listChatMessages,
  deleteChat,
  saveConversationSummary,
  getConversationSummary,
} from '../db/chats.js';
import { executeNormalChat, NORMAL_CHAT_SYSTEM_PROMPT } from '../chat/normalChat.js';
import { aiRegistry } from '../ai/registry.js';
import { AIProvider } from '../ai/types.js';

async function runMemoryContinuityTests() {
  console.log('[TEST] Starting P0-4 Persistent Conversation Memory & Context Continuity Tests...\n');

  const userA = '00000000-0000-0000-0000-00000000000a';
  const userB = '00000000-0000-0000-0000-00000000000b';

  // Setup Mock Provider for LLM calls
  const recordedCalls: any[] = [];
  const mockAI: AIProvider = {
    id: 'openai',
    name: 'Mock Memory AI',
    description: 'Mock',
    defaultModel: 'gpt-4o-mini',
    capabilities: { streaming: true, toolCalling: false, vision: false },
    isConfigured: () => true,
    testConnection: async () => ({ success: true }),
    listModels: async () => [],
    streamChat: async (opts) => {
      recordedCalls.push(opts);
      opts.onEvent({ type: 'message.delta', content: 'Understood. Remembering our prior discussion.' });
      opts.onEvent({ type: 'message.completed', content: 'Understood. Remembering our prior discussion.' });
    },
  };
  aiRegistry.register(mockAI);

  // =========================================================================
  // 1. Multi-turn Memory & Chat Isolation
  // =========================================================================
  console.log('[TEST 1] Testing Multi-turn Memory Persistence & Chat Isolation...');

  const chat1 = await createChat({ userId: userA, title: 'Chat 1: Marketing' });
  const chat2 = await createChat({ userId: userA, title: 'Chat 2: Engineering' });

  // Record turns in Chat 1
  await conversationMemoryManager.recordUserMessage(chat1.id, userA, 'My company name is SolarFlow.');
  await conversationMemoryManager.recordAssistantMessage(chat1.id, userA, 'Nice to meet you SolarFlow!');
  await conversationMemoryManager.recordUserMessage(chat1.id, userA, 'We target residential solar in Texas.');

  // Record turns in Chat 2
  await conversationMemoryManager.recordUserMessage(chat2.id, userA, 'We need a Postgres query for lead deduplication.');
  await conversationMemoryManager.recordAssistantMessage(chat2.id, userA, 'Here is a SQL CTE for deduplication.');

  // Context for Chat 1
  const ctxChat1 = await conversationMemoryManager.getEnrichedContext({
    chatId: chat1.id,
    userId: userA,
    autoSummarize: false,
  });
  assert.strictEqual(ctxChat1.recentMessages.length, 3);
  assert.ok(ctxChat1.recentMessages.some((m) => m.content.includes('SolarFlow')));
  assert.ok(!ctxChat1.recentMessages.some((m) => m.content.includes('Postgres query')), 'Chat 1 must not leak Chat 2 messages');

  // Context for Chat 2
  const ctxChat2 = await conversationMemoryManager.getEnrichedContext({
    chatId: chat2.id,
    userId: userA,
    autoSummarize: false,
  });
  assert.strictEqual(ctxChat2.recentMessages.length, 2);
  assert.ok(ctxChat2.recentMessages.some((m) => m.content.includes('Postgres query')));
  assert.ok(!ctxChat2.recentMessages.some((m) => m.content.includes('SolarFlow')), 'Chat 2 must not leak Chat 1 messages');

  console.log('✓ Test 1 Passed: Multi-turn memory saved and isolated across chats.\n');

  // =========================================================================
  // 2. Tenant Isolation (User A vs User B)
  // =========================================================================
  console.log('[TEST 2] Testing Strict User Tenant Isolation...');

  // User B attempts to access User A's chat context
  const unauthorizedCtx = await conversationMemoryManager.getEnrichedContext({
    chatId: chat1.id,
    userId: userB,
    autoSummarize: false,
  });
  assert.strictEqual(unauthorizedCtx.recentMessages.length, 0, 'User B must get 0 messages for User A chat');
  assert.strictEqual(unauthorizedCtx.summary, undefined, 'User B must get no summary for User A chat');

  // User B attempts to record message into User A's chat
  const unauthorizedSave = await conversationMemoryManager.recordUserMessage(
    chat1.id,
    userB,
    'Hacker payload into User A chat'
  );
  assert.strictEqual(unauthorizedSave, null, 'User B must be rejected from writing to User A chat');

  console.log('✓ Test 2 Passed: Tenant isolation strictly enforced on memory access.\n');

  // =========================================================================
  // 3. Rolling Summary Persistence & Inclusion in System Prompt
  // =========================================================================
  console.log('[TEST 3] Testing Rolling Summary Persistence & Context Injection...');

  await saveConversationSummary({
    chatId: chat1.id,
    userId: userA,
    summary: '• User company: SolarFlow\n• Target: Residential solar Texas\n• Goal: High-converting email outreach',
  });

  const savedSummary = await getConversationSummary(chat1.id, userA);
  assert.ok(savedSummary !== null);
  assert.ok(savedSummary.summary.includes('SolarFlow'));

  const enrichedWithSummary = await conversationMemoryManager.getEnrichedContext({
    chatId: chat1.id,
    userId: userA,
    autoSummarize: false,
  });
  assert.ok(enrichedWithSummary.summary?.includes('SolarFlow'));

  // Build system prompt and verify summary injection
  const sysPrompt = contextManager.buildSystemPrompt({
    systemPrompt: NORMAL_CHAT_SYSTEM_PROMPT,
    conversationSummary: enrichedWithSummary.summary,
    defaultLocation: 'Austin, TX',
  });
  assert.ok(sysPrompt.includes('SolarFlow'));
  assert.ok(sysPrompt.includes('Austin, TX'));
  assert.ok(sysPrompt.includes('Prior Conversation Context & Memory Summary'));

  console.log('✓ Test 3 Passed: Rolling summary persists and injects cleanly into system prompt.\n');

  // =========================================================================
  // 4. Deterministic Context Limits & Token Trimming
  // =========================================================================
  console.log('[TEST 4] Testing Deterministic Context Limits & Token Trimming...');

  const longMessages = Array.from({ length: 50 }, (_, i) => ({
    role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
    content: `Turn #${i + 1}: ${'Lorem ipsum dolor sit amet '.repeat(20)}`,
  }));

  // Bound context to maxEstimatedTokens = 500 (~2000 chars)
  const trimmedContext = contextManager.buildContext({
    systemPrompt: 'You are an AI.',
    conversationSummary: 'Summary of past 50 turns.',
    recentMessages: longMessages,
    maxEstimatedTokens: 500,
  });

  assert.ok(trimmedContext.length < longMessages.length, 'Should trim older messages to stay within limit');
  assert.ok(trimmedContext.length >= 2, 'Should retain at least the latest turns');
  // Verify that the newest turn is preserved
  assert.strictEqual(
    trimmedContext[trimmedContext.length - 1].content,
    longMessages[longMessages.length - 1].content,
    'Newest message must be preserved at end of context'
  );

  console.log('✓ Test 4 Passed: Context assembly enforces deterministic token limits.\n');

  // =========================================================================
  // 5. Normal Chat Execution Isolation
  // =========================================================================
  console.log('[TEST 5] Testing Normal Chat Execution with Clean Memory...');

  recordedCalls.length = 0;
  const chatEvents: any[] = [];

  await executeNormalChat({
    taskId: 'test_task_normal_mem',
    chatId: chat1.id,
    userId: userA,
    providerId: 'openai',
    model: 'gpt-4o-mini',
    messages: [
      { role: 'user', content: 'What is our current outreach strategy?' },
    ],
    sendEvent: (ev) => chatEvents.push(ev),
  });

  assert.ok(recordedCalls.length > 0, 'Normal chat must invoke LLM');
  const latestCall = recordedCalls[0];
  assert.ok(latestCall.systemPrompt.includes('SolarFlow'), 'Must include rolling summary in system prompt');
  assert.ok(latestCall.systemPrompt.includes('SanMine Space'), 'Must include conversational persona');
  assert.ok(!latestCall.systemPrompt.includes('browser_navigate'), 'Must NOT include browser tools in normal chat');
  assert.ok(!latestCall.systemPrompt.includes('calculate_lead_score'), 'Must NOT include lead scoring tools in normal chat');

  console.log('✓ Test 5 Passed: Normal Chat receives memory context with zero agent tool pollution.\n');

  // =========================================================================
  // 6. Deleted Chat Memory Removal
  // =========================================================================
  console.log('[TEST 6] Testing Deleted Chat Memory Removal...');

  const delRes = await deleteChat(chat1.id, userA);
  assert.strictEqual(delRes, true);

  // Subsequent context fetch must return zero messages and no summary
  const postDelCtx = await conversationMemoryManager.getEnrichedContext({
    chatId: chat1.id,
    userId: userA,
    autoSummarize: false,
  });
  assert.strictEqual(postDelCtx.recentMessages.length, 0, 'Deleted chat must return 0 messages');
  assert.strictEqual(postDelCtx.summary, undefined, 'Deleted chat must return undefined summary');

  const postDelSummary = await getConversationSummary(chat1.id, userA);
  assert.strictEqual(postDelSummary, null, 'Deleted chat summary must be null');

  const postDelMessages = await listChatMessages(chat1.id, userA);
  assert.strictEqual(postDelMessages, null, 'Deleted chat messages must be null');

  console.log('✓ Test 6 Passed: Deleted chat immediately stops contributing to future context.\n');

  // Cleanup
  await deleteChat(chat2.id, userA);

  console.log('====================================================================');
  console.log('🎉 ALL P0-4 PERSISTENT MEMORY & CONTINUITY TESTS PASSED (6/6)!');
  console.log('====================================================================\n');
}

runMemoryContinuityTests().catch((err) => {
  console.error('[TEST FAILURE] Memory Continuity Tests:', err);
  process.exit(1);
});
