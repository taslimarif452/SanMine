/**
 * AI Credential Isolation & Provider Failover Security Test Suite
 *
 * Hardens and validates all 7 P0 Credential Isolation requirements:
 * 1. User A credential cannot be used by User B (strict multi-tenant isolation).
 * 2. Gemini credential cannot be used for OpenAI / other providers (cross-provider isolation).
 * 3. Failover resolves the backup provider's own credential (never passes primary provider's key).
 * 4. Missing provider credential is skipped gracefully without infinite loop or failure before checking alternatives.
 * 5. API keys are absent from thrown errors, log output, and sanitized messages.
 * 6. All providers exhausted returns deterministic failure with clean user-facing error message.
 * 7. Provider instances contain no user-specific credential state (stateless provider design).
 */

import { resolveUserAiCredential, isProviderConfiguredForUser } from '../ai/credentialResolver.js';
import { saveUserAiApiKey, getDecryptedUserApiKey, maskApiKey } from '../db/aiKeys.js';
import { failoverManager, AllProvidersExhaustedError } from '../ai/failoverManager.js';
import { aiRegistry } from '../ai/registry.js';
import { AIProvider } from '../ai/types.js';
import { sanitizeErrorText, providerHealthManager } from '../ai/providerHealth.js';

process.env.CREDENTIAL_ENCRYPTION_KEY = process.env.CREDENTIAL_ENCRYPTION_KEY || 'test-encryption-key-with-32-chars-long!';

let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string, detail?: string) {
  if (condition) {
    console.log(`  ✓ ${name}`);
    passed++;
  } else {
    console.error(`  ✗ ${name}${detail ? ` - ${detail}` : ''}`);
    failed++;
  }
}

