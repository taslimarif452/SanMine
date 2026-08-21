import crypto from 'crypto';
import { getNeonSql, getDatabaseUrl, isDatabaseConfigured } from './neon.js';
import { AIProviderId } from '../ai/types.js';

export interface UserAiApiKeyRecord {
  id?: string;
  userId: string;
  provider: AIProviderId;
  encryptedKey: string;
  createdAt?: string;
  updatedAt?: string;
}

export const ALL_AI_PROVIDERS: AIProviderId[] = [
  'google',
  'openai',
  'openrouter',
  'anthropic',
  'xai',
  'deepseek',
  'huggingface',
  'ollama',
];

export interface ProviderConfigStatus {
  configured: boolean;
  maskedKey: string;
}

export type ProvidersStatusMap = Record<AIProviderId, ProviderConfigStatus>;

export interface UserAiProvidersResponse {
  ok: boolean;
  providers: ProvidersStatusMap;
  activeProvider: string;
}

// In-memory test store for test suites when DATABASE_URL is not provided
const memoryAiKeys = new Map<string, UserAiApiKeyRecord>(); // key: `${userId}:${provider}`

let tableInitialized = false;

/**
 * Derives AES-256 key from CREDENTIAL_ENCRYPTION_KEY using scrypt.
 * Strictly throws if CREDENTIAL_ENCRYPTION_KEY is missing or too short.
 */
export function getCredentialEncryptionKey(): Buffer {
  const secret = process.env.CREDENTIAL_ENCRYPTION_KEY?.trim();
  if (!secret || secret.length < 16) {
    const error: any = new Error(
      'Server credential encryption key (CREDENTIAL_ENCRYPTION_KEY) is not configured. At least 16 characters required.'
    );
    error.code = 'CONFIGURATION_ERROR';
    throw error;
  }
  return crypto.scryptSync(secret, 'sanmine-credential-salt', 32);
}

/**
 * Encrypts an API key string using AES-256-GCM.
 * Produces format: enc_v1:<iv_hex>:<tag_hex>:<ciphertext_hex>
 */
export function encryptApiKey(plainKey: string): string {
  if (!plainKey || typeof plainKey !== 'string' || !plainKey.trim()) {
    const error: any = new Error('API key cannot be empty');
    error.code = 'INVALID_API_KEY';
    throw error;
  }

  const trimmed = plainKey.trim();
  const iv = crypto.randomBytes(12); // 12-byte IV for GCM
  const key = getCredentialEncryptionKey();
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  let encrypted = cipher.update(trimmed, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return `enc_v1:${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypts an AES-256-GCM encrypted API key string.
 */
export function decryptApiKey(cipherText: string): string {
  if (!cipherText || typeof cipherText !== 'string') {
    throw new Error('Invalid ciphertext');
  }

  if (!cipherText.startsWith('enc_v1:')) {
    // If not versioned, do not fall back to plaintext in production
    throw new Error('Unrecognized ciphertext format');
  }

  const parts = cipherText.split(':');
  if (parts.length !== 4) {
    throw new Error('Malformed ciphertext components');
  }

  const iv = Buffer.from(parts[1], 'hex');
  const authTag = Buffer.from(parts[2], 'hex');
  const encryptedHex = parts[3];

  const key = getCredentialEncryptionKey();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Safely creates a masked representation of an API key (e.g. ••••••••abcd).
 */
export function maskApiKey(plainOrDecryptedKey: string): string {
  if (!plainOrDecryptedKey || typeof plainOrDecryptedKey !== 'string') return '';
  const trimmed = plainOrDecryptedKey.trim();
  if (trimmed.length === 0) return '';
  if (trimmed.length <= 4) return '••••••••';
  const last4 = trimmed.slice(-4);
  return `••••••••${last4}`;
}

/**
 * Ensures the user_ai_api_keys table exists in PostgreSQL.
 */
export async function initializeAiKeysSchema(): Promise<void> {
  if (tableInitialized) return;

  const sql = getNeonSql();
  if (!sql) {
    tableInitialized = true;
    return;
  }

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS user_ai_api_keys (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        provider VARCHAR(50) NOT NULL,
        encrypted_key TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        CONSTRAINT uq_user_ai_api_keys_user_provider UNIQUE (user_id, provider)
      );
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_user_ai_api_keys_user_provider 
      ON user_ai_api_keys(user_id, provider);
    `;

    tableInitialized = true;
    console.log('[Neon DB] Schema verified successfully (user_ai_api_keys).');
  } catch (error: any) {
    console.warn('[Neon DB] AI keys schema initialization notice:', error.message);
  }
}

