import { AIProvider, AIProviderId, ModelInfo, ProviderCapabilities, ChatStreamOptions } from './types.js';
import { getOpenAIToolDefinitions, executeTool } from '../tools.js';
import { AGENT_SYSTEM_PROMPT } from './openrouter.js';

export const POPULAR_OPENAI_MODELS: ModelInfo[] = [
  {
    id: 'gpt-4o',
    provider: 'openai',
    name: 'GPT-4o',
    description: 'High-intelligence flagship model for complex tasks',
    capabilities: { streaming: true, toolCalling: true, vision: true },
  },
  {
    id: 'gpt-4o-mini',
    provider: 'openai',
    name: 'GPT-4o mini',
    description: 'Fast, lightweight, cost-efficient model',
    capabilities: { streaming: true, toolCalling: true, vision: true },
  },
  {
    id: 'o3-mini',
    provider: 'openai',
    name: 'o3-mini',
    description: 'Advanced reasoning and STEM problem solver',
    capabilities: { streaming: true, toolCalling: true, vision: false },
  },
  {
    id: 'o1',
    provider: 'openai',
    name: 'o1',
    description: 'Full reasoning model for deep analytical tasks',
    capabilities: { streaming: true, toolCalling: true, vision: true },
  },
  {
    id: 'gpt-4-turbo',
    provider: 'openai',
    name: 'GPT-4 Turbo',
    description: 'High-capability GPT-4 Turbo model',
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

export class OpenAIProvider implements AIProvider {
  readonly id: AIProviderId = 'openai';
  readonly name: string = 'OpenAI';
  readonly description: string = 'GPT models';
  readonly defaultModel: string = 'gpt-4o';
  readonly capabilities: ProviderCapabilities = {
    streaming: true,
    toolCalling: true,
    vision: true,
  };

  isConfigured(apiKey?: string): boolean {
    return isValidKey(apiKey) || isValidKey(process.env.OPENAI_API_KEY);
  }

  async testConnection(apiKey?: string, model?: string) {
    const activeKey = (apiKey || process.env.OPENAI_API_KEY || '').trim();
    const activeModel = (model || this.defaultModel).trim();

    if (!activeKey) {
      return {
        success: false,
        error: 'No OpenAI API key provided. Please enter an API key.',
      };
    }

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${activeKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: activeModel,
          messages: [{ role: 'user', content: 'Say "connected" in one word.' }],
          max_tokens: 10,
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
            error: 'Invalid OpenAI API key. Please check your credentials in Settings.',
          };
        }
        if (response.status === 429) {
          return {
            success: false,
            error: 'OpenAI quota exceeded or rate limit reached. Please check your OpenAI account billing.',
          };
        }

        return {
          success: false,
          error: `OpenAI returned: ${parsedMessage}`,
        };
      }

      const data = await response.json();
      return {
        success: true,
        model: activeModel,
        message: 'OpenAI connection successful',
        sampleReply: data?.choices?.[0]?.message?.content || 'Connected',
      };
    } catch (err: any) {
      return {
        success: false,
        error: `Network error reaching OpenAI API: ${err.message || 'Could not connect'}`,
      };
    }
  }

  async listModels(apiKey?: string): Promise<ModelInfo[]> {
    const activeKey = (apiKey || process.env.OPENAI_API_KEY || '').trim();

    if (!isValidKey(activeKey)) {
      return [];
    }

    try {
      const response = await fetch('https://api.openai.com/v1/models', {
        headers: {
          'Authorization': `Bearer ${activeKey}`,
        },
      });

      if (!response.ok) {
        throw new Error(`OpenAI model discovery failed: HTTP ${response.status}`);
      }

      const data = await response.json();
      if (Array.isArray(data?.data)) {
        const chatModels = data.data
          .filter((m: any) => {
            const id = (m.id || '').toLowerCase();
            return (
              id.startsWith('gpt-4') ||
              id.startsWith('gpt-3.5') ||
              id.startsWith('o1') ||
              id.startsWith('o3') ||
              id.startsWith('chatgpt-')
            );
          })
          .map((m: any) => ({
            id: m.id,
            provider: 'openai' as AIProviderId,
            name: m.id,
            isFree: false,
            capabilities: {
              streaming: true,
              toolCalling: !m.id.includes('realtime'),
              vision: m.id.includes('4o') || m.id.includes('vision') || m.id.includes('o1'),
            },
          }))
          .sort((a: ModelInfo, b: ModelInfo) => a.id.localeCompare(b.id));

        if (chatModels.length > 0) {
          // Prioritize flagship models at the top
          const popularIds = new Set(POPULAR_OPENAI_MODELS.map((p) => p.id));
          const top = POPULAR_OPENAI_MODELS.filter((p) =>
            chatModels.some((c: ModelInfo) => c.id === p.id)
          );
          const others = chatModels.filter((c: ModelInfo) => !popularIds.has(c.id));
          return [...top, ...others];
        }
      }
      return [];
    } catch (err: any) {
      console.warn('[OpenAI] listModels error:', err.message);
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
    const activeKey = (apiKey || process.env.OPENAI_API_KEY || '').trim();

    if (!activeKey) {
      onEvent({
        type: 'error',
        message: 'OpenAI API key is not configured. Please open Settings to connect OpenAI.',
        code: 'MISSING_API_KEY',
        provider: 'openai',
      });
      return;
    }

    const activeModel = model || this.defaultModel;
    const isReasoningModel = activeModel.startsWith('o1') || activeModel.startsWith('o3');

    const fullMessages = [
      { role: 'system', content: systemPrompt || AGENT_SYSTEM_PROMPT },
      ...messages.filter((m) => m.role !== 'system'),
    ];

    const providerReqId =
      providerRequestId || `pr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

    console.log(
      `[PROVIDER HTTP REQUEST]\nproviderRequestId=${providerReqId}\ntaskId=${
        taskId || 'direct_chat'
      }\nprovider=openai\nmodel=${activeModel}`
    );

    try {
      const payload: any = {
        model: activeModel,
        messages: fullMessages,
        stream: true,
      };

      // Reasoning models (o1, o3) don't use standard temperature/max_tokens or require max_completion_tokens
      if (isReasoningModel) {
        payload.max_completion_tokens = maxTokens;
      } else {
        payload.temperature = temperature;
        payload.max_tokens = maxTokens;
      }

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${activeKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: abortSignal,
      });

      console.log(
        `[OPENAI RESPONSE]\nproviderRequestId=${providerReqId}\nstatus=${response.status}`
      );

      if (!response.ok) {
        const errorText = await response.text();
        let parsedError = 'OpenAI request failed';
        try {
          const json = JSON.parse(errorText);
          parsedError = json?.error?.message || json?.message || `Status ${response.status}`;
        } catch {
          parsedError = `HTTP ${response.status}: ${response.statusText}`;
        }

        if (response.status === 401) {
          throw new Error('Invalid OpenAI API key. Please check your credentials in Settings.');
        } else if (response.status === 429) {
          throw new Error(`OpenAI quota exceeded or rate limit reached for model "${activeModel}".`);
        } else if (response.status === 404) {
          throw new Error(`The model "${activeModel}" was not found on OpenAI.`);
        } else {
          throw new Error(`OpenAI returned an error (HTTP ${response.status}): ${parsedError}`);
        }
      }

      if (!response.body) {
        throw new Error('Response body is null');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let accumulatedContent = '';

      onEvent({ type: 'message.start', provider: 'openai', model: activeModel });

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
          message: `OpenAI returned an empty response for model "${activeModel}". Please try another prompt or model.`,
          code: 'EMPTY_RESPONSE',
          provider: 'openai',
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
      throw new Error(`OpenAI execution error: ${err.message || 'Network error'}`);
    }
  }
}