async function runCredentialIsolationSuite() {
  console.log('\n🔒 [P0 FIX 1 — AI CREDENTIAL ISOLATION & FAILOVER SECURITY SUITE]');
  console.log('==================================================================');

  const userA = 'user_uuid_aaa_111';
  const userB = 'user_uuid_bbb_222';

  // Seed keys for User A and User B
  await saveUserAiApiKey(userA, 'google', 'AIzaSyGoogleKeyUserA_1234567890');
  await saveUserAiApiKey(userA, 'openai', 'sk-OpenAIKeyUserA_1234567890');
  await saveUserAiApiKey(userA, 'anthropic', 'sk-ant-AnthropicKeyUserA_1234567890');

  await saveUserAiApiKey(userB, 'google', 'AIzaSyGoogleKeyUserB_9876543210');
  await saveUserAiApiKey(userB, 'openai', 'sk-OpenAIKeyUserB_9876543210');

  // --------------------------------------------------------------------------
  // 1. User A credential cannot be used by User B
  // --------------------------------------------------------------------------
  console.log('\n--- 1. Per-User Credential Isolation ---');
  {
    const userAGoogleKey = await resolveUserAiCredential({ userId: userA, providerId: 'google' });
    const userBGoogleKey = await resolveUserAiCredential({ userId: userB, providerId: 'google' });
    const userAAnthropicKey = await resolveUserAiCredential({ userId: userA, providerId: 'anthropic' });
    const userBAnthropicKey = await resolveUserAiCredential({ userId: userB, providerId: 'anthropic' });

    assert(userAGoogleKey === 'AIzaSyGoogleKeyUserA_1234567890', 'User A resolves User A Google key');
    assert(userBGoogleKey === 'AIzaSyGoogleKeyUserB_9876543210', 'User B resolves User B Google key');
    assert(userAGoogleKey !== userBGoogleKey, 'User A and User B Google keys are strictly distinct');
    assert(userAAnthropicKey === 'sk-ant-AnthropicKeyUserA_1234567890', 'User A resolves Anthropic key');
    assert(userBAnthropicKey === undefined, 'User B cannot resolve User A Anthropic key (returns undefined/fallback only)');
  }

  // --------------------------------------------------------------------------
  // 2. Gemini credential cannot be used for OpenAI / other providers
  // --------------------------------------------------------------------------
  console.log('\n--- 2. Cross-Provider Isolation ---');
  {
    const userAGoogleKey = await resolveUserAiCredential({ userId: userA, providerId: 'google' });
    const userAOpenAIKey = await resolveUserAiCredential({ userId: userA, providerId: 'openai' });
    const userAXAIKey = await resolveUserAiCredential({ userId: userA, providerId: 'xai' });

    assert(userAGoogleKey?.startsWith('AIzaSy'), 'Google provider resolves only Google format key');
    assert(userAOpenAIKey?.startsWith('sk-OpenAIKeyUserA'), 'OpenAI provider resolves only OpenAI key');
    assert(userAGoogleKey !== userAOpenAIKey, 'Google and OpenAI keys are completely isolated');
    assert(userAXAIKey === undefined, 'Unconfigured provider for User A does not inherit Google or OpenAI key');
  }

  // --------------------------------------------------------------------------
  // 3. Failover resolves the backup provider's own credential
  // --------------------------------------------------------------------------
  console.log('\n--- 3. Failover Provider Key Resolution ---');
  {
    // Preferred is google with explicit primary key
    const primaryKey = 'AIzaSyExplicitPrimary123';
    const primaryResolved = await failoverManager.resolveProviderApiKey('google', 'google', primaryKey, userA);
    const backupOpenAIResolved = await failoverManager.resolveProviderApiKey('openai', 'google', primaryKey, userA);
    const backupXAIResolved = await failoverManager.resolveProviderApiKey('xai', 'google', primaryKey, userA);

    assert(primaryResolved === primaryKey, 'Primary provider uses explicit primary key');
    assert(backupOpenAIResolved === 'sk-OpenAIKeyUserA_1234567890', 'Backup OpenAI provider resolves User A stored OpenAI key, NOT primary Google key');
    assert(backupOpenAIResolved !== primaryKey, 'Backup provider does NOT receive primary Google key');
    assert(backupXAIResolved === undefined, 'Unconfigured backup provider resolves undefined (does NOT leak primary key)');
  }

  // --------------------------------------------------------------------------
  // 4. Missing provider credential is skipped gracefully
  // --------------------------------------------------------------------------
  console.log('\n--- 4. Missing Provider Credential Skipped Gracefully ---');
  {
    providerHealthManager.resetAll();
    const passedProviders: string[] = [];

    const mockPrimaryFail: AIProvider = {
      id: 'mock_primary_fail' as any,
      name: 'Mock Primary Fail',
      description: 'Fails immediately with quota exceeded',
      defaultModel: 'm1',
      capabilities: { streaming: true, toolCalling: true, vision: false },
      isConfigured: () => true,
      testConnection: async () => ({ success: true }),
      listModels: async () => [],
      streamChat: async (opts) => {
        passedProviders.push('mock_primary_fail');
        throw new Error('429 Quota Exceeded: daily limit reached');
      },
    };

    const mockUnconfiguredBackup: AIProvider = {
      id: 'mock_unconfigured' as any,
      name: 'Mock Unconfigured Backup',
      description: 'Has no key configured',
      defaultModel: 'm2',
      capabilities: { streaming: true, toolCalling: true, vision: false },
      isConfigured: () => false,
      testConnection: async () => ({ success: false }),
      listModels: async () => [],
      streamChat: async (opts) => {
        passedProviders.push('mock_unconfigured');
        opts.onEvent({ type: 'message.completed', content: 'Should not run' });
      },
    };

    const mockConfiguredBackup: AIProvider = {
      id: 'mock_configured_backup' as any,
      name: 'Mock Configured Backup',
      description: 'Configured and succeeds',
      defaultModel: 'm3',
      capabilities: { streaming: true, toolCalling: true, vision: false },
      isConfigured: () => true,
      testConnection: async () => ({ success: true }),
      listModels: async () => [],
      streamChat: async (opts) => {
        passedProviders.push('mock_configured_backup');
        opts.onEvent({ type: 'message.delta', content: 'Backup succeeded cleanly.' });
        opts.onEvent({ type: 'message.completed', content: 'Backup succeeded cleanly.' });
      },
    };

    aiRegistry.register(mockPrimaryFail);
    aiRegistry.register(mockUnconfiguredBackup);
    aiRegistry.register(mockConfiguredBackup);

    const emitted: string[] = [];
    await failoverManager.streamChatWithFailover({
      taskId: 'test_skip_unconfigured',
      preferredProviderId: 'mock_primary_fail' as any,
      preferredModel: 'm1',
      messages: [{ role: 'user', content: 'Hello' }],
      candidateModels: [
        { providerId: 'mock_primary_fail' as any, model: 'm1' },
        { providerId: 'mock_unconfigured' as any, model: 'm2' },
        { providerId: 'mock_configured_backup' as any, model: 'm3' },
      ],
      onEvent: (evt) => {
        if (evt.type === 'message.delta') emitted.push(evt.content);
      },
    });

    assert(passedProviders.includes('mock_primary_fail'), 'Primary failing provider was executed first');
    assert(!passedProviders.includes('mock_unconfigured'), 'Unconfigured backup provider was skipped without calling streamChat');
    assert(passedProviders.includes('mock_configured_backup'), 'Configured backup provider was reached and executed');
    assert(emitted.join('') === 'Backup succeeded cleanly.', 'Output matches backup provider stream');
  }

  // --------------------------------------------------------------------------
  // 5. API keys are absent from thrown errors, logs, and sanitized output
  // --------------------------------------------------------------------------
  console.log('\n--- 5. No Plaintext API Key Leakage in Errors/Logs ---');
  {
    const rawErrorWithGoogleKey = 'Error from AI service: Invalid key AIzaSyTestKeySecret1234567890 at endpoint';
    const rawErrorWithBearer = 'Unauthorized for authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9';
    const rawErrorWithAnthropicKey = 'Invalid credential for key sk-ant-secretAnthropicKey1234567890';
    const rawErrorWithHeader = 'Failed request with x-api-key: sk-or-v1-superSecretToken99999999';
    const rawErrorWithDeepSeek = 'Authorization failed for dsk-DeepSeekSecretKey123456789';

    const sanitizedGoogle = sanitizeErrorText(rawErrorWithGoogleKey);
    const sanitizedBearer = sanitizeErrorText(rawErrorWithBearer);
    const sanitizedAnthropic = sanitizeErrorText(rawErrorWithAnthropicKey);
    const sanitizedHeader = sanitizeErrorText(rawErrorWithHeader);
    const sanitizedDeepSeek = sanitizeErrorText(rawErrorWithDeepSeek);

    assert(!sanitizedGoogle.includes('AIzaSyTestKeySecret1234567890'), 'Google API key redacted from error text');
    assert(sanitizedGoogle.includes('[REDACTED_API_KEY]'), 'Google API key replaced with [REDACTED_API_KEY]');

    assert(!sanitizedBearer.includes('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'), 'Bearer token redacted');
    assert(sanitizedBearer.includes('Bearer [REDACTED]'), 'Bearer token replaced with Bearer [REDACTED]');

    assert(!sanitizedAnthropic.includes('sk-ant-secretAnthropicKey1234567890'), 'Anthropic API key redacted');
    assert(sanitizedAnthropic.includes('[REDACTED_API_KEY]'), 'Anthropic API key replaced with [REDACTED_API_KEY]');

    assert(!sanitizedHeader.includes('sk-or-v1-superSecretToken99999999'), 'x-api-key token redacted');
    assert(sanitizedHeader.includes('x-api-key: [REDACTED]'), 'x-api-key header masked');
    assert(!sanitizedDeepSeek.includes('dsk-DeepSeekSecretKey123456789'), 'DeepSeek key redacted');
    assert(sanitizedDeepSeek.includes('[REDACTED_API_KEY]'), 'DeepSeek API key replaced with [REDACTED_API_KEY]');

    // Test maskApiKey helper
    const masked = maskApiKey('AIzaSyGoogleKeyUserA_1234567890');
    assert(masked === '••••••••7890', 'Masked API key only shows last 4 chars');
    assert(!masked.includes('GoogleKeyUserA'), 'Masked API key contains no plaintext secret portions');
  }

  // --------------------------------------------------------------------------
  // 6. All providers exhausted returns deterministic failure
  // --------------------------------------------------------------------------
  console.log('\n--- 6. All Providers Exhausted Deterministic Exit ---');
  {
    providerHealthManager.resetAll();

    const mockExhaust1: AIProvider = {
      id: 'mock_exhaust_1' as any,
      name: 'Mock Exhaust 1',
      description: 'Fails with 429',
      defaultModel: 'm1',
      capabilities: { streaming: true, toolCalling: true, vision: false },
      isConfigured: () => true,
      testConnection: async () => ({ success: true }),
      listModels: async () => [],
      streamChat: async () => {
        throw new Error('429 Quota Exceeded');
      },
    };

    const mockExhaust2: AIProvider = {
      id: 'mock_exhaust_2' as any,
      name: 'Mock Exhaust 2',
      description: 'Fails with 503',
      defaultModel: 'm2',
      capabilities: { streaming: true, toolCalling: true, vision: false },
      isConfigured: () => true,
      testConnection: async () => ({ success: true }),
      listModels: async () => [],
      streamChat: async () => {
        throw new Error('503 Service Unavailable');
      },
    };

    aiRegistry.register(mockExhaust1);
    aiRegistry.register(mockExhaust2);

    let caughtError: any = null;
    try {
      await failoverManager.streamChatWithFailover({
        taskId: 'test_all_exhausted',
        preferredProviderId: 'mock_exhaust_1' as any,
        preferredModel: 'm1',
        messages: [{ role: 'user', content: 'Test prompt' }],
        candidateModels: [
          { providerId: 'mock_exhaust_1' as any, model: 'm1' },
          { providerId: 'mock_exhaust_2' as any, model: 'm2' },
        ],
        onEvent: () => {},
      });
    } catch (err: any) {
      caughtError = err;
    }

    assert(caughtError !== null, 'All exhausted throws a caught error');
    assert(caughtError instanceof AllProvidersExhaustedError, 'Error is instance of AllProvidersExhaustedError');
    assert(caughtError?.isAllProvidersExhausted === true, 'isAllProvidersExhausted flag is true');
    assert(Array.isArray(caughtError?.attemptedProviders), 'Contains list of attempted providers');
    assert(caughtError?.attemptedProviders.length === 2, 'Records all attempted candidates (length 2)');
    assert(!caughtError?.message.includes('sk-') && !caughtError?.message.includes('AIza'), 'User-facing error message contains no secret keys');
  }

  // --------------------------------------------------------------------------
  // 7. Provider instances contain no user-specific credential state
  // --------------------------------------------------------------------------
  console.log('\n--- 7. Stateless Provider Instances ---');
  {
    const registeredProviders = aiRegistry.getAll();
    for (const p of registeredProviders) {
      const keys = Object.keys(p);
      assert(!keys.includes('userApiKey'), `Provider instance "${p.id}" has no userApiKey field`);
      assert(!keys.includes('apiKey'), `Provider instance "${p.id}" has no mutable apiKey field`);
      assert(!keys.includes('activeUserKey'), `Provider instance "${p.id}" has no activeUserKey field`);
    }
  }

  // --------------------------------------------------------------------------
  // Summary
  // --------------------------------------------------------------------------
  console.log('\n==================================================================');
  console.log(`TOTAL TESTS: ${passed + failed}`);
  console.log(`PASSED: ${passed}`);
  console.log(`FAILED: ${failed}`);
  console.log('==================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runCredentialIsolationSuite().catch((err) => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});
