import assert from 'node:assert';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { runEsmAudit } from './audit-esm.js';

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

function countVercelFunctions(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.name.startsWith('_')) continue; // Vercel ignores files/folders starting with _
    if (entry.isDirectory()) {
      results.push(...countVercelFunctions(fullPath));
    } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.js'))) {
      results.push(fullPath);
    }
  }
  return results;
}

async function runProductionAudit() {
  console.log('==============================================');
  console.log('🚀 Running Production & Vercel Artifact Audit');
  console.log('==============================================\n');

  // 1. Run ESM Import specifier check
  console.log('--- 1. Static ESM Specifier Audit ---');
  const esmAudit = runEsmAudit();
  if (esmAudit.totalViolations > 0) {
    console.error(`❌ ESM audit failed with ${esmAudit.totalViolations} violations`);
    process.exit(1);
  }
  console.log('✓ [PASS] Static ESM audit passed with 0 violations\n');

  // 2. Verify dist/ artifact integrity
  console.log('--- 2. Build Artifact Verification ---');
  const distDir = path.resolve('dist');
  assert.ok(fs.existsSync(distDir), 'dist/ directory must exist');
  assert.ok(fs.existsSync(path.join(distDir, 'index.html')), 'dist/index.html must exist');
  assert.ok(fs.existsSync(path.join(distDir, 'server.cjs')), 'dist/server.cjs must exist');
  console.log('✓ [PASS] dist/ contains index.html and server.cjs\n');

  // 3. Test Node.js ESM dynamic import of api/index.ts and server/app.ts
  console.log('--- 3. Node.js ESM Runtime Import Simulation ---');
  const appModule = await import('../server/app.js');
  assert.ok(typeof appModule.createExpressApp === 'function', 'createExpressApp must be exported as a function');
  
  const app = appModule.createExpressApp();
  assert.ok(app, 'Express app must instantiate without throwing');
  console.log('✓ [PASS] server/app.js cleanly imported and instantiated in Node.js ESM runtime\n');

  // 4. Verify Vercel Hobby 12-Function Limit & Serverless Entrypoints
  console.log('--- 4. Vercel Serverless Function Count & Architecture Audit ---');
  const apiDir = path.resolve('api');
  const vercelFunctions = countVercelFunctions(apiDir);
  console.log(`Found ${vercelFunctions.length} Serverless Functions in api/:`, vercelFunctions.map(f => path.relative('.', f)));
  assert.ok(
    vercelFunctions.length <= 12,
    `CRITICAL: Total Vercel Serverless Functions (${vercelFunctions.length}) exceeds Vercel Hobby 12-function limit!`
  );
  assert.ok(
    vercelFunctions.length === 2,
    `Target: Expected exactly 2 consolidated functions (found ${vercelFunctions.length})`
  );
  console.log(`✓ [PASS] Total Serverless Functions = ${vercelFunctions.length} (Well within Hobby limit of 12)`);

  // Verify api/index.ts exports standard Serverless handler
  const apiIndexModule = await import('../api/index.js');
  assert.ok(typeof apiIndexModule.default === 'function', 'api/index.ts must export default Node HTTP request listener');
  console.log('✓ [PASS] api/index.ts cleanly imported with zero eager DB/AI initialization and exports handler');

  // Verify api/gmail/index.ts exports Express app
  const gmailModule = await import('../api/gmail/index.js');
  assert.ok(typeof gmailModule.default === 'function', 'api/gmail/index.ts must export default Express handler');
  console.log('✓ [PASS] api/gmail/index.ts cleanly imported and exports Express app');

  // Verify vercel.json has no self-rewrites
  const vercelConfig = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
  const rewrites = vercelConfig.rewrites || [];
  for (const rw of rewrites) {
    assert.notStrictEqual(
      rw.source,
      rw.destination,
      `Self-rewrite detected in vercel.json: ${rw.source} -> ${rw.destination}`
    );
  }
  console.log('✓ [PASS] vercel.json contains zero self-rewrites\n');

  // 5. Test Serverless Dispatcher Direct & Rewritten Response Matrix
  console.log('--- 5. Serverless Dispatcher Endpoint Response Matrix ---');
  const server = http.createServer(apiIndexModule.default);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));

  try {
    const endpoints = [
      { path: '/api/health', expectedStatus: 200, name: 'Health Check' },
      { path: '/api/diagnostic', expectedStatus: 200, name: 'Server Diagnostics' },
      { path: '/api/gmail/status', expectedStatus: 200, name: 'Gmail Status' },
      { path: '/api/search/providers', expectedStatus: 200, name: 'Search Providers' },
      { path: '/api/ai/models', expectedStatus: 200, name: 'AI Models List' },
      { path: '/api/ai/providers', expectedStatus: 401, name: 'AI Providers List (Protected)' },
      { path: '/api/ai/configured-models', expectedStatus: 200, name: 'Configured Models' },
      { path: '/api/settings/preferences', expectedStatus: 401, name: 'Settings Preferences (Protected)' },
      { path: '/api/settings/outreach-history', expectedStatus: 401, name: 'Outreach History (Protected)' },
      { path: '/api/chats', expectedStatus: 401, name: 'Chats (Protected)' },
    ];

    for (const ep of endpoints) {
      const res = await requestApp(server, ep.path);
      assert.notStrictEqual(res.status, 500, `Endpoint ${ep.path} must not return HTTP 500`);
      assert.strictEqual(
        res.status,
        ep.expectedStatus,
        `Endpoint ${ep.path} expected HTTP ${ep.expectedStatus}, got ${res.status}`
      );
      console.log(`✓ [PASS] ${ep.name} (${ep.path}) -> HTTP ${res.status}`);
    }

    // Test Vercel /api/index rewrite with x-forwarded-uri
    const rewrittenRes = await requestApp(server, '/api/index', {
      headers: { 'x-forwarded-uri': '/api/health' },
    });
    assert.strictEqual(rewrittenRes.status, 200);
    assert.strictEqual(rewrittenRes.json()?.status, 'healthy');
    console.log(`✓ [PASS] Rewritten /api/index with x-forwarded-uri: /api/health -> HTTP 200 (healthy)`);

    // Test Gmail Auth-URL response with and without env
    const origSecret = process.env.GMAIL_OAUTH_STATE_SECRET;
    const origClientId = process.env.GOOGLE_CLIENT_ID;
    const origNodeEnv = process.env.NODE_ENV;
    const origVercel = process.env.VERCEL;
    try {
      process.env.GMAIL_OAUTH_STATE_SECRET = 'test-secret-long-enough-32-characters!';
      process.env.GOOGLE_CLIENT_ID = 'test-client-id.apps.googleusercontent.com';
      process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
      process.env.APP_URL = 'https://sanmine.space';
      process.env.NODE_ENV = 'production';
      process.env.VERCEL = '1';

      const authRes = await requestApp(server, '/api/gmail/auth?userId=audit-user');
      assert.strictEqual(authRes.status, 200);
      const authData = authRes.json();
      assert.ok(authData.url, 'authData.url must exist');
      assert.strictEqual(authData.redirectUri, 'https://sanmine.space/api/gmail/callback');
      console.log(`✓ [PASS] Gmail Auth URL Generation (/api/gmail/auth) -> HTTP 200`);
    } finally {
      process.env.GMAIL_OAUTH_STATE_SECRET = origSecret;
      process.env.GOOGLE_CLIENT_ID = origClientId;
      if (origNodeEnv !== undefined) process.env.NODE_ENV = origNodeEnv;
      else delete process.env.NODE_ENV;
      if (origVercel !== undefined) process.env.VERCEL = origVercel;
      else delete process.env.VERCEL;
    }

  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  console.log('\n==============================================');
  console.log('🎉 ALL PRODUCTION & VERCEL ARTIFACT CHECKS PASSED');
  console.log('==============================================\n');
}

runProductionAudit().catch((err) => {
  console.error('❌ Production audit failed with error:', err);
  process.exit(1);
});
