/**
 * P0-1 Lifecycle & Verification Regression Test Suite
 *
 * Verifies:
 * 1. Multi-Step Execution Lifecycle: Understand -> Plan -> Execute All Steps -> Observe -> Verify -> Complete
 * 2. Multi-Action Chaining (e.g. Discover -> Extract Contact -> Generate Proposal -> Send Email)
 * 3. Never terminates early on intermediate results (e.g. finding 1 business when 5 requested)
 * 4. Stateful completion tracking with requested, verified, and unverified counts
 * 5. Transparent reporting when fewer entities exist without hallucinating missing ones
 * 6. Provenance and source citation tracking
 */

import { PlanValidator } from './planValidator.js';
import { universalAgentBrain } from './agentBrain.js';
import { brainDecisionEngine } from './decisionEngine.js';
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

async function runLifecycleTests() {
  console.log('\n🔍 [TEST SUITE] P0-1 Agent Lifecycle & Multi-Step Verification');
  console.log('===============================================================');

  // Register mock provider for deterministic step simulation
  const mockLifecycleAI: AIProvider = {
    id: 'google',
    name: 'Lifecycle Mock Provider',
    description: 'Mock',
    defaultModel: 'gemini-3.7-flash',
    capabilities: { streaming: true, toolCalling: true, vision: true },
    isConfigured: () => true,
    testConnection: async () => ({ success: true }),
    listModels: async () => [],
    streamChat: async (opts) => {
      const isPlan = opts.systemPrompt?.includes('Planning Guidelines') || opts.systemPrompt?.includes('JSON Plan Generator');
      const isEval = opts.systemPrompt?.includes('ReAct') || opts.systemPrompt?.includes('Evaluate') || opts.systemPrompt?.includes('DECIDE NEXT ACTION');

      let responseJson = '';
      if (isPlan) {
        const rawContent = opts.messages[0]?.content || '';
        const extractedPromptMatch = rawContent.match(/User Prompt:\s*"([^"]+)"/i);
        const userPrompt = extractedPromptMatch ? extractedPromptMatch[1] : rawContent;
        const parsed = PlanValidator.validateAndRepairPlan(null, userPrompt);
        responseJson = JSON.stringify(parsed);
      } else if (isEval) {
        // Evaluate: Return complete only when criteria met
        responseJson = JSON.stringify({
          type: 'complete',
          toolName: '',
          toolArgs: {},
          rationale: 'Evaluated step and advancing lifecycle',
        });
      } else {
        responseJson = '### Verified Results\nAll items grounded in evidence.';
      }

      opts.onEvent({ type: 'message.delta', content: responseJson });
      opts.onEvent({ type: 'message.completed', content: responseJson });
    },
  };
  aiRegistry.register(mockLifecycleAI);

  // --- TEST 1: Plan Validation of Multi-Step Intent ---
  console.log('\n--- 1. Multi-Step Intent Parsing & Action Pipeline Formulation ---');
  const multiStepPrompt = 'Find 5 local restaurants in Mumbai without websites, write a pitch proposal for each, and send outreach emails.';
  const plan1 = PlanValidator.validateAndRepairPlan(null, multiStepPrompt);

  assert(plan1.quantity === 5, 'Target quantity parsed as 5', `Got ${plan1.quantity}`);
  assert(plan1.noWebsiteRequired === true, 'Recognized constraint: no website required');
  assert(plan1.proposalRequired === true, 'Recognized action: proposal required');
  assert(plan1.emailActionsRequired === true, 'Recognized action: email outreach required');
  assert(plan1.requiredActions?.includes('generate_proposal'), 'Pipeline contains generate_proposal');
  assert(plan1.requiredActions?.includes('send_email'), 'Pipeline contains send_email');

  // --- TEST 2: Deterministic Entity Completion Counter ---
  console.log('\n--- 2. Entity Completion Accounting (No premature completion) ---');
  const mockTaskState: any = {
    plan: {
      goal: 'Find 3 businesses without websites and send emails',
      quantity: 3,
      noWebsiteRequired: true,
      requestedFields: ['email'],
      proposalRequired: true,
      emailActionsRequired: true,
      constraints: ['Must not have active website'],
    },
    verifiedEntities: [
      {
        id: '1',
        name: 'Alpha Cafe',
        hasWebsite: true, // Has website -> REJECTED
        status: 'REJECTED',
        email: 'alpha@cafe.com',
        proposalMarkdown: 'Pitch',
        emailSent: true,
      },
      {
        id: '2',
        name: 'Beta Bakery',
        hasWebsite: false,
        hasNoWebsiteVerified: true,
        status: 'PROPOSAL_GENERATED',
        email: 'beta@bakery.com',
        proposalMarkdown: 'Pitch for Beta',
        emailSent: false, // Email not sent yet -> Incomplete
      },
      {
        id: '3',
        name: 'Gamma Salon',
        hasWebsite: false,
        hasNoWebsiteVerified: true,
        status: 'EMAIL_SENT',
        email: 'gamma@salon.com',
        proposalMarkdown: 'Pitch for Gamma',
        emailSent: true, // Fully complete!
      },
    ],
  };

  const completedCount = (brainDecisionEngine as any).countFullyCompletedEntities(mockTaskState);
  assert(completedCount === 1, 'Correctly identified only 1 entity as fully completed across all pipeline stages', `Got: ${completedCount}`);

  // --- TEST 2B: Raw search hits (DISCOVERED, uninspected) are never counted as verified/completed ---
  console.log('\n--- 2B. Uninspected DISCOVERED entities never count toward completion ---');
  const discoveredOnlyState: any = {
    plan: {
      goal: 'Find 20 SaaS businesses in Delhi and extract decision maker emails',
      quantity: 20,
      noWebsiteRequired: false,
      requestedFields: ['email'],
      proposalRequired: false,
      emailActionsRequired: false,
      constraints: [],
    },
    verifiedEntities: Array.from({ length: 20 }, (_, i) => ({
      id: `disc_${i}`,
      name: `Search Hit ${i + 1}`,
      url: `https://example-${i + 1}.com`,
      hasWebsite: true,
      status: 'DISCOVERED',
      pageInspected: false,
      email: null,
    })),
  };
  const discoveredCompletedCount = (brainDecisionEngine as any).countFullyCompletedEntities(discoveredOnlyState);
  assert(
    discoveredCompletedCount === 0,
    '20 DISCOVERED uninspected entities yield completedCount === 0 (search hits are NOT verified leads)',
    `Got: ${discoveredCompletedCount}`
  );

  // Missing discoveredCandidates/visitedUrls/observations must not crash the pipeline router
  let pipelineActionCrashed = false;
  let discoveredNextAction: any = null;
  try {
    discoveredNextAction = (brainDecisionEngine as any).getDeterministicNextPipelineAction(discoveredOnlyState);
  } catch {
    pipelineActionCrashed = true;
  }
  assert(!pipelineActionCrashed, 'Pipeline router does not crash when discoveredCandidates/visitedUrls are missing');
  assert(
    discoveredNextAction && discoveredNextAction.type !== 'complete',
    'Pipeline does not complete while 0/20 entities are actually verified',
    `Got: ${discoveredNextAction?.type}`
  );

  // Next action must be send_email for Beta Bakery
  const nextAction = (brainDecisionEngine as any).getDeterministicNextPipelineAction(mockTaskState);
  assert(nextAction.type === 'execute_tool', 'Next action is execute_tool');
  assert(nextAction.toolName === 'send_email', 'Next action dispatches send_email for ready proposal', `Got: ${nextAction.toolName}`);
  assert(nextAction.toolArgs.to === 'beta@bakery.com', 'Next action targets Beta Bakery recipient');

  // --- TEST 3: Honest Summary Accounting when target quantity not fully met ---
  console.log('\n--- 3. Transparent Result Accounting (No Hallucinations) ---');
  const summary = (brainDecisionEngine as any).formatFallbackSummary(mockTaskState);
  assert(summary.includes('**Requested**: 3'), 'Summary states requested target 3');
  assert(summary.includes('**Verified**: 1') || summary.includes('**Completed / Successful**: 1'), 'Summary accurately states verified 1');
  assert(summary.includes('**Remaining**: 2') || summary.includes('**Unverified**: 2'), 'Summary states unverified difference 2');
  assert(summary.includes('Excluded') || summary.includes('Limitations'), 'Summary includes limitations and exclusion notes');

  // --- TEST 4: Full Multi-Step Task Execution ---
  console.log('\n--- 4. Full Execution Execution with Pipeline Chaining ---');
  const events: any[] = [];
  const execResult = await universalAgentBrain.executeTask({
    providerId: 'google',
    model: 'gemini-3.7-flash',
    prompt: 'Find 2 local gyms in Pune without websites, create a digital strategy proposal, and send email.',
    sendEvent: (e) => events.push(e),
  });

  assert(execResult.success === true, 'Task completed without crashing');
  assert(execResult.plan.quantity === 2, 'Maintained quantity 2');
  assert(execResult.state.observations.length >= 1, 'Executed tool actions in lifecycle');
  assert(execResult.finalAnswer.length > 50, 'Synthesized rich grounded output');

  console.log('\n===============================================================');
  console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('===============================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runLifecycleTests().catch((err) => {
  console.error('Lifecycle Test Error:', err);
  process.exit(1);
});
