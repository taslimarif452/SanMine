import { AIProvider, AIProviderId, ModelInfo, ProviderCapabilities, ChatStreamOptions } from './types.js';
import { getOpenRouterToolDefinitions, executeTool } from '../tools.js';

export const AGENT_SYSTEM_PROMPT = `You are SanMine Space, a general-purpose autonomous AI agent, web researcher, and digital agency intelligence assistant.
Your job is to understand user objectives, plan logical agent workflows, invoke real backend tools, navigate live websites via browser sessions, and deliver accurate, un-simulated results with zero hallucinations.

Core Operating Directives:
1. Autonomous Intent Understanding & Planning:
   - For any user prompt (business discovery, website analysis, social media research, pricing extraction, founder lookup, or general web inquiries), plan the sequence of actions dynamically.
   - Use available tools: google_search, browser_navigate, browser_click, browser_scroll, browser_extract_content, analyze_website, calculate_lead_score, generate_proposal, deep_web_research.
2. Honest Tool Handling & Zero Hallucinations:
   - Always base factual statements on actual tool execution results and page content.
   - If search_businesses returns that "Business Search Provider is not configured.", state clearly: "Business Search Provider is not configured. Configure a provider in Settings to enable live business discovery."
   - If contact details (email, phone, founder, pricing) are missing or require login, explicitly state "Not found / Not publicly listed" rather than guessing.
3. Live Browser Inspection & Verification:
   - Ground all findings with source URLs and verified evidence.
4. Structured & Professional Output:
   - Format final outputs with clear Markdown headers, summary tables, and direct source citations.`;

