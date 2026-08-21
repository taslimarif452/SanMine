import { AIProvider, AIProviderId, ModelInfo, ProviderCapabilities, ChatStreamOptions } from './types.js';
import { AGENT_SYSTEM_PROMPT } from './openrouter.js';

export const POPULAR_OLLAMA_MODELS: ModelInfo[] = [
  {
    id: 'llama3.2',
    provider: 'ollama',
    name: 'Llama 3.2 (3B / 1B)',
    description: 'Ultra-fast, lightweight local model from Meta for everyday tasks',
    capabilities: { streaming: true, toolCalling: true, vision: true },
    isFree: true,
  },
  {
    id: 'llama3.3',
    provider: 'ollama',
    name: 'Llama 3.3 (70B)',
    description: 'High-capability 70B open model from Meta for complex coding and reasoning',
    capabilities: { streaming: true, toolCalling: true, vision: false },
    isFree: true,
  },
  {
    id: 'deepseek-r1',
    provider: 'ollama',
    name: 'DeepSeek R1 (Local Distill)',
    description: 'Local distilled reasoning model with step-by-step chain of thought',
    capabilities: { streaming: true, toolCalling: false, vision: false },
    isFree: true,
  },
  {
    id: 'qwen2.5',
    provider: 'ollama',
    name: 'Qwen 2.5',
    description: 'Strong coding, mathematics, and multilingual local model',
    capabilities: { streaming: true, toolCalling: true, vision: false },
    isFree: true,
  },
  {
    id: 'mistral',
    provider: 'ollama',
    name: 'Mistral 7B',
    description: 'Fast, efficient instruction-tuned local model',
    capabilities: { streaming: true, toolCalling: true, vision: false },
    isFree: true,
  },
  {
    id: 'gemma2',
    provider: 'ollama',
    name: 'Gemma 2 (9B / 27B)',
    description: 'Google open weights lightweight model for local performance',
    capabilities: { streaming: true, toolCalling: true, vision: false },
    isFree: true,
  },
  {
    id: 'phi4',
    provider: 'ollama',
    name: 'Phi-4 (14B)',
    description: 'Microsoft state-of-the-art compact reasoning model',
    capabilities: { streaming: true, toolCalling: true, vision: false },
    isFree: true,
  },
];

/**
 * Parses endpoint and optional authorization key from credential string.
 * Supports:
 * - "http://localhost:11434"
 * - "https://my-ollama-host.com:11434"
 * - "https://my-ollama-host.com|secret_auth_token"
 * - Plain token with default OLLAMA_BASE_URL
 */
export function parseOllamaConfig(rawInput?: string): { baseUrl: string; authToken?: string } {
  const defaultBase = (process.env.OLLAMA_BASE_URL || 'http://localhost:11434').trim().replace(/\/+$/, '');
  if (!rawInput || typeof rawInput !== 'string' || !rawInput.trim()) {
    return { baseUrl: defaultBase };
  }

  const trimmed = rawInput.trim();

  // Pipe separated endpoint and auth token: endpoint|auth_token
  if (trimmed.includes('|')) {
    const [urlPart, keyPart] = trimmed.split('|');
    let url = (urlPart || '').trim().replace(/\/+$/, '');
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = `http://${url}`;
    }
    return { baseUrl: url || defaultBase, authToken: (keyPart || '').trim() || undefined };
  }

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return { baseUrl: trimmed.replace(/\/+$/, '') };
  }

  // If input looks like localhost:11434 or IP:port
  if (trimmed.includes(':') || trimmed.includes('.') || trimmed === 'localhost') {
    return { baseUrl: `http://${trimmed}`.replace(/\/+$/, '') };
  }

  // Treat as custom authorization token on default base URL
  return { baseUrl: defaultBase, authToken: trimmed };
}

function isValidKey(key?: string): boolean {
  if (!key || typeof key !== 'string') return false;
  const trimmed = key.trim();
  if (trimmed.length < 2) return false;
  const upper = trimmed.toUpperCase();
  if (
    upper === 'MY_OLLAMA_API_KEY' ||
    upper === 'YOUR_API_KEY' ||
    upper === 'PLACEHOLDER'
  ) {
    return false;
  }
  return true;
}