/**
 * Persists an encrypted API key for a user and provider in PostgreSQL.
 */
export async function saveUserAiApiKey(
  userId: string,
  provider: AIProviderId,
  plainApiKey: string
): Promise<{ maskedKey: string; encryptedKey: string }> {
  if (!userId || typeof userId !== 'string') {
    const error: any = new Error('User ID is required');
    error.code = 'AUTH_REQUIRED';
    throw error;
  }

  const validProviders: AIProviderId[] = ALL_AI_PROVIDERS;
  if (!validProviders.includes(provider)) {
    const error: any = new Error(
      `Invalid provider "${provider}": must be one of ${ALL_AI_PROVIDERS.join(', ')}`
    );
    error.code = 'INVALID_PROVIDER';
    throw error;
  }

  if (!plainApiKey || typeof plainApiKey !== 'string' || !plainApiKey.trim()) {
    const error: any = new Error('API key cannot be empty');
    error.code = 'INVALID_API_KEY';
    throw error;
  }

  const trimmedKey = plainApiKey.trim();
  const encryptedKey = encryptApiKey(trimmedKey);
  const maskedKey = maskApiKey(trimmedKey);

  const sql = getNeonSql();
  if (!sql) {
    // If database is not configured in production, throw DATABASE_ERROR
    if (process.env.NODE_ENV === 'production' && !isDatabaseConfigured()) {
      const error: any = new Error('PostgreSQL database is not configured or unavailable.');
      error.code = 'DATABASE_ERROR';
      throw error;
    }
    // Update memory cache for test / development fallback
    const memKey = `${userId}:${provider}`;
    memoryAiKeys.set(memKey, {
      userId,
      provider,
      encryptedKey,
      updatedAt: new Date().toISOString(),
    });
    return { maskedKey, encryptedKey };
  }

  try {
    await initializeAiKeysSchema();

    const now = new Date();
    await sql`
      INSERT INTO user_ai_api_keys (
        user_id,
        provider,
        encrypted_key,
        updated_at
      ) VALUES (
        ${userId},
        ${provider},
        ${encryptedKey},
        ${now}
      )
      ON CONFLICT (user_id, provider) DO UPDATE SET
        encrypted_key = EXCLUDED.encrypted_key,
        updated_at = ${now};
    `;

    // Also sync in-memory cache
    memoryAiKeys.set(`${userId}:${provider}`, {
      userId,
      provider,
      encryptedKey,
      updatedAt: now.toISOString(),
    });

    return { maskedKey, encryptedKey };
  } catch (dbError: any) {
    console.error(`[Neon DB] Failed to save AI key for user ${userId}, provider ${provider}:`, dbError.message);
    const error: any = new Error(`Failed to store encrypted key in database: ${dbError.message}`);
    error.code = 'DATABASE_ERROR';
    throw error;
  }
}

/**
 * Retrieves the status and masked keys for all supported providers for a user.
 */
