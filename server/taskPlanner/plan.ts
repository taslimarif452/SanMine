/**
 * Universal Task Planner — Mutable Execution Plan Model & Operations
 *
 * Provides a dynamic, mutable plan that can add, remove, reorder, retry,
 * change tools, or modify search queries based on real-time observations.
 */

import { ExecutionPlan, Subtask, SubtaskStatus, Task } from './types.js';
import { decomposeTask } from './decomposer.js';

export function createExecutionPlan(task: Task): ExecutionPlan {
  const subtasks = task.subtasks.length > 0 ? task.subtasks : decomposeTask(task);
  task.subtasks = subtasks;

  return {
    id: `plan_${task.id}_v1`,
    version: 1,
    goal: task.normalizedObjective,
    subtasks,
    activeSubtaskIndex: 0,
    fallbackStrategies: [
      'Modify search queries if initial results return zero hits',
      'Follow internal subpages (About, Team, Contact) for missing fields',
      'Inspect secondary public sources when primary site is missing data',
      'Fall back to deterministic extraction when page structure is complex',
    ],
    estimatedSteps: subtasks.length,
    updatedAt: new Date().toISOString(),
  };
}

export function addSubtask(
  plan: ExecutionPlan,
  subtask: Subtask,
  position?: number
): void {
  plan.version++;
  plan.updatedAt = new Date().toISOString();
  if (position !== undefined && position >= 0 && position <= plan.subtasks.length) {
    plan.subtasks.splice(position, 0, subtask);
  } else {
    plan.subtasks.push(subtask);
  }
}

export function removeSubtask(plan: ExecutionPlan, subtaskId: string): void {
  const idx = plan.subtasks.findIndex((s) => s.id === subtaskId);
  if (idx !== -1) {
    plan.version++;
    plan.updatedAt = new Date().toISOString();
    plan.subtasks.splice(idx, 1);
  }
}

export function reorderSubtask(
  plan: ExecutionPlan,
  subtaskId: string,
  newIndex: number
): void {
  const currentIndex = plan.subtasks.findIndex((s) => s.id === subtaskId);
  if (currentIndex === -1 || newIndex < 0 || newIndex >= plan.subtasks.length) return;

  plan.version++;
  plan.updatedAt = new Date().toISOString();
  const [removed] = plan.subtasks.splice(currentIndex, 1);
  plan.subtasks.splice(newIndex, 0, removed);
}

export function retrySubtask(
  plan: ExecutionPlan,
  subtaskId: string,
  updatedParams?: Partial<Subtask>
): void {
  const subtask = plan.subtasks.find((s) => s.id === subtaskId);
  if (!subtask) return;

  plan.version++;
  plan.updatedAt = new Date().toISOString();
  subtask.retryCount++;
  subtask.status = 'RETRYING';
  if (updatedParams) {
    Object.assign(subtask, updatedParams);
  }
}

export function changeTool(
  plan: ExecutionPlan,
  subtaskId: string,
  newTool: string
): void {
  const subtask = plan.subtasks.find((s) => s.id === subtaskId);
  if (!subtask) return;

  plan.version++;
  plan.updatedAt = new Date().toISOString();
  subtask.requiredTool = newTool;
}

export function changeSource(
  plan: ExecutionPlan,
  subtaskId: string,
  newSource: string
): void {
  const subtask = plan.subtasks.find((s) => s.id === subtaskId);
  if (!subtask) return;

  plan.version++;
  plan.updatedAt = new Date().toISOString();
  subtask.targetUrl = newSource;
}

export function changeSearchQuery(
  plan: ExecutionPlan,
  subtaskId: string,
  newQuery: string
): void {
  const subtask = plan.subtasks.find((s) => s.id === subtaskId);
  if (!subtask) return;

  plan.version++;
  plan.updatedAt = new Date().toISOString();
  subtask.searchQuery = newQuery;
}

export function markSubtaskStatus(
  plan: ExecutionPlan,
  subtaskId: string,
  status: SubtaskStatus,
  resultSummary?: string,
  error?: string
): void {
  const subtask = plan.subtasks.find((s) => s.id === subtaskId);
  if (!subtask) return;

  plan.version++;
  plan.updatedAt = new Date().toISOString();
  subtask.status = status;
  if (resultSummary !== undefined) subtask.resultSummary = resultSummary;
  if (error !== undefined) subtask.error = error;
}

export function getNextPendingSubtask(plan: ExecutionPlan): Subtask | undefined {
  return plan.subtasks.find((s) => s.status === 'PENDING' || s.status === 'RETRYING');
}