export class OllamaProvider implements AIProvider {
  readonly id: AIProviderId = 'ollama';
  readonly name: string = 'Ollama (Local / Self-Hosted)';
  readonly description: string = 'Run local LLMs (Llama 3.2, DeepSeek R1, Mistral, Qwen 2.5, Gemma 2)';
  readonly defaultModel: string = 'llama3.2';
  readonly capabilities: ProviderCapabilities = {
    streaming: true,
    toolCalling: true,
    vision: true,
  };

  isConfigured(apiKey?: string): boolean {
    return Boolean(
      isValidKey(apiKey) ||
      process.env.OLLAMA_BASE_URL ||
      process.env.OLLAMA_API_KEY
    );
  }

  async testConnection(apiKey?: string, model?: string) {
    const rawConfig = apiKey !== undefined ? apiKey : (process.env.OLLAMA_BASE_URL || process.env.OLLAMA_API_KEY || '');
    const { baseUrl, authToken } = parseOllamaConfig(rawConfig);
    const activeModel = (model || this.defaultModel).trim();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }

    try {
      // First attempt: Check Ollama version/tag discovery endpoint
      const versionRes = await fetch(`${baseUrl}/api/version`, {
        method: 'GET',
        headers,
      }).catch(() => null);

      // Attempt test inference via OpenAI-compatible route or native Ollama chat
      const chatRes = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: activeModel,
          messages: [{ role: 'user', content: 'Say "connected" in one word.' }],
          max_tokens: 10,
          temperature: 0.1,
        }),
      });

      if (!chatRes.ok) {
        // Fallback check: native /api/tags
        const tagsRes = await fetch(`${baseUrl}/api/tags`, { headers }).catch(() => null);
        if (tagsRes && tagsRes.ok) {
          const tagsData = await tagsRes.json();
          const installedModels = Array.isArray(tagsData?.models)
            ? tagsData.models.map((m: any) => m.name || m.model).join(', ')
            : '';
          return {
            success: true,
            model: activeModel,
            message: `Ollama server connected (${baseUrl}). Installed models: ${installedModels || 'none'}`,
            sampleReply: 'Connected',
          };
        }

        const errorBody = await chatRes.text();
        let parsed = 'Ollama connection failed';
        try {
          const json = JSON.parse(errorBody);
          parsed = json?.error?.message || json?.error || `HTTP ${chatRes.status}`;
        } catch {
          parsed = `HTTP ${chatRes.status}: ${chatRes.statusText}`;
        }

        return {
          success: false,
          error: `Ollama at ${baseUrl} returned: ${parsed}`,
        };
      }

      const data = await chatRes.json();
      const reply = data?.choices?.[0]?.message?.content || 'Connected';
      return {
        success: true,
        model: activeModel,
        message: `Ollama server connected at ${baseUrl}`,
        sampleReply: reply,
      };
    } catch (err: any) {
      return {
        success: false,
        error: `Could not connect to Ollama server at ${baseUrl}. Ensure Ollama is running (ollama serve). Details: ${err.message || 'Connection refused'}`,
      };
    }
  }

  async listModels(apiKey?: string): Promise<ModelInfo[]> {
    const rawConfig = apiKey || process.env.OLLAMA_BASE_URL || process.env.OLLAMA_API_KEY || '';
    const { baseUrl, authToken } = parseOllamaConfig(rawConfig);

    const headers: Record<string, string> = {};
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }

    try {
      const response = await fetch(`${baseUrl}/api/tags`, {
        headers,
      });

      if (!response.ok) {
        return POPULAR_OLLAMA_MODELS;
      }

      const data = await response.json();
      if (Array.isArray(data?.models) && data.models.length > 0) {
        const discovered = data.models.map((m: any) => {
          const id = m.name || m.model || '';
          return {
            id,
            provider: 'ollama' as AIProviderId,
            name: id,
            description: `Local model (${m.details?.family || 'ollama'}) · ${m.details?.parameter_size || ''}`,
            isFree: true,
            capabilities: {
              streaming: true,
              toolCalling: true,
              vision: id.includes('vision') || id.includes('llama3.2'),
            },
          };
        });

        const popularIds = new Set(POPULAR_OLLAMA_MODELS.map((p) => p.id));
        const matchingTop = POPULAR_OLLAMA_MODELS.filter((p) =>
          discovered.some((c: ModelInfo) => c.id.startsWith(p.id))
        );
        const others = discovered.filter((c: ModelInfo) => !popularIds.has(c.id));
        return [...matchingTop, ...others, ...POPULAR_OLLAMA_MODELS.filter((p) => !discovered.some((d: ModelInfo) => d.id.startsWith(p.id)))];
      }

      return POPULAR_OLLAMA_MODELS;
    } catch (err: any) {
      console.warn(`[Ollama] listModels notice from ${baseUrl}:`, err.message);
      return POPULAR_OLLAMA_MODELS;
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
    const rawConfig = apiKey || process.env.OLLAMA_BASE_URL || process.env.OLLAMA_API_KEY || '';
    const { baseUrl, authToken } = parseOllamaConfig(rawConfig);
    const activeModel = model || this.defaultModel;

    const fullMessages = [
      { role: 'system', content: systemPrompt || AGENT_SYSTEM_PROMPT },
      ...messages.filter((m) => m.role !== 'system'),
    ];

    const providerReqId =
      providerRequestId || `pr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

    console.log(
      `[PROVIDER HTTP REQUEST]\nproviderRequestId=${providerReqId}\ntaskId=${
        taskId || 'direct_chat'
      }\nprovider=ollama\nendpoint=${baseUrl}\nmodel=${activeModel}`
    );

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }

    try {
      const payload: any = {
        model: activeModel,
        messages: fullMessages,
        temperature,
        max_tokens: maxTokens,
        stream: true,
      };

      const response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: abortSignal,
      });

      console.log(`[OLLAMA RESPONSE]\nproviderRequestId=${providerReqId}\nstatus=${response.status}`);

      if (!response.ok) {
        const errorText = await response.text();
        let parsedError = 'Ollama request failed';
        try {
          const json = JSON.parse(errorText);
          parsedError = json?.error?.message || json?.error || `Status ${response.status}`;
        } catch {
          parsedError = `HTTP ${response.status}: ${response.statusText}`;
        }

        throw new Error(
          response.status === 404
            ? `Model "${activeModel}" not found on Ollama server at ${baseUrl}. (HTTP 404)`
            : `Ollama error at ${baseUrl} (HTTP ${response.status}): ${parsedError}`
        );
      }

      if (!response.body) {
        throw new Error('Response body is null');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let accumulatedContent = '';

      onEvent({ type: 'message.start', provider: 'ollama', model: activeModel });

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(':')) continue;
          if (trimmed === 'data: [DONE]') continue;

          if (trimmed.startsWith('data: ')) {
            try {
              const parsed = JSON.parse(trimmed.slice(6));
              const choice = parsed.choices?.[0];
              const delta = choice?.delta;
              const textChunk = delta?.content || choice?.text || (typeof delta === 'string' ? delta : '');

              if (textChunk) {
                accumulatedContent += textChunk;
                onEvent({
                  type: 'message.delta',
                  content: textChunk,
                });
              }
            } catch {
              // ignore partial chunk json parse errors
            }
          }
        }
      }

      if (!accumulatedContent) {
        onEvent({
          type: 'error',
          message: `Ollama returned an empty response for model "${activeModel}". Check Ollama logs or try another model.`,
          code: 'EMPTY_RESPONSE',
          provider: 'ollama',
          model: activeModel,
        });
        return;
      }

      onEvent({
        type: 'message.completed',
        content: accumulatedContent,
      });
    } catch (err: any) {
      if (err.name === 'AbortError' || abortSignal?.aborted) return;
      throw new Error(`Ollama connection error at ${baseUrl}: ${err.message || 'Connection refused. Ensure Ollama is running.'}`);
    }
  }
}
