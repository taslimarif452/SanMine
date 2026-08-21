import assert from 'assert';
import {
  understandTaskObjective,
  decomposeTask,
  createExecutionPlan,
  addSubtask,
  removeSubtask,
  reorderSubtask,
  retrySubtask,
  changeTool,
  TaskMemoryManager,
  EvidenceManager,
  evaluateProgress,
  replanTask,
  synthesizeFinalReport,
  UniversalTaskPlanner,
} from './index.js';

async function runTaskPlannerTests() {
  console.log('[TASK PLANNER TESTS] Starting Universal Task Planner Suite...\n');

  // =========================================================================
  // TEST 1: Intent & Objective Understanding (English, Hindi, Hinglish)
  // =========================================================================
  console.log('[TEST 1] Testing Intent & Objective Understanding...');

  // 1. "Google par 20 companies find karo"
  const p1 = understandTaskObjective('Google par 20 companies find karo');
  assert.strictEqual(p1.intent, 'DISCOVERY_AND_EXTRACTION');
  assert.strictEqual(p1.quantity, 20);
  assert.strictEqual(p1.source, 'Google Search');
  assert.strictEqual(p1.status, 'PLANNING'); // Should not block on location

  // 2. "Google par Srinagar ki 20 bakeries search karo"
  const p2 = understandTaskObjective('Google par Srinagar ki 20 bakeries search karo');
  assert.strictEqual(p2.intent, 'DISCOVERY_AND_EXTRACTION');
  assert.strictEqual(p2.quantity, 20);
  assert.strictEqual(p2.location, 'Srinagar');
  assert.strictEqual(p2.source, 'Google Search');

  // 3. "Instagram se is public account ki details nikalo: ___tauqeer.x"
  const p3 = understandTaskObjective('Instagram se is public account ki details nikalo: ___tauqeer.x');
  assert.strictEqual(p3.intent, 'SOCIAL_PROFILE_RESEARCH');
  assert.ok(p3.platforms.includes('instagram'));
  assert.ok(p3.entities.includes('___tauqeer.x') || p3.target?.includes('___tauqeer.x'));

  // 4. "Is website par jao aur pricing, services aur contact email nikalo"
  const p4 = understandTaskObjective('https://supabase.com par jao aur pricing, services aur contact email nikalo');
  assert.strictEqual(p4.intent, 'URL_INSPECTION_AND_AUDIT');
  assert.ok(p4.requiredFields.includes('pricing'));
  assert.ok(p4.requiredFields.includes('services'));
  assert.ok(p4.requiredFields.includes('email'));

  // 5. "Is company ka founder find karo"
  const p5 = understandTaskObjective('Is company ka founder find karo https://openai.com');
  assert.strictEqual(p5.intent, 'URL_INSPECTION_AND_AUDIT');
  assert.ok(p5.requiredFields.includes('founder'));

  // 6. "Google par search karke relevant websites open karo aur unse information compare karo"
  const p6 = understandTaskObjective('Google par search karke relevant websites open karo aur unse information compare karo');
  assert.strictEqual(p6.intent, 'DEEP_WEB_RESEARCH');
  assert.strictEqual(p6.source, 'Google Search');

  // 7. "Is website ke About, Services aur Contact pages check karo"
  const p7 = understandTaskObjective('https://linear.app ke About, Services aur Contact pages check karo');
  assert.strictEqual(p7.intent, 'URL_INSPECTION_AND_AUDIT');
  assert.ok(p7.requiredFields.includes('about'));
  assert.ok(p7.requiredFields.includes('services'));

  // 8. "Mujhe is topic par research karke sources ke saath answer do"
  const p8 = understandTaskObjective('Mujhe quantum computing topic par research karke sources ke saath answer do');
  assert.strictEqual(p8.intent, 'DEEP_WEB_RESEARCH');

  const t1 = p1;
  const t2 = understandTaskObjective('https://stripe.com pe jao aur pricing aur founder details nikalo');

  console.log('✓ Test 1 Passed: Intent & objective engine accurately understands arbitrary prompts.\n');

  // =========================================================================
  // TEST 2: Missing Location Clarification & Multi-turn Location Resolution
  // =========================================================================
  console.log('[TEST 2] Testing Missing Location Flow & Resolution...');

  // Prompt with no location
  const tNoLoc = understandTaskObjective('Find 5 small businesses and send them personalized proposals.');
  assert.strictEqual(tNoLoc.status, 'WAITING_FOR_INPUT');
  assert.strictEqual(tNoLoc.clarificationPrompt, 'Which location should I target?');

  // Multi-turn resolution via history
  const tResolved = understandTaskObjective('Find 5 small businesses and send them personalized proposals.', {
    conversationHistory: [
      { role: 'user', content: 'Find 5 small businesses' },
      { role: 'assistant', content: 'Which location should I target?' },
      { role: 'user', content: 'Ranchi, Jharkhand' },
    ],
  });
  assert.ok(tResolved.location && tResolved.location.includes('Ranchi'), 'Must resolve Ranchi location from history');
  assert.notStrictEqual(tResolved.status, 'WAITING_FOR_INPUT');

  console.log('✓ Test 2 Passed: Missing location clarification and multi-turn lookup working properly.\n');

  // =========================================================================
  // TEST 3: Dynamic Task Decomposition
  // =========================================================================
  console.log('[TEST 3] Testing Dynamic Task Decomposition...');

  const subtasks1 = decomposeTask(t1);
  assert.ok(subtasks1.length >= 4, 'Must decompose into at least 4 atomic subtasks');
  assert.ok(subtasks1.some((s) => s.requiredTool === 'google_search'), 'Must include search subtask');
  assert.ok(subtasks1.some((s) => s.requiredTool === 'browser_navigate'), 'Must include browser inspection subtask');

  const subtasks2 = decomposeTask(t2);
  assert.ok(subtasks2.some((s) => s.targetUrl === 'https://stripe.com'), 'Must target direct URL');

  console.log('✓ Test 3 Passed: Dynamic decomposition generates structured atomic subtasks.\n');

  // =========================================================================
  // TEST 4: Mutable Execution Plan Operations
  // =========================================================================
  console.log('[TEST 4] Testing Mutable Execution Plan Operations...');

  const plan = createExecutionPlan(t1);
  const initialLength = plan.subtasks.length;

  // Add subtask
  const customSubtask = {
    id: 'subtask_custom_1',
    title: 'Custom Verification Step',
    description: 'Verify Crunchbase leadership data',
    requiredTool: 'google_search',
    targetFields: ['founder'],
    status: 'PENDING' as const,
    retryCount: 0,
    maxRetries: 3,
  };
  addSubtask(plan, customSubtask, 1);
  assert.strictEqual(plan.subtasks.length, initialLength + 1);
  assert.strictEqual(plan.subtasks[1].id, 'subtask_custom_1');

  // Reorder subtask
  reorderSubtask(plan, 'subtask_custom_1', 0);
  assert.strictEqual(plan.subtasks[0].id, 'subtask_custom_1');

  // Change tool
  changeTool(plan, 'subtask_custom_1', 'browser_navigate');
  assert.strictEqual(plan.subtasks[0].requiredTool, 'browser_navigate');

  // Retry subtask
  retrySubtask(plan, 'subtask_custom_1');
  assert.strictEqual(plan.subtasks[0].status, 'RETRYING');
  assert.strictEqual(plan.subtasks[0].retryCount, 1);

  // Remove subtask
  removeSubtask(plan, 'subtask_custom_1');
  assert.strictEqual(plan.subtasks.length, initialLength);

  console.log('✓ Test 4 Passed: Execution plan mutation operations working as expected.\n');

  // =========================================================================
  // TEST 5: Memory Manager & Anti-Loop Safeguards
  // =========================================================================
  console.log('[TEST 5] Testing Memory Manager & Anti-Loop Safeguards...');

  const memory = new TaskMemoryManager('test_task_1');

  // Query registration & loop detection
  const firstReg = memory.registerSearchQuery('bakeries in srinagar');
  assert.strictEqual(firstReg, true);
  const secondReg = memory.registerSearchQuery('bakeries in srinagar');
  assert.strictEqual(secondReg, false);

  const loop1 = memory.detectLoop('google_search', { query: 'bakeries in srinagar' });
  assert.strictEqual(loop1.isLoop, true, 'Must detect duplicate search query loop');

  // URL normalization and duplicate candidate filtering
  memory.addCandidateUrls([
    { url: 'https://example.com/page?utm_source=twitter', title: 'Example Page' },
    { url: 'https://example.com/page', title: 'Example Page Duplicate' },
  ]);
  assert.strictEqual(memory.candidateUrls.length, 1, 'Must deduplicate normalized URLs');

  // Entity deduplication
  memory.recordEntity({
    name: 'Srinagar Bakers',
    url: 'https://srinagarbakers.com',
    extractedFields: { email: 'info@srinagarbakers.com' },
    verified: true,
    confidence: 1.0,
    sourceCitations: ['https://srinagarbakers.com'],
  });

  memory.recordEntity({
    name: 'Srinagar Bakers',
    url: 'https://srinagarbakers.com',
    extractedFields: { phone: '+91 9876543210' },
    verified: true,
    confidence: 1.0,
    sourceCitations: ['https://srinagarbakers.com/contact'],
  });

  assert.strictEqual(memory.verifiedEntities.length, 1, 'Must merge duplicate entities');
  assert.strictEqual(memory.verifiedEntities[0].extractedFields['phone'], '+91 9876543210');

  console.log('✓ Test 5 Passed: Memory management and anti-loop protections validated.\n');

  // =========================================================================
  // TEST 6: Progress Evaluation & Re-Planning
  // =========================================================================
  console.log('[TEST 6] Testing Progress Evaluation & Re-planning...');

  // Evaluation on successful entity extraction
  const evalSuccess = evaluateProgress(t1, memory, {
    action: 'browser_navigate',
    tool: 'browser_navigate',
    success: true,
    source: 'https://srinagarbakers.com',
    discoveredUrls: ['https://srinagarbakers.com/about'],
    extractedFacts: [
      { field: 'email', value: 'contact@srinagarbakers.com', sourceUrl: 'https://srinagarbakers.com', confidence: 'high', timestamp: new Date().toISOString() },
    ],
    discoveredLinks: [{ text: 'About Us', href: 'https://srinagarbakers.com/about', fullUrl: 'https://srinagarbakers.com/about' }],
    evidence: [],
    executionTimeMs: 120,
    timestamp: new Date().toISOString(),
  });

  assert.strictEqual(evalSuccess.shouldReplan, false);

  // Evaluation on failed observation triggers replan
  const evalFailed = evaluateProgress(t1, memory, {
    action: 'browser_navigate',
    tool: 'browser_navigate',
    success: false,
    source: 'https://broken-site.com',
    discoveredUrls: [],
    extractedFacts: [],
    discoveredLinks: [],
    evidence: [],
    errors: '404 Not Found',
    executionTimeMs: 50,
    timestamp: new Date().toISOString(),
  });

  assert.strictEqual(evalFailed.shouldReplan, true);

  const replanDecision = replanTask(t1, memory, evalFailed, {
    action: 'browser_navigate',
    tool: 'browser_navigate',
    success: false,
    source: 'https://broken-site.com',
    discoveredUrls: [],
    extractedFacts: [],
    discoveredLinks: [],
    evidence: [],
    errors: '404 Not Found',
    executionTimeMs: 50,
    timestamp: new Date().toISOString(),
  });

  assert.strictEqual(replanDecision.triggered, true);
  console.log('✓ Test 6 Passed: Evaluator and replanner successfully adapt on execution changes.\n');

  // =========================================================================
  // TEST 7: Grounded Evidence & Synthesis Report
  // =========================================================================
  console.log('[TEST 7] Testing Evidence Citations & Final Synthesis...');

  const evidence = new EvidenceManager();
  evidence.addEvidence({
    fact: 'Inspected Srinagar Bakers official website',
    field: 'page_load',
    value: 'https://srinagarbakers.com',
    sourceUrl: 'https://srinagarbakers.com',
    pageTitle: 'Srinagar Bakers - Premium Cakes & Pastries',
    quote: 'Serving authentic Kashmiri bakery since 1995.',
    confidence: 1.0,
    timestamp: new Date().toISOString(),
  });

  const report = synthesizeFinalReport(t1, memory, evidence);
  assert.ok(report.includes('Srinagar Bakers'), 'Report must include entity name');
  assert.ok(report.includes('Verified Primary'), 'Report must include citations');
  assert.ok(report.includes('https://srinagarbakers.com'), 'Report must include source link');

  console.log('✓ Test 7 Passed: Final grounded synthesis and citations rendered cleanly.\n');

  // =========================================================================
  // TEST 8: Universal Planner Orchestration End-to-End Run
  // =========================================================================
  console.log('[TEST 8] Testing Universal Planner End-to-End Orchestration...');

  const planner = new UniversalTaskPlanner();
  const events: any[] = [];

  const result = await planner.execute({
    taskId: 'test_task_e2e',
    providerId: 'google',
    model: 'gemini-2.5-flash',
    messages: [
      {
        role: 'user',
        content: 'https://example.com website pe jao aur key details batao',
      },
    ],
    sendEvent: (event) => {
      events.push(event);
    },
  });

  assert.strictEqual(result.success, true);
  assert.ok(events.some((e) => e.type === 'task.progress'), 'Must emit progress events');
  assert.ok(events.some((e) => e.type === 'task.completed'), 'Must emit completed event');

  console.log('✓ Test 8 Passed: Universal Task Planner executed end-to-end.\n');

  console.log('=====================================================');
  console.log('🎉 ALL UNIVERSAL TASK PLANNER TESTS PASSED (8/8)!');
  console.log('=====================================================\n');
}

runTaskPlannerTests().catch((err) => {
  console.error('[TEST ERROR]', err);
  process.exit(1);
});
