/**
 * Universal Agent Brain Decision Engine
 *
 * Implements the full LLM-driven ReAct loop:
 * Plan Formulation → Real Tool Dispatch → Observation Capture →
 * LLM Step Evaluation → Dynamic Re-planning → Grounded Synthesis.
 */

import {
  BrainTaskPlan,
  BrainActionDecision,
  BrainObservation,
  BrainTaskState,
  CandidateTarget,
  GroundedFact,
  EntityActionRecord,
  UniversalBrainRunOptions,
  UniversalBrainRunResult,
} from './types.js';
import { brainLlmClient } from './llmClient.js';
import {
  getPlanSystemPrompt,
  getEvaluateStepSystemPrompt,
  getReplanSystemPrompt,
  getFinalSynthesisSystemPrompt,
} from './promptTemplates.js';
import { PlanValidator } from './planValidator.js';
import { evidenceProvenanceEngine } from './evidenceProvenance.js';
import { executeTool } from '../../tools.js';
import { browserSessionManager } from '../../browser/sessionManager.js';
import { extractFoundersFromText, extractPricingFromText } from '../../research/deepWebResearcher.js';
import { taskCheckpointManager } from '../../task/checkpointManager.js';
import { getGmailTokens } from '../../db/neon.js';
import { getUserSmtpCredentials } from '../../db/smtp.js';
import { describeWorkPlanForUser, isAffirmativeSendConfirmation, isNegativeConfirmation } from '../workIntent.js';

function isSaasOrSoftwareQuery(text: string): boolean {
  return /\b(saas|software|crm|startup|startups)\b/i.test(text || '');
}

function isNonBusinessSourceUrl(url: string): boolean {
  if (!url) return true;
  try {
    const host = new URL(url.startsWith('http') ? url : `https://${url}`).hostname.toLowerCase();
    return /(?:^|\.)google\./.test(host)
      || host.includes('bing.com')
      || host.includes('duckduckgo.com')
      || host.includes('justdial.com')
      || host.includes('yelp.com')
      || host.includes('maps.google');
  } catch {
    return true;
  }
}

