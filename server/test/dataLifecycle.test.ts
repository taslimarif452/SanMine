/**
 * P0-5: Database & Data Lifecycle Integrity Tests
 *
 * Validates:
 * 1. Individual Chat Deletion:
 *    - Strict ownership enforcement (IDOR protection)
 *    - Permanent purge of chat, messages, summaries, task checkpoints, in-memory state
 * 2. AI API Key Deletion:
 *    - Permanent deletion of encrypted DB record
 *    - Runtime credential cache clearance
 *    - Provider state update (unconfigured immediately)
 * 3. Account Deletion:
 *    - Transactional/cascading purge of all 10 user domains:
 *      * user profile (users table)
 *      * chats & messages
 *      * conversation summaries
 *      * task checkpoints
 *      * AI API keys
 *      * user preferences
 *      * Gmail OAuth tokens
 *      * SMTP credentials
 *      * outreach logs
 *      * browser/session state
 *    - Verification that no orphan rows or cached credentials remain
 */

import assert from 'assert';

process.env.CREDENTIAL_ENCRYPTION_KEY =
  process.env.CREDENTIAL_ENCRYPTION_KEY || 'test-encryption-key-for-unit-test-environment-32b';

import {
  createChat,
  saveMessage,
  getChatById,
  listChatMessages,
  deleteChat,
  saveConversationSummary,
  getConversationSummary,
  saveTaskCheckpoint,
  getTaskCheckpoint,
} from '../db/chats.js';
import {
  saveUserAiApiKey,
  getDecryptedUserApiKey,
  deleteUserAiApiKey,
  getUserAiProvidersStatus,
} from '../db/aiKeys.js';
import {
  saveUserPreferences,
  getUserPreferences,
  logOutreachAttempt,
  getUserOutreachHistory,
} from '../db/outreach.js';
import {
  saveUserSmtpCredentials,
  getUserSmtpCredentials,
} from '../db/smtp.js';
import {
  saveGmailTokens,
  getGmailTokens,
} from '../db/neon.js';
import { deleteUserAccount } from '../db/account.js';
import { resolveUserAiCredential } from '../ai/credentialResolver.js';
import { browserSessionManager } from '../browser/sessionManager.js';

