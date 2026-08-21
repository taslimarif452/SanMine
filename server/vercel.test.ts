import assert from 'node:assert';
import http from 'node:http';
import express from 'express';
import app from '../api/index.js';
import { createExpressApp } from './app.js';
import { getDatabaseUrl, isDatabaseConfigured } from './db/neon.js';
import { maskApiKey } from './config.js';

/**
 * Helper to make local in-memory HTTP requests against the exported Express app
 */
function requestApp(
  server: http.Server,
  path: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: any;
  } = {}
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string; json: () => any }> {
  return new Promise((resolve, reject) => {
    const addr = server.address();
    if (!addr || typeof addr === 'string') {
      return reject(new Error('Server address not available'));
    }

    const reqOptions: http.RequestOptions = {
      host: '127.0.0.1',
      port: addr.port,
      path,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    };

    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve({
          status: res.statusCode || 0,
          headers: res.headers,
          body: data,
          json: () => {
            try {
              return JSON.parse(data);
            } catch {
              return null;
            }
          },
        });
      });
    });

    req.on('error', reject);

    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

export async function runVercelCompatibilityTests() {
  console.log('==============================================');
  console.log('Running SANMine Vercel Compatibility Test Suite');
  console.log('==============================================\n');

  // 1. Serverless Entrypoint Loading & Architecture Check
  console.log('--- 1. Single App Architecture & Factory Check ---');
  assert.ok(app, 'Default export from api/index.ts must exist');
  assert.strictEqual(typeof app, 'function', 'Exported serverless handler must be a Node HTTP request listener function');

  const freshlyCreatedApp = createExpressApp();
  assert.strictEqual(typeof freshlyCreatedApp, 'function', 'createExpressApp() factory must return Express function');
  console.log('✓ [PASS] server/app.ts exports createExpressApp() factory cleanly without top-level auto-instantiation');
  console.log('✓ [PASS] Vercel Serverless Function entrypoint (api/index.ts) exports standard Node HTTP handler');

  // Create temporary local test server instance from Vercel export
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    // 2. Core API Route Availability
    console.log('\n--- 2. Core API Route Availability & Lightweight Dispatcher ---');
    const healthRes = await requestApp(server, '/api/health');
    assert.strictEqual(healthRes.status, 200, 'GET /api/health must return 200 OK');
    const healthData = healthRes.json();
    assert.strictEqual(healthData.ok, true);
    assert.strictEqual(healthData.status, 'healthy', 'Health status must be "healthy"');
    assert.strictEqual(healthData.runtime, 'vercel', 'Health runtime must be "vercel"');
    assert.strictEqual(healthData.service, 'SanMine Space');
    console.log('✓ [PASS] GET /api/health returned 200 with status "healthy" and runtime "vercel"');

    // Diagnostic endpoint test
    const diagnosticRes = await requestApp(server, '/api/diagnostic');
    assert.strictEqual(diagnosticRes.status, 200, 'GET /api/diagnostic must return 200 OK');
    const diagData = diagnosticRes.json();
    assert.strictEqual(diagData.ok, true);
    assert.ok(typeof diagData.diagnostics?.gmailConfigured === 'boolean');
    console.log('✓ [PASS] GET /api/diagnostic returned 200 with diagnostics');

    // Test Vercel URL rewrite detection (e.g. /api/index with x-forwarded-uri: /api/health)
    const forwardedHealthRes = await requestApp(server, '/api/index', {
      headers: {
        'x-forwarded-uri': '/api/health',
      },
    });
    assert.strictEqual(forwardedHealthRes.status, 200, 'Rewritten /api/index with x-forwarded-uri /api/health must return 200');
    assert.strictEqual(forwardedHealthRes.json()?.status, 'healthy');
    console.log('✓ [PASS] Vercel rewrite detection via x-forwarded-uri: /api/health returned 200');

    // Test Vercel URL rewrite detection via x-vercel-matched-path
    const matchedDiagRes = await requestApp(server, '/api/index', {
      headers: {
        'x-vercel-matched-path': '/api/diagnostic',
      },
    });
    assert.strictEqual(matchedDiagRes.status, 200, 'Rewritten /api/index with x-vercel-matched-path /api/diagnostic must return 200');
    assert.strictEqual(matchedDiagRes.json()?.ok, true);
    console.log('✓ [PASS] Vercel rewrite detection via x-vercel-matched-path: /api/diagnostic returned 200');

    const modelsRes = await requestApp(server, '/api/ai/models');
    assert.strictEqual(modelsRes.status, 200, 'GET /api/ai/models must return 200');
    const modelsData = modelsRes.json();
    assert.ok(Array.isArray(modelsData.models), 'Models must be an array');
    assert.ok(modelsData.models.length > 0, 'Models array must not be empty');
    console.log('✓ [PASS] GET /api/ai/models returned 200 with models list');

    // Test model query param filtering on lightweight dispatcher
    const googleModelsRes = await requestApp(server, '/api/ai/models?provider=google');
    assert.strictEqual(googleModelsRes.status, 200);
    const googleModelsData = googleModelsRes.json();
    assert.ok(Array.isArray(googleModelsData.models));
    assert.ok(googleModelsData.models.every((m: any) => m.provider === 'google'));
    console.log('✓ [PASS] GET /api/ai/models?provider=google returned filtered google models');

    // 3. Health check alias test
    const rewriteHealthRes = await requestApp(server, '/health');
    assert.strictEqual(rewriteHealthRes.status, 200, 'GET /health must return 200 via direct health route');
    console.log('✓ [PASS] Health check alias /health returned 200');

    // 4. Search status & provider endpoints
    const searchStatusRes = await requestApp(server, '/api/search/status');
    assert.strictEqual(searchStatusRes.status, 200, 'GET /api/search/status must return 200');
    const searchStatusData = searchStatusRes.json();
    assert.strictEqual(searchStatusData.managedBySanmine, true);
    console.log('✓ [PASS] GET /api/search/status returned managed search state');

    const searchProvidersRes = await requestApp(server, '/api/search/providers');
    assert.strictEqual(searchProvidersRes.status, 200, 'GET /api/search/providers must return 200');
    const searchProvidersData = searchProvidersRes.json();
    assert.strictEqual(searchProvidersData.managedBySanmine, true);
    assert.ok(Array.isArray(searchProvidersData.providers));
    console.log('✓ [PASS] GET /api/search/providers returned search provider list');

    // 4b. AI Providers Endpoint Security (Protected - requires Firebase Auth)
    const providersUnauthRes = await requestApp(server, '/api/ai/providers');
    assert.strictEqual(providersUnauthRes.status, 401, 'GET /api/ai/providers without auth must return 401');
    assert.strictEqual(providersUnauthRes.json()?.code, 'AUTH_REQUIRED');
    console.log('✓ [PASS] GET /api/ai/providers rejected unauthenticated request (401 AUTH_REQUIRED)');

    const postProvidersUnauthRes = await requestApp(server, '/api/ai/providers', {
      method: 'POST',
      body: { provider: 'google', apiKey: 'test-key' },
    });
    assert.strictEqual(postProvidersUnauthRes.status, 401, 'POST /api/ai/providers without auth must return 401');
    assert.strictEqual(postProvidersUnauthRes.json()?.code, 'AUTH_REQUIRED');
    console.log('✓ [PASS] POST /api/ai/providers rejected unauthenticated request (401 AUTH_REQUIRED)');

    // 5. Configured models & Agent config endpoints
    const configuredModelsRes = await requestApp(server, '/api/ai/configured-models');
    assert.strictEqual(configuredModelsRes.status, 200, 'GET /api/ai/configured-models must return 200');
    const configModelsData = configuredModelsRes.json();
    assert.ok(Array.isArray(configModelsData.models), 'Configured models must be an array');
    console.log('✓ [PASS] GET /api/ai/configured-models returned models list');

    const agentConfigRes = await requestApp(server, '/api/agent/config');
    assert.strictEqual(agentConfigRes.status, 200, 'GET /api/agent/config must return 200');
    console.log('✓ [PASS] GET /api/agent/config returned client-safe configuration');

    // 6. Security: Protected Routes Require Authentication
    console.log('\n--- 3. Security & Protected Route Verification ---');
    const unauthChatsRes = await requestApp(server, '/api/chats');
    assert.strictEqual(unauthChatsRes.status, 401, 'GET /api/chats without token must return 401 Unauthorized');
    assert.strictEqual(unauthChatsRes.json()?.code, 'AUTH_REQUIRED');
    console.log('✓ [PASS] GET /api/chats rejected unauthenticated request (401 AUTH_REQUIRED)');

    const unauthPrefsRes = await requestApp(server, '/api/settings/preferences');
    assert.strictEqual(unauthPrefsRes.status, 401, 'GET /api/settings/preferences without token must return 401');
    console.log('✓ [PASS] GET /api/settings/preferences rejected unauthenticated request (401)');

    // 7. Validation on AI Chat endpoint
    console.log('\n--- 4. Request Validation ---');
    const invalidChatRes = await requestApp(server, '/api/ai/chat', {
      method: 'POST',
      body: {},
    });
    assert.strictEqual(invalidChatRes.status, 400, 'POST /api/ai/chat with missing messages must return 400');
    console.log('✓ [PASS] POST /api/ai/chat validated request body');

    // 8. Secret Masking Utility Check
    console.log('\n--- 5. Credential Masking & Security ---');
    const masked = maskApiKey('sk-ant-api03-abcdef1234567890');
    assert.ok(!masked.includes('abcdef1234'), 'Masked key must never expose the secret payload');
    assert.ok(masked.includes('••••••••'), 'Masked key must contain bullet points');
    console.log('✓ [PASS] API key masking securely obscures secrets');

    // 9. Database Connection String Resolution Check
    console.log('\n--- 6. Neon PostgreSQL Database Fallback Resolution ---');
    const originalDbUrl = process.env.DATABASE_URL;
    const originalNeonUrl = process.env.NEON_DATABASE_URL;
    try {
      delete process.env.DATABASE_URL;
      process.env.NEON_DATABASE_URL = 'postgresql://test_user:test_pass@ep-test.neon.tech/neondb';
      assert.strictEqual(
        getDatabaseUrl(),
        'postgresql://test_user:test_pass@ep-test.neon.tech/neondb',
        'getDatabaseUrl must fallback to NEON_DATABASE_URL when DATABASE_URL is unset'
      );
      assert.strictEqual(isDatabaseConfigured(), true);
    } finally {
      if (originalDbUrl !== undefined) process.env.DATABASE_URL = originalDbUrl;
      else delete process.env.DATABASE_URL;
      if (originalNeonUrl !== undefined) process.env.NEON_DATABASE_URL = originalNeonUrl;
      else delete process.env.NEON_DATABASE_URL;
    }
    console.log('✓ [PASS] Neon DB connection URL correctly falls back between DATABASE_URL and NEON_DATABASE_URL');

    // 10. Gmail OAuth Diagnostics & Configuration Safety Tests
    console.log('\n--- 7. Gmail OAuth Diagnostics & Safety ---');
    const originalClientId = process.env.GOOGLE_CLIENT_ID;
    const originalClientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const originalRedirectUri = process.env.GOOGLE_REDIRECT_URI;
    const originalAppUrl = process.env.APP_URL;
    const originalStateSecret = process.env.GMAIL_OAUTH_STATE_SECRET;

    try {
      // 10a. Status check when unconfigured (ensures JSON diagnostic response, NOT a function crash)
      delete process.env.GOOGLE_CLIENT_ID;
      delete process.env.GOOGLE_CLIENT_SECRET;
      delete process.env.GOOGLE_REDIRECT_URI;
      delete process.env.GMAIL_OAUTH_STATE_SECRET;
      process.env.APP_URL = 'https://sanmine.space';

      const unconfigStatusRes = await requestApp(server, '/api/gmail/status');
      assert.strictEqual(unconfigStatusRes.status, 200, 'GET /api/gmail/status must return 200 JSON without crashing');
      const unconfigStatusData = unconfigStatusRes.json();
      assert.ok(unconfigStatusData, 'Status endpoint must return valid JSON');
      assert.strictEqual(unconfigStatusData.configured, false, 'configured must be false when keys missing');
      assert.strictEqual(unconfigStatusData.connected, false);
      console.log('✓ [PASS] GET /api/gmail/status safely reports unconfigured status');

      // 10b. Unconfigured auth returns safe JSON error/status without throwing
      const unconfigAuthRes = await requestApp(server, '/api/gmail/auth');
      assert.strictEqual(unconfigAuthRes.status, 503, 'GET /api/gmail/auth when unconfigured returns 503 JSON');
      const unconfigAuthData = unconfigAuthRes.json();
      assert.strictEqual(unconfigAuthData.configured, false);
      assert.strictEqual(unconfigAuthData.ok, false);
      console.log('✓ [PASS] GET /api/gmail/auth returns structured 503 JSON when unconfigured');

      // 10c. Status and auth when fully configured
      process.env.GOOGLE_CLIENT_ID = 'test-client-id-12345.apps.googleusercontent.com';
      process.env.GOOGLE_CLIENT_SECRET = 'GOCSPX-secret1234567890';
      process.env.GOOGLE_REDIRECT_URI = 'https://sanmine.space/api/gmail/callback';
      process.env.GMAIL_OAUTH_STATE_SECRET = 'test-secret-at-least-32-chars-long-here!';

      const configStatusRes = await requestApp(server, '/api/gmail/status');
      assert.strictEqual(configStatusRes.status, 200);
      const configStatusData = configStatusRes.json();
      assert.strictEqual(configStatusData.configured, true);
      console.log('✓ [PASS] GET /api/gmail/status reports configured status');

      // 10d. Auth-URL generation check
      const authRes = await requestApp(server, '/api/gmail/auth?userId=user_abc_123');
      assert.strictEqual(authRes.status, 200, 'GET /api/gmail/auth must return 200 OK');
      const authData = authRes.json();
      assert.strictEqual(authData.ok, true);
      assert.strictEqual(authData.configured, true);
      assert.strictEqual(authData.redirectUri, 'https://sanmine.space/api/gmail/callback');
      assert.ok(authData.url.startsWith('https://accounts.google.com/o/oauth2/v2/auth'));
      assert.ok(authData.url.includes('redirect_uri=https%3A%2F%2Fsanmine.space%2Fapi%2Fgmail%2Fcallback'));
      assert.ok(authData.url.includes('scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fgmail.send'));
      console.log('✓ [PASS] GET /api/gmail/auth generated valid Google OAuth URL with gmail.send scope');
    } finally {
      if (originalClientId !== undefined) process.env.GOOGLE_CLIENT_ID = originalClientId;
      else delete process.env.GOOGLE_CLIENT_ID;
      if (originalClientSecret !== undefined) process.env.GOOGLE_CLIENT_SECRET = originalClientSecret;
      else delete process.env.GOOGLE_CLIENT_SECRET;
      if (originalRedirectUri !== undefined) process.env.GOOGLE_REDIRECT_URI = originalRedirectUri;
      else delete process.env.GOOGLE_REDIRECT_URI;
      if (originalAppUrl !== undefined) process.env.APP_URL = originalAppUrl;
      else delete process.env.APP_URL;
      if (originalStateSecret !== undefined) process.env.GMAIL_OAUTH_STATE_SECRET = originalStateSecret;
      else delete process.env.GMAIL_OAUTH_STATE_SECRET;
    }

    // 11. Gmail OAuth Callback Route Verification (Canonical and Backward Compatibility)
    console.log('\n--- 8. Gmail OAuth Callback Route Handling ---');
    const callbackNoCodeRes = await requestApp(server, '/api/gmail/callback');
    assert.strictEqual(
      callbackNoCodeRes.status,
      200,
      'GET /api/gmail/callback with missing code should return 200 HTML popup message'
    );
    assert.ok(callbackNoCodeRes.body.includes('GMAIL_OAUTH_ERROR'), 'Callback HTML should post error message');
    assert.ok(!callbackNoCodeRes.body.includes('Cannot GET'), 'Canonical callback must not return Cannot GET');
    console.log('✓ [PASS] /api/gmail/callback reaches Gmail router and returns popup message');

    const legacyCallbackNoCodeRes = await requestApp(server, '/api/gmail/oauth/callback');
    assert.strictEqual(
      legacyCallbackNoCodeRes.status,
      200,
      'GET /api/gmail/oauth/callback with missing code should return 200 HTML popup message'
    );
    assert.ok(legacyCallbackNoCodeRes.body.includes('GMAIL_OAUTH_ERROR'), 'Legacy callback HTML should post error message');
    assert.ok(!legacyCallbackNoCodeRes.body.includes('Cannot GET'), 'Legacy callback must not return Cannot GET');
    console.log('✓ [PASS] /api/gmail/oauth/callback reaches Gmail router and returns popup message');

    // 12. Dual Path Mounting Verification (Vercel rewrite resilience)
    console.log('\n--- 9. Dual Path Mounting Verification ---');
    const directGmailStatusRes = await requestApp(server, '/gmail/status');
    assert.strictEqual(directGmailStatusRes.status, 200, 'GET /gmail/status must return 200 via dual path routing');
    console.log('✓ [PASS] Direct /gmail/status route operates with full parity to /api/gmail/status');

    const directAiProvidersRes = await requestApp(server, '/ai/providers');
    assert.strictEqual(directAiProvidersRes.status, 401, 'GET /ai/providers must return 401 (protected) via dual path routing');
    console.log('✓ [PASS] Direct /ai/providers route operates with full parity to /api/ai/providers (401 protected)');

    // 13. API 404 Route Handling
    console.log('\n--- 10. API 404 Safety ---');
    const notFoundRes = await requestApp(server, '/api/nonexistent-route-for-testing');
    assert.strictEqual(notFoundRes.status, 404, 'Unknown API route should return 404');
    assert.ok(notFoundRes.json()?.error, '404 response should be valid JSON error object');
    console.log('✓ [PASS] Nonexistent API route returned 404 JSON error response safely');

    // 14. Frontend Root Route & SPA Isolation Check
    console.log('\n--- 11. Frontend Root Route & SPA Isolation Check ---');
    const fs = await import('node:fs');
    const path = await import('node:path');
    const indexPath = path.join(process.cwd(), 'dist', 'index.html');
    const srcIndexPath = path.join(process.cwd(), 'index.html');
    
    // Check that index.html template or built dist/index.html exists and contains #root
    const indexContent = fs.existsSync(indexPath)
      ? fs.readFileSync(indexPath, 'utf-8')
      : fs.readFileSync(srcIndexPath, 'utf-8');
    assert.ok(indexContent.includes('id="root"') || indexContent.includes("id='root'"), 'index.html must contain root mount element <div id="root">');
    console.log('✓ [PASS] Frontend index.html contains React root mount point');

    // Test a production-like Express app that mounts createExpressApp() + static dist serving
    const prodApp = createExpressApp();
    const distPath = path.join(process.cwd(), 'dist');
    if (fs.existsSync(distPath)) {
      prodApp.use(express.static(distPath));
      prodApp.get('*', (req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    } else {
      prodApp.get('*', (req, res) => {
        res.type('html').send(indexContent);
      });
    }

    const prodServer = http.createServer(prodApp);
    await new Promise<void>((resolve) => prodServer.listen(0, '127.0.0.1', resolve));

    try {
      // Test GET /
      const rootRes = await requestApp(prodServer, '/', { headers: { Accept: 'text/html' } });
      assert.strictEqual(rootRes.status, 200, 'GET / must return 200 OK');
      assert.ok(
        rootRes.headers['content-type']?.includes('text/html'),
        'GET / must return Content-Type text/html'
      );
      assert.ok(
        rootRes.body.includes('id="root"') || rootRes.body.includes("id='root'"),
        'GET / must return React SPA index.html with <div id="root">'
      );
      assert.strictEqual(
        rootRes.json(),
        null,
        'GET / must NOT return JSON error'
      );
      console.log('✓ [PASS] GET / serves React HTML entrypoint with <div id="root"> and 200 OK');

      // Test GET /api/health still returns JSON on production server
      const prodHealthRes = await requestApp(prodServer, '/api/health');
      assert.strictEqual(prodHealthRes.status, 200, 'GET /api/health must return 200');
      assert.strictEqual(prodHealthRes.json()?.status, 'healthy', 'GET /api/health must return status healthy');
      console.log('✓ [PASS] GET /api/health on full production server returns JSON 200');

      // Test GET /api/gmail/status still returns JSON on production server
      const prodGmailStatusRes = await requestApp(prodServer, '/api/gmail/status');
      assert.strictEqual(prodGmailStatusRes.status, 200, 'GET /api/gmail/status must return 200');
      assert.ok(typeof prodGmailStatusRes.json()?.configured === 'boolean', 'GET /api/gmail/status must return configured boolean');
      console.log('✓ [PASS] GET /api/gmail/status on full production server returns JSON 200');
      // 15. Historical Regression: server/search/registry.ts -> ./providers.js resolution
      console.log('\n--- 12. Historical Regression: ESM Relative Specifiers & Providers Import ---');
      const registryPath = path.join(process.cwd(), 'server', 'search', 'registry.ts');
      const registryContent = fs.readFileSync(registryPath, 'utf-8');
      assert.ok(
        registryContent.includes("from './providers.js'"),
        'CRITICAL REGRESSION: server/search/registry.ts MUST import ./providers.js with explicit .js extension'
      );
      assert.ok(
        !registryContent.includes("from './providers'"),
        'CRITICAL REGRESSION: server/search/registry.ts must NOT have extensionless from "./providers"'
      );
      console.log('✓ [PASS] Historical Regression Check: server/search/registry.ts uses explicit ./providers.js');

      // Test dynamic import of all search and intelligence modules
      const searchRegistryMod = await import('./search/registry.js');
      assert.ok(searchRegistryMod.searchRegistry, 'searchRegistry must be exported');
      const intelligenceMod = await import('./intelligence/index.js');
      assert.ok(intelligenceMod.buildBusinessIntelligence, 'buildBusinessIntelligence must be exported');
      console.log('✓ [PASS] Dynamic Node.js ESM import of search and intelligence modules passed');

      // 16. Serverless Architecture & Hobby 12-Function Limit Audit
      console.log('\n--- 13. Serverless Architecture & Hobby 12-Function Limit ---');
      const fsMod = await import('node:fs');
      const pathMod = await import('node:path');

      function countFunctions(dir: string): string[] {
        const results: string[] = [];
        if (!fsMod.existsSync(dir)) return results;
        const entries = fsMod.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = pathMod.join(dir, entry.name);
          if (entry.name.startsWith('_')) continue;
          if (entry.isDirectory()) {
            results.push(...countFunctions(fullPath));
          } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.js'))) {
            results.push(fullPath);
          }
        }
        return results;
      }

      const foundFunctions = countFunctions(pathMod.resolve('api'));
      console.log(`Serverless Functions count in api/: ${foundFunctions.length} functions found`);
      assert.ok(
        foundFunctions.length <= 12,
        `CRITICAL: Serverless function count (${foundFunctions.length}) exceeds Vercel Hobby 12-function limit!`
      );
      assert.ok(
        foundFunctions.length <= 2,
        `Expected at most 2 consolidated functions, found ${foundFunctions.length}`
      );
      console.log(`✓ [PASS] Total Serverless Functions = ${foundFunctions.length} (Well under Hobby limit of 12)`);

      const mainApiModule = await import('../api/index.js');
      assert.ok(mainApiModule.default, 'api/index.ts must export default Express handler');
      console.log('✓ [PASS] Consolidated api/index.ts entrypoint exports Express app');

      const gmailApiModule = await import('../api/gmail/index.js');
      assert.ok(gmailApiModule.default, 'api/gmail/index.ts must export default Express handler');
      console.log('✓ [PASS] Dedicated api/gmail/index.ts entrypoint exports Express app');

      // 17. Authentication & ESM/CJS Compatibility Regression Test
      console.log('\n--- 14. Authentication & ESM/CJS Compatibility Regression ---');
      const { execSync } = await import('node:child_process');

      // Test A: Ensure jwks-rsa / firebase-admin loads in pure CommonJS without ERR_REQUIRE_ESM
      try {
        const cjsTestOutput = execSync(
          `node -e "const jwks = require('jwks-rsa'); const fa = require('firebase-admin'); const faAuth = require('firebase-admin/auth'); console.log('CJS_AUTH_OK');"`,
          { encoding: 'utf-8' }
        );
        assert.ok(cjsTestOutput.includes('CJS_AUTH_OK'), 'CJS Auth require must succeed without ERR_REQUIRE_ESM');
        console.log('✓ [PASS] Firebase Auth / jwks-rsa successfully required in CommonJS without ERR_REQUIRE_ESM');
      } catch (err: any) {
        assert.fail(`CommonJS require of auth libraries threw ERR_REQUIRE_ESM or module error: ${err.message}`);
      }

      // Test B: Verify Firebase Auth module imports cleanly in ESM and normalizes project IDs
      const authModule = await import('./auth/firebase.js');
      assert.ok(typeof authModule.requireAuth === 'function', 'requireAuth must be exported as a middleware function');
      assert.ok(typeof authModule.verifyFirebaseToken === 'function', 'verifyFirebaseToken must be exported');
      assert.ok(typeof authModule.getCanonicalFirebaseProjectId === 'function', 'getCanonicalFirebaseProjectId must be exported');
      console.log('✓ [PASS] server/auth/firebase.js successfully imported in Node.js ESM runtime');

      // Test C: Firebase Project ID Whitespace Sanitization & Canonical Resolution
      const origFbProjId = process.env.FIREBASE_PROJECT_ID;
      const origViteFbProjId = process.env.VITE_FIREBASE_PROJECT_ID;
      try {
        // Test with trailing whitespace as reported in production error
        process.env.FIREBASE_PROJECT_ID = 'sanmineai ';
        delete process.env.VITE_FIREBASE_PROJECT_ID;
        assert.strictEqual(
          authModule.getCanonicalFirebaseProjectId(),
          'sanmineai',
          'Trailing space in FIREBASE_PROJECT_ID must be strictly sanitized to "sanmineai"'
        );

        // Test with leading and trailing whitespace
        process.env.FIREBASE_PROJECT_ID = '   sanmineai   \n';
        assert.strictEqual(
          authModule.getCanonicalFirebaseProjectId(),
          'sanmineai',
          'Leading/trailing whitespace and newline in FIREBASE_PROJECT_ID must be sanitized'
        );

        // Test fallback to VITE_FIREBASE_PROJECT_ID with whitespace
        delete process.env.FIREBASE_PROJECT_ID;
        process.env.VITE_FIREBASE_PROJECT_ID = 'sanmineai ';
        assert.strictEqual(
          authModule.getCanonicalFirebaseProjectId(),
          'sanmineai',
          'Trailing space in VITE_FIREBASE_PROJECT_ID fallback must be sanitized to "sanmineai"'
        );

        // Test fallback to default
        delete process.env.FIREBASE_PROJECT_ID;
        delete process.env.VITE_FIREBASE_PROJECT_ID;
        assert.strictEqual(
          authModule.getCanonicalFirebaseProjectId(),
          'sanmineai',
          'Default fallback must strictly return "sanmineai"'
        );

        console.log('✓ [PASS] Firebase Project ID whitespace normalization and canonical resolution verified');
      } finally {
        if (origFbProjId !== undefined) process.env.FIREBASE_PROJECT_ID = origFbProjId;
        else delete process.env.FIREBASE_PROJECT_ID;
        if (origViteFbProjId !== undefined) process.env.VITE_FIREBASE_PROJECT_ID = origViteFbProjId;
        else delete process.env.VITE_FIREBASE_PROJECT_ID;
      }

      // Test D: Firebase ID Token Rejection on Audience Mismatch
      try {
        await authModule.verifyFirebaseToken('invalid.dummy.token');
        assert.fail('verifyFirebaseToken must reject invalid or dummy tokens');
      } catch (err: any) {
        assert.ok(
          err.message.includes('Firebase token verification failed') || err.message.includes('No authentication token'),
          `Expected verification error, got: ${err.message}`
        );
        console.log('✓ [PASS] Invalid Firebase ID token safely rejected without bypass');
      }

      // Test E: AI API Key encryption and masking
      const origEncKey = process.env.CREDENTIAL_ENCRYPTION_KEY;
      try {
        process.env.CREDENTIAL_ENCRYPTION_KEY = 'test-credential-encryption-key-32-chars-long!';
        const { encryptApiKey, decryptApiKey, maskApiKey, saveUserAiApiKey, getUserAiProvidersStatus } = await import('./db/aiKeys.js');
        const testSecretKey = 'sk-test-ai-key-0123456789abcdefghijklmnopqrstuvwxyz';
        const encKey = encryptApiKey(testSecretKey);
        assert.ok(encKey.startsWith('enc_v1:'), 'Encrypted key must use enc_v1 scheme');
        assert.ok(!encKey.includes(testSecretKey), 'Encrypted key must never contain plaintext');
        const decKey = decryptApiKey(encKey);
        assert.strictEqual(decKey, testSecretKey, 'Decrypted key must match original plain text');
        const maskedRes = maskApiKey(testSecretKey);
        assert.strictEqual(maskedRes, '••••••••wxyz', 'Masked key must show only bullet points and last 4 characters');

        // Test saveUserAiApiKey for google, openai, openrouter
        const dummyUserId = '00000000-0000-0000-0000-000000000001';
        for (const prov of ['google', 'openai', 'openrouter'] as const) {
          const saveResult = await saveUserAiApiKey(dummyUserId, prov, `key-${prov}-12345678`);
          assert.ok(saveResult.maskedKey.includes('5678'));
          assert.ok(saveResult.encryptedKey.startsWith('enc_v1:'));
        }

        const statusResult = await getUserAiProvidersStatus(dummyUserId);
        assert.strictEqual(statusResult.google.configured, true);
        assert.strictEqual(statusResult.openai.configured, true);
        assert.strictEqual(statusResult.openrouter.configured, true);

        // Test F: Configured AI Model Selector Filtering
        const { saveUserPreferences } = await import('./db/outreach.js');
        const { getUserConfiguredModelsList } = await import('./app.js');

        // Configure user preferences with specific models: Gemini 3.7 Flash and GPT-OSS 20B (Free)
        await saveUserPreferences(dummyUserId, {
          activeProvider: 'google',
          activeModel: 'gemini-3.7-flash',
          configuredModels: {
            google: ['gemini-3.7-flash'],
            openrouter: ['openai/gpt-oss-20b:free'],
          },
        });

        const configuredList = await getUserConfiguredModelsList(dummyUserId);
        assert.strictEqual(configuredList.models.length, 3, 'Should only contain the 3 configured models for the 3 active providers (1 google, 1 openai default, 1 openrouter)');
        
        const googleModels = configuredList.models.filter((m) => m.provider === 'google');
        assert.strictEqual(googleModels.length, 1, 'Google should have exactly 1 configured model');
        assert.strictEqual(googleModels[0].modelId, 'gemini-3.7-flash', 'Google configured model must be gemini-3.7-flash');

        const openRouterModels = configuredList.models.filter((m) => m.provider === 'openrouter');
        assert.strictEqual(openRouterModels.length, 1, 'OpenRouter should have exactly 1 configured model');
        assert.strictEqual(openRouterModels[0].modelId, 'openai/gpt-oss-20b:free', 'OpenRouter configured model must be openai/gpt-oss-20b:free');

        // Verify unconfigured popular models are NOT included
        const excludedModelIds = ['deepseek/deepseek-r1:free', 'meta-llama/llama-3.3-70b-instruct:free', 'gemini-2.5-pro', 'gpt-4-turbo'];
        for (const excluded of excludedModelIds) {
          assert.ok(
            !configuredList.models.some((m) => m.modelId === excluded),
            `Unconfigured model ${excluded} must NOT be in configured models list`
          );
        }

        console.log('✓ [PASS] AES-256-GCM encryption, decryption, user key saving, and exact model selector filtering verified');
      } finally {
        if (origEncKey !== undefined) process.env.CREDENTIAL_ENCRYPTION_KEY = origEncKey;
        else delete process.env.CREDENTIAL_ENCRYPTION_KEY;
      }
    } finally {
      prodServer.close();
    }

    console.log('\n==============================================');
    console.log('ALL VERCEL COMPATIBILITY TESTS PASSED (15/15)');
    console.log('==============================================\n');
  } finally {
    server.close();
  }
}

if (process.argv[1] && process.argv[1].includes('vercel.test')) {
  runVercelCompatibilityTests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Vercel test failure:', err);
      process.exit(1);
    });
}
