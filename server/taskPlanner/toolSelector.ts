/**
 * Universal Task Planner — Dynamic Tool Selector & Action Dispatcher
 *
 * Inspects task state, active subtasks, memory, and anti-loop safeguards
 * to select the optimal next tool, formulating explicit rationale and fallbacks.
 */

import { ActionSelection, Task, Subtask } from './types.js';
import { TaskMemoryManager } from './memory.js';

export function selectNextAction(
  task: Task,
  subtask: Subtask | undefined,
  memory: TaskMemoryManager
): ActionSelection {
  // 1. If active subtask specifies direct tool and parameters
  if (subtask) {
    if (subtask.requiredTool === 'browser_navigate' && subtask.targetUrl) {
      const loop = memory.detectLoop('browser_navigate', { url: subtask.targetUrl });
      if (!loop.isLoop) {
        return {
          actionName: 'browser_navigate',
          toolName: 'browser_navigate',
          inputArgs: { url: subtask.targetUrl },
          subtaskId: subtask.id,
          rationale: `Direct navigation requested by subtask: ${subtask.title}`,
          expectedResult: `Load ${subtask.targetUrl} in Live Browser session and capture DOM state`,
          fallbackStrategy: 'Fall back to analyze_website HTTP extraction if browser fails',
        };
      }
    }

    if (subtask.requiredTool === 'search_businesses') {
      const query = subtask.searchQuery || task.originalPrompt;
      const location = task.location || '';
      const limit = task.quantity || 5;
      const loop = memory.detectLoop('search_businesses', { query, location, limit });
      if (!loop.isLoop) {
        return {
          actionName: 'search_businesses',
          toolName: 'search_businesses',
          inputArgs: { query, location, limit },
          subtaskId: subtask.id,
          rationale: `Search for verified businesses: ${query} in ${location}`,
          expectedResult: `Discover up to ${limit} verified establishments in ${location}`,
          fallbackStrategy: 'Fall back to Google web search if provider returns insufficient results',
        };
      }
    }

    if (subtask.requiredTool === 'google_search' && subtask.searchQuery) {
      const loop = memory.detectLoop('google_search', { query: subtask.searchQuery });
      if (!loop.isLoop) {
        return {
          actionName: 'google_search',
          toolName: 'google_search',
          inputArgs: { query: subtask.searchQuery },
          subtaskId: subtask.id,
          rationale: `Discovery query requested by subtask: ${subtask.title}`,
          expectedResult: `Discover candidate websites and URLs for "${subtask.searchQuery}"`,
          fallbackStrategy: 'Modify search terms or remove restrictive keywords if 0 results returned',
        };
      }
    }

    if (subtask.requiredTool === 'prepare_proposals') {
      return {
        actionName: 'prepare_proposals',
        toolName: 'prepare_proposals',
        inputArgs: { targetEntities: memory.verifiedEntities },
        subtaskId: subtask.id,
        rationale: 'Draft personalized client proposals for verified leads',
        expectedResult: 'Generate structured proposal drafts with audit insights',
      };
    }
  }

  // 2. Memory-Driven Next Action Selection

  // A. If high-priority internal links (e.g. /about, /team, /pricing, /contact) exist in memory, inspect them first
  const nextInternalLink = memory.popNextInternalLink();
  if (nextInternalLink) {
    const loop = memory.detectLoop('browser_navigate', { url: nextInternalLink.fullUrl });
    if (!loop.isLoop) {
      return {
        actionName: 'browser_navigate',
        toolName: 'browser_navigate',
        inputArgs: { url: nextInternalLink.fullUrl },
        subtaskId: subtask?.id,
        rationale: `Follow high-priority internal page (${nextInternalLink.semanticTarget || 'section'}): "${nextInternalLink.text}" at ${nextInternalLink.fullUrl}`,
        expectedResult: `Extract targeted details (${nextInternalLink.semanticTarget}) from internal subpage`,
        fallbackStrategy: 'Return to candidate queue if subpage is empty or inaccessible',
      };
    }
  }

  // B. If unvisited candidate URLs exist in memory, pop next candidate
  const nextCandidate = memory.popNextCandidateUrl();
  if (nextCandidate) {
    const loop = memory.detectLoop('browser_navigate', { url: nextCandidate.url });
    if (!loop.isLoop) {
      return {
        actionName: 'browser_navigate',
        toolName: 'browser_navigate',
        inputArgs: { url: nextCandidate.url },
        subtaskId: subtask?.id,
        rationale: `Inspect candidate URL discovered from search: ${nextCandidate.title}`,
        expectedResult: `Extract text, metadata, contacts, and leadership info from ${nextCandidate.url}`,
        fallbackStrategy: 'Try secondary subpages or next candidate if page is unresponsive',
      };
    }
  }

  // C. If no candidate URLs available and we haven't satisfied target quantity
  const targetQuantity = task.quantity || (task.intent === 'DISCOVERY_AND_EXTRACTION' ? 5 : 1);
  const currentVerifiedCount = memory.verifiedEntities.length;

  if (currentVerifiedCount < targetQuantity) {
    // Formulate a progressive or refined search query
    let newQuery = task.originalPrompt;
    if (task.location && !newQuery.toLowerCase().includes(task.location.toLowerCase())) {
      newQuery = `${newQuery} in ${task.location}`;
    }

    if (memory.searchQueries.has(newQuery.toLowerCase())) {
      // Add variations: e.g. "top", "contact", "official website", or target fields
      const queryVariations = [
        `${newQuery} official website`,
        `${newQuery} contact email address`,
        `${newQuery} directory list`,
        `${newQuery} founders leadership`,
      ];
      for (const variant of queryVariations) {
        if (!memory.searchQueries.has(variant.toLowerCase())) {
          newQuery = variant;
          break;
        }
      }
    }

    const loop = memory.detectLoop('google_search', { query: newQuery });
    if (!loop.isLoop) {
      return {
        actionName: 'google_search',
        toolName: 'google_search',
        inputArgs: { query: newQuery },
        subtaskId: subtask?.id,
        rationale: `Discover additional candidate entities to reach requested target of ${targetQuantity} (current: ${currentVerifiedCount})`,
        expectedResult: 'Find additional candidate URLs for inspection',
        fallbackStrategy: 'Broaden search terms if narrow query returns no new entities',
      };
    }
  }

  // C. Fallback: Conclude and verify findings
  return {
    actionName: 'verify_and_synthesize',
    toolName: 'synthesize_response',
    inputArgs: { entitiesCount: memory.verifiedEntities.length },
    subtaskId: subtask?.id,
    rationale: 'All planned discovery and inspection actions have concluded. Formulate final report.',
    expectedResult: 'Compile verified markdown summary with citations.',
  };
}
