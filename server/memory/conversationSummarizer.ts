/**
 * Conversation Context Summarizer
 *
 * Progressively compresses older conversation turns into a high-density, factual summary
 * to maintain long context fidelity without overflowing LLM context limits.
 */

import { DbMessage, saveConversationSummary, getConversationSummary } from '../db/chats.js';
import { failoverManager } from '../ai/failoverManager.js';
import { aiRegistry } from '../ai/registry.js';
import { AIProviderId } from '../ai/types.js';

export interface SummarizeConversationOptions {
  chatId: string;
  userId: string;
  messages: DbMessage[];
  preferredProviderId?: AIProviderId;
  preferredModel?: string;
  userApiKey?: string;
}

export class ConversationSummarizer {
  /**
   * Generates or updates the rolling conversation summary for a long multi-turn chat.
   */
  public async updateSummary(options: SummarizeConversationOptions): Promise<string> {
    const { chatId, userId, messages, preferredProviderId = 'google', preferredModel = 'gemini-2.5-flash', userApiKey } = options;

    if (!messages || messages.length < 6) {
      return '';
    }

    // Get existing summary if any
    const existing = await getConversationSummary(chatId, userId);
    const existingSummary = existing?.summary || '';

    // Older messages to summarize (everything except last 4 turns)
    const messagesToSummarize = messages.slice(0, Math.max(0, messages.length - 4));
    if (messagesToSummarize.length === 0) {
      return existingSummary;
    }

    const conversationTranscript = messagesToSummarize
      .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
      .join('\n\n');

    const prompt = `You are the SanMine Space Conversation Memory Compressor.
Your objective is to create a concise, high-density factual summary of the prior conversation context.

Retain critical knowledge:
1. User identity, company name, default preferences, and requested locations.
2. Topics discussed, queries asked, and decisions made.
3. Entities discovered, website audit results, and key recommendations.
4. Unresolved tasks or user constraints.

Keep it under 300 words. Format with clean bullet points.

${existingSummary ? `### Existing Prior Summary:\n${existingSummary}\n\n` : ''}
### Messages to Integrate:
${conversationTranscript}

Updated High-Density Summary:`;

    try {
      const { result } = await failoverManager.executeWithFailover(
        async (providerId, model, resolvedApiKey) => {
          const provider = aiRegistry.get(providerId);
          if (!provider) throw new Error(`Provider ${providerId} unavailable`);

          let collectedText = '';
          await provider.streamChat({
            taskId: `sum_${Date.now()}`,
            apiKey: resolvedApiKey,
            messages: [
              {
                role: 'user',
                content: prompt,
              },
            ],
            model,
            temperature: 0.1,
            maxTokens: 500,
            onEvent: (ev) => {
              if (ev.type === 'message.delta') {
                collectedText += ev.content || '';
              }
            },
          });
          return collectedText.trim();
        },
        {
          preferredProviderId,
          preferredModel,
          userApiKey,
        }
      );

      if (result) {
        const lastMsgId = messagesToSummarize[messagesToSummarize.length - 1]?.id;
        await saveConversationSummary({
          chatId,
          userId,
          summary: result,
          lastMessageId: lastMsgId,
        });
        return result;
      }
    } catch (err: any) {
      console.warn('[Conversation Summarizer Notice] Summarization bypassed:', err.message);
    }

    return existingSummary;
  }
}

export const conversationSummarizer = new ConversationSummarizer();
