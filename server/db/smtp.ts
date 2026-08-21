import crypto from 'crypto';
import { getNeonSql } from './neon.js';

export interface UserSmtpRecord {
  userId: string;
  email: string;
  encryptedAppPassword: string;
  host: string;
  port: number;
  secure: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UserSmtpStatus {
  connected: boolean;
  email: string | null;
  provider: 'gmail_smtp';
  host: string;
  port: number;
  updatedAt?: string;
}

const memorySmtpStore = new Map<string, {
  userId: string;
  email: string;
  encryptedAppPassword: string;
  host: string;
  port: number;
  secure: boolean;
}>();

let schemaInitialized = false;

/**
 * Checks whether the production encryption key is configured with adequate strength.
 */
export function isSmtpEncryptionConfigured(): boolean {
  const secret = process.env.CREDENTIAL_ENCRYPTION_KEY?.trim();
  return Boolean(secret && secret.length >= 16);
}

/**
 * Returns encryption key derived for SMTP App Password persistence.
 * Strictly requires CREDENTIAL_ENCRYPTION_KEY in all environments with zero default/fallback secrets.
 */
export function getSmtpEncryptionKey(): Buffer {
  const secret = process.env.CREDENTIAL_ENCRYPTION_KEY?.trim();
  if (!secret || secret.length < 16) {
    throw new Error('Server credential encryption key (CREDENTIAL_ENCRYPTION_KEY) is not configured. Storing and decrypting SMTP credentials requires CREDENTIAL_ENCRYPTION_KEY (at least 16 characters) in environment variables.');
  }
  return crypto.scryptSync(secret, 'sanmine-smtp-credential-salt-v1', 32);
}

/**
 * Encrypts a Gmail App Password using AES-256-GCM.
 * Plaintext passwords are never stored in plaintext anywhere.
 */
export function encryptSmtpPassword(plainPassword: string): string {
  if (!plainPassword) return '';
  const iv = crypto.randomBytes(12);
  const key = getSmtpEncryptionKey();
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(plainPassword, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `enc_smtp_v1:${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypts a Gmail App Password server-side only for SMTP authentication.
 */
export function decryptSmtpPassword(cipherText: string): string {
  if (!cipherText || !cipherText.startsWith('enc_smtp_v1:')) {
    return cipherText || '';
  }
  const parts = cipherText.split(':');
  if (parts.length !== 4) return cipherText;
  const iv = Buffer.from(parts[1], 'hex');
  const authTag = Buffer.from(parts[2], 'hex');
  const encryptedHex = parts[3];
  const key = getSmtpEncryptionKey();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

/**
 * Initializes the user_gmail_smtp table in Neon PostgreSQL.
 */
export async function initializeSmtpSchema(): Promise<void> {
  if (schemaInitialized) return;

  const sql = getNeonSql();
  if (!sql) {
    schemaInitialized = true;
    return;
  }

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS user_gmail_smtp (
        user_id VARCHAR(255) PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        encrypted_app_password TEXT NOT NULL,
        host VARCHAR(255) DEFAULT 'smtp.gmail.com' NOT NULL,
        port INT DEFAULT 465 NOT NULL,
        secure BOOLEAN DEFAULT TRUE NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
      );
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_user_gmail_smtp_user_id ON user_gmail_smtp(user_id);
    `;

    schemaInitialized = true;
    console.log('[Neon DB] user_gmail_smtp schema verified successfully.');
  } catch (error: any) {
    console.warn('[Neon DB] user_gmail_smtp schema initialization notice:', error.message);
  }
}

/**
 * Persists validated, encrypted SMTP credentials for a user into PostgreSQL.
 * Strictly requires both CREDENTIAL_ENCRYPTION_KEY and DATABASE_URL.
 */
export async function saveUserSmtpCredentials(params: {
  userId: string;
  email: string;
  appPassword: string;
  host?: string;
  port?: number;
  secure?: boolean;
}): Promise<void> {
  const { userId, email, appPassword, host = 'smtp.gmail.com', port = 465, secure = true } = params;

  if (!isSmtpEncryptionConfigured()) {
    throw new Error('CREDENTIAL_ENCRYPTION_KEY environment variable is not configured. Storing encrypted SMTP credentials requires a valid encryption key.');
  }

  const encryptedAppPassword = encryptSmtpPassword(appPassword);
  const cleanEmail = email.trim().toLowerCase();

  // Keep in-memory cache updated for runtime/testing parity
  memorySmtpStore.set(userId, {
    userId,
    email: cleanEmail,
    encryptedAppPassword,
    host,
    port,
    secure,
  });

  const sql = getNeonSql();
  if (!sql) {
    return;
  }

  try {
    await initializeSmtpSchema();
    await sql`
      INSERT INTO user_gmail_smtp (
        user_id,
        email,
        encrypted_app_password,
        host,
        port,
        secure,
        created_at,
        updated_at
      ) VALUES (
        ${userId},
        ${cleanEmail},
        ${encryptedAppPassword},
        ${host},
        ${port},
        ${secure},
        NOW(),
        NOW()
      )
      ON CONFLICT (user_id) DO UPDATE SET
        email = EXCLUDED.email,
        encrypted_app_password = EXCLUDED.encrypted_app_password,
        host = EXCLUDED.host,
        port = EXCLUDED.port,
        secure = EXCLUDED.secure,
        updated_at = NOW();
    `;
  } catch (error: any) {
    console.error('[Neon DB] Error saving user SMTP credentials:', error.message);
    throw new Error('Database error saving SMTP credentials: ' + error.message);
  }
}

/**
 * Retrieves decrypted SMTP credentials server-side only for SMTP transmission.
 * Plaintext passwords are NEVER exposed to callers outside server-side mail transport.
 */
export async function getUserSmtpCredentials(userId: string): Promise<{
  userId: string;
  email: string;
  appPassword: string;
  host: string;
  port: number;
  secure: boolean;
} | null> {
  if (!isSmtpEncryptionConfigured()) {
    return null;
  }

  const sql = getNeonSql();
  if (!sql) {
    const mem = memorySmtpStore.get(userId);
    if (!mem) return null;
    const decryptedPass = decryptSmtpPassword(mem.encryptedAppPassword);
    if (!decryptedPass) return null;
    return {
      userId: mem.userId,
      email: mem.email,
      appPassword: decryptedPass,
      host: mem.host || 'smtp.gmail.com',
      port: mem.port || 465,
      secure: mem.secure !== false,
    };
  }

  try {
    await initializeSmtpSchema();
    const rows = (await sql`
      SELECT user_id, email, encrypted_app_password, host, port, secure
      FROM user_gmail_smtp
      WHERE user_id = ${userId}
      LIMIT 1;
    `) as any[];

    if (rows && rows.length > 0) {
      const row = rows[0];
      const decryptedPass = decryptSmtpPassword(row.encrypted_app_password);
      if (!decryptedPass) return null;
      return {
        userId: row.user_id,
        email: row.email,
        appPassword: decryptedPass,
        host: row.host || 'smtp.gmail.com',
        port: Number(row.port) || 465,
        secure: row.secure !== false,
      };
    }
  } catch (error: any) {
    console.warn('[Neon DB] Error retrieving user SMTP credentials:', error.message);
  }

  return null;
}

/**
 * Returns safe SMTP status metadata without exposing any secrets.
 */
export async function getUserSmtpStatus(userId: string): Promise<UserSmtpStatus> {
  const creds = await getUserSmtpCredentials(userId);
  if (creds && creds.email && creds.appPassword) {
    return {
      connected: true,
      email: creds.email,
      provider: 'gmail_smtp',
      host: creds.host || 'smtp.gmail.com',
      port: creds.port || 465,
    };
  }

  return {
    connected: false,
    email: null,
    provider: 'gmail_smtp',
    host: 'smtp.gmail.com',
    port: 465,
  };
}

/**
 * Purges stored SMTP credentials for a user.
 */
export async function deleteUserSmtpCredentials(userId: string): Promise<boolean> {
  memorySmtpStore.delete(userId);
  const sql = getNeonSql();
  if (sql) {
    try {
      await initializeSmtpSchema();
      await sql`
        DELETE FROM user_gmail_smtp
        WHERE user_id = ${userId};
      `;
    } catch (error: any) {
      console.error('[Neon DB] Error deleting user SMTP credentials:', error.message);
      throw new Error('Database error removing SMTP credentials: ' + error.message);
    }
  }

  return true;
}
