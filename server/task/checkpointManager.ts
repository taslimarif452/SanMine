/**
 * Task Checkpoint & State Preservation Manager
 *
 * Provides durable checkpointing of autonomous agent execution state to prevent redundant work
 * when recovering from failures, process restarts, or model failovers.
 */

import { saveTaskCheckpoint, getTaskCheckpoint, deleteTaskCheckpoint } from '../db/chats.js';
import { isDatabaseConfigured } from '../db/neon.js';
import {
  BrainTaskState,
  BrainTaskPlan,
  CandidateTarget,
  GroundedFact,
  GroundedEvidence,
  BrainObservation,
  TaskActionExecutionRecord,
} from '../agent/brain/types.js';
import { AIProviderId } from '../ai/types.js';

export const CURRENT_CHECKPOINT_VERSION = 2;

export class CheckpointValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CheckpointValidationError';
  }
}

export interface SerializableTaskCheckpoint {
  version: number;
  taskId: string;
  userId?: string;
  chatId?: string;
  userPrompt: string;
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  plan: BrainTaskPlan;
  currentIteration: number;
  maxIterations: number;
  visitedUrls: string[];
  visitedDomains?: string[];
  discoveredCandidates: CandidateTarget[];
  observations?: BrainObservation[];
  extractedFacts: GroundedFact[];
  evidence: GroundedEvidence[];
  verifiedEntities: any[];
  failedActions: Array<{ toolName: string; args: any; error: string; timestamp: string }>;
  executedActionIds?: string[];
  pendingAction?: TaskActionExecutionRecord;
  status: 'PLANNING' | 'EXECUTING' | 'EVALUATING' | 'REPLANNING' | 'COMPLETED' | 'WAITING_FOR_INPUT' | 'FAILED' | 'STOPPED';
  replanCount: number;
  remainingWork?: string;
  finalResponse?: string;
  lastProvider?: AIProviderId;
  lastModel?: string;
  updatedAt: string;
}

export class TaskCheckpointManager {
  /**
   * Returns whether checkpoints are durably stored in PostgreSQL or in-memory fallback.
   */
  public getStorageType(): 'postgres' | 'memory' {
    return isDatabaseConfigured() ? 'postgres' : 'memory';
  }