export const POPULAR_OPENROUTER_MODELS: ModelInfo[] = [
  {
    id: 'openrouter/free',
    provider: 'openrouter',
    name: 'OpenRouter Free Models (Auto)',
    isFree: true,
  },
  {
    id: 'openai/gpt-oss-20b:free',
    provider: 'openrouter',
    name: 'GPT-OSS 20B (Free)',
    isFree: true,
  },
  {
    id: 'meta-llama/llama-3.3-70b-instruct:free',
    provider: 'openrouter',
    name: 'Llama 3.3 70B Instruct (Free)',
    isFree: true,
  },
  {
    id: 'google/gemini-2.0-flash-exp:free',
    provider: 'openrouter',
    name: 'Gemini 2.0 Flash Exp (Free)',
    isFree: true,
  },
  {
    id: 'deepseek/deepseek-r1:free',
    provider: 'openrouter',
    name: 'DeepSeek R1 (Free)',
    isFree: true,
  },
  {
    id: 'qwen/qwen-2.5-72b-instruct:free',
    provider: 'openrouter',
    name: 'Qwen 2.5 72B Instruct (Free)',
    isFree: true,
  },
  {
    id: 'anthropic/claude-3.7-sonnet',
    provider: 'openrouter',
    name: 'Claude 3.7 Sonnet',
    isFree: false,
  },
  {
    id: 'openai/gpt-4o',
    provider: 'openrouter',
    name: 'GPT-4o',
    isFree: false,
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

export class OpenRouterProvider implements AIProvider {
  readonly id: AIProviderId = 'openrouter';
  readonly name: string = 'OpenRouter';
  readonly description: string = 'Hundreds of open-source and proprietary models';
  readonly defaultModel: string = 'openai/gpt-oss-20b:free';
  readonly capabilities: ProviderCapabilities = {
    streaming: true,
    toolCalling: true,
    vision: true,
  };

  isConfigured(apiKey?: string): boolean {
    return isValidKey(apiKey) || isValidKey(process.env.OPENROUTER_API_KEY);
  }

  async testConnection(apiKey?: string, model?: string) {
    const activeKey = (apiKey || process.env.OPENROUTER_API_KEY || '').trim();
    const activeModel = (model || this.defaultModel).trim();

    if (!activeKey) {
      return {
        success: false,
        error: 'No OpenRouter API key provided. Please enter an API key.',
      };
    }

    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${activeKey}`,
          'HTTP-Referer': 'https://sanmine.space',
          'X-Title': 'SanMine Space',
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
            error: 'Invalid OpenRouter API key. Please check your credentials.',
          };
        }
        if (response.status === 429) {
          return {
            success: false,
            error: 'OpenRouter rate limit reached or model quota exceeded. Please try another model or try again shortly.',
          };
        }

        return {
          success: false,
          error: `OpenRouter returned: ${parsedMessage}`,
        };
      }

      const data = await response.json();
      return {
        success: true,
        model: activeModel,
        message: 'OpenRouter connection successful',
        sampleReply: data?.choices?.[0]?.message?.content || 'Connected',
      };
    } catch (err: any) {
      return {
        success: false,
        error: `Network error reaching OpenRouter: ${err.message || 'Could not connect'}`,
      };
    }
  }

  async listModels(apiKey?: string): Promise<ModelInfo[]> {
    const activeKey = (apiKey || process.env.OPENROUTER_API_KEY || '').trim();

    if (!isValidKey(activeKey)) {
      return [];
    }

    try {
      const response = await fetch('https://openrouter.ai/api/v1/models', {
        headers: {
          'Authorization': `Bearer ${activeKey}`,
          'HTTP-Referer': 'https://sanmine.space',
          'X-Title': 'SanMine Space',
        },
      });

      if (!response.ok) {
        throw new Error(`OpenRouter model discovery failed: HTTP ${response.status}`);
      }

      const data = await response.json();
      if (Array.isArray(data?.data)) {
        const models: ModelInfo[] = data.data.map((m: any) => ({
          id: m.id,
          provider: 'openrouter' as AIProviderId,
          name: m.name || m.id,
          contextLength: m.context_length,
          isFree: m.id.endsWith(':free') || (m.pricing?.prompt === '0' && m.pricing?.completion === '0'),
          description: m.description,
          capabilities: {
            streaming: true,
            toolCalling: Boolean(m.description?.toLowerCase().includes('tool') || m.id.includes('gpt') || m.id.includes('claude') || m.id.includes('gemini') || m.id.includes('llama-3.3')),
            vision: Boolean(m.architecture?.modality?.includes('image')),
          },
        }));

        // Sort: popular frontier models and free models
        const popularIds = new Set(POPULAR_OPENROUTER_MODELS.map((p) => p.id));
        const popular = POPULAR_OPENROUTER_MODELS.filter((p) => models.some((m) => m.id === p.id));
        const others = models.filter((m) => !popularIds.has(m.id)).slice(0, 50);
        return popular.length > 0 ? [...popular, ...others] : models.slice(0, 50);
      }
      return [];
    } catch (err: any) {
      console.warn('[OpenRouter] listModels error:', err.message);
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
    const activeKey = (apiKey || process.env.OPENROUTER_API_KEY || '').trim();

    if (!activeKey) {
      onEvent({
        type: 'error',
        message: 'OpenRouter API key is not configured. Please open Settings to connect OpenRouter.',
        code: 'MISSING_API_KEY',
        provider: 'openrouter',
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
      }\nprovider=openrouter\nmodel=${activeModel}`
    );

    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${activeKey}`,
          'HTTP-Referer': 'https://sanmine.space',
          'X-Title': 'SanMine Space',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: activeModel,
          messages: fullMessages,
          temperature,
          max_tokens: maxTokens,
          stream: true,
        }),
        signal: abortSignal,
      });

      console.log(
        `[OPENROUTER RESPONSE]\nproviderRequestId=${providerReqId}\nstatus=${response.status}`
      );

      if (!response.ok) {
        const errorText = await response.text();
        let parsedError = 'OpenRouter request failed';
        try {
          const json = JSON.parse(errorText);
          parsedError = json?.error?.message || json?.message || `Status ${response.status}`;
        } catch {
          parsedError = `HTTP ${response.status}: ${response.statusText}`;
        }

        if (response.status === 401) {
          throw new Error('Invalid OpenRouter API key. Please check your credentials in Settings.');
        } else if (response.status === 429) {
          throw new Error(`OpenRouter rate limit or quota exceeded for model "${activeModel}".`);
        } else if (response.status === 404) {
          throw new Error(`The model "${activeModel}" was not found or is unavailable on OpenRouter.`);
        } else {
          throw new Error(`OpenRouter returned an error (HTTP ${response.status}): ${parsedError}`);
        }
      }

      if (!response.body) {
        throw new Error('OpenRouter response body is null');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let accumulatedContent = '';

      onEvent({ type: 'message.start', provider: 'openrouter', model: activeModel });

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
          message: `OpenRouter returned an empty response for model "${activeModel}". The model may be experiencing high load or provider limitations.`,
          code: 'EMPTY_RESPONSE',
          provider: 'openrouter',
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
      throw new Error(`OpenRouter execution error: ${err.message || 'Network error'}`);
    }
  }
}
