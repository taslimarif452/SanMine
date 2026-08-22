/**
 * Findings table & deterministic discovery tests.
 *
 * Verifies Fix #3: after google_search, candidates are registered while
 * skipping search-engine URLs, official pages are inspected before a second
 * search, and formatFindingsReport emits the 5-column table with "Not found"
 * for missing emails (never invented).
 */

import { brainDecisionEngine } from './decisionEngine.js';
import { BrainTaskState, BrainTaskPlan } from './types.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string, detail?: string) {
  if (condition) {
    console.log(`  ✓ ${name}`);
    passed++;
  } else {
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
    failed++;
  }
}

function makeState(overrides: Partial<BrainTaskState> = {}): BrainTaskState {
  const plan: BrainTaskPlan = {
    goal: 'Find SaaS companies in Delhi',
    userIntent: 'DISCOVERY_AND_EXTRACTION',
    entities: ['saas', 'companies'],
    requestedFields: ['founder', 'email', 'website'],
    quantity: 5,
    location: 'Delhi',
    constraints: ['Must be a SaaS / software company'],
    sourcePreference: 'google',
    discoveryStrategy: 'search_first',
    browserRequired: true,
    toolsRequired: ['google_search', 'browser_navigate'],
    expectedOutput: 'Findings table',
    completionCriteria: '5 verified',
    nextAction: {
      type: 'execute_tool',
      toolName: 'google_search',
      toolArgs: { query: 'saas companies Delhi' },
      rationale: 'search',
      expectedObservation: 'candidates',
    },
  };
  return {
    taskId: 'test_findings',
    userPrompt: 'Find SaaS companies in Delhi',
    conversationHistory: [],
    plan,
    currentIteration: 0,
    maxIterations: 30,
    verifiedEntities: [],
    visitedUrls: new Set(),
    visitedDomains: new Set(),
    discoveredCandidates: [],
    observations: [],
    extractedFacts: [],
    evidence: [],
    failedActions: [],
    executedActionIds: new Set(),
    status: 'EXECUTING',
    replanCount: 0,
    remainingWork: '',
    ...overrides,
  };
}

// Access private methods via any cast
const engine: any = brainDecisionEngine;

console.log('\n📊 [FINDINGS TABLE] Verification');

// 1. Search-engine URLs are skipped when registering candidates.
{
  const state = makeState();
  engine.registerDiscoveredCandidate(state, { url: 'https://www.google.com/search?q=saas', title: 'Google' });
  engine.registerDiscoveredCandidate(state, { url: 'https://www.bing.com/search?q=saas', title: 'Bing' });
  engine.registerDiscoveredCandidate(state, { url: 'https://duckduckgo.com/?q=saas', title: 'DDG' });
  engine.registerDiscoveredCandidate(state, { url: 'https://acme-saas.in/', title: 'Acme SaaS' });
  engine.registerDiscoveredCandidate(state, { url: 'https://acme-saas.in/about', title: 'Acme About (dup domain)' });
  assert(state.discoveredCandidates.length === 1, 'Search-engine URLs skipped; only official destination kept');
  assert(state.discoveredCandidates[0].url === 'https://acme-saas.in', 'Official candidate URL registered');
}

// 2. pickUnvisitedOfficialCandidate prefers official PRIMARY pages.
{
  const state = makeState();
  state.discoveredCandidates = [
    { url: 'https://www.google.com/search?q=x', title: 'SERP', domain: 'google.com', isDestination: false },
    { url: 'https://acme-saas.in/', title: 'Acme', domain: 'acme-saas.in', isDestination: true, relevanceScore: 0.9 },
    { url: 'https://www.crunchbase.com/organization/acme', title: 'Crunchbase', domain: 'crunchbase.com', isDestination: false, relevanceScore: 0.5 },
  ];
  const pick = engine.pickUnvisitedOfficialCandidate(state, 8);
  assert(!!pick, 'Picked an unvisited candidate before second search');
  assert(pick.url === 'https://acme-saas.in/', 'Official website picked before directory / second search');
}

// 3. Official-page inspection is capped (~5-8).
{
  const state = makeState();
  // Simulate 6 already-inspected official entities
  for (let i = 0; i < 6; i++) {
    state.verifiedEntities.push({
      id: `ent_${i}`,
      name: `Co ${i}`,
      url: `https://company${i}.example/`,
      hasWebsite: true,
      status: 'VERIFIED',
    });
    state.visitedUrls.add(`https://company${i}.example/`);
  }
  state.discoveredCandidates.push({
    url: 'https://nextcompany.example/',
    title: 'Next',
    domain: 'nextcompany.example',
    isDestination: true,
  });
  const pick = engine.pickUnvisitedOfficialCandidate(state, 6);
  assert(pick === undefined, 'Official inspection respects cap (~6) before another search');
}

// 4. formatFindingsReport produces the 5-column table with correct headers.
{
  const state = makeState();
  state.verifiedEntities = [
    {
      id: 'ent_1',
      name: 'Acme SaaS',
      url: 'https://acme-saas.in/',
      website: 'https://acme-saas.in/',
      hasWebsite: true,
      email: 'founder@acme-saas.in',
      emailStatus: 'VERIFIED',
      status: 'VERIFIED',
    },
    {
      id: 'ent_2',
      name: 'NoEmail Labs',
      url: 'https://noemail.dev/',
      website: 'https://noemail.dev/',
      hasWebsite: true,
      status: 'VERIFIED',
    },
  ];
  const report: string = engine.formatFindingsReport(state);
  assert(report.includes('| Company | Website | Decision maker | Email | Status |'), 'Table has the 5 required columns');
  assert(report.includes('Acme SaaS'), 'Verified company appears in table');
  assert(report.includes('founder@acme-saas.in'), 'Verified public email appears');
  assert(/NoEmail Labs[^\n]*Not found/.test(report), 'Missing email shown as "Not found", never invented');
  assert(!report.includes('```'), 'Report contains no markdown code fence');
}

// 5. Empty state -> honest message, no invented companies.
{
  const state = makeState();
  const report: string = engine.formatFindingsReport(state);
  assert(!report.includes('| Company | Website | Decision maker | Email | Status |'), 'No table header when 0 entities');
  assert(/no verified companies|could not be confirmed/i.test(report), 'Honest "no verified companies" message');
}

console.log('\n==================================================');
console.log(`Findings table tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
