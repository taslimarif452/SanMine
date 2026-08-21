/**
 * Multi-Turn Conversation Memory Manager
 *
 * Provides isolated, user-scoped conversational memory retrieval and automatic long-context management.
 */

import {
  DbMessage,
  listChatMessages,
  saveMessage,
  getConversationSummary,
} from '../db/chats.js';
import { conversationSummarizer } from './conversationSummarizer.js';
import { AIProviderId, ChatMessage } from '../ai/types.js';

export interface EnrichedChatContext {
  chatId: string;
  userId: string;
  summary?: string;
  recentMessages: ChatMessage[];
  totalMessageCount: number;
}

export class ConversationMemoryManager {
  /**
   * Retrieves full conversation context (summary + sliding window of recent messages) for LLM consumption.
   */
  public async getEnrichedContext(options: {
    chatId: string;
    userId: string;
    recentTurnsLimit?: number;
    autoSummarize?: boolean;
    preferredProviderId?: AIProviderId;
    preferredModel?: string;
    userApiKey?: string;
  }): Promise<EnrichedChatContext> {
    const {
      chatId,
      userId,
      recentTurnsLimit = 10,
      autoSummarize = true,
      preferredProviderId,
      preferredModel,
      userApiKey,
    } = options;

    const allMessages = await listChatMessages(chatId, userId);
    if (allMessages === null) {
      return {
        chatId,
        userId,
        summary: undefined,
        recentMessages: [],
        totalMessageCount: 0,
      };
    }

    let summary = '';
    const summaryRecord = await getConversationSummary(chatId, userId);
    if (summaryRecord?.summary) {
      summary = summaryRecord.summary;
    }

    // Auto-summarize if conversation exceeds threshold (e.g. > 12 messages)
    if (autoSummarize && allMessages.length >= 10 && preferredProviderId) {
      conversationSummarizer
        .updateSummary({
          chatId,
          userId,
          messages: allMessages,
          preferredProviderId,
          preferredModel,
          userApiKey,
        })
        .catch((e) => console.warn('[Auto Summarize Background Notice]:', e.message));
    }

    // Select recent sliding window of messages
    const sliceStart = Math.max(0, allMessages.length - recentTurnsLimit);
    const recentDbMessages = allMessages.slice(sliceStart);

    const recentMessages: ChatMessage[] = recentDbMessages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    return {
      chatId,
      userId,
      summary: summary || undefined,
      recentMessages,
      totalMessageCount: allMessages.length,
    };
  }

  /**
   * Appends a user message to the conversation memory.
   */
  public async recordUserMessage(
    chatId: string,
    userId: string,
    content: string,
    metadata?: any
  ): Promise<DbMessage | null> {
    return await saveMessage({
      chatId,
      userId,
      role: 'user',
      content,
      metadata,
    });
  }

  /**
   * Appends an assistant response to the conversation memory.
   */
  public async recordAssistantMessage(
    chatId: string,
    userId: string,
    content: string,
    metadata?: any
  ): Promise<DbMessage | null> {
    return await saveMessage({
      chatId,
      userId,
      role: 'assistant',
      content,
      metadata,
    });
  }
}

export const conversationMemoryManager = new ConversationMemoryManager();
