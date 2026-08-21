/**
 * Centralized AI Provider Reliability & Health Management Layer
 *
 * Classifies failure types (Quota, Rate Limit, Timeout, Auth, Server 5xx, etc.),
 * manages cooldown / backoff timers, and provides sanitized error diagnostics
 * with zero raw API key or token exposure.
 */

import { AIProviderId } from './types.js';

export type ProviderFailureType =
  | 'QUOTA_EXCEEDED'
  | 'RATE_LIMITED'
  | 'TIMEOUT'
  | 'AUTH_ERROR'
  | 'MODEL_UNAVAILABLE'
  | 'SERVER_ERROR'
  | 'NETWORK_ERROR'
  | 'INVALID_REQUEST'
  | 'UNKNOWN';

export type ProviderHealthStatus =
  | 'healthy'
  | 'degraded'
  | 'rate_limited'
  | 'quota_exhausted'
  | 'temporarily_unavailable'
  | 'disabled';

export interface FailureClassification {
  type: ProviderFailureType;
  status: ProviderHealthStatus;
  retryable: boolean;
  immediateFailover: boolean;
  backoffMs: number;
  sanitizedMessage: string;
  originalStatus?: number;
}

export interface ProviderHealthRecord {
  providerId: AIProviderId;
  status: ProviderHealthStatus;
  lastFailureType?: ProviderFailureType;
  lastFailureTime?: number;
  consecutiveFailures: number;
  backoffUntil?: number;
  sanitizedErrorMessage?: string;
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
}

// In-memory health store with cooldown tracking
const healthStore = new Map<AIProviderId, ProviderHealthRecord>();

// Cooldown configuration by failure type
const COOLDOWNS_MS: Record<ProviderFailureType, number> = {
  QUOTA_EXCEEDED: 5 * 60 * 1000, // 5 minutes cooldown for exhausted quotas
  RATE_LIMITED: 30 * 1000, // 30 seconds cooldown for 429 rate limits
  TIMEOUT: 15 * 1000, // 15 seconds cooldown for timeouts
  AUTH_ERROR: 60 * 60 * 1000, // 1 hour for invalid credentials
  MODEL_UNAVAILABLE: 10 * 60 * 1000, // 10 minutes for nonexistent/deprecated models
  SERVER_ERROR: 20 * 1000, // 20 seconds for upstream 5xx
  NETWORK_ERROR: 10 * 1000, // 10 seconds for network glitches
  INVALID_REQUEST: 5 * 1000,
  UNKNOWN: 15 * 1000,
};

/**
 * Sanitizes any raw string or error to guarantee no API keys, Bearer tokens, or passwords are exposed.
 */
export function sanitizeErrorText(raw: any): string {
  if (!raw) return 'Unknown error occurred.';
  let str = typeof raw === 'string' ? raw : raw?.message || String(raw);

  // Strip Bearer tokens first
  str = str.replace(/Bearer\s+[A-Za-z0-9_\-.~+/=]+/gi, 'Bearer [REDACTED]');
  str = str.replace(/x-api-key\s*[:=]\s*['"]?[^\s'",;]+['"]?/gi, 'x-api-key: [REDACTED]');
  
  // Strip API keys matching common patterns (Google, OpenAI, Anthropic, OpenRouter, xAI, HuggingFace, DeepSeek)
  str = str.replace(/AIza[0-9A-Za-z-_]{10,}/g, '[REDACTED_API_KEY]');
  str = str.replace(/sk-ant-[A-Za-z0-9_-]{10,}/g, '[REDACTED_API_KEY]');
  str = str.replace(/sk-or-v1-[A-Za-z0-9_-]{10,}/g, '[REDACTED_API_KEY]');
  str = str.replace(/sk-[A-Za-z0-9_-]{8,}/g, '[REDACTED_API_KEY]');
  str = str.replace(/xai-[A-Za-z0-9_-]{8,}/g, '[REDACTED_API_KEY]');
  str = str.replace(/hf_[A-Za-z0-9_-]{8,}/g, '[REDACTED_API_KEY]');
  str = str.replace(/dsk-[A-Za-z0-9_-]{8,}/g, '[REDACTED_API_KEY]');
  str = str.replace(/key=[A-Za-z0-9_-]{8,}/gi, 'key=[REDACTED]');

  // Strip other key-value secret fields (e.g. password=..., secret=..., api_key=...)
  str = str.replace(/(?:password|secret|token|apikey|api_key|auth_header)\s*[:=]\s*['"]?[^\s'",;]+['"]?/gi, (match) => {
    const prefix = match.split(/[:=]/)[0];
    return `${prefix}=[REDACTED]`;
  });

  return str.trim();
}

