/**
 * Universal Task Planner — Progress Evaluation Engine
 *
 * Evaluates tool execution observations against task completion criteria,
 * checks field satisfaction, calculates progress percentage, and determines
 * if dynamic re-planning is required.
 */

import { EvaluationOutcome, PlannerObservation, Task, TaskEvaluation } from './types.js';
import { TaskMemoryManager } from './memory.js';

export function evaluateProgress(
  task: Task,
  memory: TaskMemoryManager,
  observation: PlannerObservation
): TaskEvaluation {
  const targetQuantity = task.quantity || (task.intent === 'DISCOVERY_AND_EXTRACTION' ? 5 : 1);
  const verifiedCount = memory.verifiedEntities.length;
  const candidateCount = memory.candidateUrls.length;
  const totalFactsCount = memory.extractedFacts.length;

  const satisfiedRequirements: string[] = [];
  const missingRequirements: string[] = [];

  // Check required fields
  for (const field of task.requiredFields) {
    const hasField = memory.extractedFacts.some((f) => f.field === field && f.confidence === 'high');
    if (hasField) {
      satisfiedRequirements.push(field);
    } else {
      missingRequirements.push(field);
    }
  }

  // Calculate Progress Percentage
  let progressPercentage = 0;
  if (task.intent === 'DISCOVERY_AND_EXTRACTION' || task.intent === 'PROPOSAL_SYNTHESIS') {
    const quantityProgress = Math.min(100, Math.round((verifiedCount / targetQuantity) * 80));
    const fieldsProgress = task.requiredFields.length > 0
      ? Math.round((satisfiedRequirements.length / task.requiredFields.length) * 20)
      : 20;
    progressPercentage = Math.min(100, quantityProgress + fieldsProgress);
  } else if (task.intent === 'URL_INSPECTION_AND_AUDIT') {
    progressPercentage = observation.success ? 85 : 20;
  } else {
    progressPercentage = verifiedCount > 0 || totalFactsCount > 0 ? 90 : 30;
  }

  // Check if Task is Complete
  const isQuantitySatisfied = verifiedCount >= targetQuantity;
  const isDirectAuditSatisfied = task.intent === 'URL_INSPECTION_AND_AUDIT' && observation.success;
  const isSocialSatisfied = task.intent === 'SOCIAL_PROFILE_RESEARCH' && observation.extractedFacts.length > 0;

  const completedFields = satisfiedRequirements;
  const verifiedFields = satisfiedRequirements;
  const remainingWork = Math.max(0, targetQuantity - verifiedCount);
  const goalProgress = Math.min(100, Math.round((verifiedCount / targetQuantity) * 100));

  if (isQuantitySatisfied || isDirectAuditSatisfied || isSocialSatisfied) {
    return {
      status: 'TASK_COMPLETE',
      confidence: 0.95,
      satisfiedRequirements,
      missingRequirements,
      completedFields,
      verifiedFields,
      candidateCount,
      remainingWork: 0,
      targetQuantity,
      verifiedCount,
      goalProgress: 100,
      progressPercentage: 100,
      recommendation: 'Target completion criteria satisfied. Synthesize final answer.',
      shouldReplan: false,
    };
  }

  // Check Failed Observation
  if (!observation.success) {
    return {
      status: 'FAILED',
      confidence: 0.2,
      satisfiedRequirements,
      missingRequirements,
      completedFields,
      verifiedFields,
      candidateCount,
      remainingWork,
      targetQuantity,
      verifiedCount,
      goalProgress,
      progressPercentage,
      recommendation: `Action ${observation.action} failed: ${observation.errors || 'Unknown error'}. Trigger replan.`,
      shouldReplan: true,
      replanReason: `Execution failure in ${observation.tool}: ${observation.errors || 'Page failed to load'}`,
    };
  }

  // Check Zero Progress (e.g. search returned 0 items, or page had no facts and no subpages)
  if (
    observation.discoveredUrls.length === 0 &&
    observation.extractedFacts.length === 0 &&
    candidateCount === 0 &&
    verifiedCount < targetQuantity
  ) {
    return {
      status: 'NO_PROGRESS',
      confidence: 0.4,
      satisfiedRequirements,
      missingRequirements,
      completedFields,
      verifiedFields,
      candidateCount,
      remainingWork,
      targetQuantity,
      verifiedCount,
      goalProgress,
      progressPercentage,
      recommendation: 'Zero new candidate sources or facts discovered. Replan search strategy or broaden query.',
      shouldReplan: true,
      replanReason: 'Exhausted current candidate pool without meeting target quantity.',
    };
  }

  // Normal In-Progress
  return {
    status: verifiedCount > 0 ? 'PARTIAL_SUCCESS' : 'SUCCESS',
    confidence: 0.85,
    satisfiedRequirements,
    missingRequirements,
    completedFields,
    verifiedFields,
    candidateCount,
    remainingWork,
    targetQuantity,
    verifiedCount,
    goalProgress,
    progressPercentage,
    recommendation: `Progressing (${verifiedCount}/${targetQuantity} verified). Proceed with next action.`,
    shouldReplan: false,
  };
}
