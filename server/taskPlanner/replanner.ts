/**
 * Universal Task Planner — Dynamic Re-Planning Engine
 *
 * Responds to execution failures, zero-progress traps, missing fields,
 * or anti-loop tripwires by modifying search queries, discovering new
 * candidate pools, following subpages, or switching tools.
 */

import { PlannerObservation, ReplanDecision, Task, TaskEvaluation } from './types.js';
import { TaskMemoryManager } from './memory.js';
import { addSubtask, changeSearchQuery } from './plan.js';

export function replanTask(
  task: Task,
  memory: TaskMemoryManager,
  evaluation: TaskEvaluation,
  lastObservation: PlannerObservation
): ReplanDecision {
  const plan = task.executionPlan;
  const reason = evaluation.replanReason || 'Dynamic strategy adjustment required';

  // 1. If we have candidate URLs waiting in memory, pop and inspect next candidate
  if (memory.candidateUrls.length > 0) {
    const nextCandidate = memory.candidateUrls[0];
    const newSubtask = {
      id: `subtask_replan_${Date.now().toString(36)}`,
      title: `Inspect fallback candidate: ${nextCandidate.title || nextCandidate.url}`,
      description: `Switch to next discovered candidate URL after previous step failure`,
      requiredTool: 'browser_navigate',
      targetUrl: nextCandidate.url,
      targetFields: task.requiredFields,
      status: 'PENDING' as const,
      retryCount: 0,
      maxRetries: 2,
    };
    addSubtask(plan, newSubtask, plan.activeSubtaskIndex + 1);

    return {
      triggered: true,
      reason,
      actionTaken: 'SWITCH_SOURCE',
      updatedPlan: plan,
      notes: `Switched target source to fallback candidate: ${nextCandidate.url}`,
    };
  }

  // 2. If search yielded zero results or narrow results, broaden search query
  if (lastObservation.tool === 'google_search' || memory.candidateUrls.length === 0) {
    let broadenedQuery = task.originalPrompt
      .replace(/(?:official|verified|best|top|certified|direct|public)/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (task.location && !broadenedQuery.toLowerCase().includes(task.location.toLowerCase())) {
      broadenedQuery = `${broadenedQuery} in ${task.location}`;
    }

    // Add general suffix if needed
    if (broadenedQuery === task.originalPrompt) {
      broadenedQuery = `${broadenedQuery} directory contact website`;
    }

    const searchSubtask = {
      id: `subtask_replan_search_${Date.now().toString(36)}`,
      title: `Broadened discovery search: "${broadenedQuery}"`,
      description: `Execute broadened search query after narrow query exhaustion`,
      requiredTool: 'google_search',
      searchQuery: broadenedQuery,
      targetFields: task.requiredFields,
      status: 'PENDING' as const,
      retryCount: 0,
      maxRetries: 2,
    };
    addSubtask(plan, searchSubtask, plan.activeSubtaskIndex + 1);

    return {
      triggered: true,
      reason,
      actionTaken: 'MODIFY_QUERY',
      updatedPlan: plan,
      notes: `Generated broadened search query: "${broadenedQuery}"`,
    };
  }

  // 3. If navigation failed, try secondary links discovered earlier
  if (lastObservation.discoveredLinks && lastObservation.discoveredLinks.length > 0) {
    const fallbackLink = lastObservation.discoveredLinks[0];
    const linkUrl = fallbackLink.fullUrl || fallbackLink.href;
    const navSubtask = {
      id: `subtask_replan_link_${Date.now().toString(36)}`,
      title: `Inspect internal page: ${fallbackLink.text || linkUrl}`,
      description: `Follow internal navigation link for missing fields`,
      requiredTool: 'browser_navigate',
      targetUrl: linkUrl,
      targetFields: task.requiredFields,
      status: 'PENDING' as const,
      retryCount: 0,
      maxRetries: 2,
    };
    addSubtask(plan, navSubtask, plan.activeSubtaskIndex + 1);

    return {
      triggered: true,
      reason,
      actionTaken: 'FOLLOW_SECONDARY_LINK',
      updatedPlan: plan,
      notes: `Injected subtask to inspect internal page: ${linkUrl}`,
    };
  }

  // 4. Default fallback: conclude with partial results
  return {
    triggered: true,
    reason: 'Exhausted available exploration branches. Concluding with verified subset.',
    actionTaken: 'CONCLUDE_PARTIAL',
    updatedPlan: plan,
    notes: 'Proceeding to synthesize grounded output from all verified observations.',
  };
}
