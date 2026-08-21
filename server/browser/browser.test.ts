import assert from 'node:assert';
import {
  LiveBrowserSession,
  LiveBrowserProvider,
  RemoteCdpBrowserProvider,
  getBrowserProvider,
  HttpFallbackBrowserSession,
  detectPageRestrictions,
  browserSessionManager,
  BrowserSessionManager,
  browserTools,
} from './index.js';
import { executeTool, getRegisteredTools, getGeminiToolDeclarations, getOpenRouterToolDefinitions } from '../tools.js';

async function runBrowserTests() {
  console.log('==============================================');
  console.log('🌐 Running SANMine Live Browser Architecture Tests');
  console.log('==============================================\n');

  // 1. LiveBrowserSession State & Lifecycle
  console.log('--- 1. LiveBrowserSession State & Lifecycle ---');
  const session = new LiveBrowserSession({
    userId: 'test-user-1',
    sessionId: 'session-test-1',
  });

  assert.strictEqual(session.id, 'session-test-1');
  assert.strictEqual(session.userId, 'test-user-1');

  const initialState = session.getState();
  assert.strictEqual(initialState.status, 'idle');
  assert.strictEqual(initialState.currentUrl, 'about:blank');
  assert.strictEqual(initialState.history.length, 0);
  assert.ok(initialState.mode === 'live_browser' || initialState.mode === 'http_fallback');
  assert.strictEqual(session.getMode(), initialState.mode);
  console.log(`✓ [PASS] Initial session state verified (Mode: ${initialState.mode})`);

  // 2. Navigation & HTML / Title Extraction
  console.log('--- 2. Live Browser Navigation ---');
  const navResult = await session.navigate('https://example.com');
  assert.strictEqual(navResult.success, true);
  assert.strictEqual(navResult.action, 'navigate');
  assert.ok(navResult.url?.includes('example.com'));
  assert.ok(navResult.title?.length! > 0);
  assert.ok(navResult.text?.length! > 0);

  const stateAfterNav = session.getState();
  assert.strictEqual(stateAfterNav.history.length, 1);
  assert.strictEqual(stateAfterNav.currentUrl, navResult.url);
  console.log(`✓ [PASS] Navigation succeeded (Title: "${navResult.title}")`);

  // 3. Content Extraction & Headings
  console.log('--- 3. Content & Structure Extraction ---');
  const contentResult = await session.extractContent();
  assert.strictEqual(contentResult.success, true);
  assert.strictEqual(contentResult.action, 'extract_content');
  assert.ok(contentResult.data);
  assert.ok(Array.isArray(contentResult.data.headings.h1));
  console.log(`✓ [PASS] Extracted headings and text content`);

  // 4. Interactive Simulation (Type, Click, Scroll, Wait, Press, History)
  console.log('--- 4. Interactive DOM & History Navigation ---');
  const typeResult = await session.type('input[name="search"]', 'best local business', { clearFirst: true });
  assert.strictEqual(typeResult.success, true);
  assert.strictEqual(typeResult.action, 'type');
  assert.strictEqual(typeResult.data.value, 'best local business');

  const pressResult = await session.press('Enter');
  assert.strictEqual(pressResult.success, true);
  assert.strictEqual(pressResult.action, 'press');

  const clickResult = await session.click('button.submit');
  assert.strictEqual(clickResult.success, true);
  assert.strictEqual(clickResult.action, 'click');

  const scrollResult = await session.scroll('down', 300);
  assert.strictEqual(scrollResult.success, true);
  assert.strictEqual(scrollResult.action, 'scroll');

  const waitResult = await session.waitFor(100);
  assert.strictEqual(waitResult.success, true);
  assert.strictEqual(waitResult.action, 'wait');

  const reloadResult = await session.reload();
  assert.strictEqual(reloadResult.success, true);
  assert.strictEqual(reloadResult.action, 'reload');

  const screenshotResult = await session.screenshot();
  assert.strictEqual(screenshotResult.success, true);
  assert.strictEqual(screenshotResult.action, 'screenshot');
  console.log('✓ [PASS] Interactive actions (type, press, click, scroll, wait, reload, screenshot) succeeded');

  // 5. Block & Authentication Wall Detection
  console.log('--- 5. Block & Authentication Wall Detection ---');
  const auth401 = detectPageRestrictions(401, 'https://private.api.com', 'Unauthorized');
  assert.strictEqual(auth401.isBlocked, true);
  assert.strictEqual(auth401.errorCode, 'AUTH_REQUIRED');

  const auth403 = detectPageRestrictions(403, 'https://secure.site.com', 'Forbidden');
  assert.strictEqual(auth403.isBlocked, true);
  assert.strictEqual(auth403.errorCode, 'AUTH_REQUIRED');

  const rateLimit429 = detectPageRestrictions(429, 'https://api.rate.com', 'Too many requests');
  assert.strictEqual(rateLimit429.isBlocked, true);
  assert.strictEqual(rateLimit429.errorCode, 'BLOCKED');

  const cfChallenge = detectPageRestrictions(200, 'https://protected.com', '<html><body>Attention Required! | Cloudflare Just a moment...</body></html>');
  assert.strictEqual(cfChallenge.isBlocked, true);
  assert.strictEqual(cfChallenge.errorCode, 'BLOCKED');

  const cleanSite = detectPageRestrictions(200, 'https://mycompany.com', '<html><head><title>Welcome</title></head><body>Hello world</body></html>');
  assert.strictEqual(cleanSite.isBlocked, false);
  console.log('✓ [PASS] Block and authentication detection accurately flags restricted pages');

  // 6. Remote CDP Browser Provider & Configuration
  console.log('--- 6. Remote CDP Browser Provider & Endpoint Discovery ---');
  const remoteProvider = new RemoteCdpBrowserProvider('ws://localhost:9222/devtools/browser');
  assert.strictEqual(remoteProvider.id, 'remote-cdp-provider');
  assert.strictEqual(remoteProvider.mode, 'live_browser');
  assert.strictEqual(remoteProvider.isAvailable(), true);

  const defaultProv = getBrowserProvider();
  assert.ok(defaultProv);
  console.log('✓ [PASS] Remote CDP provider configured and verified');

  // 7. Session Manager Isolation & Cleanup
  console.log('--- 7. Session Manager Tenant Isolation & Lifecycle ---');
  const mgr = new BrowserSessionManager({ maxSessionsPerUser: 2, sessionTimeoutMs: 500 });
  const userASession1 = await mgr.getOrCreateSession('userA', 'session-a-1');
  const userASession2 = await mgr.getOrCreateSession('userA', 'session-a-2');

  assert.strictEqual(userASession1.userId, 'userA');
  assert.strictEqual(userASession2.userId, 'userA');

  // User B cannot access User A's session
  const unauthorizedFetch = mgr.getSession('session-a-1', 'userB');
  assert.strictEqual(unauthorizedFetch, undefined, 'User B must not access User A session');

  const authorizedFetch = mgr.getSession('session-a-1', 'userA');
  assert.ok(authorizedFetch !== undefined, 'User A should access own session');

  const listA = mgr.listUserSessions('userA');
  assert.strictEqual(listA.length, 2);

  // Exceeding limit closes oldest
  const userASession3 = await mgr.getOrCreateSession('userA', 'session-a-3');
  const listAAfterLimit = mgr.listUserSessions('userA');
  assert.strictEqual(listAAfterLimit.length, 2);
  assert.ok(listAAfterLimit.some((s) => s.id === 'session-a-3'));

  // Close session
  const closed = await mgr.closeSession('session-a-3', 'userA');
  assert.strictEqual(closed, true);
  assert.strictEqual(mgr.getSession('session-a-3', 'userA'), undefined);
  console.log('✓ [PASS] Session manager tenant isolation and eviction policies verified');

  // 8. Tool Registry Integration & Declarations
  console.log('--- 8. Backend Tool Registry & Web Research Integration ---');
  const registered = getRegisteredTools();
  const registeredNames = registered.map((t) => t.name);

  assert.ok(registeredNames.includes('browser_navigate'), 'browser_navigate tool must be registered');
  assert.ok(registeredNames.includes('browser_click'), 'browser_click tool must be registered');
  assert.ok(registeredNames.includes('browser_type'), 'browser_type tool must be registered');
  assert.ok(registeredNames.includes('browser_press'), 'browser_press tool must be registered');
  assert.ok(registeredNames.includes('browser_screenshot'), 'browser_screenshot tool must be registered');
  assert.ok(registeredNames.includes('browser_extract_content'), 'browser_extract_content tool must be registered');
  assert.ok(registeredNames.includes('browser_go_back'), 'browser_go_back tool must be registered');
  assert.ok(registeredNames.includes('browser_go_forward'), 'browser_go_forward tool must be registered');
  assert.ok(registeredNames.includes('browser_reload'), 'browser_reload tool must be registered');
  assert.ok(registeredNames.includes('browser_session_status'), 'browser_session_status tool must be registered');
  assert.ok(registeredNames.includes('browser_close'), 'browser_close tool must be registered');
  assert.ok(registeredNames.includes('web_research'), 'web_research tool must be registered');

  // Test executeTool with context
  const toolNavRes = await executeTool(
    'browser_navigate',
    { url: 'https://example.com' },
    undefined,
    { userId: 'test-agent-user' }
  );
  assert.strictEqual(toolNavRes.success, true);
  assert.ok(toolNavRes.sessionId);

  const toolStatusRes = await executeTool(
    'browser_session_status',
    { sessionId: toolNavRes.sessionId },
    undefined,
    { userId: 'test-agent-user' }
  );
  assert.strictEqual(toolStatusRes.success, true);
  assert.strictEqual(toolStatusRes.session.userId, 'test-agent-user');

  // Test web_research tool execution
  const webResearchRes = await executeTool(
    'web_research',
    { query: 'bakeries', location: 'Srinagar', limit: 2 },
    undefined,
    { userId: 'test-agent-user' }
  );
  assert.strictEqual(webResearchRes.success, true);
  assert.ok(Array.isArray(webResearchRes.businesses));
  assert.ok(Array.isArray(webResearchRes.sources));
  console.log(`✓ [PASS] Web research tool executed successfully (Discovered: ${webResearchRes.businesses.length} leads)`);

  // Declarations for AI models
  const geminiDecls = getGeminiToolDeclarations();
  assert.ok(geminiDecls.some((d) => d.name === 'browser_navigate'));
  assert.ok(geminiDecls.some((d) => d.name === 'web_research'));

  const openAiDecls = getOpenRouterToolDefinitions();
  assert.ok(openAiDecls.some((d) => d.function.name === 'browser_navigate'));
  assert.ok(openAiDecls.some((d) => d.function.name === 'web_research'));
  console.log('✓ [PASS] Tool registry execution and AI tool schema declarations verified');

  console.log('\n==============================================');
  console.log('🎉 ALL LIVE BROWSER TESTS PASSED (8/8)');
  console.log('==============================================\n');
}

runBrowserTests().catch((err) => {
  console.error('❌ Browser tests failed:', err);
  process.exit(1);
});
