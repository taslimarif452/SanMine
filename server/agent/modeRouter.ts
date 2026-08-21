/**
 * Execution Mode Router for SanMine Space
 *
 * SanMine is a work-delegation agent. Users should not need a leading '/'
 * to start research, lead-finding, proposal, or outreach work.
 *
 * - Leading '/' always activates Agent Mode.
 * - Natural-language work goals also activate Agent Mode.
 * - Casual chat / explanations stay in Normal Chat.
 * - In-message slashes ("/api", "https://...") do not trigger Agent Mode.
 */

import { isWorkDelegationTask } from './workIntent.js';

export type ExecutionMode = 'normal_chat' | 'agent';

export interface RouteResolution {
  /**
   * Resolved execution mode: 'normal_chat' or 'agent'
   */
  mode: ExecutionMode;

  /**
   * Whether the user explicitly typed a leading '/'
   */
  isExplicitSlashCommand: boolean;

  /**
   * Whether this is a multi-turn continuation of an active agent task
   */
  isAgentContinuation: boolean;

  /**
   * The normalized objective string (leading slash removed if present)
   */
  normalizedPrompt: string;

  /**
   * The raw original prompt unmodified
   */
  rawPrompt: string;
}

export interface RouteContext {
  conversationHistory?: Array<{ role: string; content: string; metadata?: any }>;
  hasActiveAgentSession?: boolean;
}

/**
 * Checks if a given text starts with a slash command trigger after optional leading whitespace.
 */
export function isLeadingSlashCommand(text: string): boolean {
  if (typeof text !== 'string') return false;
  return text.trimStart().startsWith('/');
}

/**
 * Strips ONLY the single leading slash after leading whitespace.
 * Preserves all other characters, internal spaces, URLs, usernames, quotes, and punctuation.
 *
 * Example:
 * "/Google par 20 companies find karo" -> "Google par 20 companies find karo"
 * "   /Instagram se ___tauqeer.x ka public detail nikalo" -> "Instagram se ___tauqeer.x ka public detail nikalo"
 */
export function stripLeadingSlash(text: string): string {
  if (typeof text !== 'string') return '';
  const trimmedLeading = text.trimStart();
  if (trimmedLeading.startsWith('/')) {
    return trimmedLeading.slice(1);
  }
  return text;
}

/**
 * Determines whether a follow-up user message is a continuation of an active Agent task.
 */
function isContinuationOfActiveAgentTask(
  prompt: string,
  history?: Array<{ role: string; content: string; metadata?: any }>
): boolean {
  if (!Array.isArray(history) || history.length === 0) {
    return false;
  }

  const trimmedPrompt = (prompt || '').trim();
  const lowerPrompt = trimmedPrompt.toLowerCase();

  // Obvious standalone normal chat greetings or questions never continue an agent loop implicitly
  const standaloneChatPhrases = [
    'hi',
    'hello',
    'hey',
    'how are you',
    'what is python',
    'explain ai agents',
    'tell me about react',
    'help me write an email',
    'what can you do',
    'who are you',
    'good morning',
    'good afternoon',
    'good evening',
  ];
  if (standaloneChatPhrases.includes(lowerPrompt) || lowerPrompt.startsWith('what is ') || lowerPrompt.startsWith('explain ')) {
    return false;
  }

  // Find the last assistant message
  const lastAssistantMsg = [...history].reverse().find((m) => m.role === 'assistant');
  if (!lastAssistantMsg || typeof lastAssistantMsg.content !== 'string') {
    return false;
  }

  // If the previous task was already marked completed/stopped in metadata, it is not waiting for input
  if (lastAssistantMsg.metadata?.taskResult?.status === 'completed' || lastAssistantMsg.metadata?.taskResult?.status === 'stopped') {
    return false;
  }

  const assistantContent = lastAssistantMsg.content.trim().toLowerCase();

  // Check if the assistant explicitly asked for specific clarification or input to proceed
  const clarificationPatterns = [
    'which location should i target',
    'which location',
    'target location',
    'which details do you need',
    'what details do you need',
    'please specify the location',
    'please provide the website url',
    'please provide the domain',
    'which company should i inspect',
    'what information should i extract',
    'which platform do you want to search',
    'waiting for your input',
  ];

  const hasClarificationRequest = clarificationPatterns.some((pattern) =>
    assistantContent.includes(pattern)
  );

  if (hasClarificationRequest || lastAssistantMsg.metadata?.taskResult?.status === 'waiting_for_input') {
    return true;
  }

  // Check if the prior user message was an explicit slash command and assistant asked a pending question
  const userMessages = history.filter((m) => m.role === 'user');
  const prevUserMsg = userMessages[userMessages.length - 1];
  const prevWasSlash = prevUserMsg && isLeadingSlashCommand(prevUserMsg.content);

  if (prevWasSlash && lastAssistantMsg.content.trim().endsWith('?') && !assistantContent.includes('here is') && !assistantContent.includes('## ')) {
    return true;
  }

  return false;
}

/**
 * Resolves the execution mode for any user message.
 */
export function resolveExecutionMode(
  message: string,
  context?: RouteContext
): RouteResolution {
  const rawPrompt = typeof message === 'string' ? message : '';
  const trimmedLeading = rawPrompt.trimStart();
  const startsWithSlash = trimmedLeading.startsWith('/');

  // 1. Explicit Slash Command -> Immediate AGENT MODE
  if (startsWithSlash) {
    const normalizedPrompt = stripLeadingSlash(rawPrompt);
    return {
      mode: 'agent',
      isExplicitSlashCommand: true,
      isAgentContinuation: false,
      normalizedPrompt,
      rawPrompt,
    };
  }

  // 2. Check for multi-turn agent continuation
  if (context?.hasActiveAgentSession || isContinuationOfActiveAgentTask(rawPrompt, context?.conversationHistory)) {
    return {
      mode: 'agent',
      isExplicitSlashCommand: false,
      isAgentContinuation: true,
      normalizedPrompt: rawPrompt,
      rawPrompt,
    };
  }

  // 3. Natural-language work delegation (research, leads, proposals, outreach)
  if (isWorkDelegationTask(rawPrompt)) {
    return {
      mode: 'agent',
      isExplicitSlashCommand: false,
      isAgentContinuation: false,
      normalizedPrompt: rawPrompt,
      rawPrompt,
    };
  }

  // 4. Default -> NORMAL CONVERSATIONAL CHAT MODE
  return {
    mode: 'normal_chat',
    isExplicitSlashCommand: false,
    isAgentContinuation: false,
    normalizedPrompt: rawPrompt,
    rawPrompt,
  };
}
