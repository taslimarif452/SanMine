import assert from 'node:assert';
import http from 'node:http';
import app from '../../api/index.js';
import {
  createOAuthState,
  verifyOAuthState,
  buildGoogleAuthUrl,
  isGmailOAuthConfigured,
  getOAuthConfig,
  CANONICAL_PRODUCTION_REDIRECT_URI,
  LEGACY_COMPATIBILITY_REDIRECT_URI,
} from './oauth.js';
import {
  isSmtpEncryptionConfigured,
  getSmtpEncryptionKey,
  encryptSmtpPassword,
  decryptSmtpPassword,
  saveUserSmtpCredentials,
  deleteUserSmtpCredentials,
} from '../db/smtp.js';
import {
  saveGmailTokens,
  deleteGmailTokens,
} from '../db/neon.js';
import {
  sanitizeAppPassword,
  isValidGmailAddress,
  connectGmailSmtp,
} from './smtp.js';

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

export async function runGmailOAuthTests() {
  console.log('==============================================');
  console.log('Running Permanent Gmail OAuth Test Suite');
  console.log('==============================================\n');

  // Setup test environment
  process.env.GMAIL_OAUTH_STATE_SECRET = 'test-state-secret-at-least-32-chars-long!';

  // 1. State Security & Cryptographic Signing Tests
  console.log('--- 1. State Signing, Expiration & Tamper Resistance ---');
  const userId = 'user_test_firebase_uid_123';
  const stateToken = createOAuthState(userId);
  assert.ok(stateToken, 'createOAuthState must return a valid token string');
  assert.ok(stateToken.includes('.'), 'State token must have payload and signature separated by dot');

  const validResult = verifyOAuthState(stateToken);
  assert.strictEqual(validResult.valid, true, 'Original state token must verify successfully');
  assert.strictEqual(validResult.userId, userId, 'Verified userId must match input userId');
  console.log('✓ [PASS] Valid OAuth state token verifies and returns correct userId');

  // Replay Attack Prevention Check
  const replayResult = verifyOAuthState(stateToken);
  assert.strictEqual(replayResult.valid, false, 'Replaying consumed state token must fail');
  assert.strictEqual(replayResult.error, 'STATE_ALREADY_USED');
  console.log('✓ [PASS] Replay protection prevents reusing the same state token twice');

  // Tampered Signature Check
  const freshState = createOAuthState(userId);
  const [b64] = freshState.split('.');
  const tamperedState = `${b64}.tampered_signature_fake_bytes`;
  const tamperedResult = verifyOAuthState(tamperedState);
  assert.strictEqual(tamperedResult.valid, false, 'Tampered signature must be rejected');
  console.log('✓ [PASS] Cryptographic HMAC-SHA256 signature tampering is rejected');

  // Missing State Check
  const missingResult = verifyOAuthState('');
  assert.strictEqual(missingResult.valid, false);
  assert.strictEqual(missingResult.error, 'STATE_MISSING');
  console.log('✓ [PASS] Missing state token rejected');

  // 2. Production Redirect URI Resolution Checks
  console.log('\n--- 2. Production Redirect URI Canonicalization ---');
  const origEnv = process.env.NODE_ENV;
  const origVercel = process.env.VERCEL;
  const origRedirect = process.env.GOOGLE_REDIRECT_URI;
  const origClientId = process.env.GOOGLE_CLIENT_ID;
  const origClientSec = process.env.GOOGLE_CLIENT_SECRET;

  try {
    process.env.GOOGLE_CLIENT_ID = 'test-client-id.apps.googleusercontent.com';
    process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
    process.env.NODE_ENV = 'production';
    process.env.VERCEL = '1';

    // Canonical redirect test in production
    delete process.env.GOOGLE_REDIRECT_URI;
    const config1 = getOAuthConfig();
    assert.strictEqual(config1.redirectUri, CANONICAL_PRODUCTION_REDIRECT_URI);
    const auth1 = buildGoogleAuthUrl(userId);
    assert.strictEqual(auth1.redirectUri, CANONICAL_PRODUCTION_REDIRECT_URI);
    assert.ok(auth1.url.includes(`redirect_uri=${encodeURIComponent(CANONICAL_PRODUCTION_REDIRECT_URI)}`));
    console.log('✓ [PASS] Production resolves to canonical https://sanmine.space/api/gmail/callback');

    // Stale GOOGLE_REDIRECT_URI in production is prevented from generating non-canonical URL
    process.env.GOOGLE_REDIRECT_URI = 'https://sanmine.space/api/gmail/oauth/callback';
    const config2 = getOAuthConfig();
    assert.strictEqual(config2.redirectUri, CANONICAL_PRODUCTION_REDIRECT_URI, 'Production must override stale redirect to canonical');
    const auth2 = buildGoogleAuthUrl(userId);
    assert.strictEqual(auth2.redirectUri, CANONICAL_PRODUCTION_REDIRECT_URI);
    assert.ok(auth2.url.includes(`redirect_uri=${encodeURIComponent(CANONICAL_PRODUCTION_REDIRECT_URI)}`));
    console.log('✓ [PASS] Stale GOOGLE_REDIRECT_URI in production safely enforces canonical redirect URI');
  } finally {
    if (origEnv !== undefined) process.env.NODE_ENV = origEnv;
    else delete process.env.NODE_ENV;
    if (origVercel !== undefined) process.env.VERCEL = origVercel;
    else delete process.env.VERCEL;
    if (origRedirect !== undefined) process.env.GOOGLE_REDIRECT_URI = origRedirect;
    else delete process.env.GOOGLE_REDIRECT_URI;
    if (origClientId !== undefined) process.env.GOOGLE_CLIENT_ID = origClientId;
    else delete process.env.GOOGLE_CLIENT_ID;
    if (origClientSec !== undefined) process.env.GOOGLE_CLIENT_SECRET = origClientSec;
    else delete process.env.GOOGLE_CLIENT_SECRET;
  }

  // 3. HTTP Route Checks
  console.log('\n--- 3. HTTP Endpoints & Backward Compatibility Callback Routes ---');
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    // GET /api/gmail/status
    const statusRes = await requestApp(server, '/api/gmail/status?userId=test_user');
    assert.strictEqual(statusRes.status, 200, 'GET /api/gmail/status must return HTTP 200');
    const statusData = statusRes.json();
    assert.ok(typeof statusData.configured === 'boolean', 'Status must contain configured boolean');
    assert.ok(typeof statusData.connected === 'boolean', 'Status must contain connected boolean');
    console.log('✓ [PASS] GET /api/gmail/status returned HTTP 200 with structured JSON');

    // GET /api/gmail/auth (configured state)
    const origId = process.env.GOOGLE_CLIENT_ID;
    const origSec = process.env.GOOGLE_CLIENT_SECRET;
    try {
      process.env.GOOGLE_CLIENT_ID = 'test-client-id.apps.googleusercontent.com';
      process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';

      const authRes = await requestApp(server, '/api/gmail/auth?userId=test_user');
      assert.strictEqual(authRes.status, 200, 'GET /api/gmail/auth must return HTTP 200');
      const authData = authRes.json();
      assert.strictEqual(authData.ok, true, 'authData.ok must be true');
      assert.strictEqual(authData.configured, true, 'authData.configured must be true');
      assert.ok(authData.url.startsWith('https://accounts.google.com/o/oauth2/v2/auth'), 'auth URL must point to Google consent');
      assert.ok(authData.url.includes('scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fgmail.send'), 'auth URL must enforce gmail.send scope');
      console.log('✓ [PASS] GET /api/gmail/auth generates Google consent URL with strict gmail.send scope');

      // GET /api/gmail/callback (canonical route)
      const canonicalRes = await requestApp(server, '/api/gmail/callback');
      assert.strictEqual(canonicalRes.status, 200, 'GET /api/gmail/callback must return HTTP 200 HTML');
      assert.ok(canonicalRes.body.includes('GMAIL_OAUTH_ERROR'), 'Callback with missing params must post GMAIL_OAUTH_ERROR to window.opener');
      assert.ok(!canonicalRes.body.includes('Cannot GET'), 'Canonical route must not return Cannot GET');
      console.log('✓ [PASS] GET /api/gmail/callback (canonical) safely responds with popup closer HTML');

      // GET /api/gmail/oauth/callback (backward compatibility alias)
      const legacyRes = await requestApp(server, '/api/gmail/oauth/callback');
      assert.strictEqual(legacyRes.status, 200, 'GET /api/gmail/oauth/callback must return HTTP 200 HTML');
      assert.ok(legacyRes.body.includes('GMAIL_OAUTH_ERROR'), 'Legacy callback with missing params must post GMAIL_OAUTH_ERROR');
      assert.ok(!legacyRes.body.includes('Cannot GET'), 'Legacy route must not return Cannot GET');
      console.log('✓ [PASS] GET /api/gmail/oauth/callback (legacy alias) safely responds with the SAME popup closer HTML');

      // Both canonical and legacy routes invoke the same handler logic with oauthError query param
      const errorCanonicalRes = await requestApp(server, '/api/gmail/callback?error=access_denied');
      assert.strictEqual(errorCanonicalRes.status, 200);
      assert.ok(errorCanonicalRes.body.includes('access_denied'));

      const errorLegacyRes = await requestApp(server, '/api/gmail/oauth/callback?error=access_denied');
      assert.strictEqual(errorLegacyRes.status, 200);
      assert.ok(errorLegacyRes.body.includes('access_denied'));
      console.log('✓ [PASS] Both /api/gmail/callback and /api/gmail/oauth/callback handle OAuth errors identically');

      // POST /api/gmail/disconnect
      const disconnectRes = await requestApp(server, '/api/gmail/disconnect', {
        method: 'POST',
        body: { userId: 'test_user' },
      });
      assert.strictEqual(disconnectRes.status, 200, 'POST /api/gmail/disconnect must return HTTP 200');
      const disconnectData = disconnectRes.json();
      assert.strictEqual(disconnectData.ok, true);
      assert.strictEqual(disconnectData.success, true);
      console.log('✓ [PASS] POST /api/gmail/disconnect successfully purges stored tokens');
    } finally {
      if (origId !== undefined) process.env.GOOGLE_CLIENT_ID = origId;
      else delete process.env.GOOGLE_CLIENT_ID;
      if (origSec !== undefined) process.env.GOOGLE_CLIENT_SECRET = origSec;
      else delete process.env.GOOGLE_CLIENT_SECRET;
    }
  } finally {
    server.close();
  }

  console.log('\n==============================================');
  console.log('ALL GMAIL OAUTH TESTS PASSED (100%)');
  console.log('==============================================\n');
}

