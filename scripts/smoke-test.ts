import https from 'node:https';
import http from 'node:http';

interface SmokeResult {
  endpoint: string;
  url: string;
  status: number | string;
  ok: boolean;
  contentType: string;
  isJson: boolean;
  hasInvocationError: boolean;
  hasModuleNotFoundError: boolean;
  error?: string;
}

const PRODUCTION_DOMAIN = process.env.PRODUCTION_DOMAIN || 'https://sanmine.space';

const SMOKE_ENDPOINTS = [
  '/api/health',
  '/api/diagnostic',
  '/api/gmail/auth?userId=smoke_test_runner',
  '/api/gmail/status',
  '/api/search/providers',
  '/api/ai/models',
  '/api/ai/providers',
  '/api/settings/preferences',
  '/api/chats',
];

function fetchEndpoint(urlStr: string): Promise<SmokeResult> {
  return new Promise((resolve) => {
    const parsed = new URL(urlStr);
    const client = parsed.protocol === 'https:' ? https : http;

    const req = client.get(
      urlStr,
      {
        headers: {
          'User-Agent': 'Sanmine-SmokeTest/1.0',
          Accept: 'application/json, text/plain, */*',
        },
        timeout: 10000,
      },
      (res) => {
        let rawData = '';
        res.on('data', (chunk) => {
          rawData += chunk;
        });
        res.on('end', () => {
          const contentType = res.headers['content-type'] || '';
          let isJson = false;
          try {
            JSON.parse(rawData);
            isJson = true;
          } catch {
            isJson = false;
          }

          const hasInvocationError =
            rawData.includes('FUNCTION_INVOCATION_FAILED') ||
            rawData.includes('Function Invocation Failed') ||
            rawData.includes('INTERNAL_FUNCTION_ERROR');

          const hasModuleNotFoundError =
            rawData.includes('ERR_MODULE_NOT_FOUND') ||
            rawData.includes('Cannot find module') ||
            rawData.includes('ERR_UNSUPPORTED_DIR_IMPORT');

          resolve({
            endpoint: parsed.pathname + parsed.search,
            url: urlStr,
            status: res.statusCode || 0,
            ok: (res.statusCode || 0) < 500 && !hasInvocationError && !hasModuleNotFoundError,
            contentType,
            isJson,
            hasInvocationError,
            hasModuleNotFoundError,
          });
        });
      }
    );

    req.on('timeout', () => {
      req.destroy();
      resolve({
        endpoint: parsed.pathname + parsed.search,
        url: urlStr,
        status: 'TIMEOUT',
        ok: false,
        contentType: '',
        isJson: false,
        hasInvocationError: false,
        hasModuleNotFoundError: false,
        error: 'Request timed out after 10000ms',
      });
    });

    req.on('error', (err) => {
      resolve({
        endpoint: parsed.pathname + parsed.search,
        url: urlStr,
        status: 'NETWORK_ERROR',
        ok: false,
        contentType: '',
        isJson: false,
        hasInvocationError: false,
        hasModuleNotFoundError: false,
        error: err.message,
      });
    });
  });
}

async function runSmokeTests() {
  console.log(`==============================================`);
  console.log(`📡 Sanmine Production Smoke Test Suite`);
  console.log(`Target: ${PRODUCTION_DOMAIN}`);
  console.log(`==============================================\n`);

  const results: SmokeResult[] = [];

  for (const ep of SMOKE_ENDPOINTS) {
    const fullUrl = `${PRODUCTION_DOMAIN}${ep}`;
    const result = await fetchEndpoint(fullUrl);
    results.push(result);

    const statusBadge = result.ok ? '✓ PASS' : '✗ FAIL';
    console.log(
      `[${statusBadge}] ${result.endpoint}\n` +
      `       Status: ${result.status} | JSON: ${result.isJson} | Type: ${result.contentType}\n` +
      `       Invocation Error: ${result.hasInvocationError} | Module Error: ${result.hasModuleNotFoundError}` +
      (result.error ? ` | Error: ${result.error}` : '') + '\n'
    );
  }

  const passedCount = results.filter((r) => r.ok).length;
  console.log(`==============================================`);
  console.log(`Summary: ${passedCount}/${results.length} endpoints succeeded without server error.`);
  console.log(`==============================================\n`);
}

runSmokeTests().catch((err) => {
  console.error('Smoke test execution error:', err);
});
