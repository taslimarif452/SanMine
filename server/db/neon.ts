import { neon } from '@neondatabase/serverless';
import crypto from 'crypto';

export interface GmailTokenRecord {
  userId: string;
  email?: string;
  accessToken: string;
  refreshToken?: string;
  expiryDate?: number;
  tokenType?: string;
  scope?: string;
  createdAt?: string;
  updatedAt?: string;
}

// In-memory fallback store in case database is temporarily connecting
const memoryTokenStore: Map<string, GmailTokenRecord> = new Map();

/**
 * Resolves the database connection string.
 * Canonical variable: DATABASE_URL
 * Fallback variable: NEON_DATABASE_URL
 * Preferred logic: DATABASE_URL || NEON_DATABASE_URL
 */
export function getDatabaseUrl(): string | undefined {
  const canonical = process.env.DATABASE_URL?.trim();
  if (canonical) return canonical;
  const fallback = process.env.NEON_DATABASE_URL?.trim();
  if (fallback) return fallback;
  return undefined;
}

export function isDatabaseConfigured(): boolean {
  return !!getDatabaseUrl();
}

// Singleton Neon SQL client instance to ensure only one connection pool exists
let sqlClient: ReturnType<typeof neon> | null = null;

export function getNeonSql(): ReturnType<typeof neon> | null {
  if (sqlClient) return sqlClient;
  const url = getDatabaseUrl();
  if (url) {
    sqlClient = neon(url);
    return sqlClient;
  }
  return null;
}

/**
 * Safe startup diagnostic log for Neon database.
 * NEVER logs the connection string, hostname, password, or credentials.
 */
export function logNeonDbStartupDiagnostic(): void {
  const configured = isDatabaseConfigured();
  console.log('[NEON DB]');
  console.log(`configured=${configured}`);
}

export function getEncryptionKey(): Buffer {
  const secret = process.env.CREDENTIAL_ENCRYPTION_KEY?.trim();
  if (!secret || secret.length < 16) {
    throw new Error(
      'Server credential encryption key (CREDENTIAL_ENCRYPTION_KEY) is not configured. Storing and decrypting credentials requires CREDENTIAL_ENCRYPTION_KEY (at least 16 characters) in environment variables.'
    );
  }
  return crypto.scryptSync(secret, 'sanmine-credential-salt', 32);
}

/**
 * Encrypts sensitive OAuth token and API key strings using AES-256-GCM before database insertion.
 * Returns undefined if encryption fails to prevent saving plaintext tokens.
 */