function entityDomain(url?: string | null): string {
  if (!url) return '';
  try {
    return new URL(url.startsWith('http') ? url : `https://${url}`).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

function ensureStateCollections(state: BrainTaskState) {
  if (!state.discoveredCandidates) state.discoveredCandidates = [];
  if (!state.visitedUrls) state.visitedUrls = new Set<string>();
  if (!state.visitedDomains) state.visitedDomains = new Set<string>();
  if (!state.verifiedEntities) state.verifiedEntities = [];
}

export class BrainDecisionEngine {
  /**
   * Executes the autonomous ReAct decision loop for arbitrary natural-language requests.
   */
  async run(options: UniversalBrainRunOptions): Promise<UniversalBrainRunResult> {
    const {
      taskId = `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      userId = 'anonymous',
      chatId,
      userApiKey,
      providerId,
      model,
      prompt,
      conversationHistory = [],
      defaultLocation,
      autoSendProposals = false,
      maxIterations = 15,
      sendEvent,
      abortSignal,
    } = options;

    // Check for existing durable checkpoint to resume exact task state
    let state: BrainTaskState;
    let plan: BrainTaskPlan;
    let currentAction: BrainActionDecision;

    let existingCheckpoint = null;
    try {
      existingCheckpoint = await taskCheckpointManager.getCheckpoint(taskId, userId, chatId);
    } catch (ckptErr: any) {
      console.warn(`[Checkpoint Recovery Warning] Failed to load checkpoint for ${taskId}:`, ckptErr.message);
    }

    if (existingCheckpoint && (existingCheckpoint.status === 'EXECUTING' || existingCheckpoint.status === 'WAITING_FOR_INPUT')) {
      state = taskCheckpointManager.deserializeBrainState(existingCheckpoint);
      state.status = 'EXECUTING';
      state.autoSendProposals = Boolean(autoSendProposals || state.autoSendProposals);
      if (chatId && !state.chatId) {
        state.chatId = chatId;
      }
      if (userId && userId !== 'anonymous' && state.gmailConnected === undefined) {
        try {
          const tokens = await getGmailTokens(userId);
          const smtp = await getUserSmtpCredentials(userId);
          state.gmailConnected = Boolean(
            tokens?.refreshToken || tokens?.accessToken || smtp?.appPassword
          );
        } catch {
          state.gmailConnected = false;
        }
      }

      // Handle in-flight pending action from crash / restart
      if (state.pendingAction) {
        const isSucceeded = state.pendingAction.status === 'completed' || state.pendingAction.lifecycleState === 'SUCCEEDED';
        const isPendingOrExecuting = state.pendingAction.status === 'pending' || state.pendingAction.status === 'executing' || state.pendingAction.lifecycleState === 'PENDING' || state.pendingAction.lifecycleState === 'EXECUTING';

        if (isSucceeded && state.pendingAction.observation) {
          const obs = state.pendingAction.observation;
          if (!state.observations.some((o) => o.timestamp === obs.timestamp && o.toolName === obs.toolName)) {
            state.observations.push(obs);
            this.updateStateWithObservation(state, obs);
          }
          if (state.pendingAction.actionId) {
            state.executedActionIds.add(state.pendingAction.actionId);
          }
          state.pendingAction = undefined;
          await taskCheckpointManager.saveCheckpoint(state, { lastProvider: providerId, lastModel: model, chatId: state.chatId });
        } else if (isPendingOrExecuting) {
          // Process crashed or was interrupted mid-flight before observation was recorded
          console.warn(`[Checkpoint Recovery] Resumed with unverified in-flight action: ${state.pendingAction.actionId} (${state.pendingAction.toolName}). Recording unresolved interruption.`);
          state.failedActions.push({
            toolName: state.pendingAction.toolName,
            args: state.pendingAction.toolArgs,
            error: 'Action interrupted in-flight by process restart or crash. Execution outcome unresolved.',
            timestamp: new Date().toISOString(),
          });
          const interruptedObs: BrainObservation = {
            toolName: state.pendingAction.toolName,
            toolArgs: state.pendingAction.toolArgs,
            success: false,
            executionTimeMs: 0,
            extractedFacts: [],
            error: `Action ${state.pendingAction.toolName} was interrupted before completion.`,
            timestamp: new Date().toISOString(),
          };
          state.observations.push(interruptedObs);

          if (!state.actionRecords) state.actionRecords = [];
          state.actionRecords.push({
            actionId: state.pendingAction.actionId,
            actionType: state.pendingAction.toolName,
            actionStatus: 'INTERRUPTED',
            lifecycleState: 'INTERRUPTED',
            executedAt: new Date().toISOString(),
            targetEntity: state.pendingAction.toolArgs?.businessName || state.pendingAction.toolArgs?.to || 'Unresolved Target',
            errorReason: 'Execution interrupted in-flight before completion',
            resultSummary: `Action ${state.pendingAction.toolName} was interrupted before observation could be recorded`,
          });

          state.pendingAction = undefined;
          await taskCheckpointManager.saveCheckpoint(state, { lastProvider: providerId, lastModel: model, chatId: state.chatId });
        } else {
          state.pendingAction = undefined;
          await taskCheckpointManager.saveCheckpoint(state, { lastProvider: providerId, lastModel: model, chatId: state.chatId });
        }
      }

      // If resuming from an email-send confirmation prompt, honor the user's reply.
      let resumingFromEmailConfirmation = false;
      if (state.awaitingEmailConfirmation && (isAffirmativeSendConfirmation(prompt) || isNegativeConfirmation(prompt))) {
        state.awaitingEmailConfirmation = false;
        const affirmative = isAffirmativeSendConfirmation(prompt);
        state.emailConfirmationGranted = affirmative;
        state.emailConfirmationDeclined = !affirmative;
        resumingFromEmailConfirmation = true;
      }

      // If resuming from a clarification prompt, incorporate user's clarification
      if (existingCheckpoint.status === 'WAITING_FOR_INPUT') {
        const clarifiedText = prompt.trim();
        if (!state.plan.location || state.plan.location === 'unknown' || state.plan.location === '') {
          state.plan.location = clarifiedText;
        }
        // Update user intent & goal with clarified context
        state.userPrompt = `${state.userPrompt} (Clarification: ${clarifiedText})`;

        if (resumingFromEmailConfirmation && state.gmailConnected && state.emailConfirmationGranted) {
          // User confirmed the send -> go straight to dispatching the first ready email.
          const readyToSend = (state.verifiedEntities || []).find(
            (e) => e.proposalMarkdown && e.email && !e.emailSent && !e.emailSendError
          );
          state.plan.nextAction = readyToSend
            ? {
                type: 'execute_tool',
                toolName: 'send_email',
                toolArgs: {
                  to: readyToSend.email,
                  businessName: readyToSend.name,
                  subject: readyToSend.proposalSubject || `Digital Growth Strategy for ${readyToSend.name}`,
                  body: readyToSend.proposalMarkdown,
                },
                rationale: `User confirmed dispatch. Sending outreach proposal to ${readyToSend.name} (${readyToSend.email})`,
                expectedObservation: 'Email dispatch confirmation with message ID',
              }
            : {
                type: 'complete',
                toolName: '',
                toolArgs: {},
                rationale: 'No emails left to send after confirmation.',
                expectedObservation: 'Final response synthesis',
              };
        } else if (!resumingFromEmailConfirmation) {
          // Pivot next action from ask_clarification to active search/execution
          const queryTarget = `${state.plan.entities.join(' ') || state.plan.goal} ${state.plan.location || clarifiedText}`.trim();
          state.plan.nextAction = {
            type: 'execute_tool',
            toolName: 'google_search',
            toolArgs: {
              query: queryTarget,
              location: state.plan.location || clarifiedText,
              limit: Math.max(state.plan.quantity, 5),
            },
            rationale: `Proceeding with search in clarified location: ${state.plan.location || clarifiedText}`,
            expectedObservation: 'Search result candidate targets with URLs and titles',
          };
        }
      }

      plan = state.plan;
      currentAction = state.plan.nextAction;

      sendEvent({
        type: 'task.resumed',
        taskId,
        iteration: state.currentIteration,
        message: `Resuming task from checkpoint at step ${state.currentIteration} (${state.verifiedEntities.length}/${state.plan.quantity} verified)...`,
      });
    } else {
      sendEvent({
        type: 'task.started',
        taskId,
        prompt,
        message: 'Universal Agent Brain analyzing request...',
        timestamp: new Date().toISOString(),
      });

      sendEvent({
        type: 'task.progress',
        taskId,
        message: 'Understanding request',
      });

      // 1. FORMULATE INITIAL PLAN VIA LLM
      plan = await this.formulatePlan({
        taskId,
        prompt,
        conversationHistory,
        providerId,
        model,
        userApiKey,
        userId,
        defaultLocation,
        sendEvent,
        abortSignal,
      });

      // Initialize State
      state = {
        taskId,
        userId,
        chatId,
        userPrompt: prompt,
        conversationHistory: conversationHistory?.map((msg) => ({
          role: msg.role === 'assistant' ? ('assistant' as const) : ('user' as const),
          content: msg.content,
        })) || [],
        plan,
        currentIteration: 0,
        // Iteration budget scales with the requested quantity:
        // maxIterations = min(max(qty*4+8, 15), 40)
        maxIterations: Math.min(Math.max((plan.quantity || 1) * 4 + 8, 15), 40),
        verifiedEntities: [],
        visitedUrls: new Set<string>(),
        visitedDomains: new Set<string>(),
        discoveredCandidates: [],
        observations: [],
        extractedFacts: [],
        evidence: [],
        failedActions: [],
        executedActionIds: new Set<string>(),
        status: 'EXECUTING',
        replanCount: 0,
        remainingWork: plan.completionCriteria,
        consecutiveEmptySearches: 0,
        searchExhausted: false,
      };

      currentAction = plan.nextAction;

      const workPlanText = describeWorkPlanForUser(prompt, {
        quantity: plan.quantity,
        location: plan.location,
        requestedFields: plan.requestedFields,
        emailActionsRequired: plan.emailActionsRequired,
        proposalRequired: plan.proposalRequired,
      });
      sendEvent({
        type: 'task.plan_created',
        plan: {
          goal: plan.goal,
          userIntent: plan.userIntent,
          quantity: plan.quantity,
          entities: plan.entities,
          requestedFields: plan.requestedFields,
          toolsRequired: plan.toolsRequired,
        },
        message: workPlanText,
        title: 'Intent',
      });
    }

    // If direct chat and no tools required, synthesize response immediately
    if (plan.userIntent === 'DIRECT_CHAT' || plan.nextAction.type === 'complete') {
      const directAnswer = await this.synthesizeFinalAnswer({
        prompt,
        state,
        providerId,
        model,
        userApiKey,
        userId,
        abortSignal,
      });
      state.status = 'COMPLETED';
      state.finalResponse = directAnswer;

      await taskCheckpointManager.saveCheckpoint(state, { lastProvider: providerId, lastModel: model });

      sendEvent({
        type: 'task.completed',
        taskId,
        result: {
          success: true,
          answer: directAnswer,
          verifiedEntities: [],
        },
      });

      return {
        success: true,
        finalAnswer: directAnswer,
        plan,
        state,
        verifiedCount: 0,
        totalFacts: 0,
        sourcesVerifiedCount: 0,
      };
    }

    if (plan.nextAction.type === 'ask_clarification') {
      const question = plan.nextAction.clarificationQuestion || 'Which location should I target?';
      state.status = 'WAITING_FOR_INPUT';
      state.finalResponse = question;

      await taskCheckpointManager.saveCheckpoint(state, { lastProvider: providerId, lastModel: model });

      sendEvent({
        type: 'message.delta',
        content: question,
      });
      sendEvent({
        type: 'message.completed',
        content: question,
      });
      sendEvent({
        type: 'task.completed',
        status: 'waiting_for_input',
        taskId,
        message: question,
      });

      return {
        success: true,
        finalAnswer: question,
        plan,
        state,
        verifiedCount: 0,
        totalFacts: 0,
        sourcesVerifiedCount: 0,
      };
    }

    // 2. REACT LOOP: EXECUTE → OBSERVE → EVALUATE → DECIDE NEXT ACTION
    let activeProvider = providerId;
    let activeModel = model;

    while (state.currentIteration < state.maxIterations && state.status === 'EXECUTING') {
      if (abortSignal?.aborted) {
        state.status = 'STOPPED';
        await taskCheckpointManager.saveCheckpoint(state, { lastProvider: activeProvider, lastModel: activeModel });
        break;
      }

      state.currentIteration += 1;

      sendEvent({
        type: 'task.progress',
        taskId,
        iteration: state.currentIteration,
        maxIterations: state.maxIterations,
        action: currentAction.toolName,
        rationale: currentAction.rationale,
        message: `Step ${state.currentIteration}: ${currentAction.rationale}`,
      });

      // Anti-Loop Check: Ensure we aren't calling identical tool + args consecutively
      const isDuplicate = this.checkDuplicateAction(currentAction, state.observations);
      if (isDuplicate) {
        console.warn(`[Brain Anti-Loop] Detected repeated action ${currentAction.toolName}. Triggering smart pivot.`);
        currentAction = this.pivotActionOnLoop(state, currentAction);
      }

      // Exactly-once execution tracking: Generate deterministic action ID
      const actionArgsStr = JSON.stringify(currentAction.toolArgs || {});
      const actionId = `action_${taskId}_${currentAction.toolName}_${actionArgsStr}`;

      let observation: BrainObservation;

      // Check if already executed in prior completed or interrupted attempt
      if (state.executedActionIds.has(actionId)) {
        const existingObs = state.observations.find(
          (o) => o.toolName === currentAction.toolName && JSON.stringify(o.toolArgs) === actionArgsStr
        );
        if (existingObs) {
          console.log(`[Exactly-Once Checkpoint Guard] Reusing completed observation for actionId: ${actionId}`);
          observation = existingObs;
        } else {
          console.log(`[Exactly-Once Checkpoint Guard] Action ${actionId} already in executedActionIds. Bypassing tool re-execution.`);
          observation = {
            toolName: currentAction.toolName,
            toolArgs: currentAction.toolArgs,
            success: true,
            executionTimeMs: 0,
            extractedFacts: [],
            extractedData: { message: 'Reused previously recorded execution checkpoint' },
            timestamp: new Date().toISOString(),
          };
        }
      } else {
        // Step 1: PENDING CHECKPOINT BEFORE EXTERNAL ACTION EXECUTION
        state.pendingAction = {
          actionId,
          status: 'pending',
          lifecycleState: 'PENDING',
          toolName: currentAction.toolName,
          toolArgs: currentAction.toolArgs,
          startedAt: new Date().toISOString(),
        };
        await taskCheckpointManager.saveCheckpoint(state, { lastProvider: activeProvider, lastModel: activeModel, chatId: state.chatId });

        // Step 2: EXECUTE EXTERNAL ACTION (Transition to EXECUTING)
        state.pendingAction.status = 'executing';
        state.pendingAction.lifecycleState = 'EXECUTING';

        observation = await this.executeAction(currentAction, state, {
          userId: userId || 'anonymous',
          userApiKey,
          sendEvent,
        });

        // Step 3: OBSERVATION RECEIVED -> RECORD SUCCEEDED / FAILED
        state.pendingAction = {
          actionId,
          status: observation.success ? 'completed' : 'failed',
          lifecycleState: observation.success ? 'SUCCEEDED' : 'FAILED',
          toolName: currentAction.toolName,
          toolArgs: currentAction.toolArgs,
          startedAt: state.pendingAction.startedAt,
          completedAt: new Date().toISOString(),
          observation,
        };
        if (observation.success) {
          state.executedActionIds.add(actionId);
        } else {
          state.failedActions.push({
            toolName: currentAction.toolName,
            args: currentAction.toolArgs,
            error: observation.error || 'Action execution failed',
            timestamp: observation.timestamp || new Date().toISOString(),
          });
        }
        await taskCheckpointManager.saveCheckpoint(state, { lastProvider: activeProvider, lastModel: activeModel, chatId: state.chatId });
      }

      state.observations.push(observation);
      this.updateStateWithObservation(state, observation, currentAction);
      state.pendingAction = undefined;

      // Checkpoint state immediately after action and observation update
      await taskCheckpointManager.saveCheckpoint(state, { lastProvider: activeProvider, lastModel: activeModel, chatId: state.chatId });

      // Check if target quantity fully satisfied across all required pipeline actions
      const targetQuantity = state.plan.quantity;
      const fullyCompletedCount = this.countFullyCompletedEntities(state);
      state.verifiedCount = fullyCompletedCount;
      state.requiredQuantity = targetQuantity;
      state.remainingQuantity = Math.max(0, targetQuantity - fullyCompletedCount);

      if (fullyCompletedCount >= targetQuantity && targetQuantity > 1) {
        sendEvent({
          type: 'task.progress',
          message: `Verified ${fullyCompletedCount}/${targetQuantity} after page inspection`,
        });
        state.status = 'COMPLETED';
        break;
      }

      // EVALUATE STEP & DECIDE NEXT ACTION WITH LLM OR HEURISTIC PIPELINE
      const nextDecision = await this.evaluateStepAndDecideNext({
        state,
        lastObservation: observation,
        providerId: activeProvider,
        model: activeModel,
        userApiKey,
        userId,
        sendEvent,
        abortSignal,
        onFailover: (ev: any) => {
          activeProvider = ev.newProvider;
          activeModel = ev.newModel;
        },
      });

      if (nextDecision.type === 'ask_clarification') {
        const question =
          nextDecision.clarificationQuestion || 'Please clarify what you need.';
        state.status = 'WAITING_FOR_INPUT';
        state.finalResponse = question;

        await taskCheckpointManager.saveCheckpoint(state, { lastProvider: activeProvider, lastModel: activeModel, chatId: state.chatId });

        sendEvent({
          type: 'message.delta',
          content: question,
        });
        sendEvent({
          type: 'message.completed',
          content: question,
        });
        sendEvent({
          type: 'task.completed',
          status: 'waiting_for_input',
          taskId,
          message: question,
        });

        return {
          success: true,
          finalAnswer: question,
          plan: state.plan,
          state,
          verifiedCount: state.verifiedEntities.length,
          totalFacts: state.extractedFacts.length,
          sourcesVerifiedCount: state.visitedUrls.size,
        };
      }

      if (nextDecision.type === 'complete' || nextDecision.type === 'report_unavailable') {
        state.status = 'COMPLETED';
        break;
      }

      if (nextDecision.type === 'replan') {
        state.replanCount += 1;
        sendEvent({
          type: 'task.replanning',
          message: 'Adjusting search and exploration strategy...',
        });
        const replanned = await this.replanTask({
          state,
          providerId: activeProvider,
          model: activeModel,
          userApiKey,
          userId,
          abortSignal,
          onFailover: (ev: any) => {
            activeProvider = ev.newProvider;
            activeModel = ev.newModel;
          },
        });
        state.plan = replanned;
        currentAction = replanned.nextAction;
      } else {
        currentAction = nextDecision;
      }
    }

    // 3. GROUNDED FINAL SYNTHESIS
    sendEvent({
      type: 'task.synthesizing',
      message: 'Compiling verified findings with source citations...',
    });

    const finalAnswer = await this.synthesizeFinalAnswer({
      prompt,
      state,
      providerId: activeProvider,
      model: activeModel,
      userApiKey,
      userId,
      abortSignal,
      onFailover: (ev: any) => {
        activeProvider = ev.newProvider;
        activeModel = ev.newModel;
      },
    });

    state.status = 'COMPLETED';
    state.finalResponse = finalAnswer;

    await taskCheckpointManager.saveCheckpoint(state, { lastProvider: activeProvider, lastModel: activeModel });

    sendEvent({
      type: 'task.completed',
      taskId,
      result: {
        success: true,
        answer: finalAnswer,
        verifiedEntities: state.verifiedEntities,
        factsCount: state.extractedFacts.length,
        sourcesCount: state.visitedUrls.size,
      },
    });

    return {
      success: true,
      finalAnswer,
      plan: state.plan,
      state,
      verifiedCount: state.verifiedEntities.length,
      totalFacts: state.extractedFacts.length,
      sourcesVerifiedCount: state.visitedUrls.size,
    };
  }

  /**
   * Formulates the structured task plan via LLM.
   */
  private async formulatePlan(opts: {
    taskId: string;
    prompt: string;
    conversationHistory: Array<{ role: string; content: string }>;
    providerId: any;
    model: string;
    userApiKey?: string;
    userId?: string;
    defaultLocation?: string;
    sendEvent: (event: any) => void;
    abortSignal?: AbortSignal;
  }): Promise<BrainTaskPlan> {
    const historyText = opts.conversationHistory
      .slice(-4)
      .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
      .join('\n');

    const userPrompt = `User Prompt: "${opts.prompt}"
${historyText ? `\nRecent Conversation Context:\n${historyText}` : ''}
${opts.defaultLocation ? `\nUser Default Location: ${opts.defaultLocation}` : ''}

Generate the strict JSON BrainTaskPlan for this request.`;

    try {
      const response = await brainLlmClient.complete({
        providerId: opts.providerId,
        model: opts.model,
        userApiKey: opts.userApiKey,
        userId: opts.userId,
        systemPrompt: getPlanSystemPrompt(),
        userPrompt,
        temperature: 0.1,
        jsonMode: true,
        abortSignal: opts.abortSignal,
      });

      return PlanValidator.validateAndRepairPlan(response.json, opts.prompt, opts.defaultLocation, opts.conversationHistory);
    } catch (err: any) {
      console.warn('[Brain Planning Notice] LLM planning failed, using schema validator fallback:', err.message);
      return PlanValidator.validateAndRepairPlan(null, opts.prompt, opts.defaultLocation, opts.conversationHistory);
    }
  }

  /**
   * Executes a tool action and converts the result into a rich BrainObservation.
   */
  private async executeAction(
    action: BrainActionDecision,
    state: BrainTaskState,
    opts: {
      userId: string;
      userApiKey?: string;
      sendEvent: (event: any) => void;
    }
  ): Promise<BrainObservation> {
    const startTime = Date.now();
    let success = false;
    let toolResult: any = null;
    let error: string | undefined;

    try {
      toolResult = await executeTool(action.toolName, action.toolArgs, opts.sendEvent, {
        userId: opts.userId,
        userApiKey: opts.userApiKey,
      });
      // Check if tool explicitly returned failure payload
      if (toolResult && toolResult.skipped) {
        success = true;
      } else if (toolResult && (toolResult.success === false || toolResult.status === 'error')) {
        success = false;
        error = toolResult.error || toolResult.message || `Tool ${action.toolName} reported execution failure`;
        state.failedActions.push({
          toolName: action.toolName,
          args: action.toolArgs,
          error: error || 'Execution failure',
          timestamp: new Date().toISOString(),
        });
      } else {
        success = true;
      }
    } catch (err: any) {
      success = false;
      error = err.message || 'Tool execution error';
      state.failedActions.push({
        toolName: action.toolName,
        args: action.toolArgs,
        error: error || 'Execution failure',
        timestamp: new Date().toISOString(),
      });
    }

    const executionTimeMs = Date.now() - startTime;

    // Convert tool result into observation structure
    const observation: BrainObservation = {
      toolName: action.toolName,
      toolArgs: action.toolArgs,
      success,
      executionTimeMs,
      error,
      extractedFacts: [],
      timestamp: new Date().toISOString(),
    };

    if (action.toolName === 'google_search') {
      const items = Array.isArray(toolResult?.items) ? toolResult.items : [];
      const candidates: CandidateTarget[] = items
        .filter((it: any) => Boolean(it.link || it.url))
        .map((it: any) => ({
          url: it.link || it.url,
          title: it.title || it.domain || 'Candidate Result',
          snippet: it.snippet,
          domain: it.domain,
          relevanceScore: it.score || 0.9,
        }));

      observation.searchState = {
        query: action.toolArgs?.query || '',
        candidateUrls: candidates,
        totalResults: candidates.length,
      };

      // Add to discovered candidates (Search results are candidates, verified upon page inspection)
      for (const cand of candidates) {
        if (!state.discoveredCandidates.some((c) => c.url === cand.url)) {
          state.discoveredCandidates.push(cand);
        }
      }

      // Anti-loop / anti-hallucination: track empty discovery searches. After
      // two consecutive zero-result searches (and with no candidates already
      // queued and nothing verified), mark discovery as exhausted so the loop
      // terminates honestly instead of re-querying and inventing companies.
      if (candidates.length > 0) {
        state.consecutiveEmptySearches = 0;
        state.searchExhausted = false;
      } else {
        state.consecutiveEmptySearches = (state.consecutiveEmptySearches || 0) + 1;
        if (
          state.consecutiveEmptySearches >= 2 &&
          state.discoveredCandidates.length === 0 &&
          state.verifiedEntities.length === 0
        ) {
          state.searchExhausted = true;
          opts.sendEvent({
            type: 'task.progress',
            message:
              'Live search returned 0 results across multiple queries. No companies were invented. Reporting an honest empty result.',
          });
        }
      }

      opts.sendEvent({
        type: 'task.candidates_discovered',
        query: action.toolArgs?.query || '',
        count: candidates.length,
        totalDiscovered: state.discoveredCandidates.length,
        message:
          candidates.length > 0
            ? `Discovered ${candidates.length} candidate URLs from search. Inspecting destination websites...`
            : 'Live search returned 0 results. No companies were invented.',
      });
    } else if (action.toolName === 'search_businesses') {
      const businesses = Array.isArray(toolResult?.businesses) ? toolResult.businesses : [];
      observation.extractedData = toolResult;
      for (const b of businesses) {
        if (b.website && !state.discoveredCandidates.some((c) => c.url === b.website)) {
          state.discoveredCandidates.push({
            url: b.website,
            title: b.name,
            snippet: `${b.address || ''} ${b.phone || ''}`.trim(),
            relevanceScore: 0.9,
          });
        }
      }
    } else if (action.toolName === 'generate_proposal') {
      observation.extractedData = toolResult;
    } else if (action.toolName === 'send_email') {
      observation.extractedData = toolResult;
    } else if (action.toolName === 'browser_navigate' || action.toolName === 'browser_extract_content') {
      const pageUrl = toolResult?.url || action.toolArgs?.url;
      const pageTitle = toolResult?.title || '';
      const textContent = toolResult?.text || toolResult?.content || '';

      observation.browserState = {
        url: pageUrl,
        title: pageTitle,
        snippet: textContent.slice(0, 1500),
        headings: toolResult?.headings,
        links: toolResult?.links,
        screenshotAvailable: Boolean(toolResult?.screenshotBase64),
        screenshotBase64: toolResult?.screenshotBase64,
        isLiveMode: toolResult?.mode === 'live_browser',
        mode: toolResult?.mode || 'http_fallback',
        status: toolResult?.success ? 'loaded' : 'failed',
        error: toolResult?.error,
      };

      if (pageUrl) {
        state.visitedUrls.add(pageUrl);
        try {
          state.visitedDomains.add(new URL(pageUrl).hostname);
        } catch {}
      }

      // Record or update verified entity from live page inspection
      if (toolResult?.success && pageUrl && !isNonBusinessSourceUrl(pageUrl) && !pageUrl.includes('google.com/search')) {
        const pageDomain = entityDomain(pageUrl);
        const existing = state.verifiedEntities.find((e) =>
          e.url === pageUrl
          || (e.website && e.website === pageUrl)
          || (pageDomain && (entityDomain(e.url) === pageDomain || entityDomain(e.website) === pageDomain))
        );
        if (existing) {
          existing.pageInspected = true;
          if (pageTitle && (!existing.name || existing.name === 'Discovered Organization')) {
            existing.name = pageTitle;
          }
          if (textContent && !existing.description) {
            existing.description = textContent.slice(0, 200).replace(/\s+/g, ' ');
          }
          if (existing.status === 'DISCOVERED' || existing.status === 'QUALIFIED' || existing.status === 'UNVERIFIED') {
            existing.status = 'VERIFIED';
          }
        } else {
          try {
            const domainName = new URL(pageUrl).hostname.replace(/^www\./, '');
            state.verifiedEntities.push({
              name: pageTitle || domainName,
              url: pageUrl,
              description: textContent ? textContent.slice(0, 200).replace(/\s+/g, ' ') : undefined,
              hasWebsite: true,
              pageInspected: true,
              status: 'VERIFIED',
              facts: [],
            });
          } catch {}
        }
      }

      // Extract facts from text and update verified entity fields
      this.extractFactsFromPageContent(pageUrl, pageTitle, textContent, observation.extractedFacts);

      // Attach extracted phone/email/services to verified entity
      const matchedEntity = state.verifiedEntities.find((e) => e.url === pageUrl);
      if (matchedEntity) {
        const phoneFact = observation.extractedFacts.find((f) => f.field === 'phone');
        if (phoneFact && !matchedEntity.phone) matchedEntity.phone = phoneFact.extractedValue;

        const emailFact = observation.extractedFacts.find((f) => f.field === 'email');
        if (emailFact && !matchedEntity.email) matchedEntity.email = emailFact.extractedValue;

        const serviceFact = observation.extractedFacts.find((f) => f.field === 'services');
        if (serviceFact && !matchedEntity.services) matchedEntity.services = serviceFact.extractedValue;

        const pricingFact = observation.extractedFacts.find((f) => f.field === 'pricing');
        if (pricingFact && !matchedEntity.pricing) matchedEntity.pricing = pricingFact.extractedValue;

        const outdatedFact = observation.extractedFacts.find((f) => f.field === 'website_status');
        if (outdatedFact && !matchedEntity.websiteStatus) matchedEntity.websiteStatus = outdatedFact.extractedValue;

        matchedEntity.pageInspected = true;
        if (!matchedEntity.email && matchedEntity.emailStatus !== 'VERIFIED') {
          matchedEntity.emailStatus = 'NOT_FOUND';
        }
      }
    } else if (action.toolName === 'analyze_website') {
      const pageUrl = action.toolArgs?.url;
      if (pageUrl) {
        state.visitedUrls.add(pageUrl);
      }
      observation.extractedData = toolResult;
      if (toolResult?.contacts) {
        if (toolResult.contacts.emails?.length) {
          for (const em of toolResult.contacts.emails) {
            observation.extractedFacts.push({
              sourceUrl: pageUrl,
              pageTitle: toolResult.title || 'Website Analysis',
              evidenceText: `Found email: ${em}`,
              field: 'email',
              extractedValue: em,
              confidence: 0.95,
              timestamp: new Date().toISOString(),
            });
          }
        }
        if (toolResult.contacts.phones?.length) {
          for (const ph of toolResult.contacts.phones) {
            observation.extractedFacts.push({
              sourceUrl: pageUrl,
              pageTitle: toolResult.title || 'Website Analysis',
              evidenceText: `Found phone: ${ph}`,
              field: 'phone',
              extractedValue: ph,
              confidence: 0.95,
              timestamp: new Date().toISOString(),
            });
          }
        }
      }
    } else if (action.toolName === 'deep_web_research') {
      const entities = Array.isArray(toolResult?.entities) ? toolResult.entities : [];
      for (const ent of entities) {
        state.verifiedEntities.push({
          ...ent,
          status: 'VERIFIED',
          facts: [],
        });
      }
      observation.extractedData = toolResult;
    }

    return observation;
  }

  /**
   * Heuristic fact extractor from raw page text with evidence provenance validation.
   */
  private extractFactsFromPageContent(url: string, title: string, text: string, factList: GroundedFact[]) {
    if (!text || text.length < 20) return;
    const normUrl = evidenceProvenanceEngine.normalizeSourceUrl(url);
    const domain = evidenceProvenanceEngine.extractDomain(normUrl);
    const sourceType = evidenceProvenanceEngine.classifySourceQuality(normUrl);

    // Emails
    const emailMatches = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
    if (emailMatches) {
      const uniqueEmails = Array.from(new Set(emailMatches.map((e) => e.toLowerCase())));
      for (const rawEmail of uniqueEmails.slice(0, 3)) {
        const verifiedEmailRes = evidenceProvenanceEngine.verifyEmailEvidence(rawEmail, text, normUrl);
        if (verifiedEmailRes.emailStatus === 'VERIFIED' && verifiedEmailRes.email) {
          const validated = evidenceProvenanceEngine.validateFactEvidence(
            {
              field: 'email',
              extractedValue: verifiedEmailRes.email,
              sourceUrl: normUrl,
              sourceDomain: domain,
              sourceTitle: title,
              sourceType,
              extractedAt: new Date().toISOString(),
              confidence: 0.95,
              evidenceQuote: `Verified contact email: ${verifiedEmailRes.email}`,
            },
            text,
            normUrl
          );
          if (validated.verified) {
            factList.push(validated.groundedFact);
          }
        }
      }
    }

    // Phone numbers
    const phoneMatches = text.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,5}\)?[-.\s]?\d{3,5}[-.\s]?\d{3,5}/g);
    if (phoneMatches) {
      const cleanPhones = Array.from(new Set(phoneMatches.filter((p) => p.replace(/\D/g, '').length >= 10)));
      for (const phone of cleanPhones.slice(0, 2)) {
        const val = phone.trim();
        const validated = evidenceProvenanceEngine.validateFactEvidence(
          {
            field: 'phone',
            extractedValue: val,
            sourceUrl: normUrl,
            sourceDomain: domain,
            sourceTitle: title,
            sourceType,
            extractedAt: new Date().toISOString(),
            confidence: 0.9,
            evidenceQuote: `Phone number found: ${val}`,
          },
          text,
          normUrl
        );
        if (validated.verified) {
          factList.push(validated.groundedFact);
        }
      }
    }

    // Founders
    const founders = extractFoundersFromText(text, url);
    for (const f of founders.slice(0, 2)) {
      const val = `${f.name} - ${f.title}`;
      const validated = evidenceProvenanceEngine.validateFactEvidence(
        {
          field: 'founder',
          extractedValue: val,
          sourceUrl: normUrl,
          sourceDomain: domain,
          sourceTitle: title,
          sourceType,
          extractedAt: new Date().toISOString(),
          confidence: 0.85,
          evidenceQuote: `Leadership/Founder mentioned: ${f.name} (${f.title})`,
        },
        text,
        normUrl
      );
      if (validated.verified) {
        factList.push(validated.groundedFact);
      }
    }

    // Pricing
    const pricingList = extractPricingFromText(text, url);
    if (pricingList.length > 0) {
      const p = pricingList[0];
      const val = `${p.planName}: ${p.price}`;
      const validated = evidenceProvenanceEngine.validateFactEvidence(
        {
          field: 'pricing',
          extractedValue: val,
          sourceUrl: normUrl,
          sourceDomain: domain,
          sourceTitle: title,
          sourceType,
          extractedAt: new Date().toISOString(),
          confidence: 0.85,
          evidenceQuote: `Pricing structure found: ${p.planName} ${p.price}`,
        },
        text,
        normUrl
      );
      if (validated.verified) {
        factList.push(validated.groundedFact);
      }
    }

    // Services / Capabilities
    const serviceMatches = text.match(/(?:our services|we offer|capabilities|solutions|products|offerings)[:\s]+([^.\n]{10,200})/i);
    if (serviceMatches && serviceMatches[1]) {
      const cleanServices = serviceMatches[1].trim().slice(0, 150);
      const validated = evidenceProvenanceEngine.validateFactEvidence(
        {
          field: 'services',
          extractedValue: cleanServices,
          sourceUrl: normUrl,
          sourceDomain: domain,
          sourceTitle: title,
          sourceType,
          extractedAt: new Date().toISOString(),
          confidence: 0.8,
          evidenceQuote: `Services listed: ${cleanServices}`,
        },
        text,
        normUrl
      );
      if (validated.verified) {
        factList.push(validated.groundedFact);
      }
    }

    // Social Profiles & Public Handles
    const socialMatches = text.match(/https?:\/\/(?:www\.)?(?:instagram\.com|linkedin\.com|twitter\.com|x\.com|facebook\.com)\/[a-zA-Z0-9._-]+/g);
    if (socialMatches) {
      const uniqueSocials = Array.from(new Set(socialMatches));
      for (const soc of uniqueSocials.slice(0, 3)) {
        const validated = evidenceProvenanceEngine.validateFactEvidence(
          {
            field: 'social_profile',
            extractedValue: soc,
            sourceUrl: normUrl,
            sourceDomain: domain,
            sourceTitle: title,
            sourceType: 'SECONDARY',
            extractedAt: new Date().toISOString(),
            confidence: 0.9,
            evidenceQuote: `Social profile link found: ${soc}`,
          },
          text,
          normUrl
        );
        if (validated.verified) {
          factList.push(validated.groundedFact);
        }
      }
    }

    // Instagram / Social Public Profile Metrics
    if (url.includes('instagram.com') || text.includes('Instagram') || text.includes('Followers') || text.includes('Following')) {
      const followersMatch = text.match(/(\d+(?:\.\d+)?[KMkm]?)\s+Followers/i) || text.match(/Followers:\s*(\d+[KMkm]?)/i);
      if (followersMatch && followersMatch[1]) {
        factList.push({
          sourceUrl: normUrl,
          sourceDomain: domain,
          sourceTitle: title,
          sourceType: 'SECONDARY',
          pageTitle: title,
          evidenceText: `Public follower count: ${followersMatch[1]} Followers`,
          evidenceQuote: `Public follower count: ${followersMatch[1]} Followers`,
          field: 'followers',
          extractedValue: followersMatch[1],
          confidence: 0.9,
          timestamp: new Date().toISOString(),
          extractedAt: new Date().toISOString(),
          verified: true,
        });
      }

      const bioMatch = text.match(/(?:Bio|About|Description)[:\s]+([^.\n]{10,250})/i);
      if (bioMatch && bioMatch[1]) {
        factList.push({
          sourceUrl: normUrl,
          sourceDomain: domain,
          sourceTitle: title,
          sourceType: 'SECONDARY',
          pageTitle: title,
          evidenceText: `Public bio found: ${bioMatch[1].trim()}`,
          evidenceQuote: `Public bio found: ${bioMatch[1].trim()}`,
          field: 'bio',
          extractedValue: bioMatch[1].trim(),
          confidence: 0.85,
          timestamp: new Date().toISOString(),
          extractedAt: new Date().toISOString(),
          verified: true,
        });
      }
    }

    // Website Modernity & Outdated Status Inspection
    const isInsecure = url.startsWith('http://');
    const copyrightMatch = text.match(/(?:©|copyright|\(c\))\s*(200\d|201\d|202[0-3])\b/i);
    const legacyIndicator = text.match(/\b(flash player required|best viewed in internet explorer|optimized for 1024x768|under construction|copyright 199\d)\b/i);

    if (isInsecure || copyrightMatch || legacyIndicator) {
      const issues: string[] = [];
      if (isInsecure) issues.push('Lacks HTTPS SSL encryption');
      if (copyrightMatch && parseInt(copyrightMatch[1], 10) < 2023) issues.push(`Outdated copyright year (${copyrightMatch[1]})`);
      if (legacyIndicator) issues.push(`Legacy web elements: ${legacyIndicator[1]}`);

      const statusDesc = issues.length > 0 ? `Outdated (${issues.join(', ')})` : 'Modern';
      factList.push({
        sourceUrl: normUrl,
        sourceDomain: domain,
        sourceTitle: title,
        sourceType,
        pageTitle: title,
        evidenceText: `Website audit findings for ${normUrl}: ${issues.join('; ') || 'Standard presence'}`,
        evidenceQuote: `Website audit findings: ${issues.join('; ')}`,
        field: 'website_status',
        extractedValue: statusDesc,
        confidence: 0.9,
        timestamp: new Date().toISOString(),
        extractedAt: new Date().toISOString(),
        verified: true,
      });
    } else {
      factList.push({
        sourceUrl: normUrl,
        sourceDomain: domain,
        sourceTitle: title,
        sourceType,
        pageTitle: title,
        evidenceText: `Website appears active and modern: ${normUrl}`,
        evidenceQuote: `Active and modern website`,
        field: 'website_status',
        extractedValue: 'Active & Modern (HTTPS enabled)',
        confidence: 0.85,
        timestamp: new Date().toISOString(),
        extractedAt: new Date().toISOString(),
        verified: true,
      });
    }
  }

  /**
   * Counts entities that have completed ALL required pipeline stages and satisfied all constraints.
   */
  private countFullyCompletedEntities(state: BrainTaskState): number {
    const plan = state.plan;
    const entities = Array.isArray(state.verifiedEntities) ? state.verifiedEntities : [];
    return entities.filter((ent) => {
      if (ent.status === 'REJECTED' || ent.status === 'FAILED' || ent.status === 'EXCLUDED') {
        return false;
      }

      // Uninspected search hits are not verified leads
      if (!ent.pageInspected && (ent.status === 'DISCOVERED' || ent.status === 'QUALIFIED' || !ent.status)) {
        return false;
      }

      const websiteVerification = evidenceProvenanceEngine.verifyWebsiteAbsence(ent);
      ent.websiteStatus = websiteVerification.websiteStatus;
      ent.hasWebsite = websiteVerification.hasWebsite;
      ent.hasNoWebsiteVerified = websiteVerification.hasNoWebsiteVerified;
      ent.websiteVerificationReason = websiteVerification.verificationReason;

      if (plan.noWebsiteRequired && ent.websiteStatus !== 'VERIFIED_NO_WEBSITE') {
        return false;
      }

      const emailRequested = Boolean(plan.requestedFields?.includes('email') || plan.emailActionsRequired);
      if (emailRequested) {
        const emailResolved =
          ent.emailStatus === 'VERIFIED'
          || (ent.pageInspected && ent.emailStatus === 'NOT_FOUND');
        if (!emailResolved) return false;
      }

      if (plan.proposalRequired && !ent.proposalMarkdown) {
        return false;
      }

     const shouldSend = Boolean(
        plan.emailActionsRequired &&
          state.gmailConnected &&
          (state.autoSendProposals || state.emailConfirmationGranted)
      );
      if (shouldSend && ent.email && !ent.emailSent && !ent.emailSendError && ent.status !== 'PROCESSED') {
        return false;
      }

      return true;
    }).length;
  }

  /**
   * Updates state with new candidate URLs, tracked entities, action records, and facts from observation.
   */
  private updateStateWithObservation(state: BrainTaskState, observation: BrainObservation, action?: BrainActionDecision) {
    ensureStateCollections(state);
    if (!state.actionRecords) {
      state.actionRecords = [];
    }

    if (observation.searchState?.candidateUrls) {
      for (const cand of observation.searchState.candidateUrls) {
        const normCandUrl = evidenceProvenanceEngine.normalizeSourceUrl(cand.url);
        if (!state.discoveredCandidates.some((c) => c.url === normCandUrl || c.url === cand.url)) {
          state.discoveredCandidates.push({
            ...cand,
            url: normCandUrl,
            domain: evidenceProvenanceEngine.extractDomain(normCandUrl),
          });
        }
      }
    }

    // Process business search results
    if (action?.toolName === 'search_businesses' && observation.extractedData?.businesses) {
      const businesses = Array.isArray(observation.extractedData.businesses) ? observation.extractedData.businesses : [];
      for (const b of businesses) {
        const cleanWebsite = b.website ? evidenceProvenanceEngine.normalizeSourceUrl(b.website) : null;
        const hasUrl = Boolean(cleanWebsite && cleanWebsite.trim() !== '');
        const verifiedNoWeb = Boolean(b.hasNoWebsiteVerified);

        const bizDomain = entityDomain(cleanWebsite);
        let existing = state.verifiedEntities.find((e) =>
          e.name.toLowerCase() === (b.name || '').toLowerCase()
          || (cleanWebsite && (e.url === cleanWebsite || e.website === cleanWebsite))
          || (bizDomain && (entityDomain(e.url) === bizDomain || entityDomain(e.website) === bizDomain))
        );
        if (!existing) {
          existing = {
            id: `ent_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
            name: b.name,
            url: cleanWebsite || null,
            website: cleanWebsite || null,
            hasWebsite: hasUrl,
            hasNoWebsiteVerified: verifiedNoWeb,
            websiteStatus: hasUrl ? 'WEBSITE_FOUND' : (verifiedNoWeb ? 'VERIFIED_NO_WEBSITE' : 'UNKNOWN'),
            phone: b.phone || undefined,
            email: b.email || null,
            address: b.address || undefined,
            rating: b.rating || undefined,
            pageInspected: false,
            status: (state.plan.noWebsiteRequired && hasUrl) ? 'REJECTED' : 'DISCOVERED',
            rejectionReason: (state.plan.noWebsiteRequired && hasUrl) ? 'Has active website' : undefined,
            facts: [],
            sources: [],
            actionRecords: [],
          };
          state.verifiedEntities.push(existing);
        } else {
          if (b.phone && !existing.phone) existing.phone = b.phone;
          if (b.address && !existing.address) existing.address = b.address;
          if (b.rating && !existing.rating) existing.rating = b.rating;
          if (hasUrl) {
            existing.url = cleanWebsite;
            existing.website = cleanWebsite;
            existing.hasWebsite = true;
            existing.websiteStatus = 'WEBSITE_FOUND';
            if (state.plan.noWebsiteRequired) {
              existing.status = 'REJECTED';
              existing.rejectionReason = 'Has active website';
            }
          } else if (verifiedNoWeb) {
            existing.hasNoWebsiteVerified = true;
            existing.websiteStatus = 'VERIFIED_NO_WEBSITE';
          }
        }

        if (b.phone) {
          const sourceUrl = cleanWebsite || 'local_business_registry';
          const validPhone = evidenceProvenanceEngine.validateFactEvidence(
            {
              field: 'phone',
              extractedValue: b.phone,
              sourceUrl,
              sourceDomain: evidenceProvenanceEngine.extractDomain(sourceUrl),
              sourceTitle: b.name,
              sourceType: cleanWebsite ? 'PRIMARY' : 'DIRECTORY',
              extractedAt: new Date().toISOString(),
              confidence: 0.95,
              evidenceQuote: `Verified business phone in registry: ${b.phone}`,
              entityId: existing.id,
              entityName: existing.name,
            },
            `Verified business phone in registry: ${b.phone}`,
            sourceUrl
          );
          if (validPhone.verified) {
            observation.extractedFacts.push(validPhone.groundedFact);
          }
        }
      }
    }

    // Process proposal generation result
    if (action?.toolName === 'generate_proposal' && observation.extractedData) {
      const bName = action.toolArgs?.businessName || '';
      const matched = state.verifiedEntities.find((e) => e.name.toLowerCase().includes(bName.toLowerCase()) || bName.toLowerCase().includes(e.name.toLowerCase()));
      if (matched) {
        if (observation.success) {
          matched.proposalMarkdown = observation.extractedData.proposalMarkdown || observation.extractedData.proposal || observation.extractedData.text || '';
          matched.proposalSubject = observation.extractedData.subject || `Digital Growth Strategy for ${matched.name}`;
          matched.status = 'PROPOSAL_GENERATED';
        }

        const actionRecord: EntityActionRecord = {
          actionId: `prop_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          actionType: 'generate_proposal',
          actionStatus: observation.success ? 'PROPOSAL_GENERATED' : 'PROPOSAL_FAILED',
          lifecycleState: observation.success ? 'SUCCEEDED' : 'FAILED',
          executedAt: new Date().toISOString(),
          targetEntity: matched.name,
          proposalId: observation.extractedData.proposalId,
          subject: matched.proposalSubject,
          resultSummary: observation.success
            ? `Generated tailored digital growth proposal for ${matched.name}`
            : `Failed to generate proposal for ${matched.name}: ${observation.error || 'Generation error'}`,
        };
        if (!matched.actionRecords) matched.actionRecords = [];
        matched.actionRecords.push(actionRecord);
        state.actionRecords.push(actionRecord);
      }
    }

    // Process email sending result with strict provider outcome verification
    if (action?.toolName === 'send_email') {
      const recipient = action.toolArgs?.to || '';
      const bName = action.toolArgs?.businessName || '';
      const matched = state.verifiedEntities.find(
        (e) => (e.email && e.email.toLowerCase() === recipient.toLowerCase()) ||
               (bName && (e.name.toLowerCase().includes(bName.toLowerCase()) || bName.toLowerCase().includes(e.name.toLowerCase())))
      );

      const emailSkipped = Boolean(observation.extractedData?.skipped);
      const emailDispatched = observation.success === true && Boolean(observation.extractedData?.success) && Boolean(observation.extractedData?.messageId);
      const actionRecord: EntityActionRecord = {
        actionId: `email_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        actionType: 'send_email',
        actionStatus: emailDispatched ? 'EMAIL_SENT' : emailSkipped ? 'EMAIL_FAILED' : 'EMAIL_FAILED',
        lifecycleState: emailDispatched ? 'SUCCEEDED' : 'FAILED',
        executedAt: new Date().toISOString(),
        targetEntity: matched?.name || bName || recipient,
        recipient,
        subject: action.toolArgs?.subject,
        messageId: observation.extractedData?.messageId,
        errorReason: emailDispatched ? undefined : (observation.error || observation.extractedData?.error || 'Email dispatch failed'),
        resultSummary: emailDispatched
          ? `Successfully dispatched proposal email to ${recipient} (ID: ${observation.extractedData?.messageId})`
          : `Failed dispatching email to ${recipient}: ${observation.error || observation.extractedData?.error || 'Unknown dispatch error'}`,
      };
      if (matched) {
        if (!matched.actionRecords) matched.actionRecords = [];
        matched.actionRecords.push(actionRecord);
        if (emailDispatched) {
          matched.emailSent = true;
          matched.status = 'EMAIL_SENT';
          matched.emailSendError = undefined;
        } else if (emailSkipped) {
          matched.emailSent = false;
          matched.emailSendError = observation.extractedData?.reason || 'already_contacted';
          matched.status = 'PROCESSED';
        } else {
          matched.emailSent = false;
          matched.emailSendError = observation.error || observation.extractedData?.error || 'Failed to dispatch email';
          matched.status = 'FAILED';
        }
      }
      state.actionRecords.push(actionRecord);
    }

    // Process search/browse facts and link to entities
    if (observation.extractedFacts?.length) {
      for (const f of observation.extractedFacts) {
        state.extractedFacts.push(f);
        state.evidence.push({
          fact: `${f.field}: ${f.extractedValue}`,
          sourceUrl: f.sourceUrl,
          quote: f.evidenceQuote || f.evidenceText || '',
          timestamp: f.extractedAt || f.timestamp || new Date().toISOString(),
        });

        // Link email/phone facts to active entities if relevant
        if (f.field === 'email' && f.extractedValue) {
          const matchingEntity = state.verifiedEntities.find((e) => !e.email && (f.pageTitle.toLowerCase().includes(e.name.toLowerCase()) || e.name.toLowerCase().includes(f.pageTitle.toLowerCase())));
          if (matchingEntity) {
            matchingEntity.email = f.extractedValue;
            matchingEntity.emailStatus = 'VERIFIED';
            matchingEntity.emailSourceUrl = f.sourceUrl;
            matchingEntity.emailEvidence = f.evidenceQuote || f.evidenceText;
          }
        }
      }
    }
  }

  /**
   * Uses LLM to evaluate the latest observation and choose the next action.
   */
  private async evaluateStepAndDecideNext(opts: {
    state: BrainTaskState;
    lastObservation: BrainObservation;
    providerId: any;
    model: string;
    userApiKey?: string;
    userId?: string;
    sendEvent: (event: any) => void;
    abortSignal?: AbortSignal;
    onFailover?: (event: any) => void;
  }): Promise<BrainActionDecision> {
    const { state, lastObservation } = opts;

    // Evaluate multi-step pipeline candidates
    const qualifiedCandidates = state.verifiedEntities.filter((e) => e.status !== 'REJECTED');
    const fullyCompletedCount = this.countFullyCompletedEntities(state);
    const targetQuantity = state.plan.quantity;

    // EMAIL PERMISSION GATE (deterministic): if proposals are ready but the user has
    // not confirmed dispatch, ask before sending. Never dispatch without consent and
    // never claim EMAIL_SENT when Gmail is not connected.
    if ((state.plan.emailActionsRequired || state.autoSendProposals) && !state.emailConfirmationDeclined) {
      const readyToSend = qualifiedCandidates.filter(
        (e) => e.proposalMarkdown && e.email && !e.emailSent && !e.emailSendError
      );
      if (readyToSend.length > 0) {
        if (!state.gmailConnected) {
          state.awaitingEmailConfirmation = false;
          state.emailConfirmationGranted = false;
          return {
            type: 'ask_clarification',
            toolName: '',
            toolArgs: {},
            rationale: 'Gmail is not connected; proposals are prepared but cannot be sent.',
            clarificationQuestion:
              `I found ${state.verifiedEntities.length} verified leads and prepared ${readyToSend.length} personalized emails, but your Gmail is not connected. ` +
              `Please connect Gmail (OAuth or SMTP) in Settings, then tell me to send them.`,
            expectedObservation: 'User reply to the clarification prompt',
          };
        }
        if (!state.autoSendProposals && !state.emailConfirmationGranted) {
          state.awaitingEmailConfirmation = true;
          return {
            type: 'ask_clarification',
            toolName: '',
            toolArgs: {},
            rationale: 'Proposals are ready but the user must confirm the send.',
            clarificationQuestion:
              `I found ${state.verifiedEntities.length} verified leads and prepared ${readyToSend.length} personalized emails. ` +
              `Do you want me to send them from your connected Gmail?`,
            expectedObservation: 'User reply to the clarification prompt',
          };
        }
      }
    }

    // Remaining unvisited destination URLs from search candidates
    ensureStateCollections(state);
    const unvisitedCandidates = (state.discoveredCandidates || []).filter((c) => !state.visitedUrls?.has(c.url));

    const promptContext = `### Task Plan
- Goal: ${state.plan.goal}
- Intent: ${state.plan.userIntent}
- Target Quantity: ${targetQuantity} (Fully completed pipeline: ${fullyCompletedCount}/${targetQuantity}, Qualified candidates: ${qualifiedCandidates.length})
- Constraints: ${state.plan.constraints.join('; ') || 'None'}
- Required Actions Pipeline: ${state.plan.requiredActions?.join(' -> ') || 'Find -> Verify -> Complete'}
- Requested Fields: ${state.plan.requestedFields.join(', ') || 'General Overview'}
- Completion Criteria: ${state.plan.completionCriteria}

### Current Tracked Entities (${qualifiedCandidates.length} qualified):
${qualifiedCandidates.slice(0, 8).map((e) => `* ${e.name} | Web: ${e.hasWebsite ? 'YES' : 'NO'} | Email: ${e.email || 'None'} | Proposal: ${e.proposalMarkdown ? 'YES' : 'NO'} | Sent: ${e.emailSent ? 'YES' : e.emailSendError ? 'FAILED' : 'NO'}`).join('\n') || 'None'}

### Latest Observation
- Tool Executed: ${lastObservation.toolName}
- Success: ${lastObservation.success}
${lastObservation.error ? `- Error: ${lastObservation.error}` : ''}
${lastObservation.searchState ? `- Search Query: "${lastObservation.searchState.query}" (Found ${lastObservation.searchState.totalResults} results)` : ''}
- Facts Extracted this step: ${lastObservation.extractedFacts.length}

Evaluate this observation and decide the NEXT ACTION to advance the multi-step pipeline.
DO NOT return 'complete' if fully completed count (${fullyCompletedCount}) is less than target quantity (${targetQuantity}) and further candidates can be discovered or processed!`;

    try {
      const response = await brainLlmClient.complete({
        providerId: opts.providerId,
        model: opts.model,
        userApiKey: opts.userApiKey,
        userId: opts.userId,
        systemPrompt: getEvaluateStepSystemPrompt(),
        userPrompt: promptContext,
        temperature: 0.1,
        jsonMode: true,
        abortSignal: opts.abortSignal,
        onFailover: opts.onFailover,
      });

      const parsedAction = PlanValidator.validateAndRepairAction(
        response.json,
        state.userPrompt,
        state.plan.userIntent
      );

      // Guard against premature LLM completion when target quantity and pipeline are incomplete
      if (
        (parsedAction.type === 'complete' || parsedAction.type === 'report_unavailable') &&
        fullyCompletedCount < targetQuantity &&
        state.currentIteration < state.maxIterations - 1
      ) {
        console.log(`[Brain Anti-Premature Completion Guard] LLM suggested ${parsedAction.type}, but only ${fullyCompletedCount}/${targetQuantity} satisfied. Routing next pipeline step.`);
        const forced = this.getDeterministicNextPipelineAction(state);
        if (forced.type !== 'complete') return forced;
      }

      return parsedAction;
    } catch (err: any) {
      console.warn('[Brain ReAct Evaluation Notice] Using heuristic pipeline action:', err.message);
      return this.getDeterministicNextPipelineAction(state);
    }
  }

  /**
   * Deterministic pipeline router ensuring every required multi-step stage is executed for every entity.
   */
  private getDeterministicNextPipelineAction(state: BrainTaskState): BrainActionDecision {
    const plan = state.plan;
    const qualifiedCandidates = state.verifiedEntities.filter((e) => e.status !== 'REJECTED');
    const fullyCompletedCount = this.countFullyCompletedEntities(state);
    const targetQuantity = plan.quantity;

    // Honest termination: discovery has been exhausted (zero live results
    // across multiple queries, no candidates, nothing verified). Do NOT loop
    // or invent companies — report the empty result.
    if (state.searchExhausted && qualifiedCandidates.length === 0) {
      return {
        type: 'report_unavailable',
        toolName: '',
        toolArgs: {},
        rationale: 'Live search returned 0 results; reporting honestly without inventing data.',
        expectedObservation: 'Final honest empty-result report',
        unavailableReason:
          'Live search returned 0 results. No companies, websites, decision makers, or emails were invented.',
      };
    }

    // EMAIL PERMISSION GATE: proposals are ready to send but the user has not
    // confirmed dispatch yet -> pause and ask before sending. Never claim EMAIL_SENT.
    if ((plan.emailActionsRequired || state.autoSendProposals) && !state.emailConfirmationDeclined) {
      const readyToSend = qualifiedCandidates.filter(
        (e) => e.proposalMarkdown && e.email && !e.emailSent && !e.emailSendError
      );
      if (readyToSend.length > 0) {
        if (!state.gmailConnected) {
          state.awaitingEmailConfirmation = false;
          state.emailConfirmationGranted = false;
          return {
            type: 'ask_clarification',
            toolName: '',
            toolArgs: {},
            rationale: 'Gmail is not connected; proposals are prepared but cannot be sent.',
            clarificationQuestion:
              `I found ${state.verifiedEntities.length} verified leads and prepared ${readyToSend.length} personalized emails, but your Gmail is not connected. ` +
              `Please connect Gmail (OAuth or SMTP) in Settings, then tell me to send them.`,
            expectedObservation: 'User reply to the clarification prompt',
          };
        }
        if (!state.autoSendProposals && !state.emailConfirmationGranted) {
          state.awaitingEmailConfirmation = true;
          return {
            type: 'ask_clarification',
            toolName: '',
            toolArgs: {},
            rationale: 'Proposals are ready but the user must confirm the send.',
            clarificationQuestion:
              `I found ${state.verifiedEntities.length} verified leads and prepared ${readyToSend.length} personalized emails. ` +
              `Do you want me to send them from your connected Gmail?`,
            expectedObservation: 'User reply to the clarification prompt',
          };
        }
      }
    }

    // Check 1: Do we need to dispatch emails for proposals that are ready?
    const shouldDispatchEmail =
      Boolean(state.gmailConnected) &&
      Boolean(plan.emailActionsRequired || state.autoSendProposals) &&
      Boolean(state.autoSendProposals || state.emailConfirmationGranted);
    if (shouldDispatchEmail) {
      const candToSend = qualifiedCandidates.find((e) => e.proposalMarkdown && e.email && !e.emailSent && !e.emailSendError);
      if (candToSend) {
        return {
          type: 'execute_tool',
          toolName: 'send_email',
          toolArgs: {
            to: candToSend.email,
            businessName: candToSend.name,
            subject: candToSend.proposalSubject || `Digital Growth Strategy for ${candToSend.name}`,
            body: candToSend.proposalMarkdown,
          },
          rationale: `Dispatching outreach proposal to verified email for ${candToSend.name} (${candToSend.email})`,
          expectedObservation: 'Email dispatch confirmation with message ID',
        };
      }
    }

    // Check 2: Do we need to generate proposals for qualified candidates?
    if (plan.proposalRequired) {
      const candToPropose = qualifiedCandidates.find((e) => !e.proposalMarkdown && (e.email || !plan.emailActionsRequired));
      if (candToPropose) {
        return {
          type: 'execute_tool',
          toolName: 'generate_proposal',
          toolArgs: {
            businessName: candToPropose.name,
            businessType: candToPropose.services || 'Local Business',
            location: candToPropose.address || plan.location || 'India',
            weakness: candToPropose.hasWebsite === false ? 'No online website presence' : 'Needs digital enhancement',
          },
          rationale: `Generating tailored digital pitch proposal for ${candToPropose.name}`,
          expectedObservation: 'Structured personalized proposal markdown',
        };
      }
    }

    // Check 3: Do we need to discover contact email/phone for qualified candidates?
    if (plan.requestedFields.includes('email') || plan.emailActionsRequired) {
      const candNeedingEmail = qualifiedCandidates.find((e) =>
        e.emailStatus !== 'NOT_FOUND' && (!e.email || e.email.trim() === '')
      );
      if (candNeedingEmail) {
        const contactQuery = `"${candNeedingEmail.name}" ${candNeedingEmail.address || plan.location || ''} contact email phone`;
        return {
          type: 'execute_tool',
          toolName: 'google_search',
          toolArgs: {
            query: contactQuery,
            location: plan.location,
          },
          rationale: `Searching contact details and verified email for ${candNeedingEmail.name}`,
          expectedObservation: 'Contact email or phone number for candidate',
        };
      }
    }

    // Check 4: If we have unvisited candidate URLs from search discovery, visit the next one
    ensureStateCollections(state);
    const unvisitedCandidates = (state.discoveredCandidates || []).filter((c) => !state.visitedUrls?.has(c.url));
    if (unvisitedCandidates.length > 0) {
      const nextCandidate = unvisitedCandidates[0];
      return {
        type: 'execute_tool',
        toolName: 'browser_navigate',
        toolArgs: { url: nextCandidate.url },
        rationale: `Visiting candidate destination: ${nextCandidate.title}`,
        expectedObservation: 'Inspect webpage headings, text, pricing, and contact details',
      };
    }

    // Check 5: If fully completed count is still below target quantity, perform search variation
    if (fullyCompletedCount < targetQuantity && state.currentIteration < state.maxIterations - 1) {
      const location = plan.location || '';
      const base = (plan.entities.join(' ') || plan.goal).slice(0, 80);
      const queryVariations = [
        `${base} ${location}`.trim(),
        `${base} ${location} official website`.trim(),
        `${base} ${location} contact email`.trim(),
        `best ${base} ${location}`.trim(),
        `${base} ${location} directory`.trim(),
      ];
      const query = queryVariations[(state.currentIteration - 1) % queryVariations.length];
      return {
        type: 'execute_tool',
        toolName: state.currentIteration % 2 === 0 ? 'search_businesses' : 'google_search',
        toolArgs: {
          query,
          location,
          limit: Math.min(Math.max(targetQuantity, 10), 30),
        },
        rationale: `Discovering additional candidates to meet target quantity (${fullyCompletedCount}/${targetQuantity})`,
        expectedObservation: 'Additional candidate businesses for verification',
      };
    }

    return {
      type: 'complete',
      toolName: '',
      toolArgs: {},
      rationale: `Completed pipeline. Verified ${fullyCompletedCount}/${targetQuantity} items.`,
      expectedObservation: 'Final response synthesis',
    };
  }

  /**
   * Dynamically generates a revised plan when an impediment is encountered.
   */
  private async replanTask(opts: {
    state: BrainTaskState;
    providerId: any;
    model: string;
    userApiKey?: string;
    userId?: string;
    abortSignal?: AbortSignal;
    onFailover?: (event: any) => void;
  }): Promise<BrainTaskPlan> {
    const { state } = opts;
    const userPrompt = `The previous strategy encountered roadblocks:
- Failed Actions: ${JSON.stringify(state.failedActions.slice(-2))}
- Visited URLs: ${Array.from(state.visitedUrls).join(', ')}
- Goal: ${state.plan.goal}

Formulate an adjusted BrainTaskPlan with alternative search queries or direct browsing techniques.`;

    try {
      const response = await brainLlmClient.complete({
        providerId: opts.providerId,
        model: opts.model,
        userApiKey: opts.userApiKey,
        userId: opts.userId,
        systemPrompt: getReplanSystemPrompt(),
        userPrompt,
        temperature: 0.2,
        jsonMode: true,
        abortSignal: opts.abortSignal,
        onFailover: opts.onFailover,
      });
      return PlanValidator.validateAndRepairPlan(response.json, state.userPrompt);
    } catch {
      return state.plan;
    }
  }

  /**
   * Synthesizes the final verified response strictly based on evidence.
   */
  private async synthesizeFinalAnswer(opts: {
    prompt: string;
    state: BrainTaskState;
    providerId: any;
    model: string;
    userApiKey?: string;
    userId?: string;
    abortSignal?: AbortSignal;
    onFailover?: (event: any) => void;
  }): Promise<string> {
    const { prompt, state } = opts;

    const structuredReport = evidenceProvenanceEngine.formatStructuredEvidenceReport(state);

    const evidenceText = state.evidence
      .slice(0, 25)
      .map((e) => `[Source: ${e.sourceUrl}] ${e.fact} (Quote: "${e.quote}")`)
      .join('\n');

    const verifiedEntitiesText = state.verifiedEntities.length
      ? JSON.stringify(state.verifiedEntities.slice(0, 25), null, 2)
      : 'None';

    const actionRecordsText = state.actionRecords?.length
      ? JSON.stringify(state.actionRecords.slice(0, 20), null, 2)
      : 'None';

    const visitedUrlsList = Array.from(state.visitedUrls).join('\n') || 'None';

    const synthesisPrompt = `User Question: "${prompt}"

Task Goal: ${state.plan.goal}
Requested Fields: ${state.plan.requestedFields.join(', ') || 'All relevant verified details'}
Required Quantity: ${state.plan.quantity}

### Verified Entities (${state.verifiedEntities.length}):
${verifiedEntitiesText}

### Action Execution History (e.g. Email Dispatch, Proposals):
${actionRecordsText}

### Verified Facts & Evidence Quotes:
${evidenceText || 'No direct text facts found.'}

### Sources Inspected:
${visitedUrlsList}

### Pre-Calculated Grounded Report Reference:
${structuredReport}

Synthesize the final grounded response strictly following all rules:
- Produce the 5 standard sections: ### Result, ### Summary, ### Evidence, ### Sources, ### Limitations.
- Include source citations and evidence quotes for all verified data.
- If requested fields or entities were not found or not publicly listed, explicitly state "Not found / Not publicly listed / Unable to verify".
- Never claim an email was sent if it failed or was not executed.
- If outreach was requested but Gmail is not connected, say so clearly and keep the proposals as drafts.
- Do not invent any data.
Gmail connected: ${state.gmailConnected ? 'yes' : 'no'}
Auto-send setting: ${state.autoSendProposals ? 'on' : 'off'}`;

    try {
      const response = await brainLlmClient.complete({
        providerId: opts.providerId,
        model: opts.model,
        userApiKey: opts.userApiKey,
        userId: opts.userId,
        systemPrompt: getFinalSynthesisSystemPrompt(),
        userPrompt: synthesisPrompt,
        temperature: 0.1,
        jsonMode: false,
        abortSignal: opts.abortSignal,
        onFailover: opts.onFailover,
      });
      return response.text && response.text.length > 50 ? response.text : structuredReport;
    } catch (err: any) {
      console.warn('[Brain Synthesis Notice] Fallback summary formatter:', err.message);
      return this.formatFallbackSummary(state);
    }
  }

  private checkDuplicateAction(action: BrainActionDecision, observations: BrainObservation[]): boolean {
    if (observations.length === 0) return false;
    const last = observations[observations.length - 1];
    if (last.toolName !== action.toolName) return false;
    return JSON.stringify(last.toolArgs) === JSON.stringify(action.toolArgs);
  }

  private pivotActionOnLoop(state: BrainTaskState, action: BrainActionDecision): BrainActionDecision {
    ensureStateCollections(state);
    const unvisited = (state.discoveredCandidates || []).filter((c) => !state.visitedUrls?.has(c.url));
    if (unvisited.length > 0) {
      return {
        type: 'execute_tool',
        toolName: 'browser_navigate',
        toolArgs: { url: unvisited[0].url },
        rationale: `Pivoting to next candidate destination: ${unvisited[0].title}`,
        expectedObservation: 'Inspect webpage content',
      };
    }

    if (action.toolName === 'google_search') {
      const altQuery = `${action.toolArgs?.query || state.userPrompt} official website contact`;
      return {
        type: 'execute_tool',
        toolName: 'google_search',
        toolArgs: { query: altQuery },
        rationale: `Pivoting query to "${altQuery}"`,
        expectedObservation: 'Search results for refined query',
      };
    }

    return {
      type: 'complete',
      toolName: '',
      toolArgs: {},
      rationale: 'Completed current exploration path',
      expectedObservation: 'Final response',
    };
  }

  private formatFallbackSummary(state: BrainTaskState): string {
    return evidenceProvenanceEngine.formatStructuredEvidenceReport(state);
  }
}

export const brainDecisionEngine = new BrainDecisionEngine();

