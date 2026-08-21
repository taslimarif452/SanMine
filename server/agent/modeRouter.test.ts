import assert from 'assert';
import {
  resolveExecutionMode,
  isLeadingSlashCommand,
  stripLeadingSlash,
} from './modeRouter.js';
import { isWorkDelegationTask, parseWorkGoal } from './workIntent.js';

console.log('[TEST] Starting Slash Command Mode Router Tests...\n');

// =========================================================================
// TEST 1: Normal Conversational Chat Messages (MUST NOT Trigger Agent Mode)
// =========================================================================
console.log('[TEST 1] Testing Normal Chat Messages...');
const normalChatPrompts = [
  'Hi',
  'Hello',
  'How are you?',
  'Kya haal hai?',
  'Explain Python',
  'What is React?',
  'Explain quantum computing',
  'Write a paragraph about India',
  'What do you think about this idea?',
  'Mujhe Python samjhao',
  'Help me write an email',
  'What can you do?',
  'What is /api used for?',
  'Explain /api',
  'Use /usr/bin',
  'Explain /usr/bin on Linux',
  'https://example.com',
  'I found https://example.com/test in the docs',
  '1/2 cup of milk and 3/4 cup of sugar',
];

for (const prompt of normalChatPrompts) {
  const result = resolveExecutionMode(prompt);
  assert.strictEqual(
    result.mode,
    'normal_chat',
    `Expected "${prompt}" to resolve to normal_chat, got ${result.mode}`
  );
  assert.strictEqual(
    result.isExplicitSlashCommand,
    false,
    `Expected isExplicitSlashCommand to be false for "${prompt}"`
  );
  assert.strictEqual(
    result.isAgentContinuation,
    false,
    `Expected isAgentContinuation to be false for "${prompt}"`
  );
  assert.strictEqual(
    result.normalizedPrompt,
    prompt,
    `Expected normalizedPrompt to equal rawPrompt for normal chat`
  );
}
console.log(`✓ Test 1 Passed: All ${normalChatPrompts.length} normal chat messages routed to normal_chat.\n`);

// =========================================================================
// TEST 2: Leading Slash Commands (MUST Activate Autonomous Agent Mode)
// =========================================================================
console.log('[TEST 2] Testing Explicit Slash Commands...');
const agentSlashCommands = [
  {
    input: '/Google par 20 companies find karo',
    expectedNormalized: 'Google par 20 companies find karo',
  },
  {
    input: '/Srinagar ki bakeries find karo',
    expectedNormalized: 'Srinagar ki bakeries find karo',
  },
  {
    input: '/website kholo aur pricing nikalo',
    expectedNormalized: 'website kholo aur pricing nikalo',
  },
  {
    input: '/Instagram se public profile detail nikalo',
    expectedNormalized: 'Instagram se public profile detail nikalo',
  },
  {
    input: '/Google par Srinagar ki 10 bakeries find karo aur phone aur website do',
    expectedNormalized: 'Google par Srinagar ki 10 bakeries find karo aur phone aur website do',
  },
  {
    input: '/is website pe jao aur pricing, services aur contact email nikalo',
    expectedNormalized: 'is website pe jao aur pricing, services aur contact email nikalo',
  },
  {
    input: '/Instagram se ___tauqeer.x ka public detail nikalo',
    expectedNormalized: 'Instagram se ___tauqeer.x ka public detail nikalo',
  },
  {
    input: '/Google par 20 companies find karo aur unki websites inspect karke batao kaunsi outdated hai',
    expectedNormalized: 'Google par 20 companies find karo aur unki websites inspect karke batao kaunsi outdated hai',
  },
  {
    input: '   /find 5 software agencies in Delhi',
    expectedNormalized: 'find 5 software agencies in Delhi',
  },
  {
    input: '/https://example.com par jao aur founder ka naam batao',
    expectedNormalized: 'https://example.com par jao aur founder ka naam batao',
  },
];

for (const { input, expectedNormalized } of agentSlashCommands) {
  const result = resolveExecutionMode(input);
  assert.strictEqual(
    result.mode,
    'agent',
    `Expected "${input}" to resolve to agent mode, got ${result.mode}`
  );
  assert.strictEqual(
    result.isExplicitSlashCommand,
    true,
    `Expected isExplicitSlashCommand to be true for "${input}"`
  );
  assert.strictEqual(
    result.normalizedPrompt,
    expectedNormalized,
    `Expected normalizedPrompt "${expectedNormalized}", got "${result.normalizedPrompt}"`
  );
  assert.strictEqual(
    result.rawPrompt,
    input,
    `Expected rawPrompt to preserve original input`
  );
}
console.log(`✓ Test 2 Passed: All ${agentSlashCommands.length} slash commands activated Agent Mode with clean normalization.\n`);

// =========================================================================
// TEST 3: Slash Helper Functions & Normalization Precision
// =========================================================================
console.log('[TEST 3] Testing normalization functions...');

assert.strictEqual(isLeadingSlashCommand('Hi'), false);
assert.strictEqual(isLeadingSlashCommand('/task'), true);
assert.strictEqual(isLeadingSlashCommand('  /task'), true);
assert.strictEqual(isLeadingSlashCommand('What is /api?'), false);
assert.strictEqual(isLeadingSlashCommand('https://google.com'), false);

