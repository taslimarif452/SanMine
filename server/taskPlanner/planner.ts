/**
 * Universal Task Planner & Agent Intelligence Layer
 *
 * Central intelligence/orchestration brain of SanMine Space.
 * Provides general-purpose objective understanding, dynamic task decomposition,
 * execution plan management, anti-loop memory tracking, and grounded synthesis.
 */

import { Task, UniversalPlannerOptions } from './types.js';
import { understandTaskObjective } from './intent.js';
import { createExecutionPlan, markSubtaskStatus, getNextPendingSubtask } from './plan.js';
import { TaskMemoryManager } from './memory.js';
import { EvidenceManager } from './evidence.js';
import { selectNextAction } from './toolSelector.js';
import { executePlannerAction } from './executor.js';
import { evaluateProgress } from './evaluator.js';
import { replanTask } from './replanner.js';
import { synthesizeFinalReport } from './completion.js';
import { browserSessionManager } from '../browser/sessionManager.js';
import { aiRegistry } from '../ai/registry.js';
import { executeTool } from '../tools.js';

export class UniversalTaskPlanner {
  /**
   * Main entry point to orchestrate arbitrary user tasks.
   */
  public async execute(options: UniversalPlannerOptions): Promise<{
    success: boolean;
    finalAnswer: string;
    task: Task;
  }> {
    const {
      taskId = `task_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      userId = 'anonymous',
      userApiKey,
      providerId,
      model,
      messages,
      defaultLocation,
      sendEvent,
      abortSignal,
      maxIterations = 10,
    } = options;

    const lastMessage = messages[messages.length - 1];
    const userPrompt = lastMessage?.content || '';
    const conversationHistory = messages.slice(0, -1);

    console.log(`[UNIVERSAL TASK PLANNER] Planning task for: "${userPrompt}"`);

    // 1. UNDERSTAND OBJECTIVE & INTENT
    const task = understandTaskObjective(userPrompt, {
      taskId,
      defaultLocation,
      conversationHistory,
    });

    // Handle Missing Location Clarification
    if (task.status === 'WAITING_FOR_INPUT' && task.clarificationPrompt) {
      console.log('[UNIVERSAL PLANNER] Location unresolved. Prompting user for clarification.');
      sendEvent({ type: 'message.delta', content: task.clarificationPrompt });
      sendEvent({ type: 'message.completed', content: task.clarificationPrompt });
      sendEvent({
        type: 'task.completed',
        status: 'waiting_for_input',
        message: 'Awaiting target location',
      });

      return {
        success: true,
        finalAnswer: task.clarificationPrompt,
        task,
      };
    }

    // Handle System Diagnostic Intent
    if (task.intent === 'SYSTEM_DIAGNOSTIC') {
      const statusRes = await executeTool('get_system_status', { checkType: 'all' }, sendEvent);
      const statusText = `### ⚙️ SanMine Space — Runtime System Status

- **Status:** ${statusRes.status || 'Active'}
- **Timestamp:** ${statusRes.timestamp || new Date().toISOString()}
- **AI Integrations Configured:** ${statusRes.providersConfigured ? statusRes.providersConfigured.join(', ') : 'Ready'}
- **Active Tools Available:** ${statusRes.toolsAvailable ? statusRes.toolsAvailable.join(', ') : 'search_businesses, analyze_website, calculate_lead_score, get_system_status'}`;

      sendEvent({ type: 'message.delta', content: statusText });
      sendEvent({ type: 'message.completed', content: statusText });
      sendEvent({
        type: 'task.completed',
        status: 'completed',
        message: 'System status report delivered',
      });
      return { success: true, finalAnswer: statusText, task };
    }

    // Handle Direct Chat Intent
    if (task.intent === 'DIRECT_CHAT') {
      const provider = aiRegistry.get(providerId);
      if (provider) {
        let fullReply = '';
        try {
          await provider.streamChat({
            taskId,
            apiKey: userApiKey,
            messages: messages.map((m) => ({ role: m.role as any, content: m.content })),
            model,
            onEvent: (event) => {
              if (event.type === 'message.delta' && event.content) {
                fullReply += event.content;
              }
              sendEvent(event);
            },
            abortSignal,
          });

          sendEvent({ type: 'task.completed', status: 'completed', message: 'Chat completed' });
          return { success: true, finalAnswer: fullReply, task };
        } catch (chatErr: any) {
          console.warn('[Direct Chat Error]:', chatErr.message);
        }
      }
    }

    // 2. CREATE EXECUTION PLAN & INITIALIZE MEMORY
    task.executionPlan = createExecutionPlan(task);
    const memory = new TaskMemoryManager(taskId);
    const evidence = new EvidenceManager();

    sendEvent({
      type: 'task.started',
      message: 'Agent is working',
      provider: providerId,
      model,
    });

    sendEvent({
      type: 'task.progress',
      stepId: 'step_understand',
      title: 'Understanding request',
      status: 'completed',
      message: 'Understood request & formulated dynamic execution plan',
      detail: `Goal: ${task.normalizedObjective}`,
    });

    // 3. EXECUTION LOOP
    let iteration = 0;
    let isTaskComplete = false;

    while (iteration < maxIterations && !isTaskComplete) {
      if (abortSignal?.aborted) {
        console.log(`[UNIVERSAL PLANNER] Task ${taskId} aborted.`);
        task.status = 'STOPPED';
        break;
      }

      iteration++;
      task.currentState.currentIteration = iteration;
      console.log(`[UNIVERSAL PLANNER LOOP] Iteration ${iteration}/${maxIterations} | Verified entities: ${memory.verifiedEntities.length}`);

      // A. Get Next Subtask
      const currentSubtask = getNextPendingSubtask(task.executionPlan);
      if (currentSubtask) {
        markSubtaskStatus(task.executionPlan, currentSubtask.id, 'IN_PROGRESS');
      }

      // B. Select Next Action
      const action = selectNextAction(task, currentSubtask, memory);

      // If action is synthesis, finish loop
      if (action.actionName === 'verify_and_synthesize') {
        isTaskComplete = true;
        if (currentSubtask) {
          markSubtaskStatus(task.executionPlan, currentSubtask.id, 'COMPLETED');
        }
        break;
      }

      // C. Execute Action
      task.currentState.totalToolsExecuted++;
      const observation = await executePlannerAction({
        task,
        action,
        memory,
        userId,
        sendEvent,
        abortSignal,
      });

      // D. Record Observation into Memory & Evidence
      memory.recordObservation(observation);
      for (const ev of observation.evidence) {
        evidence.addEvidence(ev);
      }
      for (const fact of observation.extractedFacts) {
        evidence.addFact(fact);
      }

      // E. Evaluate Progress
      const evaluation = evaluateProgress(task, memory, observation);
      task.currentState.progressPercentage = evaluation.progressPercentage;

      sendEvent({
        type: 'task.progress',
        stepId: `step_progress_${iteration}`,
        title: `Goal progress: ${evaluation.verifiedCount}/${evaluation.targetQuantity}`,
        status: evaluation.status === 'TASK_COMPLETE' ? 'completed' : 'in_progress',
        message: `Goal progress: ${evaluation.verifiedCount}/${evaluation.targetQuantity} verified entities`,
        detail: `Verified: ${evaluation.verifiedCount}, Remaining: ${evaluation.remainingWork}, Candidates: ${evaluation.candidateCount}`,
      });

      if (currentSubtask) {
        markSubtaskStatus(
          task.executionPlan,
          currentSubtask.id,
          observation.success ? 'COMPLETED' : 'FAILED',
          observation.success ? `Observed ${observation.extractedFacts.length} facts` : observation.errors
        );
      }

      // F. Dynamic Re-Planning if Needed
      if (evaluation.shouldReplan) {
        console.log(`[UNIVERSAL PLANNER] Re-planning triggered: ${evaluation.replanReason}`);
        sendEvent({
          type: 'task.progress',
          stepId: `step_replan_${iteration}`,
          title: 'Re-planning...',
          status: 'in_progress',
          message: evaluation.replanReason || 'Broadening candidate search and exploring alternative sources',
        });
        replanTask(task, memory, evaluation, observation);
      }

      // G. Check for Task Completion
      if (evaluation.status === 'TASK_COMPLETE') {
        isTaskComplete = true;
      }
    }

    // 4. SYNTHESIZE FINAL REPORT
    sendEvent({
      type: 'task.progress',
      stepId: 'step_verify_synthesize',
      title: 'Verifying result & preparing answer',
      status: 'in_progress',
      message: 'Compiling verified findings report...',
    });

    const finalReport = synthesizeFinalReport(task, memory, evidence);

    // Safely close any active browser sessions
    try {
      const activeSession = await browserSessionManager.getSession(userId);
      if (activeSession) {
        await browserSessionManager.closeSession(activeSession.id, userId);
        sendEvent({
          type: 'browser.session.closed',
          sessionId: activeSession.id,
        });
      }
    } catch (closeErr) {
      console.warn('[Universal Planner] Browser close notice:', closeErr);
    }

    sendEvent({
      type: 'task.progress',
      stepId: 'step_verify_synthesize',
      title: 'Task completed',
      status: 'completed',
      message: 'Autonomous task completed',
    });

    sendEvent({ type: 'message.delta', content: finalReport });
    sendEvent({ type: 'message.completed', content: finalReport });

    sendEvent({
      type: 'task.completed',
      status: 'completed',
      message: 'Task completed',
      result: {
        totalEntities: memory.verifiedEntities.length,
        totalFacts: memory.extractedFacts.length,
        visitedUrlsCount: memory.visitedUrls.size,
      },
    });

    task.status = 'COMPLETED';
    return {
      success: true,
      finalAnswer: finalReport,
      task,
    };
  }
}

export const universalTaskPlanner = new UniversalTaskPlanner();
