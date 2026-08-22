/**
 * Official Web Search tests: Tavily → Serper automatic failover.
 *
 * Run with: npx tsx server/research/officialSearch.test.ts
 */

import assert from 'node:assert';
import {
  performOfficialWebSearch,
  hasTavilyKey,
  hasSerperKey,
  __resetOfficialSearchCooldownsForTests,
} from './officialSearch.js';

// ---------------------------------------------------------------------------
// Tiny test harness
// ---------------------------------------------------------------------------
let passed = 0;
let failed = 0;
function test(name: string, fn: () => Promise<void> | void) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed += 1;
      console.log(`✓ ${name}`);
    })
    .catch((err: any) => {
      failed += 1;
      console.error(`✗ ${name}: ${err?.message || err}`);
    });
}

// A controllable fetch mock keyed by URL.
interface MockResponse {
  status?: number;
  body?: any; // object -> JSON, string -> raw
  delayMs?: number;
  throwError?: Error;
}

function createMockFetch(routes: Record<string, MockResponse>) {
  const calls: Array<{ url: string; body: any; headers: Record<string, string> }> = [];
  const fetchImpl = (async (input: any, init?: any) => {
    const url = typeof input === 'string' ? input : input?.url;
    const route = routes[url];
    const reqBody = init?.body ? JSON.parse(init.body) : undefined;
    calls.push({ url, body: reqBody, headers: init?.headers || {} });

    if (route?.delayMs) {
      await new Promise((r) => setTimeout(r, route.delayMs));
    }
    if (route?.throwError) {
      throw route.throwError;
    }
    if (!route) {
      return new Response(JSON.stringify({ error: 'not found' }), { status: 404 });
    }
    const status = route.status ?? 200;
    const payload =
      typeof route.body === 'string' ? route.body : JSON.stringify(route.body ?? {});
    return new Response(payload, {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

function setEnv(overrides: Record<string, string | undefined>) {
  const saved: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(overrides)) {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return () => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  };
}

// ---------------------------------------------------------------------------
async function main() {
  console.log('[TEST] Starting Official Web Search (Tavily + Serper failover)\n');

  // -------------------------------------------------------------------------
  // Test 1: Tavily success → Serper is NEVER called; HTML scrape is skipped.
  // -------------------------------------------------------------------------
  await test('Tavily success skips Serper entirely', async () => {
    __resetOfficialSearchCooldownsForTests();
    const restore = setEnv({
      TAVILY_API_KEY: 'tvly-test-key',
      SERPER_API_KEY: 'serper-test-key',
      SEARCH_PRIMARY: 'tavily',
    });

    const tavilyResults = [
      {
        title: 'Acme Corp — Official Site',
        url: 'https://acme.example.com/',
        content: 'Acme makes widgets. Contact: hello@acme.example.com',
      },
      {
        title: 'Acme on LinkedIn',
        url: 'https://www.linkedin.com/company/acme',
        content: 'LinkedIn profile',
      },
    ];

    const { fetchImpl, calls } = createMockFetch({
      'https://api.tavily.com/search': { status: 200, body: { results: tavilyResults } },
      'https://google.serper.dev/search': {
        status: 200,
        body: { organic: [{ title: 'SHOULD NOT BE CALLED', link: 'https://nope.example.com' }] },
      },
    });

    const res = await performOfficialWebSearch('acme corp', { fetchImpl });

    // Diagnostic helpers must not leak key values — check while keys are set.
    assert.strictEqual(hasTavilyKey(), true);
    assert.strictEqual(hasSerperKey(), true);
    restore();

    assert.strictEqual(res.success, true, 'response should succeed');
    assert.strictEqual(res.providerUsed, 'tavily', 'providerUsed must be tavily');
    assert.strictEqual(res.items.length, 2, 'two items returned');
    assert.strictEqual(res.items[0].url, 'https://acme.example.com/');
    assert.strictEqual(res.items[0].sourceEngine, 'tavily');
    // Social classification still works.
    assert.strictEqual(res.items[1].isSocialProfile, true);
    assert.strictEqual(res.items[1].socialPlatform as string, 'linkedin');

    // The Tavily request must use the Bearer auth header and include api_key.
    const tavilyCall = calls.find((c) => c.url === 'https://api.tavily.com/search');
    assert.ok(tavilyCall, 'Tavily must have been called');
    assert.strictEqual(tavilyCall!.headers['Authorization'], 'Bearer tvly-test-key');
    assert.strictEqual(tavilyCall!.body.search_depth, 'basic');
    assert.strictEqual(tavilyCall!.body.include_answer, false);
    assert.ok(typeof tavilyCall!.body.max_results === 'number');

    // Serper must NOT have been called.
    const serperCalls = calls.filter((c) => c.url === 'https://google.serper.dev/search');
    assert.strictEqual(serperCalls.length, 0, 'Serper must not be called when Tavily succeeds');
  });

  // -------------------------------------------------------------------------
  // Test 2: Tavily 429 → immediately fail over to Serper; Tavily on cooldown.
  // -------------------------------------------------------------------------
  await test('Tavily 429 triggers immediate Serper failover', async () => {
    __resetOfficialSearchCooldownsForTests();
    const restore = setEnv({
      TAVILY_API_KEY: 'tvly-test-key',
      SERPER_API_KEY: 'serper-test-key',
      SEARCH_PRIMARY: 'tavily',
    });

    const { fetchImpl, calls } = createMockFetch({
      'https://api.tavily.com/search': {
        status: 429,
        body: { error: 'Rate limit exceeded' },
      },
      'https://google.serper.dev/search': {
        status: 200,
        body: {
          organic: [
            {
              title: 'Globex Official',
              link: 'https://globex.example.com/',
              snippet: 'Globex homepage',
            },
          ],
        },
      },
    });

    const res = await performOfficialWebSearch('globex', { fetchImpl });
    restore();

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.providerUsed, 'serper');
    assert.strictEqual(res.items.length, 1);
    assert.strictEqual(res.items[0].sourceEngine, 'serper');
    assert.ok(res.cooldownProviders.includes('tavily'), 'Tavily must be on cooldown after 429');

    // Both endpoints were hit exactly once.
    assert.strictEqual(
      calls.filter((c) => c.url === 'https://api.tavily.com/search').length,
      1
    );
    assert.strictEqual(
      calls.filter((c) => c.url === 'https://google.serper.dev/search').length,
      1
    );

    // Serper must use X-API-KEY header.
    const serperCall = calls.find((c) => c.url === 'https://google.serper.dev/search')!;
    assert.strictEqual(serperCall.headers['X-API-KEY'], 'serper-test-key');
    assert.strictEqual(serperCall.body.q, 'globex');
    assert.strictEqual(typeof serperCall.body.num, 'number');
  });

  // -------------------------------------------------------------------------
  // Test 3: On the NEXT call, exhausted Tavily is skipped non-stop (Serper only).
  // -------------------------------------------------------------------------
  await test('Next call skips an exhausted (cooldown) provider', async () => {
    // Tavily is STILL on cooldown from the previous test (same process).
    const restore = setEnv({
      TAVILY_API_KEY: 'tvly-test-key',
      SERPER_API_KEY: 'serper-test-key',
      SEARCH_PRIMARY: 'tavily',
    });

    const { fetchImpl, calls } = createMockFetch({
      'https://api.tavily.com/search': {
        status: 200,
        body: { results: [{ title: 'SHOULD NOT BE CALLED', url: 'https://nope.example.com' }] },
      },
      'https://google.serper.dev/search': {
        status: 200,
        body: {
          organic: [
            { title: 'Initech', link: 'https://initech.example.com/', snippet: 'Initech' },
          ],
        },
      },
    });

    const res = await performOfficialWebSearch('initech', { fetchImpl });
    restore();

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.providerUsed, 'serper');
    assert.ok(
      !res.providersAttempted.includes('tavily'),
      'Tavily must be skipped while on cooldown'
    );
    assert.strictEqual(
      calls.filter((c) => c.url === 'https://api.tavily.com/search').length,
      0,
      'Tavily HTTP call must not happen while on cooldown'
    );
  });

  // -------------------------------------------------------------------------
  // Test 4: No keys configured → 0 items, no HTTP calls, no inventions.
  // -------------------------------------------------------------------------
  await test('No API keys returns 0 items and makes no HTTP calls', async () => {
    __resetOfficialSearchCooldownsForTests();
    const restore = setEnv({
      TAVILY_API_KEY: undefined,
      TAVILY_KEY: undefined,
      SERPER_API_KEY: undefined,
      SERPER_KEY: undefined,
      SEARCH_PRIMARY: 'tavily',
    });

    const { fetchImpl, calls } = createMockFetch({
      'https://api.tavily.com/search': { status: 200, body: { results: [] } },
      'https://google.serper.dev/search': { status: 200, body: { organic: [] } },
    });

    const res = await performOfficialWebSearch('anything', { fetchImpl });
    restore();

    assert.strictEqual(res.success, false);
    assert.strictEqual(res.hasAnyKey, false);
    assert.strictEqual(res.providerUsed, 'none');
    assert.strictEqual(res.items.length, 0);
    assert.strictEqual(res.totalResults, 0);
    assert.strictEqual(calls.length, 0, 'No HTTP calls may be made without keys');
    assert.strictEqual(hasTavilyKey(), false);
    assert.strictEqual(hasSerperKey(), false);
  });

  // -------------------------------------------------------------------------
  // Test 5: SEARCH_PRIMARY=serper tries Serper first and skips Tavily on hit.
  // -------------------------------------------------------------------------
  await test('SEARCH_PRIMARY=serper tries Serper first', async () => {
    __resetOfficialSearchCooldownsForTests();
    const restore = setEnv({
      TAVILY_API_KEY: 'tvly-test-key',
      SERPER_API_KEY: 'serper-test-key',
      SEARCH_PRIMARY: 'serper',
    });

    const { fetchImpl, calls } = createMockFetch({
      'https://api.tavily.com/search': { status: 200, body: { results: [] } },
      'https://google.serper.dev/search': {
        status: 200,
        body: {
          organic: [{ title: 'Hooli', link: 'https://hooli.example.com/', snippet: 'Hooli' }],
        },
      },
    });

    const res = await performOfficialWebSearch('hooli', { fetchImpl });
    restore();

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.providerUsed, 'serper');
    assert.strictEqual(res.providersAttempted[0], 'serper');
    assert.strictEqual(
      calls.filter((c) => c.url === 'https://api.tavily.com/search').length,
      0,
      'Tavily must not be called when Serper returns hits'
    );
  });

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  console.log(`\n${passed} passed, ${failed} failed.`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('Test runner crashed:', err);
  process.exit(1);
});