assert.strictEqual(
  stripLeadingSlash('/Instagram se ___tauqeer.x ka public detail nikalo'),
  'Instagram se ___tauqeer.x ka public detail nikalo',
  'Must preserve exact username with underscores'
);
assert.strictEqual(
  stripLeadingSlash('   /search "ACME Corp"'),
  'search "ACME Corp"',
  'Must preserve quotes and remove leading whitespace with slash'
);
assert.strictEqual(
  stripLeadingSlash('/https://my-site.com/sub/path?q=1'),
  'https://my-site.com/sub/path?q=1',
  'Must preserve full URL path after leading slash'
);
console.log('✓ Test 3 Passed: Normalization functions maintain 100% parameter fidelity.\n');

// =========================================================================
// TEST 4: Multi-Turn Agent Continuation vs. Standalone Normal Chat
// =========================================================================
console.log('[TEST 4] Testing Multi-turn Agent Continuation...');

// Case A: Assistant asked for location clarification in an agent task
const historyWithClarification = [
  { role: 'user', content: '/Find 5 small businesses and send proposals' },
  { role: 'assistant', content: 'Which location should I target?' },
];

const continuationResult = resolveExecutionMode('Ranchi, Jharkhand', {
  conversationHistory: historyWithClarification,
});
assert.strictEqual(
  continuationResult.mode,
  'agent',
  'Expected reply to clarification to continue in agent mode'
);
assert.strictEqual(
  continuationResult.isAgentContinuation,
  true,
  'Expected isAgentContinuation to be true'
);

// Case B: Assistant completed the agent task, user sends a new normal message
const historyWithCompletedTask = [
  { role: 'user', content: '/Google par 5 companies find karo' },
  {
    role: 'assistant',
    content: '## Research Report\n\nHere are 5 verified companies:\n1. Acme Corp...',
    metadata: { taskResult: { status: 'completed' } },
  },
];

const newChatAfterTaskResult = resolveExecutionMode('What is Python?', {
  conversationHistory: historyWithCompletedTask,
});
assert.strictEqual(
  newChatAfterTaskResult.mode,
  'normal_chat',
  'Expected new conversation after completed task to return to normal_chat'
);

const greetingAfterTaskResult = resolveExecutionMode('Hi', {
  conversationHistory: historyWithCompletedTask,
});
assert.strictEqual(
  greetingAfterTaskResult.mode,
  'normal_chat',
  'Expected greeting after completed task to be normal_chat'
);

console.log('✓ Test 4 Passed: Multi-turn continuation and return-to-chat work seamlessly.\n');

// =========================================================================
// TEST 5: Natural-language work delegation (NO slash required)
// =========================================================================
console.log('[TEST 5] Testing work delegation without a leading slash...');
const workWithoutSlash = [
  'Mujhe US mein 20 relevant SaaS companies find karo jo AI use karti hain',
  'India mein 50 SaaS companies find karo jo 10–100 employees ki hain',
  'US ke 30 restaurants find karo jinki websites outdated hain aur unke contact details collect karo',
  'is website par jao aur pricing, services aur contact email nikalo: https://example.com',
  'leads find karo, proposal generate karo aur Gmail se bhej do',
  'Find 20 bakeries in Srinagar',
];

for (const prompt of workWithoutSlash) {
  const result = resolveExecutionMode(prompt);
  assert.strictEqual(
    result.mode,
    'agent',
    `Expected work prompt "${prompt}" to resolve to agent, got ${result.mode}`
  );
  assert.strictEqual(
    result.isExplicitSlashCommand,
    false,
    `Work prompt should not be treated as an explicit slash command: "${prompt}"`
  );
}
console.log(`✓ Test 5 Passed: All ${workWithoutSlash.length} natural-language work goals activate Agent Mode.\n`);

// =========================================================================
// TEST 6: Work goal parser (quantity, location, outreach, fields)
// =========================================================================
console.log('[TEST 6] Testing work goal parser...');
assert.strictEqual(isWorkDelegationTask('Hi'), false);
assert.strictEqual(isWorkDelegationTask('Explain Python'), false);
assert.strictEqual(isWorkDelegationTask('What is /api used for?'), false);

const saasGoal = parseWorkGoal(
  'Mujhe US mein 20 relevant SaaS companies find karo jo AI use karti hain, unki official websites check karo, founders aur contact email nikalo'
);
assert.strictEqual(saasGoal.isWorkTask, true, 'SaaS research is a work task');
assert.strictEqual(saasGoal.quantity, 20, 'Quantity parsed as 20');
assert.strictEqual(saasGoal.location, 'United States', 'US mapped to United States');
assert.ok(saasGoal.requestedFields.includes('founder'), 'Founder field requested');
assert.ok(saasGoal.requestedFields.includes('email'), 'Email field requested');
assert.ok(saasGoal.constraints.some((c) => /AI/i.test(c)), 'AI constraint recorded');

const sendGoal = parseWorkGoal('leads find karo, proposal generate karo aur Gmail se bhej do');
assert.strictEqual(sendGoal.proposalRequired, true, 'Proposal required when asked');
assert.strictEqual(sendGoal.emailActionsRequired, true, 'Email send required when asked to bhej do');

console.log('✓ Test 6 Passed: Work goal parser extracts quantity, location, fields, and outreach flags.\n');

console.log('====================================================');
console.log('ALL SLASH COMMAND MODE ROUTER TESTS PASSED (6/6)!');
console.log('====================================================');