/**
 * Classifies an error into a standardized ProviderFailureType with retry/failover policy.
 */
export function classifyFailure(error: any): FailureClassification {
  const message = (error?.message || String(error || '')).toLowerCase();
  const status = Number(error?.status || error?.statusCode || error?.code);
  const sanitized = sanitizeErrorText(error);

  // 1. Quota Exceeded (429 with quota keyword, RESOURCE_EXHAUSTED, daily limit, billing)
  if (
    message.includes('quota') ||
    message.includes('resource_exhausted') ||
    message.includes('exceeded your current quota') ||
    message.includes('daily limit') ||
    message.includes('insufficient_quota') ||
    message.includes('credit balance is too low') ||
    message.includes('billing')
  ) {
    return {
      type: 'QUOTA_EXCEEDED',
      status: 'quota_exhausted',
      retryable: false,
      immediateFailover: true,
      backoffMs: COOLDOWNS_MS.QUOTA_EXCEEDED,
      sanitizedMessage: 'AI provider quota limit reached. Switching to alternative model.',
      originalStatus: status || 429,
    };
  }

  // 2. Rate Limited (Standard 429 without permanent quota exhaustion)
  if (
    status === 429 ||
    message.includes('rate limit') ||
    message.includes('too many requests') ||
    message.includes('429')
  ) {
    return {
      type: 'RATE_LIMITED',
      status: 'rate_limited',
      retryable: true,
      immediateFailover: true,
      backoffMs: COOLDOWNS_MS.RATE_LIMITED,
      sanitizedMessage: 'AI provider rate limit encountered. Backing off and failing over.',
      originalStatus: 429,
    };
  }

  // 3. Authentication & Permission Errors (401, 403, invalid api key)
  if (
    status === 401 ||
    status === 403 ||
    message.includes('unauthorized') ||
    message.includes('forbidden') ||
    message.includes('invalid api key') ||
    message.includes('api key is invalid') ||
    (message.includes('api key') && (message.includes('invalid') || message.includes('expired'))) ||
    message.includes('invalid key') ||
    message.includes('authentication') ||
    message.includes('api_key_invalid') ||
    message.includes('permission denied')
  ) {
    return {
      type: 'AUTH_ERROR',
      status: 'disabled',
      retryable: false,
      immediateFailover: true,
      backoffMs: COOLDOWNS_MS.AUTH_ERROR,
      sanitizedMessage: 'AI provider authentication failed. Please verify API key.',
      originalStatus: status || 401,
    };
  }

  // 4. Model Unavailable / Deprecated / 404
  if (
    status === 404 ||
    message.includes('not found') ||
    message.includes('model not found') ||
    message.includes('model is not available') ||
    message.includes('deprecated') ||
    message.includes('no longer supported')
  ) {
    return {
      type: 'MODEL_UNAVAILABLE',
      status: 'degraded',
      retryable: false,
      immediateFailover: true,
      backoffMs: COOLDOWNS_MS.MODEL_UNAVAILABLE,
      sanitizedMessage: 'Selected model is unavailable. Switching to alternative model.',
      originalStatus: 404,
    };
  }

  // 5. Timeouts & Network Aborts
  if (
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('time out') ||
    message.includes('deadline exceeded') ||
    message.includes('etimedout') ||
    message.includes('econnaborted') ||
    message.includes('aborted') ||
    message.includes('fetch failed') ||
    message.includes('econnreset')
  ) {
    return {
      type: 'TIMEOUT',
      status: 'temporarily_unavailable',
      retryable: true,
      immediateFailover: true,
      backoffMs: COOLDOWNS_MS.TIMEOUT,
      sanitizedMessage: 'Request to AI provider timed out. Failing over to backup.',
      originalStatus: 408,
    };
  }

  // 6. Upstream Server 5xx Errors (500, 502, 503, 504, overloaded, bad gateway)
  if (
    (status >= 500 && status <= 599) ||
    message.includes('500') ||
    message.includes('502') ||
    message.includes('503') ||
    message.includes('504') ||
    message.includes('overloaded') ||
    message.includes('server error') ||
    message.includes('internal error')
  ) {
    return {
      type: 'SERVER_ERROR',
      status: 'temporarily_unavailable',
      retryable: true,
      immediateFailover: true,
      backoffMs: COOLDOWNS_MS.SERVER_ERROR,
      sanitizedMessage: 'AI provider server temporarily overloaded. Switching to backup.',
      originalStatus: status || 500,
    };
  }

  // 7. Invalid Request (400 Bad Request)
  if (status === 400 || message.includes('bad request') || message.includes('invalid_request')) {
    return {
      type: 'INVALID_REQUEST',
      status: 'healthy',
      retryable: false,
      immediateFailover: false,
      backoffMs: 0,
      sanitizedMessage: `Invalid request: ${sanitized.slice(0, 100)}`,
      originalStatus: 400,
    };
  }

  return {
    type: 'UNKNOWN',
    status: 'degraded',
    retryable: true,
    immediateFailover: true,
    backoffMs: COOLDOWNS_MS.UNKNOWN,
    sanitizedMessage: `Provider error: ${sanitized.slice(0, 100)}`,
    originalStatus: status || 500,
  };
}

