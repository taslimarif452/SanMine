/**
 * LLM Client for Universal Agent Brain
 *
 * Communicates with the configured AI provider (Google Gemini, OpenAI, OpenRouter)
 * and guarantees clean JSON parsing and extraction.
 */

import { GoogleGenAI } from '@google/genai';
import { AIProviderId } from '../../ai/types.js';
import { aiRegistry } from '../../ai/registry.js';
import { failoverManager } from '../../ai/failoverManager.js';

export interface BrainLLMCompletionOptions {
  providerId: AIProviderId;
  model: string;
  userApiKey?: string;
  userId?: string;
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
  abortSignal?: AbortSignal;
  onFailover?: (event: any) => void;
}

export interface BrainLLMCompletionResult {
  text: string;
  json: any | null;
  providerId: AIProviderId;
  model: string;
  rawResponse?: any;
}

/**
 * Extracts and parses JSON from raw LLM text safely.
 */
export function extractAndParseJson(text: string): any | null {
  if (!text || typeof text !== 'string') return null;

  const trimmed = text.trim();

  // Try direct parse first
  try {
    return JSON.parse(trimmed);
  } catch {}

  // Try markdown code block extraction
  const jsonBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (jsonBlockMatch && jsonBlockMatch[1]) {
    try {
      return JSON.parse(jsonBlockMatch[1].trim());
    } catch {}
  }

  // Try finding outer-most braces { ... }
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const candidate = trimmed.substring(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(candidate);
    } catch {
      // Try fixing trailing commas
      try {
        const cleaned = candidate.replace(/,\s*([}\]])/g, '$1');
        return JSON.parse(cleaned);
      } catch {}
    }
  }

  // Try finding array [ ... ]
  const firstBracket = trimmed.indexOf('[');
  const lastBracket = trimmed.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    const candidate = trimmed.substring(firstBracket, lastBracket + 1);
    try {
      return JSON.parse(candidate);
    } catch {}
  }

  return null;
}

export class BrainLLMClient {
  async complete(options: BrainLLMCompletionOptions): Promise<BrainLLMCompletionResult> {
    const {
      providerId: preferredProviderId,
      model: preferredModel,
      userApiKey,
      userId,
      systemPrompt,
      userPrompt,
      temperature = 0.2,
      maxTokens = 4096,
      jsonMode = true,
      abortSignal,
      onFailover,
    } = options;

    const { result: responseText, providerId: actualProvider, model: actualModel } = await failoverManager.executeWithFailover(
      async (pId, pModel, resolvedApiKey) => {
        const provider = aiRegistry.get(pId);
        if (!provider) {
          throw new Error(`AI Provider "${pId}" is not registered.`);
        }

        const effectiveApiKey = (resolvedApiKey || '').trim();
        // Ollama does not strictly require an API key unless configured
        if (!effectiveApiKey && pId !== 'ollama') {
          throw new Error(`API key for provider "${pId}" is not configured.`);
        }

        // 1. Google Gemini fast path with native JSON mime type support (for genuine Gemini API keys)
        if (pId === 'google' && effectiveApiKey.startsWith('AIza')) {
          try {
            return await this.completeGemini({
              apiKey: effectiveApiKey,
              model: pModel,
              systemPrompt,
              userPrompt,
              temperature,
              maxTokens,
              jsonMode,
              abortSignal,
            });
          } catch (geminiErr: any) {
            console.warn(`[Brain Gemini Direct Completion Notice]: ${geminiErr.message}. Falling back to universal stream completion.`);
          }
        }

        // 2. Universal fallback across all 8 providers (OpenAI, OpenRouter, Anthropic, xAI, DeepSeek, HuggingFace, Ollama, Gemini)
        return await this.completeViaProviderStream({
          provider,
          apiKey: effectiveApiKey,
          model: pModel,
          systemPrompt,
          userPrompt,
          temperature,
          maxTokens,
          jsonMode,
          abortSignal,
        });
      },
      {
        preferredProviderId,
        preferredModel,
        userApiKey,
        userId,
        abortSignal,
        onFailover,
      }
    );

    const parsedJson = extractAndParseJson(responseText);

    return {
      text: responseText,
      json: parsedJson,
      providerId: actualProvider,
      model: actualModel,
    };
  }

