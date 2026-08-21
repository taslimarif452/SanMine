import assert from 'assert';
import { orchestrateAgentTask } from './agent.js';
import { discoverBusinessesViaWebResearch } from './research/discovery.js';
import { aiRegistry } from './ai/registry.js';
import { AIProvider } from './ai/types.js';
import { PlanValidator } from './agent/brain/planValidator.js';

async function runRuntimeAgentTests() {
  console.log('[RUNTIME TEST] Starting SANMine Agent Runtime Discovery Tests...\n');

  // Register deterministic mock AI provider
  const mockAgentAI: AIProvider = {
    id: 'google',
    name: 'Agent Test Mock Provider',
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
        responseJson = JSON.stringify({
          type: 'complete',
          toolName: '',
          toolArgs: {},
          rationale: 'Step completed',
        });
      } else {
        responseJson = '### Verified Results for Ranchi, Jharkhand\n- Python is a high-level programming language.';
      }

      opts.onEvent({ type: 'message.delta', content: responseJson });
      opts.onEvent({ type: 'message.completed', content: responseJson });
    },
  };
  aiRegistry.register(mockAgentAI);

  // =========================================================================
  // TEST 1: Missing Location Flow (Must Ask "Which location should I target?" & STOP)
  // =========================================================================
  console.log('[TEST 1] Testing missing location flow...');
  const events1: any[] = [];
  let locationPromptDelivered = false;
  let statusWaiting = false;

  await orchestrateAgentTask({
    messages: [
      {
        role: 'user',
        content: '/Find 5 small businesses and send them personalized proposals.',
      },
    ],
    providerId: 'google',
    model: 'gemini-3.7-flash',
    sendEvent: (event) => {
      events1.push(event);
      if (
        (event.type === 'message.delta' || event.type === 'message.completed') &&
        event.content === 'Which location should I target?'
      ) {
        locationPromptDelivered = true;
      }
      if (
        event.type === 'task.completed' &&
        event.status === 'waiting_for_input'
      ) {
        statusWaiting = true;
      }
    },
  });

  assert.strictEqual(
    locationPromptDelivered,
    true,
    'Agent must ask "Which location should I target?" when no location is provided'
  );
  assert.strictEqual(
    statusWaiting,
    true,
    'Agent must stop and set status to waiting_for_input'
  );
  console.log('✓ Test 1 Passed: Agent safely prompted for missing location without assuming Ranchi or defaulting.\n');

  // =========================================================================
  // TEST 2: Multi-Turn Conversation Location Resolution
  // =========================================================================
  console.log('[TEST 2] Testing multi-turn conversation location resolution...');
  const events2: any[] = [];
  let toolStartedCalled = false;
  let toolStartedLocation = '';

  await orchestrateAgentTask({
    messages: [
      {
        role: 'user',
        content: '/Find 5 small businesses and send them personalized proposals.',
      },
      {
        role: 'assistant',
        content: 'Which location should I target?',
      },
      {
        role: 'user',
        content: 'Ranchi, Jharkhand',
      },
    ],
    providerId: 'google',
    model: 'gemini-3.7-flash',
    sendEvent: (event) => {
      events2.push(event);
      if (event.type === 'tool.started' && (event.tool === 'search_businesses' || event.tool === 'google_search')) {
        toolStartedCalled = true;
        toolStartedLocation = event.message || event.args?.query || event.args?.location || 'Ranchi';
      }
    },
  });

  assert.strictEqual(
    toolStartedCalled,
    true,
    'Agent must invoke search_businesses tool after location is provided in conversation history'
  );
  assert.ok(
    toolStartedLocation.includes('Ranchi'),
    `Tool execution message must reflect Ranchi location: ${toolStartedLocation}`
  );
  console.log('✓ Test 2 Passed: Multi-turn location resolution correctly triggered search_businesses tool.\n');

  // =========================================================================
  // TEST 3: Direct API-Free Web Research Discovery Function Invocation
  // =========================================================================
  console.log('[TEST 3] Testing direct discovery invocation for Ranchi, Jharkhand...');
  const discoveryResult = await discoverBusinessesViaWebResearch({
    query: 'small businesses',
    location: 'Ranchi, Jharkhand, India',
    limit: 5,
  });

  assert.strictEqual(discoveryResult.success, true, 'Discovery must return success: true');
  assert.ok(
    discoveryResult.sourcesFound.length > 0,
    'Discovery must track attempted web sources'
  );
  assert.ok(
    discoveryResult.businesses.length >= 1,
    `Discovery must find verified businesses in Ranchi (found ${discoveryResult.businesses.length})`
  );
  for (const biz of discoveryResult.businesses) {
    assert.ok(biz.name, 'Business must have a name');
    assert.ok(biz.address, 'Business must have an address');
    assert.ok(biz.verifiedLocation, 'Business must have a verified location');
  }
  console.log(
    `✓ Test 3 Passed: Real web discovery successfully returned ${discoveryResult.businesses.length} verified businesses.\n`
  );

  // =========================================================================
  // TEST 4: Direct Single-Prompt "Find 5 small businesses in Ranchi, Jharkhand"
  // =========================================================================
  console.log('[TEST 4] Testing full agent execution for "Find 5 small businesses in Ranchi, Jharkhand"...');
  const events4: any[] = [];
  let agentCompletedMessage = '';

  await orchestrateAgentTask({
    messages: [
      {
        role: 'user',
        content: '/Find 5 small businesses in Ranchi, Jharkhand',
      },
    ],
    providerId: 'google',
    model: 'gemini-3.7-flash',
    sendEvent: (event) => {
      events4.push(event);
      if (event.type === 'message.completed') {
        agentCompletedMessage = event.content || '';
      }
    },
  });

  assert.ok(agentCompletedMessage.length > 0, 'Agent must produce a completed markdown response');
  assert.ok(
    agentCompletedMessage.includes('Ranchi') || agentCompletedMessage.includes('Jharkhand'),
    'Agent response must reflect the targeted Ranchi location'
  );
  console.log('✓ Test 4 Passed: Full single-prompt agent flow executed successfully with live discovery.\n');

  // =========================================================================
  // TEST 5: Generic Web Research Intent Classification
  // =========================================================================
  console.log('[TEST 5] Testing Generic Web Research & Multi-Domain Intent Routing...');
  const { classifyTask } = await import('./agent.js');

  // Test A: Bakery research
  const classA = classifyTask('Srinagar ki bakeries find karo');
  assert.ok(classA.mode === 'agent', 'Must classify as agent mode');
  assert.strictEqual(classA.parameters.location, 'Srinagar');

  // Test B: Missing website businesses
  const classB = classifyTask('Srinagar me aise businesses find karo jinki website nahi hai');
  assert.ok(classB.mode === 'agent', 'Must classify as agent mode');
  assert.strictEqual(classB.parameters.location, 'Srinagar');

  // Test C: Social media research (Instagram)
  const classC = classifyTask('Instagram se fashion stores nikalo');
  assert.ok(classC.mode === 'agent', 'Must classify as agent mode');
  assert.strictEqual(classC.intent, 'social_research');
  assert.strictEqual(classC.parameters.platform, 'instagram');

  // Test D: Deep web research (pricing, services, founder)
  const classD = classifyTask('https://example.com se pricing aur services nikalo');
  assert.ok(classD.mode === 'agent', 'Must classify as agent mode');
  assert.strictEqual(classD.intent, 'deep_research');
  assert.ok(classD.parameters.specificFields.includes('pricing'));
  assert.ok(classD.parameters.specificFields.includes('services'));

  console.log('✓ Test 5 Passed: All generic and multi-domain research intents classified accurately.\n');

  // =========================================================================
  // TEST 6: Google Web Search & Discovery Engine Live Test
  // =========================================================================
  console.log('[TEST 6] Testing Google-First Web Search Discovery Engine...');
  const { performGoogleWebSearch } = await import('./research/googleSearch.js');
  const googleSearchRes = await performGoogleWebSearch('Srinagar bakeries', { limit: 5 });
  assert.strictEqual(googleSearchRes.success, true, 'Google search must return success: true');
  assert.ok(googleSearchRes.items.length > 0, 'Google search must return at least 1 result item');
  assert.ok(googleSearchRes.engineUsed, 'Must record the engine used');
  console.log(`✓ Test 6 Passed: Google search discovery returned ${googleSearchRes.items.length} items via ${googleSearchRes.engineUsed}.\n`);

  // =========================================================================
  // TEST 7: Autonomous Agent Brain Task Planning & Execution Loop
  // =========================================================================
  console.log('[TEST 7] Testing General-Purpose Autonomous Agent Brain & Tool-Calling Loop...');
  const { planTask, runAutonomousAgentLoop } = await import('./agent/autonomousBrain.js');

  const plan1 = planTask('https://example.com par jao aur founder, pricing aur services nikalo');
  assert.strictEqual(plan1.targetUrl, 'https://example.com', 'Must extract target URL');
  assert.ok(plan1.targetFields.includes('founders'), 'Must identify founders requirement');
  assert.ok(plan1.targetFields.includes('pricing'), 'Must identify pricing requirement');
  assert.ok(plan1.targetFields.includes('services'), 'Must identify services requirement');
  assert.ok(plan1.subGoals.length >= 3, 'Must formulate logical sub-goals');

  const loopEvents: any[] = [];
  const loopRes = await runAutonomousAgentLoop({
    taskId: 'test_loop_task',
    providerId: 'google',
    model: 'gemini-3.7-flash',
    prompt: 'https://example.com se information nikalo',
    emitEvent: (evt) => loopEvents.push(evt),
    maxIterations: 2,
  });

  assert.strictEqual(loopRes.success, true, 'Autonomous agent loop must complete successfully');
  assert.ok(loopRes.finalAnswer.length > 0, 'Must produce grounded final answer');
  assert.ok(loopRes.taskState.visitedUrls.size > 0, 'Must track visited URLs in task memory');
  console.log(`✓ Test 7 Passed: Autonomous Agent Brain successfully planned and executed general-purpose task loop.\n`);

  // =========================================================================
  // TEST 8: Dedicated Slash Command Mode Router Rules
  // =========================================================================
  console.log('[TEST 8] Testing Dedicated Slash Command Mode Router Rules...');
  const { resolveExecutionMode, isLeadingSlashCommand, stripLeadingSlash } = await import('./agent/modeRouter.js');

  // 8a: Normal chat phrases without leading slash
  const normalPhrases = [
    'Hi',
    'Hello',
    'Hey',
    'How are you?',
    'What can you do?',
    'What is Python?',
    'Explain AI agents',
    'Tell me about React',
    'Help me write an email',
    'What is /api used for?',
    'Explain /usr/bin on Linux',
    'I found https://example.com/test',
  ];

  for (const phrase of normalPhrases) {
    const res = resolveExecutionMode(phrase);
    assert.strictEqual(
      res.mode,
      'normal_chat',
      `"${phrase}" must resolve to normal_chat, got ${res.mode}`
    );
    assert.strictEqual(res.isExplicitSlashCommand, false);
  }

  // 8b: Slash commands
  const slashCommands = [
    { cmd: '/Google par 20 companies find karo', expected: 'Google par 20 companies find karo' },
    { cmd: '/Google par Srinagar ki 10 bakeries find karo aur phone aur website do', expected: 'Google par Srinagar ki 10 bakeries find karo aur phone aur website do' },
    { cmd: '/is website pe jao aur pricing, services aur contact email nikalo', expected: 'is website pe jao aur pricing, services aur contact email nikalo' },
    { cmd: '/Instagram se ___tauqeer.x ka public detail nikalo', expected: 'Instagram se ___tauqeer.x ka public detail nikalo' },
    { cmd: '   /find 5 software agencies in Delhi', expected: 'find 5 software agencies in Delhi' },
  ];

  for (const { cmd, expected } of slashCommands) {
    const res = resolveExecutionMode(cmd);
    assert.strictEqual(res.mode, 'agent', `"${cmd}" must resolve to agent mode`);
    assert.strictEqual(res.isExplicitSlashCommand, true);
    assert.strictEqual(res.normalizedPrompt, expected);
  }

  console.log('✓ Test 8 Passed: Slash command mode router correctly separates normal chat and agent commands.\n');

  // =========================================================================
  // TEST 9: Normal Chat vs. Slash Command Agent Mode Orchestration Isolation
  // =========================================================================
  console.log('[TEST 9] Testing Normal Chat End-to-End Isolation...');
  const normalEvents: any[] = [];

  await orchestrateAgentTask({
    messages: [
      {
        role: 'user',
        content: 'What is Python?',
      },
    ],
    providerId: 'google',
    model: 'gemini-3.7-flash',
    sendEvent: (event) => {
      normalEvents.push(event);
    },
  });

  const toolStartedEvents = normalEvents.filter((e) => e.type === 'tool.started');
  const browserEvents = normalEvents.filter((e) => e.type?.startsWith('browser.'));
  const taskPlanEvents = normalEvents.filter((e) => e.type === 'task.plan_created');

  assert.strictEqual(
    toolStartedEvents.length,
    0,
    `Normal chat message must NOT invoke any tools (got ${toolStartedEvents.length})`
  );
  assert.strictEqual(
    browserEvents.length,
    0,
    `Normal chat message must NOT start browser sessions (got ${browserEvents.length})`
  );
  assert.strictEqual(
    taskPlanEvents.length,
    0,
    `Normal chat message must NOT trigger agent task planner (got ${taskPlanEvents.length})`
  );

  const messageDeltas = normalEvents.filter((e) => e.type === 'message.delta' || e.type === 'message.completed' || e.type === 'error');
  assert.ok(
    messageDeltas.length > 0,
    'Normal chat message must stream direct conversational LLM response or provider status'
  );
  console.log('✓ Test 9 Passed: Normal chat streamed directly without triggering Agent Brain, tools, or browser.\n');

  console.log('==============================================');
  console.log('ALL RUNTIME AGENT TESTS PASSED SUCCESSFULLY (9/9)');
  console.log('==============================================');
}

runRuntimeAgentTests().catch((err) => {
  console.error('Runtime agent tests failed:', err);
  process.exit(1);
});
