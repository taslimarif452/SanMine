import { GoogleGenAI } from '@google/genai';
import { AIProvider, AIProviderId, ModelInfo, ProviderCapabilities, ChatStreamOptions } from './types.js';
import { getGeminiToolDeclarations, executeTool } from '../tools.js';
import { AGENT_SYSTEM_PROMPT } from './openrouter.js';

export const POPULAR_GEMINI_MODELS: ModelInfo[] = [
  {
    id: 'gemini-3.7-flash',
    provider: 'google',
    name: 'Gemini 3.7 Flash',
    description: 'Next-generation frontier multimodal model with hybrid reasoning',
    capabilities: { streaming: true, toolCalling: true, vision: true },
  },
  {
    id: 'gemini-3.1-pro-preview',
    provider: 'google',
    name: 'Gemini 3.1 Pro Preview',
    description: 'Frontier reasoning model for advanced coding and math',
    capabilities: { streaming: true, toolCalling: true, vision: true },
  },
  {
    id: 'gemini-flash-latest',
    provider: 'google',
    name: 'Gemini Flash Latest',
    description: 'Always points to the latest Gemini Flash release',
    capabilities: { streaming: true, toolCalling: true, vision: true },
  },
  {
    id: 'gemini-3.1-flash-lite',
    provider: 'google',
    name: 'Gemini 3.1 Flash Lite',
    description: 'Lightweight, ultra-fast Gemini model for quick tasks',
    capabilities: { streaming: true, toolCalling: true, vision: true },
  },
];

function isValidKey(key?: string): boolean {
  if (!key || typeof key !== 'string') return false;
  const trimmed = key.trim();
  if (trimmed.length < 5) return false;
  const upper = trimmed.toUpperCase();
  if (
    upper === 'MY_OPENAI_API_KEY' ||
    upper === 'MY_GEMINI_API_KEY' ||
    upper === 'MY_OPENROUTER_API_KEY' ||
    upper === 'YOUR_API_KEY' ||
    upper === 'PLACEHOLDER'
  ) {
    return false;
  }
  return true;
}

function parseGeminiError(err: any) {
  const rawMsg = String(err?.message || err || '');
  // Sanitize all credentials and secrets safely
  const sanitized = rawMsg
    .replace(/AIza[0-9A-Za-z-_]{35}/g, '[REDACTED_API_KEY]')
    .replace(/(?:key|apiKey|token|secret)=([^&\s]+)/gi, '$1=[REDACTED]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]');

  let status = err?.status || err?.statusCode || err?.response?.status || err?.httpStatus || err?.error?.code;
  if (!status) {
    const statusMatch = rawMsg.match(/(?:HTTP\s*|status\s*:?\s*|\[)(\d{3})(?:\]|\s+|$)/i);
    if (statusMatch) {
      status = parseInt(statusMatch[1], 10);
    }
  }

  let errorCode = err?.code || err?.error?.status || err?.errorDetails?.[0]?.reason || 'GEMINI_ERROR';
  if (rawMsg.includes('RESOURCE_EXHAUSTED') || status === 429 || rawMsg.includes('quota') || rawMsg.includes('rate limit')) {
    errorCode = 'RESOURCE_EXHAUSTED';
    status = status || 429;
  } else if (rawMsg.includes('UNAUTHENTICATED') || rawMsg.includes('API_KEY_INVALID') || status === 401) {
    errorCode = 'UNAUTHENTICATED';
    status = status || 401;
  } else if (rawMsg.includes('PERMISSION_DENIED') || status === 403) {
    errorCode = 'PERMISSION_DENIED';
    status = status || 403;
  } else if (rawMsg.includes('NOT_FOUND') || status === 404) {
    errorCode = 'NOT_FOUND';
    status = status || 404;
  } else if (rawMsg.includes('INVALID_ARGUMENT') || status === 400) {
    errorCode = 'INVALID_ARGUMENT';
    status = status || 400;
  } else if (rawMsg.includes('INTERNAL') || status === 500) {
    errorCode = 'INTERNAL';
    status = status || 500;
  } else if (rawMsg.includes('UNAVAILABLE') || status === 503) {
    errorCode = 'UNAVAILABLE';
    status = status || 503;
  }

  const contentType = err?.response?.headers?.get?.('content-type') || err?.headers?.['content-type'] || 'application/json';

  return {
    status: status || 500,
    contentType,
    errorCode,
    sanitizedMessage: sanitized,
  };
}

