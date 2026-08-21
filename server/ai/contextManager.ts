/**
 * Context Management & Assembly Layer
 *
 * Formulates compact, high-relevance prompt contexts combining system prompts,
 * long-term conversation summaries, user preferences, and recent sliding-window messages.
 */

import { ChatMessage } from './types.js';

export interface BuildChatContextOptions {
  systemPrompt: string;
  conversationSummary?: string;
  recentMessages: ChatMessage[];
  defaultLocation?: string;
  userContext?: Record<string, any>;
  maxEstimatedTokens?: number;
}

export class ContextManager {
  /**
   * Builds the composite system instruction string incorporating long-term summaries and environment context.
   */
  public buildSystemPrompt(options: {
    systemPrompt: string;
    conversationSummary?: string;
    defaultLocation?: string;
    userContext?: Record<string, any>;
  }): string {
    const { systemPrompt, conversationSummary, defaultLocation, userContext } = options;
    const systemSections: string[] = [systemPrompt.trim()];

    if (conversationSummary && conversationSummary.trim()) {
      systemSections.push(
        `### Prior Conversation Context & Memory Summary:\n${conversationSummary.trim()}`
      );
    }

    if (defaultLocation && defaultLocation.trim()) {
      systemSections.push(`User Preferred Default Location: ${defaultLocation.trim()}`);
    }

    if (userContext && Object.keys(userContext).length > 0) {
      systemSections.push(`User Environment Context: ${JSON.stringify(userContext)}`);
    }

    return systemSections.join('\n\n');
  }

  /**
   * Constructs the optimized message array for LLM completions with sliding-window capacity limit.
   */
  public buildContext(options: BuildChatContextOptions): ChatMessage[] {
    const {
      systemPrompt,
      conversationSummary,
      recentMessages,
      defaultLocation,
      userContext,
      maxEstimatedTokens = 6000,
    } = options;

    const effectiveSystemPrompt = this.buildSystemPrompt({
      systemPrompt,
      conversationSummary,
      defaultLocation,
      userContext,
    });

    // Estimate token footprint of system instructions
    let currentTokens = Math.round(effectiveSystemPrompt.length / 4);
    const messagesToInclude: ChatMessage[] = [];

    // Traverse from newest to oldest to preserve latest conversational turns
    for (let i = recentMessages.length - 1; i >= 0; i--) {
      const msg = recentMessages[i];
      const msgTokens = Math.round((msg.content || '').length / 4);
      if (currentTokens + msgTokens > maxEstimatedTokens && messagesToInclude.length >= 2) {
        break; // Reached token capacity limit
      }
      currentTokens += msgTokens;
      messagesToInclude.unshift(msg);
    }

    return messagesToInclude;
  }
}

export const contextManager = new ContextManager();
