/**
 * Production Model Failover Orchestrator
 *
 * Implements intelligent, automatic model failover across AI providers (Gemini, OpenAI, OpenRouter, Anthropic, xAI, DeepSeek, HuggingFace, Ollama)
 * with strict provider credential isolation and seamless streaming continuation.
 */

import { aiRegistry } from './registry.js';
import { AIProviderId, StreamChatOptions, ChatMessage } from './types.js';
import {
  providerHealthManager,
  classifyFailure,
  FailureClassification,
  sanitizeErrorText,
} from './providerHealth.js';
import { resolveUserAiCredential } from './credentialResolver.js';

export interface ModelCandidate {
  providerId: AIProviderId;
  model: string;
  isHealthy: boolean;
  priority: number;
}

export interface FailoverExecutionOptions {
  preferredProviderId?: AIProviderId;
  preferredModel?: string;
  candidateModels?: Array<{ providerId: AIProviderId; model: string }>;
  userApiKey?: string;
  userId?: string;
  taskType?: 'chat' | 'agent';
  requireStreaming?: boolean;
  requireToolCalling?: boolean;
  requireVision?: boolean;
  abortSignal?: AbortSignal;
  onFailover?: (event: {
    previousProvider: AIProviderId;
    previousModel: string;
    newProvider: AIProviderId;
    newModel: string;
    classification: FailureClassification;
  }) => void;
}

export interface FailoverAttemptRecord {
  providerId: AIProviderId;
  model: string;
  charsEmitted: number;
  failureReason?: string;
  continuationBoundary?: number;
}

/**
 * Intelligent Stream Overlap Deduplicator
 *
 * Prevents token and paragraph repetition when a secondary provider resumes an interrupted stream.
 * Detects:
 * 1. Full restart from beginning (buffer matches prefix of prior content)
 * 2. Suffix overlap (beginning of backup stream matches ending of prior content)
 * 3. Immediate continuation (zero overlap)
 */
export class StreamOverlapDeduplicator {
  private priorContent: string;
  private buffer = '';
  private overlapResolved = false;
  private emittedCount = 0;

  constructor(priorContent: string) {
    this.priorContent = priorContent || '';
    if (!this.priorContent) {
      this.overlapResolved = true;
    }
  }

  public processDelta(delta: string): string {
    if (!delta) return '';
    if (this.overlapResolved) {
      this.emittedCount += delta.length;
      return delta;
    }

    this.buffer += delta;

    // Check 1: Did the backup provider restart from the exact beginning of prior content?
    if (this.priorContent.startsWith(this.buffer)) {
      if (this.buffer.length >= this.priorContent.length) {
        this.overlapResolved = true;
        const remainder = this.buffer.slice(this.priorContent.length);
        this.buffer = '';
        this.emittedCount += remainder.length;
        return remainder;
      }
      return '';
    }

    if (this.buffer.startsWith(this.priorContent)) {
      this.overlapResolved = true;
      const remainder = this.buffer.slice(this.priorContent.length);
      this.buffer = '';
      this.emittedCount += remainder.length;
      return remainder;
    }

    // Check 2: Suffix overlap (e.g. repeated the last few words or sentence)
    let longestOverlap = 0;
    const maxCheck = Math.min(this.buffer.length, this.priorContent.length, 300);
    for (let len = maxCheck; len >= 1; len--) {
      const bufPrefix = this.buffer.slice(0, len);
      if (this.priorContent.endsWith(bufPrefix)) {
        longestOverlap = len;
        break;
      }
    }

    if (longestOverlap > 0) {
      this.overlapResolved = true;
      const nonOverlapping = this.buffer.slice(longestOverlap);
      this.buffer = '';
      this.emittedCount += nonOverlapping.length;
      return nonOverlapping;
    }

    // Check 3: If buffer has grown past initial boundary without matching overlap, release it
    if (this.buffer.length >= 40 || !this.priorContent) {
      this.overlapResolved = true;
      const out = this.buffer;
      this.buffer = '';
      this.emittedCount += out.length;
      return out;
    }

    return '';
  }