class ProviderHealthManager {
  private getOrCreateRecord(providerId: AIProviderId): ProviderHealthRecord {
    let rec = healthStore.get(providerId);
    if (!rec) {
      rec = {
        providerId,
        status: 'healthy',
        consecutiveFailures: 0,
        totalCalls: 0,
        successfulCalls: 0,
        failedCalls: 0,
      };
      healthStore.set(providerId, rec);
    }
    return rec;
  }

  /**
   * Checks if a provider is currently considered healthy and ready to accept requests.
   */
  public isHealthy(providerId: AIProviderId): boolean {
    const rec = this.getOrCreateRecord(providerId);
    const now = Date.now();

    if (rec.backoffUntil && now < rec.backoffUntil) {
      return false; // Still in cooldown
    }

    if (rec.status === 'disabled') {
      return false;
    }

    return true;
  }

  /**
   * Alias for isHealthy.
   */
  public isAvailable(providerId: AIProviderId): boolean {
    return this.isHealthy(providerId);
  }

  /**
   * Returns current health record for a specific provider.
   */
  public getHealth(providerId: AIProviderId): ProviderHealthRecord {
    return { ...this.getOrCreateRecord(providerId) };
  }

  /**
   * Resets all provider health states.
   */
  public resetAll(): void {
    healthStore.clear();
  }

  /**
   * Records a successful execution for a provider, clearing cooldowns.
   */
  public recordSuccess(providerId: AIProviderId): void {
    const rec = this.getOrCreateRecord(providerId);
    rec.totalCalls += 1;
    rec.successfulCalls += 1;
    rec.consecutiveFailures = 0;
    rec.status = 'healthy';
    rec.backoffUntil = undefined;
    rec.sanitizedErrorMessage = undefined;
  }

  /**
   * Records a failure for a provider and updates backoff and health state.
   */
  public recordFailure(providerId: AIProviderId, error: any): FailureClassification {
    const rec = this.getOrCreateRecord(providerId);
    const classification = classifyFailure(error);

    rec.totalCalls += 1;
    rec.failedCalls += 1;
    rec.consecutiveFailures += 1;
    rec.lastFailureType = classification.type;
    rec.lastFailureTime = Date.now();
    rec.status = classification.status;
    rec.sanitizedErrorMessage = classification.sanitizedMessage;

    // Exponential backoff scaling for repeated consecutive failures
    const multiplier = Math.min(Math.pow(1.5, rec.consecutiveFailures - 1), 5);
    rec.backoffUntil = Date.now() + classification.backoffMs * multiplier;

    console.log(
      `[PROVIDER HEALTH UPDATE]\nprovider=${providerId}\nstatus=${rec.status}\nfailureType=${classification.type}\nconsecutiveFailures=${rec.consecutiveFailures}\ncooldownSec=${Math.round(
        (classification.backoffMs * multiplier) / 1000
      )}\nmessage="${classification.sanitizedMessage}"`
    );

    return classification;
  }

  /**
   * Resets health state for a provider (e.g., when a user updates their API key).
   */
  public resetProvider(providerId: AIProviderId): void {
    const rec = this.getOrCreateRecord(providerId);
    rec.status = 'healthy';
    rec.consecutiveFailures = 0;
    rec.backoffUntil = undefined;
    rec.sanitizedErrorMessage = undefined;
  }

  /**
   * Returns current health overview for all providers.
   */
  public getHealthSummary(): Record<AIProviderId, ProviderHealthRecord> {
    const summary: Record<string, ProviderHealthRecord> = {};
    const providers: AIProviderId[] = [
      'google',
      'openai',
      'openrouter',
      'anthropic',
      'xai',
      'deepseek',
      'huggingface',
      'ollama',
    ];
    for (const p of providers) {
      summary[p] = { ...this.getOrCreateRecord(p) };
    }
    return summary as Record<AIProviderId, ProviderHealthRecord>;
  }
}

export const providerHealthManager = new ProviderHealthManager();
