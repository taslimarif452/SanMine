import { AIProvider, AIProviderId, ModelInfo, ProviderCapabilities, ChatStreamOptions } from './types.js';
import { AGENT_SYSTEM_PROMPT } from './openrouter.js';

export const POPULAR_ANTHROPIC_MODELS: ModelInfo[] = [
  {
    id: 'claude-3-7-sonnet-20250219',
    provider: 'anthropic',
    name: 'Claude 3.7 Sonnet',
    description: 'Anthropic flagship hybrid reasoning and frontier coding model',
    capabilities: { streaming: true, toolCalling: true, vision: true },
  },
  {
    id: 'claude-3-5-sonnet-20241022',
    provider: 'anthropic',
    name: 'Claude 3.5 Sonnet',
    description: 'High intelligence and industry-leading reasoning performance',
    capabilities: { streaming: true, toolCalling: true, vision: true },
  },
  {
    id: 'claude-3-5-haiku-20241022',
    provider: 'anthropic',
    name: 'Claude 3.5 Haiku',
    description: 'Ultra-fast and cost-efficient intelligent assistant',
    capabilities: { streaming: true, toolCalling: true, vision: true },
  },
  {
    id: 'claude-3-opus-20240229',
    provider: 'anthropic',
    name: 'Claude 3 Opus',
    description: 'Powerful model for deep research and complex synthesis',
    capabilities: { streaming: true, toolCalling: true, vision: true },
  },
];

function isValidKey(key?: string): boolean {
  if (!key || typeof key !== 'string') return false;
  const trimmed = key.trim();
  if (trimmed.length < 5) return false;
  const upper = trimmed.toUpperCase();
  if (
    upper === 'MY_ANTHROPIC_API_KEY' ||
    upper === 'YOUR_API_KEY' ||
    upper === 'PLACEHOLDER'
  ) {
    return false;
  }
  return true;
}

export class AnthropicProvider implements AIProvider {
  readonly id: AIProviderId = 'anthropic';
  readonly name: string = 'Anthropic Claude';
  readonly description: string = 'Claude frontier models (Claude 3.7 Sonnet, Claude 3.5 Sonnet, Haiku, Opus)';
  readonly defaultModel: string = 'claude-3-7-sonnet-20250219';
  readonly capabilities: ProviderCapabilities = {
    streaming: true,
    toolCalling: true,
    vision: true,
  };

  isConfigured(apiKey?: string): boolean {
    return isValidKey(apiKey) || isValidKey(process.env.ANTHROPIC_API_KEY);
  }