export async function getUserAiProvidersStatus(
  userId: string
): Promise<ProvidersStatusMap> {
  const result: Partial<ProvidersStatusMap> = {};
  for (const prov of ALL_AI_PROVIDERS) {
    result[prov] = { configured: false, maskedKey: '' };
  }

  const fullResult = result as ProvidersStatusMap;
  if (!userId) return fullResult;

  const sql = getNeonSql();
  if (!sql) {
    // Check memory store for tests / offline dev
    ALL_AI_PROVIDERS.forEach((prov) => {
      const record = memoryAiKeys.get(`${userId}:${prov}`);
      if (record && record.encryptedKey) {
        try {
          const decrypted = decryptApiKey(record.encryptedKey);
          fullResult[prov] = {
            configured: true,
            maskedKey: maskApiKey(decrypted),
          };
        } catch {
          fullResult[prov] = { configured: true, maskedKey: '••••••••' };
        }
      }
    });
    return fullResult;
  }

  try {
    await initializeAiKeysSchema();

    const rows = (await sql`
      SELECT provider, encrypted_key as "encryptedKey"
      FROM user_ai_api_keys
      WHERE user_id = ${userId};
    `) as Array<{ provider: string; encryptedKey: string }>;

    if (Array.isArray(rows)) {
      for (const row of rows) {
        const prov = row.provider as AIProviderId;
        if (ALL_AI_PROVIDERS.includes(prov)) {
          if (row.encryptedKey) {
            try {
              const decrypted = decryptApiKey(row.encryptedKey);
              fullResult[prov] = {
                configured: true,
                maskedKey: maskApiKey(decrypted),
              };
            } catch (decErr) {
              fullResult[prov] = {
                configured: true,
                maskedKey: '••••••••',
              };
            }
          }
        }
      }
    }

    return fullResult;
  } catch (error: any) {
    console.error(`[Neon DB] Error reading AI keys for user ${userId}:`, error.message);
    // Return memory fallback if present
    ALL_AI_PROVIDERS.forEach((prov) => {
      const record = memoryAiKeys.get(`${userId}:${prov}`);
      if (record && record.encryptedKey) {
        try {
          const decrypted = decryptApiKey(record.encryptedKey);
          fullResult[prov] = {
            configured: true,
            maskedKey: maskApiKey(decrypted),
          };
        } catch {
          fullResult[prov] = { configured: true, maskedKey: '••••••••' };
        }
      }
    });
    return fullResult;
  }
}

/**
 * Retrieves and decrypts a user's API key for a specific provider in server memory.
 * Never exposed to browser or API responses.
 */
export async function getDecryptedUserApiKey(
  userId: string,
  provider: AIProviderId
): Promise<string | null> {
  if (!userId) return null;

  const sql = getNeonSql();
  if (!sql) {
    const memRecord = memoryAiKeys.get(`${userId}:${provider}`);
    if (memRecord?.encryptedKey) {
      try {
        return decryptApiKey(memRecord.encryptedKey);
      } catch {
        return null;
      }
    }
    return null;
  }

  try {
    await initializeAiKeysSchema();

    const rows = (await sql`
      SELECT encrypted_key as "encryptedKey"
      FROM user_ai_api_keys
      WHERE user_id = ${userId} AND provider = ${provider}
      LIMIT 1;
    `) as Array<{ encryptedKey: string }>;

    if (rows && rows.length > 0 && rows[0].encryptedKey) {
      return decryptApiKey(rows[0].encryptedKey);
    }

    return null;
  } catch (error: any) {
    console.error(`[Neon DB] Error decrypting AI key for user ${userId}, provider ${provider}:`, error.message);
    const memRecord = memoryAiKeys.get(`${userId}:${provider}`);
    if (memRecord?.encryptedKey) {
      try {
        return decryptApiKey(memRecord.encryptedKey);
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * Deletes a stored AI provider key for a user.
 */
export async function deleteUserAiApiKey(userId: string, provider: AIProviderId): Promise<boolean> {
  if (!userId) return false;

  memoryAiKeys.delete(`${userId}:${provider}`);

  const sql = getNeonSql();
  if (!sql) return true;

  try {
    await initializeAiKeysSchema();
    await sql`
      DELETE FROM user_ai_api_keys
      WHERE user_id = ${userId} AND provider = ${provider};
    `;
    return true;
  } catch (error: any) {
    console.error(`[Neon DB] Error deleting AI key for user ${userId}, provider ${provider}:`, error.message);
    return false;
  }
}

/**
 * Clears all in-memory AI key records for a user.
 */
export function clearUserAiKeysMemory(userId: string): void {
  for (const prov of ALL_AI_PROVIDERS) {
    memoryAiKeys.delete(`${userId}:${prov}`);
  }
}

/**
 * Deletes all AI provider API keys for a user in PostgreSQL and memory.
 */
export async function deleteAllUserAiApiKeys(userId: string): Promise<boolean> {
  if (!userId) return false;

  clearUserAiKeysMemory(userId);

  const sql = getNeonSql();
  if (!sql) return true;

  try {
    await initializeAiKeysSchema();
    await sql`
      DELETE FROM user_ai_api_keys
      WHERE user_id = ${userId}::uuid;
    `;
    return true;
  } catch (error: any) {
    console.error(`[Neon DB] Error deleting all AI keys for user ${userId}:`, error.message);
    return false;
  }
}

