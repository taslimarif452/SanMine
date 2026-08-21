import crypto from 'crypto';
import { getNeonSql } from './neon.js';

export interface UserPreferences {
  userId: string;
  autoSendProposals: boolean;
  userDisplayName?: string;
  activeProvider?: string;
  activeModel?: string;
  configuredModels?: Record<string, string[] | string>;
  updatedAt: string;
}

export interface OutreachLogRecord {
  id?: string;
  userId: string;
  recipientEmail: string;
  businessName?: string;
  website?: string;
  subject?: string;
  messageId?: string;
  threadId?: string;
  status: 'sent' | 'failed' | 'skipped';
  reason?: string;
  errorMessage?: string;
  createdAt?: string;
}

// In-memory fallback stores for test/isolated runtimes
const memoryPreferences = new Map<string, UserPreferences>();
const memoryOutreachLogs: OutreachLogRecord[] = [];

let tablesInitialized = false;

/**
 * Initializes the user_preferences and outreach_logs tables in Neon PostgreSQL.
 */
export async function initializeOutreachSchema(): Promise<void> {
  if (tablesInitialized) return;

  const sql = getNeonSql();
  if (!sql) {
    tablesInitialized = true;
    return;
  }

  try {
    // 1. User Preferences Table
    await sql`
      CREATE TABLE IF NOT EXISTS user_preferences (
        user_id VARCHAR(255) PRIMARY KEY,
        auto_send_proposals BOOLEAN DEFAULT FALSE NOT NULL,
        user_display_name TEXT,
        active_provider VARCHAR(50),
        active_model VARCHAR(100),
        configured_models JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `;

    // Ensure columns exist on already-created tables
    await sql`ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS active_provider VARCHAR(50);`;
    await sql`ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS active_model VARCHAR(100);`;
    await sql`ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS configured_models JSONB;`;

    // 2. Outreach Logs Table (Strictly stores delivery audit metadata, NEVER tokens)
    await sql`
      CREATE TABLE IF NOT EXISTS outreach_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR(255) NOT NULL,
        recipient_email VARCHAR(320) NOT NULL,
        business_name TEXT,
        website TEXT,
        subject TEXT,
        message_id TEXT,
        thread_id TEXT,
        status VARCHAR(50) NOT NULL,
        reason TEXT,
        error_message TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_outreach_logs_user_recipient 
      ON outreach_logs(user_id, recipient_email, created_at DESC);
    `;

    tablesInitialized = true;
    console.log('[Neon DB] Outreach schema verified (user_preferences, outreach_logs).');
  } catch (error: any) {
    console.warn('[Neon DB] Outreach schema init notice:', error.message);
  }
}

/**
 * Retrieves user preferences (e.g. Outreach Automation mode, Active AI selection).
 */
export async function getUserPreferences(userId: string): Promise<UserPreferences> {
  const defaultPrefs: UserPreferences = {
    userId,
    autoSendProposals: false,
    userDisplayName: undefined,
    activeProvider: undefined,
    activeModel: undefined,
    configuredModels: undefined,
    updatedAt: new Date().toISOString(),
  };

  const sql = getNeonSql();
  if (!sql) {
    return memoryPreferences.get(userId) || defaultPrefs;
  }

  try {
    await initializeOutreachSchema();

    const rows = (await sql`
      SELECT 
        user_id as "userId",
        auto_send_proposals as "autoSendProposals",
        user_display_name as "userDisplayName",
        active_provider as "activeProvider",
        active_model as "activeModel",
        configured_models as "configuredModels",
        updated_at as "updatedAt"
      FROM user_preferences
      WHERE user_id = ${userId}
      LIMIT 1;
    `) as any[];

    if (rows && rows.length > 0) {
      const row = rows[0];
      let parsedConfiguredModels: Record<string, string[] | string> | undefined = undefined;
      if (row.configuredModels) {
        if (typeof row.configuredModels === 'object') {
          parsedConfiguredModels = row.configuredModels;
        } else if (typeof row.configuredModels === 'string') {
          try {
            parsedConfiguredModels = JSON.parse(row.configuredModels);
          } catch {
            // ignore JSON parse error
          }
        }
      }

      const record: UserPreferences = {
        userId: row.userId,
        autoSendProposals: Boolean(row.autoSendProposals),
        userDisplayName: row.userDisplayName || undefined,
        activeProvider: row.activeProvider || undefined,
        activeModel: row.activeModel || undefined,
        configuredModels: parsedConfiguredModels,
        updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : new Date().toISOString(),
      };
      memoryPreferences.set(userId, record);
      return record;
    }

    return defaultPrefs;
  } catch (error: any) {
    console.warn(`[Neon DB] Error reading user preferences for ${userId}:`, error.message);
    return memoryPreferences.get(userId) || defaultPrefs;
  }
}