export class GeminiProvider implements AIProvider {
  readonly id: AIProviderId = 'google';
  readonly name: string = 'Google Gemini';
  readonly description: string = 'Gemini models';
  readonly defaultModel: string = 'gemini-3.7-flash';
  readonly capabilities: ProviderCapabilities = {
    streaming: true,
    toolCalling: true,
    vision: true,
  };

  isConfigured(apiKey?: string): boolean {
    return isValidKey(apiKey) || isValidKey(process.env.GEMINI_API_KEY) || isValidKey(process.env.GOOGLE_API_KEY);
  }

  private getClient(apiKey?: string): GoogleGenAI {
    const key = (apiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '').trim();
    if (!isValidKey(key)) {
      throw new Error('No valid Google Gemini API key provided.');
    }
    return new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }

  async testConnection(apiKey?: string, model?: string) {
    const activeKey = (apiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '').trim();
    const activeModel = (model || this.defaultModel).trim();

    if (!activeKey) {
      return {
        success: false,
        error: 'No Google Gemini API key provided. Please enter an API key.',
      };
    }

    try {
      const ai = this.getClient(activeKey);
      const response = await ai.models.generateContent({
        model: activeModel,
        contents: 'Say "connected" in one word.',
      });

      const replyText = response.text || 'Connected';

      return {
        success: true,
        model: activeModel,
        message: 'Google Gemini connection successful',
        sampleReply: replyText,
      };
    } catch (err: any) {
      const diag = parseGeminiError(err);
      console.log(
        `[GEMINI RESPONSE]\nstatus=${diag.status}\ncontent-type=${diag.contentType}\nerrorCode=${diag.errorCode}\nerrorMessage=${diag.sanitizedMessage}`
      );

      let message = diag.sanitizedMessage || 'Connection failed';
      if (diag.status === 401 || diag.errorCode === 'UNAUTHENTICATED' || message.includes('API_KEY_INVALID')) {
        message = 'Invalid Google Gemini API key. Please check your credentials in Settings.';
      } else if (diag.status === 429 || diag.errorCode === 'RESOURCE_EXHAUSTED' || message.includes('RESOURCE_EXHAUSTED')) {
        message = 'Gemini API quota exceeded or rate limit reached. Please try again shortly.';
      } else if (diag.status === 404 || diag.errorCode === 'NOT_FOUND' || message.includes('NOT_FOUND')) {
        message = `The model "${activeModel}" is not supported or not found in your Gemini project.`;
      }

      return {
        success: false,
        error: `Google Gemini error: ${message}`,
      };
    }
  }