  private async completeGemini(opts: {
    apiKey: string;
    model: string;
    systemPrompt: string;
    userPrompt: string;
    temperature: number;
    maxTokens: number;
    jsonMode: boolean;
    abortSignal?: AbortSignal;
  }): Promise<string> {
    const ai = new GoogleGenAI({ apiKey: opts.apiKey });

    let rawModel = (opts.model || 'gemini-2.5-flash').replace(/^models\//, '');
    if (rawModel === 'gemini-2.5-flash') {
      rawModel = 'gemini-2.5-flash';
    }

    const config: any = {
      systemInstruction: opts.systemPrompt,
      temperature: opts.temperature,
      maxOutputTokens: opts.maxTokens,
    };

    if (opts.jsonMode) {
      config.responseMimeType = 'application/json';
    }

    try {
      const response = await ai.models.generateContent({
        model: rawModel,
        contents: [{ role: 'user', parts: [{ text: opts.userPrompt }] }],
        config,
      });
      return response.text || '';
    } catch (err: any) {
      const errMsg = String(err?.message || '');
      if (errMsg.includes('not found') || errMsg.includes('404') || errMsg.includes('no longer available')) {
        // Retry with default stable models
        const fallbacks = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];
        for (const fb of fallbacks) {
          if (fb === rawModel) continue;
          try {
            const fbResponse = await ai.models.generateContent({
              model: fb,
              contents: [{ role: 'user', parts: [{ text: opts.userPrompt }] }],
              config,
            });
            return fbResponse.text || '';
          } catch {}
        }
      }
      throw err;
    }
  }

  private async completeOpenAI(opts: {
    apiKey: string;
    model: string;
    systemPrompt: string;
    userPrompt: string;
    temperature: number;
    maxTokens: number;
    jsonMode: boolean;
    abortSignal?: AbortSignal;
  }): Promise<string> {
    const body: any = {
      model: opts.model,
      messages: [
        { role: 'system', content: opts.systemPrompt },
        { role: 'user', content: opts.userPrompt },
      ],
      temperature: opts.temperature,
      max_tokens: opts.maxTokens,
    };

    if (opts.jsonMode) {
      body.response_format = { type: 'json_object' };
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${opts.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: opts.abortSignal,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenAI API error (${response.status}): ${errText}`);
    }

    const json = (await response.json()) as any;
    return json.choices?.[0]?.message?.content || '';
  }

  private async completeOpenRouter(opts: {
    apiKey: string;
    model: string;
    systemPrompt: string;
    userPrompt: string;
    temperature: number;
    maxTokens: number;
    jsonMode: boolean;
    abortSignal?: AbortSignal;
  }): Promise<string> {
    const body: any = {
      model: opts.model,
      messages: [
        { role: 'system', content: opts.systemPrompt },
        { role: 'user', content: opts.userPrompt },
      ],
      temperature: opts.temperature,
      max_tokens: opts.maxTokens,
    };

    if (opts.jsonMode) {
      body.response_format = { type: 'json_object' };
    }

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${opts.apiKey}`,
        'HTTP-Referer': 'https://sanmine.space',
        'X-Title': 'SanMine Space Universal Brain',
      },
      body: JSON.stringify(body),
      signal: opts.abortSignal,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenRouter API error (${response.status}): ${errText}`);
    }

    const json = (await response.json()) as any;
    return json.choices?.[0]?.message?.content || '';
  }

  private async completeViaProviderStream(opts: {
    provider: any;
    apiKey: string;
    model: string;
    systemPrompt: string;
    userPrompt: string;
    temperature: number;
    maxTokens: number;
    jsonMode: boolean;
    abortSignal?: AbortSignal;
  }): Promise<string> {
    let accumulatedText = '';
    const effectiveSystemPrompt = opts.jsonMode
      ? `${opts.systemPrompt}\n\nIMPORTANT: Output ONLY valid, parseable JSON according to the requested schema. Do not enclose in markdown blocks unless unavoidable.`
      : opts.systemPrompt;

    await opts.provider.streamChat({
      taskId: `brain_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      apiKey: opts.apiKey,
      model: opts.model,
      systemPrompt: effectiveSystemPrompt,
      messages: [{ role: 'user', content: opts.userPrompt }],
      temperature: opts.temperature,
      maxTokens: opts.maxTokens,
      onEvent: (event: any) => {
        if (event.type === 'message.delta' && event.content) {
          accumulatedText += event.content;
        } else if (event.type === 'content.delta' && event.delta) {
          accumulatedText += event.delta;
        } else if (event.type === 'message.completed' && event.content && !accumulatedText) {
          accumulatedText = event.content;
        }
      },
      abortSignal: opts.abortSignal,
    });

    return accumulatedText.trim();
  }
}

export const brainLlmClient = new BrainLLMClient();
