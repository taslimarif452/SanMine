import assert from 'assert';
import { executeNormalChat, NORMAL_CHAT_SYSTEM_PROMPT } from './normalChat.js';
import { aiRegistry } from '../ai/registry.js';
import { AIProvider } from '../ai/types.js';

console.log('[TEST] Starting Normal Chat Brain & Isolation Tests...\n');

// =========================================================================
// TEST 1: System Prompt Isolation
// =========================================================================
console.log('[TEST 1] Testing Normal Chat System Prompt...');
assert.ok(
  NORMAL_CHAT_SYSTEM_PROMPT.includes('helpful general-purpose AI assistant') ||
    NORMAL_CHAT_SYSTEM_PROMPT.includes('helpful, intelligent, and articulate') ||
    NORMAL_CHAT_SYSTEM_PROMPT.includes('SanMine Space'),
  'System prompt must define SanMine as a general-purpose AI assistant'
);
assert.ok(
  !NORMAL_CHAT_SYSTEM_PROMPT.includes('google_search, browser_navigate'),
  'Normal Chat system prompt must NOT include browser navigation tools'
);
assert.ok(
  !NORMAL_CHAT_SYSTEM_PROMPT.includes('calculate_lead_score'),
  'Normal Chat system prompt must NOT include lead scoring instructions'
);
console.log('✓ Test 1 Passed: Normal Chat system prompt is clean and strictly conversational.\n');

// =========================================================================
// TEST 2: Conversation History & Context Preservation
// =========================================================================
console.log('[TEST 2] Testing Conversation History Preservation...');

let capturedStreamOptions: any = null;
const mockChatEvents: any[] = [];

// Create a mock provider to verify exact parameters passed to streamChat
const mockProvider: AIProvider = {
  id: 'openai',
  name: 'Mock Provider',
  description: 'Mock for unit tests',
  defaultModel: 'gpt-4o-mini',
  capabilities: { streaming: true, toolCalling: false, vision: false },
  isConfigured: () => true,
  testConnection: async () => ({ success: true }),
  listModels: async () => [],
  streamChat: async (opts) => {
    capturedStreamOptions = opts;
    opts.onEvent({ type: 'message.delta', content: 'Hello Ali! Python is great.' });
    opts.onEvent({ type: 'message.completed', content: 'Hello Ali! Python is great.' });
  },
};

// Temporarily register mock provider in aiRegistry
aiRegistry.register(mockProvider);

const multiTurnMessages = [
  { role: 'user' as const, content: 'Mera naam Ali hai' },
  { role: 'assistant' as const, content: 'Nice to meet you, Ali!' },
  { role: 'user' as const, content: 'Mujhe Python seekhna hai' },
];

await executeNormalChat({
  taskId: 'test_chat_task_1',
  providerId: 'openai',
  model: 'gpt-4o-mini',
  messages: multiTurnMessages,
  sendEvent: (event) => {
    mockChatEvents.push(event);
  },
});

assert.ok(capturedStreamOptions, 'streamChat must be called with options');
assert.strictEqual(
  capturedStreamOptions.messages.length,
  3,
  'All 3 conversation history messages must be preserved'
);
assert.strictEqual(capturedStreamOptions.messages[0].content, 'Mera naam Ali hai');
assert.strictEqual(capturedStreamOptions.messages[1].content, 'Nice to meet you, Ali!');
assert.strictEqual(capturedStreamOptions.messages[2].content, 'Mujhe Python seekhna hai');
assert.strictEqual(
  capturedStreamOptions.systemPrompt,
  NORMAL_CHAT_SYSTEM_PROMPT,
  'Must use conversational system prompt'
);

const deltaEvents = mockChatEvents.filter((e) => e.type === 'message.delta');
assert.ok(deltaEvents.length > 0, 'Normal chat must emit message.delta events');
console.log('✓ Test 2 Passed: Multi-turn conversation history passed accurately to the LLM.\n');

// =========================================================================
// TEST 3: Zero Tool/Browser/Task-Planner Invocations
// =========================================================================
console.log('[TEST 3] Testing Strict Normal Chat Isolation...');

const toolEvents = mockChatEvents.filter(
  (e) => e.type === 'tool.started' || e.type === 'tool.completed' || e.type?.startsWith('browser.')
);
assert.strictEqual(
  toolEvents.length,
  0,
  'Normal Chat MUST NOT emit any tool or browser events'
);

const summaryEvents = mockChatEvents.filter((e) =>
  String(e.content || '').includes('Research Summary') ||
  String(e.content || '').includes('0 entities discovered') ||
  String(e.content || '').includes('No businesses found')
);
assert.strictEqual(
  summaryEvents.length,
  0,
  'Normal Chat MUST NOT produce research summary or entity discovery markers'
);

console.log('✓ Test 3 Passed: Normal chat runs with 100% isolation from agent tools.\n');

// =========================================================================
// TEST 4: Error Handling Isolation
// =========================================================================
console.log('[TEST 4] Testing Conversational Error Handling Isolation...');

const errorProvider: AIProvider = {
  id: 'google',
  name: 'Error Provider',
  description: 'Mock error provider',
  defaultModel: 'gemini-3.7-flash',
  capabilities: { streaming: true, toolCalling: false, vision: false },
  isConfigured: () => true,
  testConnection: async () => ({ success: true }),
  listModels: async () => [],
  streamChat: async () => {
    throw new Error('API Rate Limit Exceeded (429)');
  },
};

const openaiErrorProvider: AIProvider = {
  ...errorProvider,
  id: 'openai',
  defaultModel: 'gpt-4o-mini',
};

aiRegistry.register(errorProvider);
aiRegistry.register(openaiErrorProvider);

const errorEvents: any[] = [];
await executeNormalChat({
  taskId: 'test_error_task',
  providerId: 'google',
  model: 'gemini-3.7-flash',
  messages: [{ role: 'user', content: 'What is React?' }],
  sendEvent: (e) => errorEvents.push(e),
});

const errEvent = errorEvents.find((e) => e.type === 'error');
assert.ok(errEvent, 'Must emit standard error event when provider fails');
assert.strictEqual(
  errEvent.code,
  'NORMAL_CHAT_STREAM_ERROR',
  'Must use conversational error code'
);
assert.ok(
  !String(errEvent.message).includes('Research Summary'),
  'Error must not be wrapped in Research Summary'
);

console.log('✓ Test 4 Passed: Errors handled cleanly without converting to agent task results.\n');

console.log('====================================================');
console.log('ALL NORMAL CHAT BRAIN TESTS PASSED (4/4)!');
console.log('====================================================');