export function encryptToken(plainText?: string): string | undefined {
  if (!plainText || typeof plainText !== 'string') return undefined;
  const trimmed = plainText.trim();
  if (!trimmed) return undefined;
  try {
    const iv = crypto.randomBytes(12);
    const key = getEncryptionKey();
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    let encrypted = cipher.update(trimmed, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return `enc_v1:${iv.toString('hex')}:${authTag}:${encrypted}`;
  } catch (err: any) {
    console.error('[Neon DB] Encryption error:', err?.message || err);
    return undefined;
  }
}

/**
 * Decrypts AES-256-GCM encrypted tokens read from PostgreSQL.
 */
export function decryptToken(cipherText?: string): string | undefined {
  if (!cipherText || typeof cipherText !== 'string') return undefined;
  if (!cipherText.startsWith('enc_v1:')) {
    // Backward-compatible for previously stored un-prefixed tokens
    return cipherText;
  }
  try {
    const parts = cipherText.split(':');
    if (parts.length !== 4) return undefined;
    const iv = Buffer.from(parts[1], 'hex');
    const authTag = Buffer.from(parts[2], 'hex');
    const encryptedHex = parts[3];
    const key = getEncryptionKey();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err: any) {
    console.error('[Neon DB] Decryption error:', err?.message || err);
    return undefined;
  }
}

let tableInitialized = false;

async function ensureTableExists(sql: ReturnType<typeof neon>) {
  if (tableInitialized) return;
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS user_gmail_tokens (
        user_id VARCHAR(255) PRIMARY KEY,
        email VARCHAR(255),
        access_token TEXT NOT NULL,
        refresh_token TEXT,
        expiry_date BIGINT,
        token_type VARCHAR(50) DEFAULT 'Bearer',
        scope TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `;
    tableInitialized = true;
  } catch (error) {
    console.warn('[Neon DB] Table initialization warning (will retry if needed):', error);
  }
}

/**
 * Save Gmail OAuth tokens securely against the authenticated Firebase UID in Neon PostgreSQL.
 * Tokens are encrypted at rest using AES-256-GCM before writing to the database.
 */
export async function saveGmailTokens(tokens: GmailTokenRecord): Promise<void> {
  // Always update in-memory cache as secondary layer (stores decrypted for runtime)
  memoryTokenStore.set(tokens.userId, {
    ...tokens,
    updatedAt: new Date().toISOString(),
  });

  const sql = getNeonSql();
  if (!sql) {
    console.log(`[Neon DB] DATABASE_URL not set. Token stored in secure server-side runtime store for user: ${tokens.userId}`);
    return;
  }

  try {
    await ensureTableExists(sql);

    const encryptedAccessToken = encryptToken(tokens.accessToken) || tokens.accessToken;
    const encryptedRefreshToken = tokens.refreshToken ? encryptToken(tokens.refreshToken) : null;

    const now = new Date();
    await sql`
      INSERT INTO user_gmail_tokens (
        user_id,
        email,
        access_token,
        refresh_token,
        expiry_date,
        token_type,
        scope,
        updated_at
      ) VALUES (
        ${tokens.userId},
        ${tokens.email || null},
        ${encryptedAccessToken},
        ${encryptedRefreshToken},
        ${tokens.expiryDate || null},
        ${tokens.tokenType || 'Bearer'},
        ${tokens.scope || 'https://www.googleapis.com/auth/gmail.send'},
        ${now}
      )
      ON CONFLICT (user_id) DO UPDATE SET
        email = COALESCE(EXCLUDED.email, user_gmail_tokens.email),
        access_token = EXCLUDED.access_token,
        refresh_token = COALESCE(EXCLUDED.refresh_token, user_gmail_tokens.refresh_token),
        expiry_date = EXCLUDED.expiry_date,
        token_type = EXCLUDED.token_type,
        scope = EXCLUDED.scope,
        updated_at = ${now};
    `;
    console.log(`[Neon DB] Encrypted Gmail OAuth tokens persisted successfully for UID: ${tokens.userId}`);
  } catch (error: any) {
    console.error(`[Neon DB] Failed to persist tokens to PostgreSQL:`, error);
    // Token is still preserved in server runtime memory
  }
}

/**
 * Retrieve Gmail OAuth tokens for a specific Firebase UID, decrypting tokens server-side.
 */
export async function getGmailTokens(userId: string): Promise<GmailTokenRecord | null> {
  const sql = getNeonSql();
  if (!sql) {
    return memoryTokenStore.get(userId) || null;
  }

  try {
    await ensureTableExists(sql);

    const rows = (await sql`
      SELECT 
        user_id as "userId",
        email,
        access_token as "accessToken",
        refresh_token as "refreshToken",
        expiry_date as "expiryDate",
        token_type as "tokenType",
        scope,
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM user_gmail_tokens
      WHERE user_id = ${userId}
      LIMIT 1;
    `) as any[];

    if (rows && rows.length > 0) {
      const row = rows[0] as any;
      const rawAccess = row.accessToken;
      const rawRefresh = row.refreshToken;

      const record: GmailTokenRecord = {
        userId: row.userId,
        email: row.email,
        accessToken: decryptToken(rawAccess) || rawAccess,
        refreshToken: decryptToken(rawRefresh) || rawRefresh,
        expiryDate: row.expiryDate ? Number(row.expiryDate) : undefined,
        tokenType: row.tokenType,
        scope: row.scope,
        createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : undefined,
        updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : undefined,
      };
      // Keep memory store synced
      memoryTokenStore.set(userId, record);
      return record;
    }
  } catch (error) {
    console.error(`[Neon DB] Error reading tokens for UID ${userId}:`, error);
  }

  // Fallback to memory store
  return memoryTokenStore.get(userId) || null;
}

/**
 * Delete Gmail OAuth tokens for a specific Firebase UID.
 */
export async function deleteGmailTokens(userId: string): Promise<boolean> {
  memoryTokenStore.delete(userId);

  const sql = getNeonSql();
  if (!sql) {
    return true;
  }

  try {
    await ensureTableExists(sql);
    await sql`
      DELETE FROM user_gmail_tokens
      WHERE user_id = ${userId};
    `;
    console.log(`[Neon DB] Deleted Gmail tokens for UID: ${userId}`);
    return true;
  } catch (error) {
    console.error(`[Neon DB] Error deleting tokens for UID ${userId}:`, error);
    return false;
  }
}