  /**
   * Converts in-memory BrainTaskState into a serializable checkpoint snapshot with strict versioning.
   */
  public serializeBrainState(
    state: BrainTaskState,
    meta?: { lastProvider?: AIProviderId; lastModel?: string; chatId?: string }
  ): SerializableTaskCheckpoint {
    if (!state || !state.taskId) {
      throw new CheckpointValidationError('Cannot serialize invalid BrainTaskState: missing taskId');
    }

    return {
      version: CURRENT_CHECKPOINT_VERSION,
      taskId: state.taskId,
      userId: state.userId,
      chatId: state.chatId || meta?.chatId,
      userPrompt: state.userPrompt || '',
      conversationHistory: state.conversationHistory ? JSON.parse(JSON.stringify(state.conversationHistory)) : [],
      plan: state.plan ? JSON.parse(JSON.stringify(state.plan)) : {
        goal: state.userPrompt || '',
        userIntent: 'MULTI_STEP_RESEARCH' as const,
        quantity: 5,
        entities: [],
        requestedFields: [],
        toolsRequired: [],
        constraints: [],
        sourcePreference: 'auto' as const,
        discoveryStrategy: 'search_first' as const,
        browserRequired: false,
        expectedOutput: 'Summary report',
        completionCriteria: '',
        nextAction: {
          type: 'execute_tool' as const,
          toolName: 'google_search',
          toolArgs: { query: state.userPrompt || '' },
          rationale: 'Initial search',
          expectedObservation: 'Search results',
        },
      },
      currentIteration: typeof state.currentIteration === 'number' ? state.currentIteration : 0,
      maxIterations: typeof state.maxIterations === 'number' ? state.maxIterations : 15,
      visitedUrls: Array.from(state.visitedUrls || []),
      visitedDomains: Array.from(state.visitedDomains || []),
      discoveredCandidates: state.discoveredCandidates ? JSON.parse(JSON.stringify(state.discoveredCandidates)) : [],
      observations: state.observations ? JSON.parse(JSON.stringify(state.observations)) : [],
      extractedFacts: state.extractedFacts ? JSON.parse(JSON.stringify(state.extractedFacts)) : [],
      evidence: state.evidence ? JSON.parse(JSON.stringify(state.evidence)) : [],
      verifiedEntities: state.verifiedEntities ? JSON.parse(JSON.stringify(state.verifiedEntities)) : [],
      failedActions: state.failedActions ? JSON.parse(JSON.stringify(state.failedActions)) : [],
      executedActionIds: Array.from(state.executedActionIds || []),
      pendingAction: state.pendingAction ? JSON.parse(JSON.stringify(state.pendingAction)) : undefined,
      status: state.status || 'EXECUTING',
      replanCount: typeof state.replanCount === 'number' ? state.replanCount : 0,
      remainingWork: state.remainingWork || state.plan?.completionCriteria || '',
      finalResponse: state.finalResponse,
      lastProvider: meta?.lastProvider,
      lastModel: meta?.lastModel,
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Restores a BrainTaskState from a persisted checkpoint snapshot with schema validation and safe migration.
   */
  public deserializeBrainState(snapshot: SerializableTaskCheckpoint): BrainTaskState {
    if (!snapshot || typeof snapshot !== 'object') {
      throw new CheckpointValidationError('Corrupted checkpoint: snapshot is null or not an object');
    }

    if (!snapshot.taskId) {
      throw new CheckpointValidationError('Corrupted checkpoint: missing required taskId');
    }

    // Version validation & backwards-compatibility migration
    const version = typeof snapshot.version === 'number' ? snapshot.version : 1;
    if (version > CURRENT_CHECKPOINT_VERSION) {
      throw new CheckpointValidationError(
        `Incompatible checkpoint version ${version}. Current supported version is ${CURRENT_CHECKPOINT_VERSION}.`
      );
    }
    if (version < 1) {
      throw new CheckpointValidationError(`Invalid checkpoint version: ${version}`);
    }

    // Ensure plan is valid object
    let plan = snapshot.plan;
    if (!plan || typeof plan !== 'object') {
      plan = {
        goal: snapshot.userPrompt || 'Autonomous task',
        userIntent: 'MULTI_STEP_RESEARCH',
        quantity: 5,
        entities: [],
        requestedFields: [],
        toolsRequired: [],
        constraints: [],
        sourcePreference: 'auto',
        discoveryStrategy: 'search_first',
        browserRequired: false,
        expectedOutput: 'Summary report',
        completionCriteria: snapshot.remainingWork || '',
        nextAction: {
          type: 'execute_tool',
          toolName: 'google_search',
          toolArgs: { query: snapshot.userPrompt || '' },
          rationale: 'Resume task with search',
          expectedObservation: 'Search results',
        },
      };
    }

    return {
      taskId: snapshot.taskId,
      userId: snapshot.userId,
      chatId: snapshot.chatId,
      userPrompt: snapshot.userPrompt || '',
      conversationHistory: Array.isArray(snapshot.conversationHistory)
        ? JSON.parse(JSON.stringify(snapshot.conversationHistory))
        : [],
      plan: JSON.parse(JSON.stringify(plan)),
      currentIteration: typeof snapshot.currentIteration === 'number' ? snapshot.currentIteration : 0,
      maxIterations: typeof snapshot.maxIterations === 'number' ? snapshot.maxIterations : 15,
      visitedUrls: new Set(Array.isArray(snapshot.visitedUrls) ? snapshot.visitedUrls : []),
      visitedDomains: new Set(Array.isArray(snapshot.visitedDomains) ? snapshot.visitedDomains : []),
      discoveredCandidates: Array.isArray(snapshot.discoveredCandidates)
        ? JSON.parse(JSON.stringify(snapshot.discoveredCandidates))
        : [],
      extractedFacts: Array.isArray(snapshot.extractedFacts)
        ? JSON.parse(JSON.stringify(snapshot.extractedFacts))
        : [],
      evidence: Array.isArray(snapshot.evidence)
        ? JSON.parse(JSON.stringify(snapshot.evidence))
        : [],
      verifiedEntities: Array.isArray(snapshot.verifiedEntities)
        ? JSON.parse(JSON.stringify(snapshot.verifiedEntities))
        : [],
      failedActions: Array.isArray(snapshot.failedActions)
        ? JSON.parse(JSON.stringify(snapshot.failedActions))
        : [],
      observations: Array.isArray(snapshot.observations)
        ? JSON.parse(JSON.stringify(snapshot.observations))
        : [],
      executedActionIds: new Set(Array.isArray(snapshot.executedActionIds) ? snapshot.executedActionIds : []),
      pendingAction: snapshot.pendingAction ? JSON.parse(JSON.stringify(snapshot.pendingAction)) : undefined,
      status: snapshot.status || 'EXECUTING',
      replanCount: typeof snapshot.replanCount === 'number' ? snapshot.replanCount : 0,
      remainingWork: snapshot.remainingWork || plan.completionCriteria || '',
      finalResponse: snapshot.finalResponse,
    };
  }

  /**
   * Saves a checkpoint of the current task state.
   */
  public async saveCheckpoint(
    state: BrainTaskState,
    meta?: { lastProvider?: AIProviderId; lastModel?: string; chatId?: string }
  ): Promise<void> {
    const serialized = this.serializeBrainState(state, meta);
    await saveTaskCheckpoint({
      taskId: state.taskId,
      userId: state.userId || 'anonymous',
      chatId: state.chatId || meta?.chatId,
      state: serialized,
    });
  }

  /**
   * Retrieves an existing checkpoint for resuming task execution, verifying ownership.
   */
  public async getCheckpoint(
    taskId: string,
    userId?: string,
    chatId?: string
  ): Promise<SerializableTaskCheckpoint | null> {
    const targetUser = userId || 'anonymous';
    const record = await getTaskCheckpoint(taskId, targetUser);
    if (!record || !record.state) return null;

    const state = record.state as SerializableTaskCheckpoint;
    // Multi-tenant check: verify owner
    if (state.userId && state.userId !== targetUser) {
      console.warn(`[Checkpoint Security] Blocked cross-tenant access attempt: requested by ${targetUser}, owned by ${state.userId}`);
      return null;
    }

    if (chatId && state.chatId && state.chatId !== chatId) {
      console.warn(`[Checkpoint Isolation] Checkpoint belongs to chatId ${state.chatId}, not requested chatId ${chatId}`);
      return null;
    }

    return state;
  }

  /**
   * Deletes a checkpoint upon successful completion.
   */
  public async removeCheckpoint(taskId: string, userId?: string): Promise<void> {
    await deleteTaskCheckpoint(taskId, userId || 'anonymous');
  }

  /**
   * Filters candidate targets against visited URLs and verified entities to guarantee anti-duplication.
   */
  public filterUnvisitedCandidates(
    candidates: CandidateTarget[],
    visitedUrls: Set<string> | string[],
    verifiedEntities: any[] = []
  ): CandidateTarget[] {
    const visitedSet = visitedUrls instanceof Set ? visitedUrls : new Set(visitedUrls);
    const verifiedNames = new Set(verifiedEntities.map((e) => (e.name || e.entityName || '').toLowerCase().trim()));

    return candidates.filter((c) => {
      if (!c.url || visitedSet.has(c.url)) return false;
      if (c.title && verifiedNames.has(c.title.toLowerCase().trim())) return false;
      return true;
    });
  }
}

export const taskCheckpointManager = new TaskCheckpointManager();
