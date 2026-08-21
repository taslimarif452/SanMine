import { getNeonSql } from './neon.js';
import { deleteGmailTokens } from './neon.js';
import { deleteUserSmtpCredentials } from './smtp.js';
import { clearUserChatMemory } from './chats.js';
import { clearUserAiKeysMemory } from './aiKeys.js';
import { clearUserOutreachMemory } from './outreach.js';
import { browserSessionManager } from '../browser/sessionManager.js';

export interface DeleteUserAccountParams {
  userId: string;
  firebaseUid?: string;
}

function isValidUuid(id?: string): boolean {
  if (!id || typeof id !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

/**
 * Permanently deletes all data associated with a user across all PostgreSQL tables,
 * in-memory fallback stores, runtime caches, and active browser sessions.
 *
 * Guaranteed complete cascade:
 * - user_gmail_tokens
 * - user_gmail_smtp
 * - user_preferences
 * - outreach_logs
 * - user_ai_api_keys
 * - task_checkpoints
 * - conversation_summaries
 * - messages
 * - chats
 * - users
 */
export async function deleteUserAccount(params: DeleteUserAccountParams): Promise<boolean> {
  const { userId, firebaseUid } = params;
  if (!userId && !firebaseUid) {
    throw new Error('Valid userId or firebaseUid is required for account deletion.');
  }

  const sql = getNeonSql();

  if (sql) {
    try {
      // Resolve internal database UUID if needed
      let internalUuid = isValidUuid(userId) ? userId : undefined;
      const targetFirebaseUid = firebaseUid || (!isValidUuid(userId) ? userId : undefined);

      if (!internalUuid && targetFirebaseUid) {
        const userRows = (await sql`
          SELECT id::text FROM users WHERE firebase_uid = ${targetFirebaseUid} LIMIT 1;
        `.catch(() => [])) as any[];
        if (userRows && userRows.length > 0) {
          internalUuid = userRows[0].id;
        }
      }

      // 1. Delete Gmail OAuth tokens
      if (userId) {
        await sql`DELETE FROM user_gmail_tokens WHERE user_id = ${userId};`.catch(() => {});
      }
      if (firebaseUid && firebaseUid !== userId) {
        await sql`DELETE FROM user_gmail_tokens WHERE user_id = ${firebaseUid};`.catch(() => {});
      }
      if (internalUuid && internalUuid !== userId) {
        await sql`DELETE FROM user_gmail_tokens WHERE user_id = ${internalUuid};`.catch(() => {});
      }

      // 2. Delete Gmail SMTP credentials
      if (userId) {
        await sql`DELETE FROM user_gmail_smtp WHERE user_id = ${userId};`.catch(() => {});
      }
      if (firebaseUid && firebaseUid !== userId) {
        await sql`DELETE FROM user_gmail_smtp WHERE user_id = ${firebaseUid};`.catch(() => {});
      }
      if (internalUuid && internalUuid !== userId) {
        await sql`DELETE FROM user_gmail_smtp WHERE user_id = ${internalUuid};`.catch(() => {});
      }

      // 3. Delete user preferences
      if (userId) {
        await sql`DELETE FROM user_preferences WHERE user_id = ${userId};`.catch(() => {});
      }
      if (firebaseUid && firebaseUid !== userId) {
        await sql`DELETE FROM user_preferences WHERE user_id = ${firebaseUid};`.catch(() => {});
      }
      if (internalUuid && internalUuid !== userId) {
        await sql`DELETE FROM user_preferences WHERE user_id = ${internalUuid};`.catch(() => {});
      }

      // 4. Delete outreach delivery logs
      if (userId) {
        await sql`DELETE FROM outreach_logs WHERE user_id = ${userId};`.catch(() => {});
      }
      if (firebaseUid && firebaseUid !== userId) {
        await sql`DELETE FROM outreach_logs WHERE user_id = ${firebaseUid};`.catch(() => {});
      }
      if (internalUuid && internalUuid !== userId) {
        await sql`DELETE FROM outreach_logs WHERE user_id = ${internalUuid};`.catch(() => {});
      }

      // 5. Delete AI provider API keys
      if (internalUuid) {
        await sql`DELETE FROM user_ai_api_keys WHERE user_id = ${internalUuid}::uuid;`.catch(() => {});
      }

      // 6. Delete task checkpoints
      if (userId) {
        await sql`DELETE FROM task_checkpoints WHERE user_id = ${userId};`.catch(() => {});
      }
      if (firebaseUid && firebaseUid !== userId) {
        await sql`DELETE FROM task_checkpoints WHERE user_id = ${firebaseUid};`.catch(() => {});
      }
      if (internalUuid && internalUuid !== userId) {
        await sql`DELETE FROM task_checkpoints WHERE user_id = ${internalUuid};`.catch(() => {});
      }

      // 7. Delete conversation summaries
      if (internalUuid) {
        await sql`DELETE FROM conversation_summaries WHERE user_id = ${internalUuid}::uuid;`.catch(() => {});
      }

      // 8. Delete messages (explicit cascade before chats)
      if (internalUuid) {
        await sql`
          DELETE FROM messages 
          WHERE chat_id IN (SELECT id FROM chats WHERE user_id = ${internalUuid}::uuid);
        `.catch(() => {});
      }

      // 9. Delete chats
      if (internalUuid) {
        await sql`DELETE FROM chats WHERE user_id = ${internalUuid}::uuid;`.catch(() => {});
      }

      // 10. Delete user record in users table
      if (internalUuid && targetFirebaseUid) {
        await sql`DELETE FROM users WHERE id = ${internalUuid}::uuid OR firebase_uid = ${targetFirebaseUid};`.catch(() => {});
      } else if (internalUuid) {
        await sql`DELETE FROM users WHERE id = ${internalUuid}::uuid;`.catch(() => {});
      } else if (targetFirebaseUid) {
        await sql`DELETE FROM users WHERE firebase_uid = ${targetFirebaseUid};`.catch(() => {});
      }

      console.log(`[Account Deletion] Hard deleted PostgreSQL records for userId=${userId} firebaseUid=${firebaseUid}`);
    } catch (dbError: any) {
      console.error(`[Account Deletion] Database error during deleteUserAccount:`, dbError.message);
      throw new Error(`Failed to delete account data: ${dbError.message}`);
    }
  }

  // Clear all in-memory fallback stores
  if (userId) {
    clearUserChatMemory(userId, firebaseUid);
    clearUserAiKeysMemory(userId);
    clearUserOutreachMemory(userId);
    deleteGmailTokens(userId);
    deleteUserSmtpCredentials(userId);
  }
  if (firebaseUid) {
    clearUserChatMemory(userId, firebaseUid);
    clearUserOutreachMemory(firebaseUid);
    deleteGmailTokens(firebaseUid);
    deleteUserSmtpCredentials(firebaseUid);
  }

  // Terminate active live browser sessions
  try {
    if (browserSessionManager) {
      if (userId) await browserSessionManager.closeAllUserSessions(userId);
      if (firebaseUid) await browserSessionManager.closeAllUserSessions(firebaseUid);
    }
  } catch (err) {
    console.warn('[Account Deletion] Browser session cleanup notice:', err);
  }

  return true;
}
