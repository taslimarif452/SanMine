import assert from 'assert';

// Ensure test encryption key is configured
process.env.CREDENTIAL_ENCRYPTION_KEY =
  process.env.CREDENTIAL_ENCRYPTION_KEY || 'test-encryption-key-for-unit-test-environment-32b';

import {
  createChat,
  saveMessage,
  getChatById,
  listChatMessages,
  deleteChat,
  saveTaskCheckpoint,
  getTaskCheckpoint,
  saveConversationSummary,
  getConversationSummary,
} from './db/chats.js';
import {
  saveUserAiApiKey,
  getDecryptedUserApiKey,
  deleteUserAiApiKey,
  getUserAiProvidersStatus,
} from './db/aiKeys.js';
import {
  saveUserPreferences,
  logOutreachAttempt,
  getUserOutreachHistory,
} from './db/outreach.js';
import {
  saveUserSmtpCredentials,
  getUserSmtpCredentials,
} from './db/smtp.js';
import {
  saveGmailTokens,
  getGmailTokens,
} from './db/neon.js';
import { deleteUserAccount } from './db/account.js';
import { cleanSearchDestinationUrl, classifySearchItem } from './research/googleSearch.js';

async function runTests() {
  console.log('[TEST] Starting Deletion, Cascade & Reliability Verification Suite...\n');

  const testUserId = '00000000-0000-0000-0000-000000000001';
  const testFirebaseUid = 'firebase-uid-test-5678';

  // =========================================================================
  // TEST 1: Hard Chat Deletion & Cascade Purge
  // =========================================================================
  console.log('[TEST 1] Hard Chat Deletion & Cascade Purge...');
  {
    // Clean slate
    await deleteUserAccount({ userId: testUserId, firebaseUid: testFirebaseUid }).catch(() => {});

    // 1. Create chat
    const chat = await createChat({ userId: testUserId, title: 'Autonomous Outreach Run' });
    assert(chat && chat.id, 'Chat should be created');

    // 2. Save messages
    await saveMessage({
      chatId: chat.id,
      userId: testUserId,
      role: 'user',
      content: 'Find dental clinics in Dallas',
    });
    await saveMessage({
      chatId: chat.id,
      userId: testUserId,
      role: 'assistant',
      content: 'Found 5 dental clinics',
    });

    // 3. Save summary
    await saveConversationSummary({
      chatId: chat.id,
      userId: testUserId,
      summary: 'Dental clinic search in Dallas',
    });

    // 4. Save task checkpoint linked to chat
    const taskId = `task-${chat.id}`;
    await saveTaskCheckpoint({
      taskId,
      userId: testUserId,
      chatId: chat.id,
      state: {
        chatId: chat.id,
        step: 3,
        plan: ['search', 'evaluate', 'draft'],
      },
    });

    // Verify existence before deletion
    const chatBefore = await getChatById(chat.id, testUserId);
    assert(chatBefore !== null, 'Chat must exist before deletion');

    const messagesBefore = await listChatMessages(chat.id, testUserId);
    assert(messagesBefore !== null, 'Messages must exist before deletion');
    assert.strictEqual(messagesBefore.length, 2, '2 messages must exist before deletion');

    const summaryBefore = await getConversationSummary(chat.id, testUserId);
    assert(summaryBefore !== null, 'Summary must exist before deletion');

    const cpBefore = await getTaskCheckpoint(taskId, testUserId);
    assert(cpBefore !== null, 'Checkpoint must exist before deletion');

    // Execute hard chat deletion
    const deleted = await deleteChat(chat.id, testUserId);
    assert.strictEqual(deleted, true, 'deleteChat must return true');

    // Verify complete hard purge
    const chatAfter = await getChatById(chat.id, testUserId);
    assert.strictEqual(chatAfter, null, 'Chat must be null after deletion');

    const messagesAfter = await listChatMessages(chat.id, testUserId);
    assert.strictEqual(messagesAfter, null, 'Messages list must be null/empty after chat deletion');

    const summaryAfter = await getConversationSummary(chat.id, testUserId);
    assert.strictEqual(summaryAfter, null, 'Summary must be null after chat deletion');

    const cpAfter = await getTaskCheckpoint(taskId, testUserId);
    assert.strictEqual(cpAfter, null, 'Checkpoint must be null after chat deletion');

    console.log('✓ TEST 1 PASSED: Hard chat deletion purged all messages, summaries, and task checkpoints.');
  }

  // =========================================================================
  // TEST 2: IDOR Protection on Chat Deletion
  // =========================================================================
  console.log('\n[TEST 2] IDOR Protection on Chat Deletion...');
  {
    const chat = await createChat({ userId: testUserId, title: 'Private User Chat' });
    const attackerUserId = '00000000-0000-0000-0000-000000000999';

    const deleted = await deleteChat(chat.id, attackerUserId);
    assert.strictEqual(deleted, false, 'Attacker must NOT be allowed to delete another user chat');

    const stillExists = await getChatById(chat.id, testUserId);
    assert(stillExists !== null, 'Chat must remain untouched');

    // Cleanup
    await deleteChat(chat.id, testUserId);
    console.log('✓ TEST 2 PASSED: IDOR protection verified; unauthorized users cannot delete chats.');
  }

  // =========================================================================
  // TEST 3: Permanent AI API Key Removal
  // =========================================================================
  console.log('\n[TEST 3] Permanent AI API Key Removal...');
  {
    const saveRes = await saveUserAiApiKey(
      testUserId,
      'anthropic',
      'sk-ant-api03-test-key-abc-1234567890'
    );
    assert(saveRes.maskedKey, 'API key save should return masked key');

    // Verify key retrieval
    const keyBefore = await getDecryptedUserApiKey(testUserId, 'anthropic');
    assert.strictEqual(keyBefore, 'sk-ant-api03-test-key-abc-1234567890', 'Decrypted key should match');

    const statusBefore = await getUserAiProvidersStatus(testUserId);
    assert.strictEqual(statusBefore.anthropic.configured, true, 'Provider should be configured');

    // Delete key
    const deleted = await deleteUserAiApiKey(testUserId, 'anthropic');
    assert.strictEqual(deleted, true, 'deleteUserAiApiKey should return true');

    // Verify key wiped
    const keyAfter = await getDecryptedUserApiKey(testUserId, 'anthropic');
    assert.strictEqual(keyAfter, null, 'Key must be null after deletion');

    const statusAfter = await getUserAiProvidersStatus(testUserId);
    assert.strictEqual(statusAfter.anthropic.configured, false, 'Provider should no longer be configured');
    assert.strictEqual(statusAfter.anthropic.maskedKey, '', 'Masked key must be empty');

    console.log('✓ TEST 3 PASSED: Permanent AI key deletion verified.');
  }

  // =========================================================================
  // TEST 4: Full Multi-Domain Account Deletion Cascade
  // =========================================================================
  console.log('\n[TEST 4] Full Multi-Domain Account Deletion Cascade...');
  {
    // A. Chat
    const chat = await createChat({ userId: testUserId, title: 'Account Deletion Test Chat' });
    await saveMessage({
      chatId: chat.id,
      userId: testUserId,
      role: 'user',
      content: 'Analyze website example.com',
    });

    // B. AI API Key
    await saveUserAiApiKey(testUserId, 'openai', 'sk-proj-testkey1234567890abcdef');

    // C. Gmail OAuth tokens
    await saveGmailTokens({
      userId: testUserId,
      email: 'user@example.com',
      accessToken: 'access_token_secret',
      refreshToken: 'refresh_token_secret',
      scope: 'https://www.googleapis.com/auth/gmail.send',
      tokenType: 'Bearer',
    });

    // D. SMTP credentials
    await saveUserSmtpCredentials({
      userId: testUserId,
      email: 'user@gmail.com',
      appPassword: 'app-password-16-chars',
    });

    // E. Preferences & Outreach log
    await saveUserPreferences(testUserId, {
      autoSendProposals: true,
      activeProvider: 'openai',
    });

    await logOutreachAttempt({
      userId: testUserId,
      recipientEmail: 'client@example.com',
      businessName: 'Example Dental',
      status: 'sent',
    });

    // Verify all records exist before account deletion
    assert(await getChatById(chat.id, testUserId) !== null, 'Chat should exist');
    assert(await getDecryptedUserApiKey(testUserId, 'openai') !== null, 'AI Key should exist');
    assert(await getGmailTokens(testUserId) !== null, 'Gmail tokens should exist');
    assert(await getUserSmtpCredentials(testUserId) !== null, 'SMTP credentials should exist');
    assert((await getUserOutreachHistory(testUserId, 10)).length > 0, 'Outreach history should exist');

    // Execute complete account deletion
    const accountDeleted = await deleteUserAccount({ userId: testUserId, firebaseUid: testFirebaseUid });
    assert.strictEqual(accountDeleted, true, 'deleteUserAccount must return true');

    // Verify all data is completely wiped
    assert.strictEqual(await getChatById(chat.id, testUserId), null, 'Chat must be null');
    assert.strictEqual(await getDecryptedUserApiKey(testUserId, 'openai'), null, 'AI key must be null');
    assert.strictEqual(await getGmailTokens(testUserId), null, 'Gmail tokens must be null');
    assert.strictEqual(await getUserSmtpCredentials(testUserId), null, 'SMTP credentials must be null');
    assert.strictEqual((await getUserOutreachHistory(testUserId, 10)).length, 0, 'Outreach history must be empty');

    console.log('✓ TEST 4 PASSED: Complete account deletion wiped all databases and user stores.');
  }

  // =========================================================================
  // TEST 5: Zero Fake Discovery & URL Cleaning
  // =========================================================================
  console.log('\n[TEST 5] Zero Fake Discovery & Search Destination URL Validation...');
  {
    // Search engine landing URLs must be cleaned/filtered
    const googleRedirect = 'https://www.google.com/url?q=https://www.apexdentaldallas.com/contact&sa=U';
    const cleaned = cleanSearchDestinationUrl(googleRedirect);
    assert.strictEqual(cleaned, 'https://www.apexdentaldallas.com/contact', 'Google redirect should be unwrapped to real destination URL');

    const internalLink = '/search?q=dentists';
    const cleanedInternal = cleanSearchDestinationUrl(internalLink);
    assert.strictEqual(cleanedInternal, '', 'Internal search pages must be rejected');

    const businessItem = classifySearchItem('https://www.apexdentaldallas.com');
    assert.strictEqual(businessItem.isOfficialWebsite, true, 'Official website classified correctly');
    assert.strictEqual(businessItem.isDirectory, false, 'Not a directory');

    const directoryItem = classifySearchItem('https://www.yelp.com/biz/apex-dental-dallas');
    assert.strictEqual(directoryItem.isDirectory, true, 'Directory domain identified');

    console.log('✓ TEST 5 PASSED: Zero fake discovery & search destination URL validation verified.');
  }

  console.log('\n======================================================');
  console.log('ALL DELETION & RELIABILITY TESTS PASSED SUCCESSFULLY!');
  console.log('======================================================\n');
}

runTests().catch((err) => {
  console.error('[TEST FAILURE]:', err);
  process.exit(1);
});
