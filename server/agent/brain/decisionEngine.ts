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
  TrackedEntityState,
  UniversalBrainRunOptions,
  UniversalBrainRunResult,
} from './types.js';
import { brainLlmClient } from './llmClient.js';
import { getFinalSynthesisSystemPrompt } from './promptTemplates.js';
import { PlanValidator } from './planValidator.js';
import { evidenceProvenanceEngine } from './evidenceProvenance.js';
import { executeTool } from '../../tools.js';
import { browserSessionManager } from '../../browser/sessionManager.js';
import { extractFoundersFromText, extractPricingFromText } from '../../research/deepWebResearcher.js';
import { taskCheckpointManager } from '../../task/checkpointManager.js';
import { getGmailTokens } from '../../db/neon.js';
import { getUserSmtpCredentials } from '../../db/smtp.js';

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

      // If resuming from a clarification prompt, incorporate user's clarification
      if (existingCheckpoint.status === 'WAITING_FOR_INPUT') {
        const clarifiedText = prompt.trim();
        if (!state.plan.location || state.plan.location === 'unknown' || state.plan.location === '') {
          state.plan.location = clarifiedText;
        }
        // Update user intent & goal with clarified context
        state.userPrompt = `${state.userPrompt} (Clarification: ${clarifiedText})`;

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

      plan = state.plan;
      currentAction = state.plan.nextAction;

      sendEvent({
        type: 'task.resumed',
        taskId,
        iteration: state.currentIteration,
        message: `Resuming task from checkpoint at step ${state.currentIteration} (${state.verifiedEntities.length}/${state.plan.quantity} verified)...`,
      });
    } else {
      // NOTE: task.started ("Thinking...") is emitted by the orchestrator
      // (agent.ts) before the brain runs, so the UI gets the pulsing
      // indicator immediately. We do NOT re-emit task.started here.

      // 1. FORMULATE INITIAL PLAN — deterministic (no LLM JSON plan call).
      //    Passing null forces PlanValidator to build a safe, grounded plan
      //    and keeps the first paint fast and reliable.
      plan = PlanValidator.validateAndRepairPlan(
        null,
        prompt,
        defaultLocation,
        conversationHistory
      );

      // Initialize State
      // Discovery runs search → inspect up to ~6 official pages → optional
      // contact search, so allow a slightly higher iteration cap.
      const discoveryIntent =
        plan.userIntent === 'DISCOVERY_AND_EXTRACTION' ||
        plan.userIntent === 'MULTI_STEP_RESEARCH' ||
        plan.userIntent === 'PROFILE_RESEARCH';
      const effectiveMaxIterations = Math.min(
        Math.max(maxIterations, discoveryIntent ? 30 : 15),
        35
      );

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
        maxIterations: effectiveMaxIterations,
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
      };

      currentAction = plan.nextAction;

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
        message: `Goal: ${plan.goal}`,
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

      // Stream the answer so the assistant bubble fills in (and the Thinking
      // indicator clears on the first token).
      if (directAnswer) {
        sendEvent({ type: 'message.delta', content: directAnswer });
        sendEvent({ type: 'message.completed', content: directAnswer });
      }

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
          message: `Reached target goal: verified and completed all pipeline stages for ${fullyCompletedCount}/${targetQuantity} items.`,
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

    // For research/discovery, produce the deterministic findings table and
    // stream it. We do NOT rely on formatStructuredEvidenceReport here because
    // it rejects 0-qualified entities when an email is required and would
    // emit "No verified entities" even when a table of discovered companies
    // exists.
    const isDiscoveryTask =
      plan.userIntent === 'DISCOVERY_AND_EXTRACTION' ||
      plan.userIntent === 'MULTI_STEP_RESEARCH' ||
      plan.userIntent === 'PROFILE_RESEARCH';

    let finalAnswer: string;
    if (isDiscoveryTask) {
      finalAnswer = this.formatFindingsReport(state);
    } else {
      finalAnswer = await this.synthesizeFinalAnswer({
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
    }

    // Stream the final answer as the assistant message so the Thinking
    // indicator clears and the bubble fills in. task.completed also carries
    // the answer in result.answer for clients that only read that field.
    if (finalAnswer) {
      sendEvent({ type: 'message.delta', content: finalAnswer });
      sendEvent({ type: 'message.completed', content: finalAnswer });
    }

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
   * Formulates the structured task plan.
   *
   * Deliberately deterministic: we skip the LLM JSON-planning call and build
   * the plan directly via PlanValidator.validateAndRepairPlan(null, ...).
   * This removes a slow, failure-prone JSON round-trip and guarantees a valid
   * plan on every request.
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
    return PlanValidator.validateAndRepairPlan(
      null,
      opts.prompt,
      opts.defaultLocation,
      opts.conversationHistory
    );
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
      const beforeCount = state.discoveredCandidates.length;

      // Register candidates, skipping search-engine/SERP URLs and de-duping by domain.
      for (const it of items) {
        const rawUrl = it?.link || it?.url;
        if (!rawUrl) continue;
        this.registerDiscoveredCandidate(state, {
          url: rawUrl,
          title: it.title || it.domain || 'Candidate Result',
          snippet: it.snippet,
          domain: it.domain,
          relevanceScore: it.score || 0.9,
        });
      }

      const newCandidates = state.discoveredCandidates.slice(beforeCount);
      observation.searchState = {
        query: action.toolArgs?.query || '',
        candidateUrls: newCandidates,
        totalResults: newCandidates.length,
      };

      opts.sendEvent({
        type: 'task.candidates_discovered',
        query: action.toolArgs?.query || '',
        count: newCandidates.length,
        totalDiscovered: state.discoveredCandidates.length,
        message: `Discovered ${newCandidates.length} candidate listings (not yet verified). Inspecting official pages...`,
      });
    } else if (action.toolName === 'search_businesses') {
      const businesses = Array.isArray(toolResult?.businesses) ? toolResult.businesses : [];
      observation.extractedData = toolResult;
      for (const b of businesses) {
        if (b.website) {
          this.registerDiscoveredCandidate(state, {
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

      // Mark any matching discovered candidate as inspected
      if (pageUrl) {
        const normVisited = evidenceProvenanceEngine.normalizeSourceUrl(pageUrl);
        for (const cand of state.discoveredCandidates) {
          if (cand.url === pageUrl || cand.url === normVisited) {
            cand.isInspected = true;
          }
        }
      }

      // Record or update verified entity from live page inspection
      if (toolResult?.success && pageUrl && !pageUrl.includes('google.com/search')) {
        const existing = state.verifiedEntities.find((e) => e.url === pageUrl);
        if (existing) {
          if (pageTitle && (!existing.name || existing.name === 'Discovered Organization')) {
            existing.name = pageTitle;
          }
          if (textContent && !existing.description) {
            existing.description = textContent.slice(0, 200).replace(/\s+/g, ' ');
          }
        } else {
          try {
            const domainName = new URL(pageUrl).hostname.replace(/^www\./, '');
            state.verifiedEntities.push({
              id: `ent_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
              name: pageTitle || domainName,
              url: pageUrl,
              website: pageUrl,
              description: textContent ? textContent.slice(0, 200).replace(/\s+/g, ' ') : undefined,
              hasWebsite: true,
              status: 'VERIFIED',
              facts: [],
              sources: [],
              actionRecords: [],
            });
          } catch {}
        }
      }

      // Extract facts from text and update verified entity fields
      this.extractFactsFromPageContent(pageUrl, pageTitle, textContent, observation.extractedFacts);

      // Attach extracted phone/email/founder/services to verified entity
      const matchedEntity = state.verifiedEntities.find((e) => e.url === pageUrl);
      if (matchedEntity) {
        // Tag every fact extracted from this page with the owning entity so the
        // findings table can surface decision makers / emails reliably.
        for (const f of observation.extractedFacts) {
          if (!f.entityId && matchedEntity.id) f.entityId = matchedEntity.id;
          if (!f.entityName) f.entityName = matchedEntity.name;
        }

        const phoneFact = observation.extractedFacts.find((f) => f.field === 'phone');
        if (phoneFact && !matchedEntity.phone) matchedEntity.phone = phoneFact.extractedValue;

        const emailFact = observation.extractedFacts.find((f) => f.field === 'email');
        if (emailFact && !matchedEntity.email) {
          const emailCheck = evidenceProvenanceEngine.verifyEmailEvidence(emailFact.extractedValue);
          if (emailCheck.emailStatus === 'VERIFIED' && emailCheck.email) {
            matchedEntity.email = emailCheck.email;
            matchedEntity.emailStatus = 'VERIFIED';
          }
        }

        const founderFact = observation.extractedFacts.find((f) => f.field === 'founder');
        if (founderFact && !matchedEntity.services) {
          // Stash decision maker on the entity for convenience.
          (matchedEntity as any).decisionMaker = founderFact.extractedValue;
        }

        const serviceFact = observation.extractedFacts.find((f) => f.field === 'services');
        if (serviceFact && !matchedEntity.services) matchedEntity.services = serviceFact.extractedValue;

        const pricingFact = observation.extractedFacts.find((f) => f.field === 'pricing');
        if (pricingFact && !matchedEntity.pricing) matchedEntity.pricing = pricingFact.extractedValue;

        const outdatedFact = observation.extractedFacts.find((f) => f.field === 'website_status');
        if (outdatedFact && !matchedEntity.websiteStatus) matchedEntity.websiteStatus = outdatedFact.extractedValue;
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
   * Returns true for search-engine / SERP / redirect-host URLs that must never
   * be treated as discovered candidate destinations.
   */
  private isSearchEngineUrl(rawUrl: string): boolean {
    if (!rawUrl || typeof rawUrl !== 'string') return true;
    let host = '';
    try {
      host = new URL(rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`).hostname.toLowerCase();
    } catch {
      return true;
    }
    host = host.replace(/^www\./, '');
    if (host === '') return true;
    const blocked = [
      'google.com', 'google.co.in', 'google.co.uk', 'googleusercontent.com', 'gstatic.com',
      'bing.com', 'duckduckgo.com', 'yahoo.com', 'ecosia.org', 'ask.com',
      'search.yahoo.com', 'microsoft.com',
      'youtube.com', 'youtu.be',
      'translate.google.com', 'webcache.googleusercontent.com',
    ];
    if (blocked.some((b) => host === b || host.endsWith('.' + b))) return true;
    // Google / Bing search paths regardless of host
    if (/\/search|\/url\?|\/ck\/a\?|\/l\/\?/.test(rawUrl)) return true;
    return false;
  }

  /**
   * Registers a candidate destination discovered during research.
   *
   * Search-engine URLs (SERPs, redirect wrappers) are skipped. Duplicates
   * (by normalized URL or domain) are de-duped. Candidates are tagged so the
   * pipeline can prefer official company websites for inspection.
   */
  private registerDiscoveredCandidate(state: BrainTaskState, cand: Partial<CandidateTarget>): void {
    if (!cand || !cand.url) return;
    const normUrl = evidenceProvenanceEngine.normalizeSourceUrl(cand.url);
    if (!normUrl || this.isSearchEngineUrl(normUrl)) return;

    const domain = evidenceProvenanceEngine.extractDomain(normUrl);
    const sourceType = evidenceProvenanceEngine.classifySourceQuality(normUrl);
    const isDestination = sourceType === 'PRIMARY';

    if (state.discoveredCandidates.some((c) => c.url === normUrl)) return;
    // De-dupe by registered domain so we inspect one page per company.
    if (state.discoveredCandidates.some((c) => c.domain === domain)) return;

    state.discoveredCandidates.push({
      url: normUrl,
      title: cand.title || domain || normUrl,
      snippet: cand.snippet,
      domain,
      relevanceScore: cand.relevanceScore ?? 0.8,
      isDestination,
      isInspected: false,
    });
  }

  /**
   * Picks the next unvisited official (non-search-engine, non-social,
   * non-directory) candidate page to inspect, BEFORE issuing another search.
   *
   * Inspection is capped so a single search cannot balloon into dozens of
   * navigations. Returns undefined when there is nothing official left to
   * inspect (caller should then search again or finish).
   */
  private pickUnvisitedOfficialCandidate(state: BrainTaskState, cap = 6): CandidateTarget | undefined {
    const inspectedOfficialCount = (state.verifiedEntities || []).filter((e) => e.hasWebsite && e.url).length;
    if (inspectedOfficialCount >= cap) return undefined;
    if (!Array.isArray(state.discoveredCandidates) || state.discoveredCandidates.length === 0) {
      return undefined;
    }

    const unvisited = state.discoveredCandidates.filter(
      (c) => c.url && !state.visitedUrls.has(c.url) && !this.isSearchEngineUrl(c.url)
    );

    // Prefer PRIMARY official websites, then everything else (directories etc).
    const official = unvisited.filter((c) => c.isDestination);
    const pool = official.length > 0 ? official : unvisited;

    const sorted = [...pool].sort((a, b) => (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0));
    return sorted[0];
  }

  /**
   * Builds the grounded findings TABLE that is streamed to the user as the
   * final answer for research/discovery tasks.
   *
   * Columns: Company | Website | Decision maker | Email | Status.
   * - Emails are only shown when extracted from a public page; otherwise "Not found".
   * - Nothing is invented. Companies come strictly from verified entities /
   *   inspected official pages.
   */
  private formatFindingsReport(state: BrainTaskState): string {
    const entities = (state.verifiedEntities || []).filter(
      (e) => e && e.name && e.status !== 'REJECTED'
    );

    const goal = state.plan?.goal || 'Research findings';
    const header = `## Findings\n\n${goal}\n`;

    if (entities.length === 0) {
      return `${header}\nNo verified companies or official pages could be confirmed from the live search. Refine the query or add a location, and I will re-run the research.`;
    }

    const rows = entities.slice(0, 30).map((e) => {
      const company = (e.name || 'Unknown').replace(/\|/g, ' ').trim();

      let websiteCell = 'Not found';
      const siteUrl = e.url || e.website;
      if (siteUrl) {
        const safe = siteUrl.toString();
        const label = evidenceProvenanceEngine.extractDomain(safe) || safe;
        websiteCell = `[${label}](${safe})`;
      }

      // Decision maker: use an extracted founder/leadership fact if present.
      let decisionMaker = 'Not found';
      const founderFact = state.extractedFacts.find(
        (f) =>
          f.field === 'founder' &&
          (f.entityId === e.id ||
            (f.entityName && e.name && f.entityName.toLowerCase() === e.name.toLowerCase()) ||
            (f.sourceUrl && e.url && evidenceProvenanceEngine.normalizeSourceUrl(f.sourceUrl) === evidenceProvenanceEngine.normalizeSourceUrl(e.url)))
      );
      if (founderFact?.extractedValue) {
        decisionMaker = founderFact.extractedValue.replace(/\|/g, ' ').trim();
      }

      // Email: only show a verified public email; never invent one.
      let emailCell = 'Not found';
      if (e.email && e.emailStatus !== 'NOT_FOUND') {
        const validated = evidenceProvenanceEngine.verifyEmailEvidence(e.email);
        if (validated.emailStatus === 'VERIFIED' && validated.email) {
          emailCell = `\`${validated.email}\``;
        }
      }

      const status = this.statusLabel(e);
      return `| ${company} | ${websiteCell} | ${decisionMaker} | ${emailCell} | ${status} |`;
    });

    const table = [
      '| Company | Website | Decision maker | Email | Status |',
      '|---|---|---|---|---|',
      ...rows,
    ].join('\n');

    const sourceCount = state.visitedUrls ? state.visitedUrls.size : 0;
    const footer = `\n\n_${entities.length} compan${entities.length === 1 ? 'y' : 'ies'} verified across ${sourceCount} inspected page${sourceCount === 1 ? '' : 's'}. Missing emails are shown as "Not found" — no contact details were invented._`;

    return `${header}\n${table}${footer}`;
  }

  private statusLabel(e: TrackedEntityState): string {
    if (e.emailSent) return 'Contacted';
    if (e.proposalMarkdown) return 'Proposal ready';
    if (e.status === 'REJECTED') return 'Excluded';
    if (e.email) return 'Verified';
    if (e.hasWebsite) return 'Website verified';
    return 'Discovered';
  }

  /**
   * Counts entities that have completed ALL required pipeline stages and satisfied all constraints.
   */
  private countFullyCompletedEntities(state: BrainTaskState): number {
    const plan = state.plan;
    return state.verifiedEntities.filter((ent) => {
      // 1. Website constraint verification
      const websiteVerification = evidenceProvenanceEngine.verifyWebsiteAbsence(ent);
      ent.websiteStatus = websiteVerification.websiteStatus;
      ent.hasWebsite = websiteVerification.hasWebsite;
      ent.hasNoWebsiteVerified = websiteVerification.hasNoWebsiteVerified;
      ent.websiteVerificationReason = websiteVerification.verificationReason;

      if (plan.noWebsiteRequired && ent.websiteStatus !== 'VERIFIED_NO_WEBSITE') {
        return false;
      }

      // Missing requested fields are reported as "Not found" — they do not block quantity.
      // 3. If proposal required, proposal must be generated
      if (plan.proposalRequired && !ent.proposalMarkdown) {
        return false;
      }

      // 4. If outreach was requested AND Gmail is connected AND auto-send is
      //    enabled, wait until the email is actually sent (or failed). When
      //    auto-send is OFF the proposal stays a draft awaiting confirmation,
      //    which counts as complete for the research pipeline.
      const shouldSend =
        Boolean(plan.emailActionsRequired && state.gmailConnected && state.autoSendProposals);
      if (shouldSend && ent.email && !ent.emailSent && !ent.emailSendError) {
        return false;
      }

      return ent.status !== 'REJECTED' && ent.status !== 'FAILED';
    }).length;
  }

  /**
   * Updates state with new candidate URLs, tracked entities, action records, and facts from observation.
   */
  private updateStateWithObservation(state: BrainTaskState, observation: BrainObservation, action?: BrainActionDecision) {
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

        let existing = state.verifiedEntities.find((e) => e.name.toLowerCase() === b.name.toLowerCase());
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
            status: (state.plan.noWebsiteRequired && hasUrl) ? 'REJECTED' : 'QUALIFIED',
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
    // Fully deterministic step routing — no LLM JSON evaluation. The pipeline
    // router already encodes the required order (official-page inspection
    // before second search, proposal, optional send). This keeps research
    // fast and prevents a premature "complete" that yields steps-only output.
    return this.getDeterministicNextPipelineAction(opts.state);
  }

  /**
   * Deterministic pipeline router ensuring every required multi-step stage is executed for every entity.
   */
  private getDeterministicNextPipelineAction(state: BrainTaskState): BrainActionDecision {
    const plan = state.plan;
    const qualifiedCandidates = state.verifiedEntities.filter((e) => e.status !== 'REJECTED');
    const fullyCompletedCount = this.countFullyCompletedEntities(state);
    const targetQuantity = plan.quantity;

    // Check 1: Do we need to dispatch emails for proposals that are ready?
    // SAFETY: Gmail is only dispatched automatically when the user's
    // autoSendProposals setting is ON. Otherwise proposals remain drafts and
    // are sent only after explicit confirmation in the UI.
    const shouldDispatchEmail =
      Boolean(state.gmailConnected) &&
      Boolean(plan.emailActionsRequired) &&
      Boolean(state.autoSendProposals);
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
      const candNeedingEmail = qualifiedCandidates.find((e) => (!e.email || e.email.trim() === ''));
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

    // Check 4: Inspect discovered OFFICIAL pages BEFORE running another search.
    // pickUnvisitedOfficialCandidate prefers official company sites and caps the
    // number of pages inspected so a single search cannot run away.
    const nextOfficial = this.pickUnvisitedOfficialCandidate(state);
    if (nextOfficial) {
      return {
        type: 'execute_tool',
        toolName: 'browser_navigate',
        toolArgs: { url: nextOfficial.url },
        rationale: `Inspecting official page: ${nextOfficial.title}`,
        expectedObservation: 'Inspect webpage headings, text, founder, email, pricing, and contact details',
      };
    }

    // Any other unvisited non-search-engine candidate (directory/social) — only
    // after the official-page cap has been reached.
    const remainingUnvisited = (state.discoveredCandidates || []).filter(
      (c) => c.url && !state.visitedUrls.has(c.url) && !this.isSearchEngineUrl(c.url)
    );
    if (remainingUnvisited.length > 0) {
      const nextCandidate = remainingUnvisited[0];
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
    // Deterministic re-plan: rebuild a safe plan from the original prompt and
    // keep the already-discovered state. Avoids an LLM JSON round-trip.
    const { state } = opts;
    return PlanValidator.validateAndRepairPlan(
      null,
      state.userPrompt,
      state.plan.location,
      state.conversationHistory
    );
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
    const unvisited = state.discoveredCandidates.filter((c) => !state.visitedUrls.has(c.url));
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