/**
 * Saves or updates user preferences (e.g. Outreach Automation toggle state, active AI selection, configured models).
 */
export async function saveUserPreferences(
  userId: string,
  prefs: {
    autoSendProposals?: boolean;
    userDisplayName?: string;
    activeProvider?: string;
    activeModel?: string;
    configuredModels?: Record<string, string[] | string>;
  }
): Promise<UserPreferences> {
  const existing = await getUserPreferences(userId);

  // Merge configuredModels cleanly
  let mergedConfiguredModels: Record<string, string[] | string> = existing.configuredModels
    ? { ...existing.configuredModels }
    : {};

  if (prefs.configuredModels) {
    mergedConfiguredModels = { ...mergedConfiguredModels, ...prefs.configuredModels };
  }

  if (prefs.activeProvider && prefs.activeModel) {
    const rawProv = prefs.activeProvider === 'gemini' ? 'google' : prefs.activeProvider;
    const existingList = mergedConfiguredModels[rawProv];
    if (Array.isArray(existingList)) {
      if (!existingList.includes(prefs.activeModel)) {
        mergedConfiguredModels[rawProv] = [...existingList, prefs.activeModel];
      }
    } else if (typeof existingList === 'string') {
      if (existingList !== prefs.activeModel) {
        mergedConfiguredModels[rawProv] = [existingList, prefs.activeModel];
      }
    } else {
      mergedConfiguredModels[rawProv] = [prefs.activeModel];
    }
  }

  const updated: UserPreferences = {
    userId,
    autoSendProposals:
      typeof prefs.autoSendProposals === 'boolean'
        ? prefs.autoSendProposals
        : existing.autoSendProposals,
    userDisplayName:
      prefs.userDisplayName !== undefined ? prefs.userDisplayName : existing.userDisplayName,
    activeProvider:
      prefs.activeProvider !== undefined ? prefs.activeProvider : existing.activeProvider,
    activeModel:
      prefs.activeModel !== undefined ? prefs.activeModel : existing.activeModel,
    configuredModels: Object.keys(mergedConfiguredModels).length > 0 ? mergedConfiguredModels : undefined,
    updatedAt: new Date().toISOString(),
  };

  memoryPreferences.set(userId, updated);

  const sql = getNeonSql();
  if (!sql) {
    return updated;
  }

  try {
    await initializeOutreachSchema();

    const now = new Date();
    const configuredJson = updated.configuredModels ? JSON.stringify(updated.configuredModels) : null;

    await sql`
      INSERT INTO user_preferences (
        user_id,
        auto_send_proposals,
        user_display_name,
        active_provider,
        active_model,
        configured_models,
        updated_at
      ) VALUES (
        ${userId},
        ${updated.autoSendProposals},
        ${updated.userDisplayName || null},
        ${updated.activeProvider || null},
        ${updated.activeModel || null},
        ${configuredJson ? sql`${configuredJson}::jsonb` : null},
        ${now}
      )
      ON CONFLICT (user_id) DO UPDATE SET
        auto_send_proposals = EXCLUDED.auto_send_proposals,
        user_display_name = COALESCE(EXCLUDED.user_display_name, user_preferences.user_display_name),
        active_provider = COALESCE(EXCLUDED.active_provider, user_preferences.active_provider),
        active_model = COALESCE(EXCLUDED.active_model, user_preferences.active_model),
        configured_models = COALESCE(EXCLUDED.configured_models, user_preferences.configured_models),
        updated_at = ${now};
    `;

    console.log(
      `[Neon DB] User preferences saved for ${userId}: autoSendProposals=${updated.autoSendProposals}, activeProvider=${updated.activeProvider}`
    );
    return updated;
  } catch (error: any) {
    console.error(`[Neon DB] Error saving user preferences for ${userId}:`, error.message);
    return updated;
  }
}

/**
 * Checks idempotency: Determines whether this user has already sent an outreach email
 * to this recipient within the last 30 days.
 */