export async function runGmailSmtpSecurityTests() {
  console.log('==============================================');
  console.log('Running Gmail SMTP Security & Encryption Audit');
  console.log('==============================================\n');

  // 1. Password sanitization tests
  console.log('--- 1. App Password Sanitization & Validation ---');
  assert.strictEqual(sanitizeAppPassword('abcd efgh ijkl mnop'), 'abcdefghijklmnop');
  assert.strictEqual(sanitizeAppPassword('  abcd  efgh  ijkl  mnop  '), 'abcdefghijklmnop');
  assert.strictEqual(isValidGmailAddress('test@gmail.com'), true);
  assert.strictEqual(isValidGmailAddress('sales@customdomain.com'), true);
  assert.strictEqual(isValidGmailAddress('invalid-email'), false);
  console.log('✓ [PASS] Sanitization and email format validation pass');

  // 2. Encryption key enforcement & fail-safe tests
  console.log('\n--- 2. Production Key Enforcement & Zero-Fallback Guarantee ---');
  const origKey = process.env.CREDENTIAL_ENCRYPTION_KEY;
  try {
    delete process.env.CREDENTIAL_ENCRYPTION_KEY;
    assert.strictEqual(isSmtpEncryptionConfigured(), false, 'isSmtpEncryptionConfigured must be false when key is missing');
    assert.throws(
      () => getSmtpEncryptionKey(),
      /CREDENTIAL_ENCRYPTION_KEY.*not configured/,
      'getSmtpEncryptionKey must throw when secret is missing with zero fallback'
    );
    console.log('✓ [PASS] Missing CREDENTIAL_ENCRYPTION_KEY strictly throws with no fallback');

    // Attempting to connect without CREDENTIAL_ENCRYPTION_KEY must fail safely
    const connectFail = await connectGmailSmtp({
      userId: 'test_no_env_user',
      email: 'test@gmail.com',
      appPassword: 'abcdefghijklmnop',
    });
    assert.strictEqual(connectFail.success, false);
    assert.ok(connectFail.error?.includes('CREDENTIAL_ENCRYPTION_KEY'), 'Must return safe configuration error');
    console.log('✓ [PASS] connectGmailSmtp safely refuses to connect when CREDENTIAL_ENCRYPTION_KEY is missing');
  } finally {
    if (origKey !== undefined) process.env.CREDENTIAL_ENCRYPTION_KEY = origKey;
    else delete process.env.CREDENTIAL_ENCRYPTION_KEY;
  }

  // 3. AES-256-GCM Encryption with Unique IV & AuthTag Verification
  console.log('\n--- 3. AES-256-GCM Encryption & Auth Tag Verification ---');
  try {
    process.env.CREDENTIAL_ENCRYPTION_KEY = 'test-smtp-encryption-key-32-chars-long!';
    assert.strictEqual(isSmtpEncryptionConfigured(), true);

    const testPassword = 'my-secret-app-password-16';
    const encrypted1 = encryptSmtpPassword(testPassword);
    const encrypted2 = encryptSmtpPassword(testPassword);

    assert.ok(encrypted1.startsWith('enc_smtp_v1:'), 'Encrypted string must have version prefix');
    assert.notStrictEqual(encrypted1, encrypted2, 'Two encryptions of same password must produce distinct IVs and ciphertexts');

    const decrypted = decryptSmtpPassword(encrypted1);
    assert.strictEqual(decrypted, testPassword, 'Decrypted password must match original');

    // Tampered AuthTag Verification
    const parts = encrypted1.split(':');
    const tamperedAuthTag = `enc_smtp_v1:${parts[1]}:00000000000000000000000000000000:${parts[3]}`;
    assert.throws(
      () => decryptSmtpPassword(tamperedAuthTag),
      'Tampered GCM auth tag must throw verification error and refuse decryption'
    );
    console.log('✓ [PASS] AES-256-GCM produces unique nonces per encryption and rejects tampered ciphertexts');
  } finally {
    if (origKey !== undefined) process.env.CREDENTIAL_ENCRYPTION_KEY = origKey;
    else delete process.env.CREDENTIAL_ENCRYPTION_KEY;
  }

  // 4. HTTP Endpoint Security & Zero Plaintext Exposure
  console.log('\n--- 4. HTTP Route Security (Zero Plaintext Exposure) ---');
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    // GET /api/gmail/smtp/status
    const statusRes = await requestApp(server, '/api/gmail/smtp/status?userId=test_user');
    assert.strictEqual(statusRes.status, 200);
    const statusData = statusRes.json();
    assert.strictEqual(typeof statusData.connected, 'boolean');
    assert.strictEqual(statusData.provider, 'gmail_smtp');
    assert.strictEqual(statusData.appPassword, undefined, 'Plaintext password must NEVER be in status response');
    assert.strictEqual(statusData.password, undefined, 'Password must NEVER be in status response');
    console.log('✓ [PASS] GET /api/gmail/smtp/status never exposes passwords or credentials');

    // POST /api/gmail/smtp/connect with missing key returns safe 400
    delete process.env.CREDENTIAL_ENCRYPTION_KEY;
    const connectRes = await requestApp(server, '/api/gmail/smtp/connect', {
      method: 'POST',
      body: {
        userId: 'audit-user',
        email: 'test@gmail.com',
        appPassword: 'abcdefghijklmnop',
      },
    });
    assert.strictEqual(connectRes.status, 400);
    const connectData = connectRes.json();
    assert.strictEqual(connectData.ok, false);
    assert.ok(connectData.error?.includes('CREDENTIAL_ENCRYPTION_KEY'));
    console.log('✓ [PASS] POST /api/gmail/smtp/connect returns clean 400 configuration error when key is missing');
  } finally {
    if (origKey !== undefined) process.env.CREDENTIAL_ENCRYPTION_KEY = origKey;
    else delete process.env.CREDENTIAL_ENCRYPTION_KEY;
    server.close();
  }

  console.log('\n==============================================');
  console.log('ALL GMAIL SMTP SECURITY CHECKS PASSED (100%)');
  console.log('==============================================\n');
}