  public flush(): string {
    if (!this.overlapResolved && this.buffer.length > 0) {
      this.overlapResolved = true;
      let longestOverlap = 0;
      const maxCheck = Math.min(this.buffer.length, this.priorContent.length);
      for (let len = maxCheck; len >= 1; len--) {
        const bufPrefix = this.buffer.slice(0, len);
        if (this.priorContent.endsWith(bufPrefix)) {
          longestOverlap = len;
          break;
        }
      }
      const out = this.buffer.slice(longestOverlap);
      this.buffer = '';
      this.emittedCount += out.length;
      return out;
    }
    const out = this.buffer;
    this.buffer = '';
    this.emittedCount += out.length;
    return out;
  }

  public getEmittedCount(): number {
    return this.emittedCount;
  }
}

export class AllProvidersExhaustedError extends Error {
  public readonly isAllProvidersExhausted = true;
  public readonly attemptedProviders: Array<{ providerId: AIProviderId; model: string; error: string }>;

  constructor(
    message: string,
    attempted: Array<{ providerId: AIProviderId; model: string; error: string }>
  ) {
    super(message);
    this.name = 'AllProvidersExhaustedError';
    this.attemptedProviders = attempted;
  }
}

export class FailoverManager {
  /**
   * Resolves the prioritized list of model candidates for execution.
   * Strictly enforces provider-specific configuration: a backup provider is only included
   * if it has its own valid credentials configured, never inheriting primary provider keys.
   */
  public getCandidateModels(options: {
    preferredProviderId?: AIProviderId;
    preferredModel?: string;
    userApiKey?: string;
    userId?: string;
    requireStreaming?: boolean;
    requireToolCalling?: boolean;
    requireVision?: boolean;
    excludeCandidates?: Array<{ providerId: AIProviderId; model: string }>;
  }): ModelCandidate[] {
    const {
      preferredProviderId,
      preferredModel,
      userApiKey,
      requireStreaming,
      requireToolCalling,
      requireVision,
      excludeCandidates = [],
    } = options;
    const candidates: ModelCandidate[] = [];

    // Fallback model map per provider
    const providerFallbackModels: Record<AIProviderId, string[]> = {
      google: ['gemini-3.7-flash', 'gemini-3.1-pro-preview', 'gemini-flash-latest', 'gemini-3.1-flash-lite', 'gemini-2.5-flash'],
      openai: ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo'],
      openrouter: ['google/gemini-2.0-flash-001', 'openai/gpt-4o-mini', 'meta-llama/llama-3.3-70b-instruct:free', 'deepseek/deepseek-chat'],
      anthropic: ['claude-3-5-haiku-20241022', 'claude-3-5-sonnet-20241022', 'claude-3-7-sonnet-20250219'],
      xai: ['grok-2-latest', 'grok-beta'],
      deepseek: ['deepseek-chat', 'deepseek-reasoner'],
      huggingface: ['meta-llama/Llama-3.3-70B-Instruct', 'mistralai/Mistral-7B-Instruct-v0.3', 'Qwen/Qwen2.5-72B-Instruct'],
      ollama: ['llama3.2', 'mistral', 'qwen2.5', 'llama3.3'],
    };

    const isCapabilityCompatible = (p: any): boolean => {
      if (!p) return false;
      if (requireStreaming && !p.capabilities?.streaming) return false;
      if (requireToolCalling && !p.capabilities?.toolCalling) return false;
      if (requireVision && !p.capabilities?.vision) return false;
      return true;
    };

    // 1. Add preferred candidate first if provided
    if (preferredProviderId && preferredModel) {
      const preferredProvider = aiRegistry.get(preferredProviderId);
      const isConfigured = Boolean(preferredProvider?.isConfigured()) || Boolean(userApiKey);
      if (isConfigured && isCapabilityCompatible(preferredProvider)) {
        const isHealthy = providerHealthManager.isHealthy(preferredProviderId);
        candidates.push({
          providerId: preferredProviderId,
          model: preferredModel,
          isHealthy,
          priority: 100,
        });
      }
    }

    // 2. Add alternate models on preferred provider
    if (preferredProviderId) {
      const preferredProvider = aiRegistry.get(preferredProviderId);
      const isConfigured = Boolean(preferredProvider?.isConfigured()) || Boolean(userApiKey);
      if (isConfigured && isCapabilityCompatible(preferredProvider)) {
        const altModels = providerFallbackModels[preferredProviderId] || [];
        for (const m of altModels) {
          if (m !== preferredModel) {
            const isHealthy = providerHealthManager.isHealthy(preferredProviderId);
            candidates.push({
              providerId: preferredProviderId,
              model: m,
              isHealthy,
              priority: 80,
            });
          }
        }
      }
    }

    // 3. Add other configured providers from registry.
    // CRITICAL: Strict credential isolation - each backup provider MUST have its own independent configuration!
    const allRegistered = aiRegistry.getAll();
    for (const p of allRegistered) {
      const pId = p.id;
      if (pId === preferredProviderId) continue;
      if (!isCapabilityCompatible(p)) continue;

      // Independent configuration check for backup provider (do NOT pass primary userApiKey)
      const hasIndependentConfig = p.isConfigured();

      if (hasIndependentConfig) {
        const isHealthy = providerHealthManager.isHealthy(pId);
        const models = providerFallbackModels[pId] || [p.defaultModel];
        for (let i = 0; i < models.length; i++) {
          candidates.push({
            providerId: pId,
            model: models[i],
            isHealthy,
            priority: isHealthy ? 60 - i * 5 : 20 - i * 5,
          });
        }
      }
    }

    // Filter out already attempted candidates
    const filtered = candidates.filter((c) => {
      return !excludeCandidates.some(
        (ex) => ex.providerId === c.providerId && ex.model === c.model
      );
    });

    // Deduplicate candidates
    const unique: ModelCandidate[] = [];
    const seen = new Set<string>();
    for (const c of filtered) {
      const key = `${c.providerId}:${c.model}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(c);
      }
    }

    // Sort: healthy first, then by priority descending
    return unique.sort((a, b) => {
      if (a.isHealthy && !b.isHealthy) return -1;
      if (!a.isHealthy && b.isHealthy) return 1;
      return b.priority - a.priority;
    });
  }

  /**
   * Resolves the dedicated API key for a candidate provider, strictly isolating credentials.
   */
  public async resolveProviderApiKey(
    candidateProviderId: AIProviderId,
    preferredProviderId?: AIProviderId,
    userApiKey?: string,
    userId?: string
  ): Promise<string | undefined> {
    return resolveUserAiCredential({
      userId,
      providerId: candidateProviderId,
      explicitApiKey: candidateProviderId === preferredProviderId ? userApiKey : undefined,
    });
  }

  /**
   * Executes an asynchronous AI operation with automated retry and failover across providers.
   */
  public async executeWithFailover<T>(
    operation: (providerId: AIProviderId, model: string, apiKey?: string) => Promise<T>,
    options: FailoverExecutionOptions = {}
  ): Promise<{ result: T; providerId: AIProviderId; model: string }> {
    const {
      preferredProviderId = 'google',
      preferredModel = 'gemini-2.5-flash',
      onFailover,
      abortSignal,
      userApiKey,
      userId,
      requireStreaming,
      requireToolCalling,
      requireVision,
    } = options;

    const attempted: Array<{ providerId: AIProviderId; model: string; error: string }> = [];
    let currentCandidates = options.candidateModels
      ? options.candidateModels.map((c, i) => ({
          providerId: c.providerId,
          model: c.model,
          isHealthy: providerHealthManager.isHealthy(c.providerId),
          priority: 100 - i * 10,
        }))
      : this.getCandidateModels({
          preferredProviderId,
          preferredModel,
          userApiKey,
          userId,
          requireStreaming,
          requireToolCalling,
          requireVision,
          excludeCandidates: [],
        });

    if (currentCandidates.length === 0) {
      currentCandidates = [
        {
          providerId: preferredProviderId,
          model: preferredModel,
          isHealthy: true,
          priority: 100,
        },
      ];
    }

    for (let i = 0; i < currentCandidates.length; i++) {
      if (abortSignal?.aborted) {
        throw new Error('Task aborted by user');
      }

      const candidate = currentCandidates[i];
      const effectiveApiKey = await this.resolveProviderApiKey(candidate.providerId, preferredProviderId, userApiKey, userId);

      try {
        const result = await operation(candidate.providerId, candidate.model, effectiveApiKey);
        // Record success and clear cooldown
        providerHealthManager.recordSuccess(candidate.providerId);
        return { result, providerId: candidate.providerId, model: candidate.model };
      } catch (err: any) {
        const classification = providerHealthManager.recordFailure(candidate.providerId, err);
        attempted.push({
          providerId: candidate.providerId,
          model: candidate.model,
          error: classification.sanitizedMessage,
        });

        // Determine next candidate
        const nextCandidate = currentCandidates.slice(i + 1).find((c) => {
          if (classification.type === 'QUOTA_EXCEEDED' || classification.type === 'AUTH_ERROR') {
            return c.providerId !== candidate.providerId;
          }
          return true;
        });

        if (nextCandidate) {
          console.log(
            `[FAILOVER TRIGGERED]\nfrom=${candidate.providerId} (${candidate.model})\nto=${nextCandidate.providerId} (${nextCandidate.model})\nreason="${classification.sanitizedMessage}"`
          );

          if (onFailover) {
            onFailover({
              previousProvider: candidate.providerId,
              previousModel: candidate.model,
              newProvider: nextCandidate.providerId,
              newModel: nextCandidate.model,
              classification,
            });
          }
        }
      }
    }

    // All available models exhausted
    const cleanExplanation =
      'I couldn’t complete this request right now because all connected AI models are currently unavailable (quota or rate limits reached). Your progress has been safely saved so the task can resume when provider capacity recovers.';

    throw new AllProvidersExhaustedError(cleanExplanation, attempted);
  }

  /**
   * Executes streaming chat with automatic failover protection and true semantic continuation.
   * If a provider fails mid-stream after emitting partial tokens, the backup provider resumes
   * from the exact logical stopping point without repeating the completed text.
   */
  public async streamChatWithFailover(
    options: Omit<StreamChatOptions, 'model'> & {
      preferredProviderId: AIProviderId;
      preferredModel?: string;
      model?: string;
      candidateModels?: Array<{ providerId: AIProviderId; model: string }>;
      messages: ChatMessage[];
      userApiKey?: string;
      userId?: string;
    }
  ): Promise<{ providerId: AIProviderId; model: string }> {
    const {
      preferredProviderId,
      model,
      preferredModel = model,
      candidateModels,
      onEvent,
      taskId,
      abortSignal,
      messages,
      systemPrompt,
      temperature,
      maxTokens,
      userApiKey,
      userId,
    } = options;

    let accumulatedContent = '';
    const attempts: FailoverAttemptRecord[] = [];
    const attempted: Array<{ providerId: AIProviderId; model: string; error: string }> = [];

    const candidates = candidateModels
      ? candidateModels.map((c, i) => ({
          providerId: c.providerId,
          model: c.model,
          isHealthy: providerHealthManager.isHealthy(c.providerId),
          priority: 100 - i * 10,
        }))
      : this.getCandidateModels({
          preferredProviderId,
          preferredModel,
          userApiKey,
          userId,
          requireStreaming: true,
        });

    for (let i = 0; i < candidates.length; i++) {
      if (abortSignal?.aborted) {
        return { providerId: candidates[i].providerId, model: candidates[i].model };
      }

      const candidate = candidates[i];
      const providerInstance = aiRegistry.get(candidate.providerId);
      if (!providerInstance) continue;

      // Resolve candidate's own key strictly (credential isolation)
      const effectiveApiKey = await this.resolveProviderApiKey(candidate.providerId, preferredProviderId, userApiKey, userId);

      if (!providerInstance.isConfigured(effectiveApiKey) && !effectiveApiKey && candidate.providerId !== 'ollama') {
        continue;
      }

      // Check if we need to resume via semantic continuation from mid-stream failure
      const isContinuation = accumulatedContent.length > 0;
      let continuationMessages = messages;
      let effectiveSystemPrompt = systemPrompt;

      if (isContinuation) {
        // Construct seamless continuation prompt to avoid repetition
        effectiveSystemPrompt = `${systemPrompt || ''}\n\n[CONTINUATION DIRECTIVE]: The previous AI model was interrupted after generating the following partial response:\n\"\"\"${accumulatedContent}\"\"\"\nResume the response seamlessly starting EXACTLY where it stopped. Do NOT repeat or restart any of the above text. Output only the continuation.`.trim();

        // Include recent partial turn context
        const lastMsg = messages[messages.length - 1];
        if (lastMsg && lastMsg.role === 'user') {
          continuationMessages = [
            ...messages.slice(0, -1),
            {
              role: 'user',
              content: `${lastMsg.content}\n\n[Context: You are continuing this response seamlessly from where it cut off: "${accumulatedContent.slice(-200)}"]`,
            },
          ];
        }
      }

      const deduplicator = new StreamOverlapDeduplicator(isContinuation ? accumulatedContent : '');
      let nonDuplicateStreamed = '';

      try {
        await providerInstance.streamChat({
          taskId,
          apiKey: effectiveApiKey,
          messages: continuationMessages,
          systemPrompt: effectiveSystemPrompt,
          model: candidate.model,
          temperature,
          maxTokens,
          abortSignal,
          onEvent: (event) => {
            if (event.type === 'message.delta') {
              const delta = event.content || '';
              const cleanedDelta = deduplicator.processDelta(delta);
              if (cleanedDelta) {
                nonDuplicateStreamed += cleanedDelta;
                onEvent({
                  type: 'message.delta',
                  content: cleanedDelta,
                });
              }
            } else if (event.type === 'message.completed') {
              const remaining = deduplicator.flush();
              if (remaining) {
                nonDuplicateStreamed += remaining;
                onEvent({
                  type: 'message.delta',
                  content: remaining,
                });
              }
              // Final completed response combines initial partial and deduplicated continuation
              const fullResponse = (accumulatedContent + nonDuplicateStreamed).trim();
              onEvent({
                type: 'message.completed',
                content: fullResponse || event.content,
              });
            } else {
              onEvent(event);
            }
          },
        });

        // Flush any remaining tokens
        const remaining = deduplicator.flush();
        if (remaining) {
          nonDuplicateStreamed += remaining;
          onEvent({
            type: 'message.delta',
            content: remaining,
          });
        }

        // Provider completed successfully
        accumulatedContent += nonDuplicateStreamed;
        providerHealthManager.recordSuccess(candidate.providerId);
        attempts.push({
          providerId: candidate.providerId,
          model: candidate.model,
          charsEmitted: nonDuplicateStreamed.length,
          continuationBoundary: accumulatedContent.length,
        });

        return { providerId: candidate.providerId, model: candidate.model };
      } catch (err: any) {
        const remaining = deduplicator.flush();
        if (remaining) {
          nonDuplicateStreamed += remaining;
          onEvent({
            type: 'message.delta',
            content: remaining,
          });
        }
        accumulatedContent += nonDuplicateStreamed; // Preserve whatever was successfully emitted

        const classification = providerHealthManager.recordFailure(candidate.providerId, err);
        attempts.push({
          providerId: candidate.providerId,
          model: candidate.model,
          charsEmitted: nonDuplicateStreamed.length,
          failureReason: classification.sanitizedMessage,
          continuationBoundary: accumulatedContent.length,
        });

        attempted.push({
          providerId: candidate.providerId,
          model: candidate.model,
          error: classification.sanitizedMessage,
        });

        const nextCandidate = candidates.slice(i + 1).find((c) => {
          if (classification.type === 'QUOTA_EXCEEDED' || classification.type === 'AUTH_ERROR') {
            return c.providerId !== candidate.providerId;
          }
          return true;
        });

        if (nextCandidate) {
          console.log(
            `[STREAM FAILOVER TRIGGERED]\nfrom=${candidate.providerId} (${candidate.model})\nto=${nextCandidate.providerId} (${nextCandidate.model})\npartialLength=${accumulatedContent.length}\nreason="${classification.sanitizedMessage}"`
          );

          // Subtle user-facing notice without raw error exposure
          onEvent({
            type: 'provider.failover',
            message: 'Continuing seamlessly with backup model...',
            provider: nextCandidate.providerId,
            model: nextCandidate.model,
          });
        }
      }
    }

    // All exhausted
    const cleanExplanation =
      'I couldn’t complete this request right now because all connected AI models are currently unavailable (quota or rate limits reached). Please try again shortly or configure an alternate API key in Settings.';

    throw new AllProvidersExhaustedError(cleanExplanation, attempted);
  }
}

export const failoverManager = new FailoverManager();

