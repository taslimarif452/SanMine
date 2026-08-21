import { AIProvider, AIProviderId, ModelInfo, ProviderCapabilities, ChatStreamOptions } from './types.js';
import { AGENT_SYSTEM_PROMPT } from './openrouter.js';

export const POPULAR_HUGGINGFACE_MODELS: ModelInfo[] = [
  {
    id: 'meta-llama/Llama-3.3-70B-Instruct',
    provider: 'huggingface',
    name: 'Llama 3.3 70B Instruct',
    description: 'State-of-the-art open weights flagship model from Meta on Hugging Face Serverless',
    capabilities: { streaming: true, toolCalling: true, vision: false },
  },
  {
    id: 'deepseek-ai/DeepSeek-R1',
    provider: 'huggingface',
    name: 'DeepSeek R1',
    description: 'DeepSeek R1 reasoning model served via Hugging Face Inference Router',
    capabilities: { streaming: true, toolCalling: false, vision: false },
  },
  {
    id: 'Qwen/Qwen2.5-72B-Instruct',
    provider: 'huggingface',
    name: 'Qwen 2.5 72B Instruct',
    description: 'Advanced multilingual and complex reasoning model from Alibaba Cloud',
    capabilities: { streaming: true, toolCalling: true, vision: false },
  },
  {
    id: 'mistralai/Mistral-7B-Instruct-v0.3',
    provider: 'huggingface',
    name: 'Mistral 7B Instruct v0.3',
    description: 'Fast, efficient, high-performance compact model with function support',
    capabilities: { streaming: true, toolCalling: true, vision: false },
  },
  {
    id: 'meta-llama/Llama-3.1-8B-Instruct',
    provider: 'huggingface',
    name: 'Llama 3.1 8B Instruct',
    description: 'High-speed 8B instruct model for rapid conversational tasks',
    capabilities: { streaming: true, toolCalling: true, vision: false },
  },
];

function isValidKey(key?: string): boolean {
  if (!key || typeof key !== 'string') return false;
  const trimmed = key.trim();
  if (trimmed.length < 5) return false;
  const upper = trimmed.toUpperCase();
  if (
    upper === 'MY_HUGGINGFACE_API_KEY' ||
    upper === 'MY_HF_TOKEN' ||
    upper === 'YOUR_API_KEY' ||
    upper === 'PLACEHOLDER'
  ) {
    return false;
  }
  return true;
}

export class HuggingFaceProvider implements AIProvider {
  readonly id: AIProviderId = 'huggingface';
  readonly name: string = 'Hugging Face';
  readonly description: string = 'Hugging Face Serverless Inference API (Llama 3.3, DeepSeek R1, Qwen 2.5, Mistral)';
  readonly defaultModel: string = 'meta-llama/Llama-3.3-70B-Instruct';
  readonly capabilities: ProviderCapabilities = {
    streaming: true,
    toolCalling: true,
    vision: false,
  };

  isConfigured(apiKey?: string): boolean {
    return isValidKey(apiKey) || isValidKey(process.env.HUGGINGFACE_API_KEY || process.env.HF_TOKEN);
  }

  async testConnection(apiKey?: string, model?: string) {
    const activeKey = (apiKey || process.env.HUGGINGFACE_API_KEY || process.env.HF_TOKEN || '').trim();
    const activeModel = (model || this.defaultModel).trim();

    if (!activeKey) {
      return {
        success: false,
        error: 'No Hugging Face User Access Token (API key) provided.',
      };
    }

    try {
      // Use Hugging Face Router endpoint
      const response = await fetch('https://router.huggingface.co/hf-inference/v1/chat/completions', {
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
          parsedMessage = json?.error?.message || json?.error || json?.message || `HTTP ${response.status}`;
        } catch {
          parsedMessage = `HTTP ${response.status}: ${response.statusText}`;
        }

        if (response.status === 401) {
          return {
            success: false,
            error: 'Invalid Hugging Face Token. Please verify permissions in Settings.',
          };
        }
        if (response.status === 429) {
          return {
            success: false,
            error: 'Hugging Face rate limit or quota exceeded. Please check your Hugging Face account.',
          };
        }

        return {
          success: false,
          error: `Hugging Face returned: ${parsedMessage}`,
        };
      }

      const data = await response.json();
      const reply = data?.choices?.[0]?.message?.content || 'Connected';
      return {
        success: true,
        model: activeModel,
        message: 'Hugging Face connection successful',
        sampleReply: reply,
      };
    } catch (err: any) {
      return {
        success: false,
        error: `Network error reaching Hugging Face API: ${err.message || 'Could not connect'}`,
      };
    }
  }

  async listModels(apiKey?: string): Promise<ModelInfo[]> {
    return POPULAR_HUGGINGFACE_MODELS;
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
    const activeKey = (apiKey || process.env.HUGGINGFACE_API_KEY || process.env.HF_TOKEN || '').trim();

    if (!activeKey) {
      onEvent({
        type: 'error',
        message: 'Hugging Face Token is not configured. Please open Settings to connect Hugging Face.',
        code: 'MISSING_API_KEY',
        provider: 'huggingface',
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
      }\nprovider=huggingface\nmodel=${activeModel}`
    );

    try {
      const payload: any = {
        model: activeModel,
        messages: fullMessages,
        temperature,
        max_tokens: maxTokens,
        stream: true,
      };

      const response = await fetch('https://router.huggingface.co/hf-inference/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${activeKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: abortSignal,
      });

      console.log(`[HUGGINGFACE RESPONSE]\nproviderRequestId=${providerReqId}\nstatus=${response.status}`);

      if (!response.ok) {
        const errorText = await response.text();
        let parsedError = 'Hugging Face request failed';
        try {
          const json = JSON.parse(errorText);
          parsedError = json?.error?.message || json?.error || json?.message || `Status ${response.status}`;
        } catch {
          parsedError = `HTTP ${response.status}: ${response.statusText}`;
        }

        if (response.status === 401) {
          throw new Error('Invalid Hugging Face Token. Please check your credentials in Settings.');
        } else if (response.status === 429) {
          throw new Error(`Hugging Face rate limit or credit quota exceeded for model "${activeModel}".`);
        } else if (response.status === 404) {
          throw new Error(`The model "${activeModel}" is currently unavailable on Hugging Face.`);
        } else {
          throw new Error(`Hugging Face error (HTTP ${response.status}): ${parsedError}`);
        }
      }

      if (!response.body) {
        throw new Error('Response body is null');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let accumulatedContent = '';

      onEvent({ type: 'message.start', provider: 'huggingface', model: activeModel });

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
        throw new Error(`Hugging Face returned an empty response for model "${activeModel}".`);
      }

      onEvent({
        type: 'message.completed',
        content: accumulatedContent,
      });
    } catch (err: any) {
      if (err.name === 'AbortError' || abortSignal?.aborted) return;
      throw new Error(`Hugging Face execution error: ${err.message || 'Network error'}`);
    }
  }
}
