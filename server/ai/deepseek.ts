import { AIProvider, AIProviderId, ModelInfo, ProviderCapabilities, ChatStreamOptions } from './types.js';
import { AGENT_SYSTEM_PROMPT } from './openrouter.js';

export const POPULAR_DEEPSEEK_MODELS: ModelInfo[] = [
  {
    id: 'deepseek-chat',
    provider: 'deepseek',
    name: 'DeepSeek-V3 (Chat)',
    description: 'High-performance 671B MoE frontier model for general chat and coding',
    capabilities: { streaming: true, toolCalling: true, vision: false },
  },
  {
    id: 'deepseek-reasoner',
    provider: 'deepseek',
    name: 'DeepSeek-R1 (Reasoner)',
    description: 'State-of-the-art open reasoning model with chain-of-thought reasoning',
    capabilities: { streaming: true, toolCalling: false, vision: false },
  },
];

function isValidKey(key?: string): boolean {
  if (!key || typeof key !== 'string') return false;
  const trimmed = key.trim();
  if (trimmed.length < 5) return false;
  const upper = trimmed.toUpperCase();
  if (
    upper === 'MY_DEEPSEEK_API_KEY' ||
    upper === 'YOUR_API_KEY' ||
    upper === 'PLACEHOLDER'
  ) {
    return false;
  }
  return true;
}

export class DeepSeekProvider implements AIProvider {
  readonly id: AIProviderId = 'deepseek';
  readonly name: string = 'DeepSeek';
  readonly description: string = 'DeepSeek-V3 and DeepSeek-R1 reasoning models';
  readonly defaultModel: string = 'deepseek-chat';
  readonly capabilities: ProviderCapabilities = {
    streaming: true,
    toolCalling: true,
    vision: false,
  };

  isConfigured(apiKey?: string): boolean {
    return isValidKey(apiKey) || isValidKey(process.env.DEEPSEEK_API_KEY);
  }

  async testConnection(apiKey?: string, model?: string) {
    const activeKey = (apiKey || process.env.DEEPSEEK_API_KEY || '').trim();
    const activeModel = (model || this.defaultModel).trim();

    if (!activeKey) {
      return {
        success: false,
        error: 'No DeepSeek API key provided. Please enter an API key.',
      };
    }

    try {
      const response = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${activeKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: activeModel,
          messages: [{ role: 'user', content: 'Say "connected" in one word.' }],
          max_tokens: 15,
          temperature: 0.1,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        let parsedMessage = 'Connection failed';
        try {
          const json = JSON.parse(errorBody);
          parsedMessage = json?.error?.message || json?.message || `HTTP ${response.status}`;
        } catch {
          parsedMessage = `HTTP ${response.status}: ${response.statusText}`;
        }

        if (response.status === 401) {
          return {
            success: false,
            error: 'Invalid DeepSeek API key. Please check your credentials in Settings.',
          };
        }
        if (response.status === 429) {
          return {
            success: false,
            error: 'DeepSeek balance insufficient or rate limit reached. Please check your DeepSeek console.',
          };
        }

        return {
          success: false,
          error: `DeepSeek returned: ${parsedMessage}`,
        };
      }

      const data = await response.json();
      const reply = data?.choices?.[0]?.message?.content || 'Connected';
      return {
        success: true,
        model: activeModel,
        message: 'DeepSeek connection successful',
        sampleReply: reply,
      };
    } catch (err: any) {
      return {
        success: false,
        error: `Network error reaching DeepSeek API: ${err.message || 'Could not connect'}`,
      };
    }
  }

  async listModels(apiKey?: string): Promise<ModelInfo[]> {
    const activeKey = (apiKey || process.env.DEEPSEEK_API_KEY || '').trim();

    if (!isValidKey(activeKey)) {
      return POPULAR_DEEPSEEK_MODELS;
    }

    try {
      const response = await fetch('https://api.deepseek.com/models', {
        headers: {
          'Authorization': `Bearer ${activeKey}`,
        },
      });

      if (!response.ok) {
        return POPULAR_DEEPSEEK_MODELS;
      }

      const data = await response.json();
      if (Array.isArray(data?.data)) {
        const discovered = data.data
          .filter((m: any) => typeof m.id === 'string')
          .map((m: any) => ({
            id: m.id,
            provider: 'deepseek' as AIProviderId,
            name: m.id === 'deepseek-chat' ? 'DeepSeek-V3' : m.id === 'deepseek-reasoner' ? 'DeepSeek-R1' : m.id,
            description: `DeepSeek model ${m.id}`,
            isFree: false,
            capabilities: {
              streaming: true,
              toolCalling: m.id === 'deepseek-chat',
              vision: false,
            },
          }));

        if (discovered.length > 0) {
          const popularIds = new Set(POPULAR_DEEPSEEK_MODELS.map((p) => p.id));
          const top = POPULAR_DEEPSEEK_MODELS.filter((p) =>
            discovered.some((c: ModelInfo) => c.id === p.id)
          );
          const others = discovered.filter((c: ModelInfo) => !popularIds.has(c.id));
          return [...top, ...others];
        }
      }
      return POPULAR_DEEPSEEK_MODELS;
    } catch (err: any) {
      console.warn('[DeepSeek] listModels fallback to popular models:', err.message);
      return POPULAR_DEEPSEEK_MODELS;
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
    const activeKey = (apiKey || process.env.DEEPSEEK_API_KEY || '').trim();

    if (!activeKey) {
      onEvent({
        type: 'error',
        message: 'DeepSeek API key is not configured. Please open Settings to connect DeepSeek.',
        code: 'MISSING_API_KEY',
        provider: 'deepseek',
      });
      return;
    }

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
      }\nprovider=deepseek\nmodel=${activeModel}`
    );

    try {
      const payload: any = {
        model: activeModel,
        messages: fullMessages,
        temperature: activeModel === 'deepseek-reasoner' ? 1.0 : temperature, // DeepSeek R1 recommends temp 1.0 or omitted
        max_tokens: maxTokens,
        stream: true,
      };

      const response = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${activeKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: abortSignal,
      });

      console.log(`[DEEPSEEK RESPONSE]\nproviderRequestId=${providerReqId}\nstatus=${response.status}`);

      if (!response.ok) {
        const errorText = await response.text();
        let parsedError = 'DeepSeek request failed';
        try {
          const json = JSON.parse(errorText);
          parsedError = json?.error?.message || json?.message || `Status ${response.status}`;
        } catch {
          parsedError = `HTTP ${response.status}: ${response.statusText}`;
        }

        if (response.status === 401) {
          throw new Error('Invalid DeepSeek API key. Please check your credentials in Settings.');
        } else if (response.status === 429) {
          throw new Error(`DeepSeek rate limit reached or insufficient balance for model "${activeModel}".`);
        } else if (response.status === 404) {
          throw new Error(`The model "${activeModel}" was not found on DeepSeek.`);
        } else {
          throw new Error(`DeepSeek returned an error (HTTP ${response.status}): ${parsedError}`);
        }
      }

      if (!response.body) {
        throw new Error('Response body is null');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let accumulatedContent = '';

      onEvent({ type: 'message.start', provider: 'deepseek', model: activeModel });

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
        throw new Error(`DeepSeek returned an empty response for model "${activeModel}".`);
      }

      onEvent({
        type: 'message.completed',
        content: accumulatedContent,
      });
    } catch (err: any) {
      if (err.name === 'AbortError' || abortSignal?.aborted) return;
      throw new Error(`DeepSeek execution error: ${err.message || 'Network error'}`);
    }
  }
}
