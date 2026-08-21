/**
 * Multi-Tenant AI Credential Resolver
 *
 * Authoritative, user-scoped credential isolation layer.
 * Guarantees that:
 * 1. User credentials are resolved per-request from the database (or explicit user key).
 * 2. Provider instances and global registries NEVER hold mutable user credentials in memory.
 * 3. Failover strictly resolves credentials for each candidate provider independently for the active user.
 * 4. Credentials never leak across users or sessions.
 */

import { AIProviderId } from './types.js';
import { getDecryptedUserApiKey } from '../db/aiKeys.js';

/**
 * Returns optional server-level environment variable fallback for a provider.
 * Used ONLY when no user-specific key exists and server has a global key configured (e.g. CLI or single-tenant mode).
 */
export function getProviderEnvFallbackKey(providerId: AIProviderId): string | undefined {
  let envKey: string | undefined;

  switch (providerId) {
    case 'google':
      envKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
      break;
    case 'openai':
      envKey = process.env.OPENAI_API_KEY;
      break;
    case 'openrouter':
      envKey = process.env.OPENROUTER_API_KEY;
      break;
    case 'anthropic':
      envKey = process.env.ANTHROPIC_API_KEY;
      break;
    case 'xai':
      envKey = process.env.XAI_API_KEY;
      break;
    case 'deepseek':
      envKey = process.env.DEEPSEEK_API_KEY;
      break;
    case 'huggingface':
      envKey = process.env.HUGGINGFACE_API_KEY || process.env.HF_TOKEN;
      break;
    case 'ollama':
      envKey = process.env.OLLAMA_BASE_URL || process.env.OLLAMA_API_KEY;
      break;
    default:
      envKey = undefined;
  }

  if (!envKey || typeof envKey !== 'string') return undefined;
  const trimmed = envKey.trim();
  const upper = trimmed.toUpperCase();
  if (
    trimmed.length < 3 ||
    upper.includes('YOUR_API_KEY') ||
    upper.includes('PLACEHOLDER') ||
    upper.startsWith('MY_')
  ) {
    return undefined;
  }

  return trimmed;
}

export interface ResolveCredentialOptions {
  userId?: string;
  providerId: AIProviderId;
  explicitApiKey?: string;
}

/**
 * Resolves the decrypted API key for a specific user and provider.
 * Strict resolution order:
 * 1. Explicit API key (if provided for the current execution)
 * 2. User's encrypted API key from PostgreSQL / memory store (if userId provided)
 * 3. Server environment variable fallback (if available)
 */
export async function resolveUserAiCredential(options: ResolveCredentialOptions): Promise<string | undefined> {
  const { userId, providerId, explicitApiKey } = options;

  if (explicitApiKey && typeof explicitApiKey === 'string' && explicitApiKey.trim().length > 0) {
    return explicitApiKey.trim();
  }

  if (userId) {
    try {
      const userKey = await getDecryptedUserApiKey(userId, providerId);
      if (userKey && userKey.trim().length > 0) {
        return userKey.trim();
      }
    } catch (err: any) {
      console.warn(`[Credential Resolver] Notice decrypting key for user ${userId}, provider ${providerId}:`, err.message);
    }
  }

  // Fallback to server-level environment variable (e.g. for development or CLI runs)
  const envFallback = getProviderEnvFallbackKey(providerId);
  if (envFallback) {
    return envFallback;
  }

  return undefined;
}

/**
 * Checks whether a provider is configured for a specific user.
 */
export async function isProviderConfiguredForUser(
  providerId: AIProviderId,
  userId?: string,
  explicitApiKey?: string
): Promise<boolean> {
  if (explicitApiKey && typeof explicitApiKey === 'string' && explicitApiKey.trim().length > 0) {
    return true;
  }

  if (userId) {
    try {
      const userKey = await getDecryptedUserApiKey(userId, providerId);
      if (userKey && userKey.trim().length > 0) {
        return true;
      }
    } catch {
      // ignore
    }
  }

  const envFallback = getProviderEnvFallbackKey(providerId);
  if (envFallback) {
    return true;
  }

  if (providerId === 'ollama') {
    return true; // Local Ollama can be running on default localhost:11434
  }

  return false;
}