export async function checkEmailAlreadySent(
  userId: string,
  recipientEmail: string
): Promise<boolean> {
  const cleanEmail = recipientEmail.trim().toLowerCase();
  if (!cleanEmail) return false;

  // Check in-memory logs
  const inMemoryDuplicate = memoryOutreachLogs.some(
    (log) =>
      log.userId === userId &&
      log.recipientEmail.toLowerCase() === cleanEmail &&
      log.status === 'sent'
  );
  if (inMemoryDuplicate) return true;

  const sql = getNeonSql();
  if (!sql) return false;

  try {
    await initializeOutreachSchema();

    // Check sent records in last 30 days
    const rows = (await sql`
      SELECT id FROM outreach_logs
      WHERE user_id = ${userId}
        AND LOWER(recipient_email) = ${cleanEmail}
        AND status = 'sent'
        AND created_at > NOW() - INTERVAL '30 days'
      LIMIT 1;
    `) as any[];

    return Boolean(rows && rows.length > 0);
  } catch (error: any) {
    console.warn(`[Neon DB] Idempotency check notice for ${recipientEmail}:`, error.message);
    return false;
  }
}

/**
 * Logs an outreach delivery attempt (sent, skipped, or failed).
 * Strictly contains delivery metadata for reporting; NEVER stores auth tokens.
 */
export async function logOutreachAttempt(
  data: OutreachLogRecord
): Promise<OutreachLogRecord> {
  const record: OutreachLogRecord = {
    ...data,
    id: data.id || crypto.randomUUID?.() || `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    recipientEmail: data.recipientEmail.trim().toLowerCase(),
    createdAt: new Date().toISOString(),
  };

  memoryOutreachLogs.push(record);

  const sql = getNeonSql();
  if (!sql) return record;

  try {
    await initializeOutreachSchema();

    await sql`
      INSERT INTO outreach_logs (
        user_id,
        recipient_email,
        business_name,
        website,
        subject,
        message_id,
        thread_id,
        status,
        reason,
        error_message,
        created_at
      ) VALUES (
        ${record.userId},
        ${record.recipientEmail},
        ${record.businessName || null},
        ${record.website || null},
        ${record.subject || null},
        ${record.messageId || null},
        ${record.threadId || null},
        ${record.status},
        ${record.reason || null},
        ${record.errorMessage || null},
        NOW()
      );
    `;

    console.log(
      `[OUTREACH AUDIT LOG] userId=${record.userId} recipient=${record.recipientEmail} status=${record.status}`
    );
    return record;
  } catch (error: any) {
    console.error(`[Neon DB] Failed to persist outreach audit log:`, error.message);
    return record;
  }
}

/**
 * Gets recent outreach history for the authenticated user.
 */
export async function getUserOutreachHistory(
  userId: string,
  limit = 50
): Promise<OutreachLogRecord[]> {
  const sql = getNeonSql();
  if (!sql) {
    return memoryOutreachLogs
      .filter((l) => l.userId === userId)
      .slice(-limit)
      .reverse();
  }

  try {
    await initializeOutreachSchema();

    const rows = (await sql`
      SELECT 
        id,
        user_id as "userId",
        recipient_email as "recipientEmail",
        business_name as "businessName",
        website,
        subject,
        message_id as "messageId",
        thread_id as "threadId",
        status,
        reason,
        error_message as "errorMessage",
        created_at as "createdAt"
      FROM outreach_logs
      WHERE user_id = ${userId}
      ORDER BY created_at DESC
      LIMIT ${limit};
    `) as any[];

    return rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      recipientEmail: r.recipientEmail,
      businessName: r.businessName,
      website: r.website,
      subject: r.subject,
      messageId: r.messageId,
      threadId: r.threadId,
      status: r.status,
      reason: r.reason,
      errorMessage: r.errorMessage,
      createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : undefined,
    }));
  } catch (error: any) {
    console.error(`[Neon DB] Error retrieving outreach history for ${userId}:`, error.message);
    return memoryOutreachLogs.filter((l) => l.userId === userId).slice(-limit).reverse();
  }
}

/**
 * Clears all in-memory outreach logs and preferences for a user.
 */
export function clearUserOutreachMemory(userId: string): void {
  memoryPreferences.delete(userId);
  // Remove outreach logs for this user from array
  for (let i = memoryOutreachLogs.length - 1; i >= 0; i--) {
    if (memoryOutreachLogs[i].userId === userId) {
      memoryOutreachLogs.splice(i, 1);
    }
  }
}