  async testConnection(apiKey?: string, model?: string) {
    const activeKey = (apiKey || process.env.ANTHROPIC_API_KEY || '').trim();
    const activeModel = (model || this.defaultModel).trim();

    if (!activeKey) {
      return {
        success: false,
        error: 'No Anthropic API key provided. Please enter an API key.',
      };
    }

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': activeKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: activeModel,
          max_tokens: 15,
          messages: [{ role: 'user', content: 'Say "connected" in one word.' }],
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
            error: 'Invalid Anthropic API key. Please check your credentials in Settings.',
          };
        }
        if (response.status === 429) {
          return {
            success: false,
            error: 'Anthropic rate limit or credit limit reached. Please check your billing dashboard.',
          };
        }

        return {
          success: false,
          error: `Anthropic returned: ${parsedMessage}`,
        };
      }

      const data = await response.json();
      const reply = data?.content?.[0]?.text || 'Connected';
      return {
        success: true,
        model: activeModel,
        message: 'Anthropic Claude connection successful',
        sampleReply: reply,
      };
    } catch (err: any) {
      return {
        success: false,
        error: `Network error reaching Anthropic API: ${err.message || 'Could not connect'}`,
      };
    }
  }

  async listModels(apiKey?: string): Promise<ModelInfo[]> {
    const activeKey = (apiKey || process.env.ANTHROPIC_API_KEY || '').trim();

    if (!isValidKey(activeKey)) {
      return POPULAR_ANTHROPIC_MODELS;
    }

    try {
      const response = await fetch('https://api.anthropic.com/v1/models', {
        headers: {
          'x-api-key': activeKey,
          'anthropic-version': '2023-06-01',
        },
      });

      if (!response.ok) {
        return POPULAR_ANTHROPIC_MODELS;
      }

      const data = await response.json();
      if (Array.isArray(data?.data)) {
        const discovered = data.data
          .filter((m: any) => typeof m.id === 'string' && m.id.startsWith('claude-'))
          .map((m: any) => ({
            id: m.id,
            provider: 'anthropic' as AIProviderId,
            name: m.display_name || m.id,
            description: m.description || `Anthropic model ${m.id}`,
            isFree: false,
            capabilities: {
              streaming: true,
              toolCalling: true,
              vision: true,
            },
          }));

        if (discovered.length > 0) {
          const popularIds = new Set(POPULAR_ANTHROPIC_MODELS.map((p) => p.id));
          const top = POPULAR_ANTHROPIC_MODELS.filter((p) =>
            discovered.some((c: ModelInfo) => c.id === p.id)
          );
          const others = discovered.filter((c: ModelInfo) => !popularIds.has(c.id));
          return [...top, ...others];
        }
      }
      return POPULAR_ANTHROPIC_MODELS;
    } catch (err: any) {
      console.warn('[Anthropic] listModels fallback to popular models:', err.message);
      return POPULAR_ANTHROPIC_MODELS;
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
    const activeKey = (apiKey || process.env.ANTHROPIC_API_KEY || '').trim();

    if (!activeKey) {
      onEvent({
        type: 'error',
        message: 'Anthropic API key is not configured. Please open Settings to connect Anthropic.',
        code: 'MISSING_API_KEY',
        provider: 'anthropic',
      });
      return;
    }

    const activeModel = model || this.defaultModel;

    // Filter and format messages for Anthropic Messages API
    const anthropicMessages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    for (const m of messages) {
      if (m.role === 'system') continue;
      const role = m.role === 'assistant' ? 'assistant' : 'user';
      const content = (m.content || '').trim();
      if (!content) continue;

      // Ensure alternating roles if duplicate consecutive roles occur
      if (
        anthropicMessages.length > 0 &&
        anthropicMessages[anthropicMessages.length - 1].role === role
      ) {
        anthropicMessages[anthropicMessages.length - 1].content += `\n\n${content}`;
      } else {
        anthropicMessages.push({ role, content });
      }
    }

    if (anthropicMessages.length === 0) {
      anthropicMessages.push({ role: 'user', content: 'Hello' });
    }

    const providerReqId =
      providerRequestId || `pr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

    console.log(
      `[PROVIDER HTTP REQUEST]\nproviderRequestId=${providerReqId}\ntaskId=${
        taskId || 'direct_chat'
      }\nprovider=anthropic\nmodel=${activeModel}`
    );

    try {
      const payload: any = {
        model: activeModel,
        system: systemPrompt || AGENT_SYSTEM_PROMPT,
        messages: anthropicMessages,
        max_tokens: maxTokens,
        temperature,
        stream: true,
      };

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': activeKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: abortSignal,
      });

      console.log(
        `[ANTHROPIC RESPONSE]\nproviderRequestId=${providerReqId}\nstatus=${response.status}`
      );

      if (!response.ok) {
        const errorText = await response.text();
        let parsedError = 'Anthropic request failed';
        try {
          const json = JSON.parse(errorText);
          parsedError = json?.error?.message || json?.message || `Status ${response.status}`;
        } catch {
          parsedError = `HTTP ${response.status}: ${response.statusText}`;
        }

        if (response.status === 401) {
          throw new Error('Invalid Anthropic API key. Please check your credentials in Settings.');
        } else if (response.status === 429) {
          throw new Error(`Anthropic rate limit or quota exceeded for model "${activeModel}".`);
        } else if (response.status === 404) {
          throw new Error(`The model "${activeModel}" was not found on Anthropic.`);
        } else {
          throw new Error(`Anthropic returned an error (HTTP ${response.status}): ${parsedError}`);
        }
      }

      if (!response.body) {
        throw new Error('Response body is null');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let accumulatedContent = '';

      onEvent({ type: 'message.start', provider: 'anthropic', model: activeModel });

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(':')) continue;

          if (trimmed.startsWith('data: ')) {
            const dataStr = trimmed.slice(6).trim();
            if (dataStr === '[DONE]') continue;
            try {
              const parsed = JSON.parse(dataStr);
              if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
                const textChunk = parsed.delta.text || '';
                if (textChunk) {
                  accumulatedContent += textChunk;
                  onEvent({
                    type: 'message.delta',
                    content: textChunk,
                  });
                }
              } else if (parsed.type === 'error') {
                throw new Error(parsed.error?.message || 'Anthropic stream error');
              }
            } catch (pErr: any) {
              if (pErr.message && pErr.message.includes('Anthropic stream error')) {
                throw pErr;
              }
              // ignore partial chunk json parse errors
            }
          }
        }
      }

      if (!accumulatedContent) {
        throw new Error(`Anthropic returned an empty response for model "${activeModel}".`);
      }

      onEvent({
        type: 'message.completed',
        content: accumulatedContent,
      });
    } catch (err: any) {
      if (err.name === 'AbortError' || abortSignal?.aborted) return;
      throw new Error(`Anthropic execution error: ${err.message || 'Network error'}`);
    }
  }
}