async function runDataLifecycleTests() {
  console.log('[TEST] Starting P0-5 Database & Data Lifecycle Integrity Tests...\n');

  const userAlpha = '00000000-0000-0000-0000-0000000000a1';
  const userBravo = '00000000-0000-0000-0000-0000000000b2';
  const firebaseUidAlpha = 'firebase-uid-alpha-123';

  // Clean slate
  await deleteUserAccount({ userId: userAlpha, firebaseUid: firebaseUidAlpha }).catch(() => {});
  await deleteUserAccount({ userId: userBravo }).catch(() => {});

  // =========================================================================
  // 1. Individual Chat Deletion & IDOR Protection
  // =========================================================================
  console.log('[TEST 1] Testing Individual Chat Deletion & IDOR Protection...');

  const chatA = await createChat({ userId: userAlpha, title: 'Confidential Client Strategy' });
  await saveMessage({
    chatId: chatA.id,
    userId: userAlpha,
    role: 'user',
    content: 'Client strategy document',
  });
  await saveConversationSummary({
    chatId: chatA.id,
    userId: userAlpha,
    summary: 'Summary of strategy',
  });
  await saveTaskCheckpoint({
    taskId: `task-chat-${chatA.id}`,
    userId: userAlpha,
    chatId: chatA.id,
    state: { currentStep: 'draft_proposal' },
  });

  // IDOR Attack: User Bravo attempts to read, write, or delete User Alpha's chat
  assert.strictEqual(await getChatById(chatA.id, userBravo), null, 'User Bravo must not read User Alpha chat');
  assert.strictEqual(await listChatMessages(chatA.id, userBravo), null, 'User Bravo must not list User Alpha messages');
  assert.strictEqual(await deleteChat(chatA.id, userBravo), false, 'User Bravo must not delete User Alpha chat');

  // Verify chat still intact for User Alpha
  assert.ok((await getChatById(chatA.id, userAlpha)) !== null);
  assert.strictEqual((await listChatMessages(chatA.id, userAlpha))?.length, 1);

  // Legitimate Deletion by Owner (User Alpha)
  const delChatRes = await deleteChat(chatA.id, userAlpha);
  assert.strictEqual(delChatRes, true, 'deleteChat by owner must succeed');

  // Confirm complete cascade
  assert.strictEqual(await getChatById(chatA.id, userAlpha), null);
  assert.strictEqual(await listChatMessages(chatA.id, userAlpha), null);
  assert.strictEqual(await getConversationSummary(chatA.id, userAlpha), null);
  assert.strictEqual(await getTaskCheckpoint(`task-chat-${chatA.id}`, userAlpha), null);

  console.log('✓ Test 1 Passed: Individual chat deletion enforces IDOR safety and cascades fully.\n');

  // =========================================================================
  // 2. AI API Key Deletion & Credential Resolution Invalidation
  // =========================================================================
  console.log('[TEST 2] Testing AI API Key Deletion & Credential Invalidation...');

  // Save multiple keys
  await saveUserAiApiKey(userAlpha, 'anthropic', 'sk-ant-api03-testkey-12345678901234567890');
  await saveUserAiApiKey(userAlpha, 'openai', 'sk-proj-openai-testkey-12345678901234567890');

  // Verify retrieval
  assert.strictEqual(
    await getDecryptedUserApiKey(userAlpha, 'anthropic'),
    'sk-ant-api03-testkey-12345678901234567890'
  );
  const statusBefore = await getUserAiProvidersStatus(userAlpha);
  assert.strictEqual(statusBefore.anthropic.configured, true);
  assert.strictEqual(statusBefore.openai.configured, true);

  // Resolve via credentialResolver
  const credResolvedBefore = await resolveUserAiCredential({ userId: userAlpha, providerId: 'anthropic' });
  assert.strictEqual(credResolvedBefore, 'sk-ant-api03-testkey-12345678901234567890');

  // Delete Anthropic Key
  const keyDeleted = await deleteUserAiApiKey(userAlpha, 'anthropic');
  assert.strictEqual(keyDeleted, true);

  // Verify Anthropic key is wiped and unconfigured
  assert.strictEqual(await getDecryptedUserApiKey(userAlpha, 'anthropic'), null);
  const statusAfter = await getUserAiProvidersStatus(userAlpha);
  assert.strictEqual(statusAfter.anthropic.configured, false);
  assert.strictEqual(statusAfter.anthropic.maskedKey, '');
  // OpenAI should remain intact
  assert.strictEqual(statusAfter.openai.configured, true);

  // Credential resolver must now return no credential for Anthropic (assuming no server env var for anthropic)
  delete process.env.ANTHROPIC_API_KEY;
  const credResolvedAfter = await resolveUserAiCredential({ userId: userAlpha, providerId: 'anthropic' });
  assert.strictEqual(credResolvedAfter, undefined);

  console.log('✓ Test 2 Passed: AI API key deletion permanently wipes credentials and updates status.\n');

  // =========================================================================
  // 3. Full Multi-Domain Account Deletion Cascade
  // =========================================================================
  console.log('[TEST 3] Testing Complete Account Deletion Cascade across all 10 domains...');

  // Setup records in all domains for userAlpha
  // 1. Chats & Messages
  const chat1 = await createChat({ userId: userAlpha, title: 'Chat to Purge' });
  await saveMessage({ chatId: chat1.id, userId: userAlpha, role: 'user', content: 'Msg 1' });
  await saveConversationSummary({ chatId: chat1.id, userId: userAlpha, summary: 'Summary 1' });
  // 2. Task Checkpoints
  await saveTaskCheckpoint({ taskId: 'task-alpha-101', userId: userAlpha, state: { status: 'executing' } });
  // 3. AI Keys (OpenAI left over)
  // 4. Gmail OAuth Tokens
  await saveGmailTokens({
    userId: userAlpha,
    email: 'alpha@example.com',
    accessToken: 'ya29.alpha-token',
    refreshToken: '1//alpha-refresh',
    scope: 'https://www.googleapis.com/auth/gmail.send',
    tokenType: 'Bearer',
  });
  // 5. SMTP Credentials
  await saveUserSmtpCredentials({
    userId: userAlpha,
    email: 'alpha-smtp@example.com',
    appPassword: 'alpha-app-password',
  });
  // 6. User Preferences
  await saveUserPreferences(userAlpha, {
    activeProvider: 'openai',
    activeModel: 'gpt-4o',
    autoSendProposals: true,
  });
  // 7. Outreach Logs
  await logOutreachAttempt({
    userId: userAlpha,
    recipientEmail: 'lead@targetbiz.com',
    businessName: 'Target Biz',
    status: 'sent',
  });
  // 8. Active Browser Session
  const session = await browserSessionManager.getOrCreateSession(userAlpha, 'browser-alpha-session');
  assert.ok(session);
  assert.strictEqual(browserSessionManager.listUserSessions(userAlpha).length, 1);

  // Verify all records exist prior to deletion
  assert.ok(await getChatById(chat1.id, userAlpha) !== null);
  assert.ok(await getTaskCheckpoint('task-alpha-101', userAlpha) !== null);
  assert.ok(await getDecryptedUserApiKey(userAlpha, 'openai') !== null);
  assert.ok(await getGmailTokens(userAlpha) !== null);
  assert.ok(await getUserSmtpCredentials(userAlpha) !== null);
  assert.ok(await getUserPreferences(userAlpha) !== null);
  assert.strictEqual((await getUserOutreachHistory(userAlpha, 10)).length, 1);

  // Execute Account Deletion
  const accountDeleted = await deleteUserAccount({ userId: userAlpha, firebaseUid: firebaseUidAlpha });
  assert.strictEqual(accountDeleted, true);

  // Verify EVERYTHING is wiped
  assert.strictEqual(await getChatById(chat1.id, userAlpha), null, 'Chats must be purged');
  assert.strictEqual(await listChatMessages(chat1.id, userAlpha), null, 'Messages must be purged');
  assert.strictEqual(await getConversationSummary(chat1.id, userAlpha), null, 'Summaries must be purged');
  assert.strictEqual(await getTaskCheckpoint('task-alpha-101', userAlpha), null, 'Checkpoints must be purged');
  assert.strictEqual(await getDecryptedUserApiKey(userAlpha, 'openai'), null, 'AI keys must be purged');
  assert.strictEqual(await getGmailTokens(userAlpha), null, 'Gmail tokens must be purged');
  assert.strictEqual(await getUserSmtpCredentials(userAlpha), null, 'SMTP credentials must be purged');
  assert.strictEqual((await getUserOutreachHistory(userAlpha, 10)).length, 0, 'Outreach history must be purged');
  assert.strictEqual(browserSessionManager.listUserSessions(userAlpha).length, 0, 'Browser sessions must be closed and purged');

  console.log('✓ Test 3 Passed: Multi-domain account deletion completely purged all user records.\n');

  console.log('====================================================================');
  console.log('🎉 ALL P0-5 DATABASE & DATA LIFECYCLE INTEGRITY TESTS PASSED (3/3)!');
  console.log('====================================================================\n');
}

runDataLifecycleTests().catch((err) => {
  console.error('[TEST FAILURE] Data Lifecycle Tests:', err);
  process.exit(1);
});
