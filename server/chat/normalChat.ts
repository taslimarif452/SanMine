import { AIProviderId, ChatEvent, ChatMessage } from '../ai/types.js';
import { failoverManager } from '../ai/failoverManager.js';
import { contextManager } from '../ai/contextManager.js';
import { conversationMemoryManager } from '../memory/conversationMemory.js';

/**
 * Conversational System Prompt for SanMine Space Normal Chat Brain.
 * Focuses purely on natural conversational intelligence (English, Hindi, Hinglish),
 * with zero autonomous agent overhead, zero web discovery tools, and zero research wrappers.
 */
export const NORMAL_CHAT_SYSTEM_PROMPT = `You are SanMine Space, an articulate, friendly, and helpful general-purpose AI assistant (like ChatGPT and Claude).

Your personality & communication style:
- Natural, engaging, polite, and direct.
- Fluent in English, Hindi, Hinglish, and multi-lingual conversations. Adapt to the user's preferred language and tone seamlessly.
- Provide clear, high-quality responses with appropriate Markdown formatting (headings, code blocks, lists) when helpful.
- Keep answers focused, insightful, and easy to read.

Capabilities:
- Casual conversation, greetings, and friendly dialogue
- In-depth explanations of concepts (science, technology, programming, mathematics, history, business, etc.)
- Coding assistance: writing, debugging, explaining code, architecture design, and best practices
- Creative writing, essays, emails, resumes, poetry, and structuring content
- Brainstorming, problem-solving, and strategy ideation
- Summarization, translation, language learning, and text editing
- Multi-turn conversational memory and logical follow-ups

Important Directives:
- Do NOT output agent research wrappers, telemetry, or tool execution steps.
- Do NOT output phrases like "Research Summary:", "0 entities discovered", "No businesses found", "Google Search", or "Agent task completed".
- You are a conversational AI companion in this mode.
- Autonomous research / outreach tools run when the user delegates work (find companies, inspect websites, generate or send proposals). A leading "/" also forces Agent Mode.
- If the user is only chatting, stay conversational. Do not invent research reports.`;

export interface NormalChatExecutionOptions {
  taskId: string;
  chatId?: string;
  userId?: string;
  userApiKey?: string;
  defaultLocation?: string;
  providerId: AIProviderId;
  model: string;
  messages: Array<{
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string;
  }>;
  temperature?: number;
  maxTokens?: number;
  sendEvent: (event: ChatEvent) => void;
  abortSignal?: AbortSignal;
}

/**
 * Executes a clean, independent conversational chat path with automatic model failover
 * and long-term conversation memory context injection.
 */
export async function executeNormalChat({
  taskId,
  chatId,
  userId,
  userApiKey,
  defaultLocation,
  providerId,
  model,
  messages,
  temperature = 0.7,
  maxTokens = 4096,
  sendEvent,
  abortSignal,
}: NormalChatExecutionOptions): Promise<void> {
  // Filter conversation history to valid user/assistant turns
  const cleanMessages: ChatMessage[] = messages
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

  if (cleanMessages.length === 0) {
    cleanMessages.push({ role: 'user', content: 'Hello' });
  }

  // Retrieve existing summary if chatId is present
  let conversationSummary: string | undefined = undefined;
  if (chatId && userId) {
    try {
      const enriched = await conversationMemoryManager.getEnrichedContext({
        chatId,
        userId,
        recentTurnsLimit: 12,
        autoSummarize: true,
        preferredProviderId: providerId,
        preferredModel: model,
        userApiKey,
      });
      conversationSummary = enriched.summary;
    } catch (e: any) {
      console.warn('[Normal Chat Memory Context Notice]:', e.message);
    }
  }

  // Build composite system prompt containing memory summary
  const effectiveSystemPrompt = contextManager.buildSystemPrompt({
    systemPrompt: NORMAL_CHAT_SYSTEM_PROMPT,
    conversationSummary,
    defaultLocation,
  });

  // Build optimized context with sliding window
  const assembledMessages = contextManager.buildContext({
    systemPrompt: NORMAL_CHAT_SYSTEM_PROMPT,
    conversationSummary,
    recentMessages: cleanMessages,
    defaultLocation,
  });

  const latestUserMsg = [...cleanMessages].reverse().find((m) => m.role === 'user');
  console.log(
    `[NORMAL CHAT EXECUTION]\nrequestId=${taskId}\nprovider=${providerId}\nmodel=${model}\nmessageLength=${
      latestUserMsg?.content?.length || 0
    }\nhistoryTurns=${cleanMessages.length}\nhasSummary=${Boolean(conversationSummary)}`
  );

  try {
    await failoverManager.streamChatWithFailover({
      taskId,
      preferredProviderId: providerId,
      preferredModel: model,
      userApiKey,
      userId,
      messages: assembledMessages,
      systemPrompt: effectiveSystemPrompt,
      temperature,
      maxTokens,
      onEvent: sendEvent,
      abortSignal,
    });
  } catch (err: any) {
    console.error(`[NORMAL CHAT ERROR] All providers failed:`, err?.message || err);
    sendEvent({
      type: 'error',
      message: err?.message || 'Conversational model is temporarily unavailable. Please try again shortly.',
      code: 'NORMAL_CHAT_STREAM_ERROR',
      provider: providerId,
    });
  }
}