export async function runGmailProviderExclusivityTests() {
  console.log('==============================================');
  console.log('Running Gmail Provider Exclusivity (OAuth vs SMTP)');
  console.log('==============================================\n');

  process.env.CREDENTIAL_ENCRYPTION_KEY = 'test-smtp-encryption-key-32-chars-long!';
  process.env.GMAIL_OAUTH_STATE_SECRET = 'test-state-secret-at-least-32-chars-long!';
  process.env.GOOGLE_CLIENT_ID = 'test-client-id.apps.googleusercontent.com';
  process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

  const testUser = 'user_exclusive_test_999';

  try {
    // Clean initial state
    await deleteGmailTokens(testUser);
    await deleteUserSmtpCredentials(testUser);

    // 1. Simulate active Google OAuth connection
    console.log('--- 1. Case 1: OAuth Active -> SMTP Connection Rejected ---');
    await saveGmailTokens({
      userId: testUser,
      email: 'oauth.user@gmail.com',
      accessToken: 'test-oauth-access-token',
      refreshToken: 'test-oauth-refresh-token',
      scope: 'https://www.googleapis.com/auth/gmail.send',
    });

    // Attempting to connect SMTP when OAuth is active must be rejected by connectGmailSmtp
    const smtpAttemptDirect = await connectGmailSmtp({
      userId: testUser,
      email: 'smtp.user@gmail.com',
      appPassword: 'abcdefghijklmnop',
    });
    assert.strictEqual(smtpAttemptDirect.success, false, 'connectGmailSmtp must fail when OAuth is active');
    assert.strictEqual(
      smtpAttemptDirect.error,
      'A Gmail account is already connected through Google. Disconnect the existing Gmail account before connecting Gmail manually through SMTP.'
    );
    console.log('✓ [PASS] connectGmailSmtp strictly rejects connection when Google OAuth account is connected');

    // Attempting POST /api/gmail/smtp/connect must return 400 with the exact error
    const smtpHttpRes = await requestApp(server, '/api/gmail/smtp/connect', {
      method: 'POST',
      body: {
        userId: testUser,
        email: 'different.smtp@gmail.com',
        appPassword: 'abcdefghijklmnop',
      },
    });
    assert.strictEqual(smtpHttpRes.status, 400, 'POST /api/gmail/smtp/connect must return 400 when OAuth is active');
    const smtpHttpData = smtpHttpRes.json();
    assert.strictEqual(smtpHttpData.ok, false);
    assert.strictEqual(
      smtpHttpData.error,
      'A Gmail account is already connected through Google. Disconnect the existing Gmail account before connecting Gmail manually through SMTP.'
    );
    console.log('✓ [PASS] POST /api/gmail/smtp/connect returns HTTP 400 with clear exclusivity guidance message');

    // 2. Disconnect OAuth, connect SMTP -> OAuth Initiation Rejected
    console.log('\n--- 2. Case 2: SMTP Active -> Google OAuth Initiation & Callback Rejected ---');
    await deleteGmailTokens(testUser);
    await saveUserSmtpCredentials({
      userId: testUser,
      email: 'smtp.active@gmail.com',
      appPassword: 'abcdefghijklmnop',
    });

    // Attempting GET /api/gmail/auth when SMTP is active must return 400
    const oauthAuthRes = await requestApp(server, `/api/gmail/auth?userId=${testUser}`);
    assert.strictEqual(oauthAuthRes.status, 400, 'GET /api/gmail/auth must return 400 when SMTP is active');
    const oauthAuthData = oauthAuthRes.json();
    assert.strictEqual(oauthAuthData.ok, false);
    assert.strictEqual(
      oauthAuthData.error,
      'A Gmail account is already connected through SMTP. Disconnect the existing Gmail account before connecting through Google.'
    );
    console.log('✓ [PASS] GET /api/gmail/auth strictly blocks initiating OAuth when SMTP account is connected');

    // Attempting GET /api/gmail/callback with state for this user must return error page
    const stateToken = createOAuthState(testUser);
    const callbackRes = await requestApp(server, `/api/gmail/callback?code=mock_code&state=${encodeURIComponent(stateToken)}`);
    assert.strictEqual(callbackRes.status, 200);
    assert.ok(
      callbackRes.body.includes('A Gmail account is already connected through SMTP. Disconnect the existing Gmail account before connecting through Google.'),
      'OAuth callback must reject completion if SMTP is active'
    );
    console.log('✓ [PASS] GET /api/gmail/callback strictly aborts token exchange if SMTP is active');

    // 3. Disconnect SMTP -> Both methods can connect freely
    console.log('\n--- 3. Disconnection Restores Alternative Provider Availability ---');
    await deleteUserSmtpCredentials(testUser);
    const postDisconnectAuthRes = await requestApp(server, `/api/gmail/auth?userId=${testUser}`);
    assert.strictEqual(postDisconnectAuthRes.status, 200);
    assert.strictEqual(postDisconnectAuthRes.json().ok, true);
    console.log('✓ [PASS] After disconnecting SMTP, Google OAuth flow is immediately re-enabled');
  } finally {
    await deleteGmailTokens(testUser);
    await deleteUserSmtpCredentials(testUser);
    server.close();
  }

  console.log('\n==============================================');
  console.log('ALL PROVIDER EXCLUSIVITY TESTS PASSED (100%)');
  console.log('==============================================\n');
}

if (process.argv[1] && process.argv[1].includes('gmail.test')) {
  (async () => {
    await runGmailOAuthTests();
    await runGmailSmtpSecurityTests();
    await runGmailProviderExclusivityTests();
  })()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Gmail test failure:', err);
      process.exit(1);
    });
}