  async listModels(apiKey?: string): Promise<ModelInfo[]> {
    const activeKey = (apiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '').trim();

    if (!isValidKey(activeKey)) {
      return [];
    }

    try {
      const ai = this.getClient(activeKey);
      const listRes = await ai.models.list();
      const modelsList: any[] = [];

      // Iterate through list pager if available
      for await (const m of listRes) {
        modelsList.push(m);
      }

      if (modelsList.length > 0) {
        const geminiModels = modelsList
          .filter((m: any) => {
            const name = (m.name || m.id || '').toLowerCase();
            const displayName = (m.displayName || '').toLowerCase();
            // Match Gemini text/multimodal generation models
            return (
              (name.includes('gemini') || displayName.includes('gemini')) &&
              !name.includes('embedding') &&
              !name.includes('aqa') &&
              !name.includes('imagen')
            );
          })
          .map((m: any) => {
            const rawId = m.name?.replace(/^models\//, '') || m.id;
            return {
              id: rawId,
              provider: 'google' as AIProviderId,
              name: m.displayName || rawId,
              description: m.description,
              isFree: false,
              capabilities: {
                streaming: true,
                toolCalling: true,
                vision: true,
              },
            };
          });

        if (geminiModels.length > 0) {
          // Merge with popular models so standard names are prominent
          const popularIds = new Set(POPULAR_GEMINI_MODELS.map((p) => p.id));
          const top = POPULAR_GEMINI_MODELS.filter((p) =>
            geminiModels.some((g: ModelInfo) => g.id === p.id || g.id === `models/${p.id}`)
          );
          const others = geminiModels.filter((g: ModelInfo) => !popularIds.has(g.id));
          return top.length > 0 ? [...top, ...others] : geminiModels;
        }
      }

      return [];
    } catch (err: any) {
      console.warn('[Gemini] listModels error:', err.message);
      throw err;
    }
  }

  async streamChat({
    apiKey,
    messages,
    model,
    temperature = 0.7,
    maxTokens = 4096,
    onEvent,
    abortSignal,
    taskId,
    providerRequestId,
    systemPrompt,
  }: ChatStreamOptions): Promise<void> {
    const activeKey = (apiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '').trim();

    if (!activeKey) {
      onEvent({
        type: 'error',
        message: 'Google Gemini API key is not configured. Please open Settings to connect Google Gemini.',
        code: 'MISSING_API_KEY',
        provider: 'google',
      });
      return;
    }

    const activeModel = model || this.defaultModel;

    try {
      const ai = this.getClient(activeKey);

      // Convert chat messages to Gemini contents format
      // Note: Gemini contents support user and model roles
      const formattedContents: any[] = [];
      for (const m of messages) {
        if (m.role === 'system') continue;
        const role = m.role === 'assistant' ? 'model' : 'user';
        formattedContents.push({
          role,
          parts: [{ text: m.content || '' }],
        });
      }

      // If no contents, add at least one user prompt
      if (formattedContents.length === 0) {
        formattedContents.push({
          role: 'user',
          parts: [{ text: 'Hello' }],
        });
      }

      const configPayload: any = {
        systemInstruction: systemPrompt || AGENT_SYSTEM_PROMPT,
        temperature,
        maxOutputTokens: maxTokens,
      };

      const providerReqId =
        providerRequestId || `pr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

      onEvent({ type: 'message.start', provider: 'google', model: activeModel });

      console.log(
        `[PROVIDER HTTP REQUEST]\nproviderRequestId=${providerReqId}\ntaskId=${
          taskId || 'direct_chat'
        }\nprovider=google\nmodel=${activeModel}`
      );

      let responseStream: any;
      let attempt = 0;
      const maxAttempts = 2;

      while (attempt < maxAttempts) {
        attempt++;
        try {
          responseStream = await ai.models.generateContentStream({
            model: activeModel,
            contents: formattedContents,
            config: configPayload,
          });
          break;
        } catch (attemptErr: any) {
          const diag = parseGeminiError(attemptErr);
          const isRetryable =
            (diag.status === 429 || diag.status === 503 || diag.errorCode === 'RESOURCE_EXHAUSTED' || diag.errorCode === 'UNAVAILABLE') &&
            attempt < maxAttempts &&
            !abortSignal?.aborted;

          if (isRetryable) {
            const backoffMs = 1000 * Math.pow(2, attempt - 1) + Math.random() * 400;
            console.log(
              `[GEMINI RETRY]\nattempt=${attempt}\nmaxAttempts=${maxAttempts}\nbackoffMs=${Math.round(backoffMs)}\nreason=${diag.errorCode}`
            );
            await new Promise((r) => setTimeout(r, backoffMs));
            continue;
          }
          throw attemptErr;
        }
      }

      console.log(`[GEMINI RESPONSE]\nproviderRequestId=${providerReqId}\nstatus=200`);

      let accumulatedContent = '';

      for await (const chunk of responseStream) {
        if (abortSignal?.aborted) break;

        // Check for text delta
        const text = chunk.text;
        if (text) {
          accumulatedContent += text;
          onEvent({
            type: 'message.delta',
            content: text,
          });
        }
      }

      if (!accumulatedContent) {
        onEvent({
          type: 'error',
          message: `Google Gemini returned an empty response for model "${activeModel}". Please try another prompt or model.`,
          code: 'EMPTY_RESPONSE',
          provider: 'google',
          model: activeModel,
        });
        return;
      }

      onEvent({
        type: 'message.completed',
        content: accumulatedContent,
      });
    } catch (err: any) {
      if (abortSignal?.aborted || err.name === 'AbortError') return;

      const diag = parseGeminiError(err);
      console.log(
        `[GEMINI RESPONSE]\nstatus=${diag.status}\ncontent-type=${diag.contentType}\nerrorCode=${diag.errorCode}\nerrorMessage=${diag.sanitizedMessage}`
      );

      let msg = diag.sanitizedMessage || 'Unknown error communicating with Gemini';
      if (diag.status === 401 || diag.errorCode === 'UNAUTHENTICATED' || msg.includes('API_KEY_INVALID')) {
        msg = 'Invalid Google Gemini API key. Please check your Gemini connection in Settings.';
      } else if (diag.status === 429 || diag.errorCode === 'RESOURCE_EXHAUSTED' || msg.includes('RESOURCE_EXHAUSTED')) {
        msg = `Google Gemini rate limit or quota exceeded for model "${activeModel}".`;
      } else if (diag.status === 404 || diag.errorCode === 'NOT_FOUND' || msg.includes('NOT_FOUND')) {
        msg = `The model "${activeModel}" is not supported or not found in your Gemini project.`;
      }

      throw new Error(`Google Gemini error: ${msg}`);
    }
  }
}
