/**
 * Universal Task Planner & Agent Intelligence Layer — Core Types
 *
 * Strongly typed representations for general-purpose reasoning,
 * dynamic decomposition, plan mutation, memory tracking, and verification.
 */

import { AIProviderId } from '../ai/types.js';

export type TaskStatus =
  | 'PENDING'
  | 'PLANNING'
  | 'EXECUTING'
  | 'EVALUATING'
  | 'REPLANNING'
  | 'WAITING_FOR_INPUT'
  | 'COMPLETED'
  | 'PARTIALLY_COMPLETED'
  | 'FAILED'
  | 'STOPPED';

export type SubtaskStatus =
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'PARTIAL'
  | 'FAILED'
  | 'SKIPPED'
  | 'RETRYING';

export type EvaluationOutcome =
  | 'SUCCESS'
  | 'PARTIAL_SUCCESS'
  | 'FAILED'
  | 'NO_PROGRESS'
  | 'NEEDS_REPLAN'
  | 'TASK_COMPLETE';

export type TaskIntentType =
  | 'DISCOVERY_AND_EXTRACTION'
  | 'URL_INSPECTION_AND_AUDIT'
  | 'DEEP_WEB_RESEARCH'
  | 'SOCIAL_PROFILE_RESEARCH'
  | 'PROPOSAL_SYNTHESIS'
  | 'MULTI_SOURCE_SYNTHESIS'
  | 'SYSTEM_DIAGNOSTIC'
  | 'DIRECT_CHAT'
  | 'GENERAL_TASK';

export interface TaskEntity {
  id: string;
  name: string;
  url?: string;
  type?: string;
  location?: string;
  extractedFields: Record<string, string | string[]>;
  verified: boolean;
  confidence: number;
  sourceCitations: string[];
}

export interface ExtractedFact {
  field: string;
  value: string;
  sourceUrl: string;
  pageTitle?: string;
  confidence: 'high' | 'medium' | 'low';
  evidenceText?: string;
  entityKey?: string;
  timestamp: string;
}

export interface TaskEvidenceItem {
  id: string;
  fact: string;
  field: string;
  value: string;
  sourceUrl: string;
  pageTitle?: string;
  quote: string;
  confidence: number;
  timestamp: string;
}

export interface Subtask {
  id: string;
  title: string;
  description: string;
  objective?: string;
  requiredTool?: string;
  preferredTools?: string[];
  fallbackTools?: string[];
  targetUrl?: string;
  searchQuery?: string;
  targetFields: string[];
  dependsOn?: string[];
  dependencies?: string[];
  expectedObservation?: string;
  completionCondition?: string;
  retryPolicy?: {
    maxRetries: number;
    backoffMs?: number;
  };
  evidenceRequirements?: string[];
  status: SubtaskStatus;
  retryCount: number;
  maxRetries: number;
  resultSummary?: string;
  error?: string;
}

export interface ExecutionPlan {
  id: string;
  version: number;
  goal: string;
  subtasks: Subtask[];
  activeSubtaskIndex: number;
  fallbackStrategies: string[];
  estimatedSteps: number;
  updatedAt: string;
}

export interface CompletionCriteria {
  requiredQuantity?: number;
  minimumVerifiedEntities?: number;
  requiredFields: string[];
  requirePublicVerification: boolean;
  minConfidence: number;
  maxIterations: number;
  allowPartial: boolean;
}

export interface Task {
  id: string;
  originalPrompt: string;
  normalizedObjective: string;
  intent: TaskIntentType;
  target?: string;
  entities: string[];
  source?: string;
  platforms: string[];
  location?: string;
  quantity?: number;
  requiredFields: string[];
  constraints: string[];
  accessRequirements: string[];
  needsBrowser?: boolean;
  followRelevantLinks?: boolean;
  preferredOutput: 'table' | 'proposals' | 'report' | 'list' | 'conversational';
  language: string;
  subtasks: Subtask[];
  executionPlan: ExecutionPlan;
  completionCriteria: CompletionCriteria;
  currentState: TaskState;
  status: TaskStatus;
  clarificationPrompt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaskState {
  currentIteration: number;
  activeSubtaskId?: string;
  currentUrl?: string;
  activeSearchQuery?: string;
  progressPercentage: number;
  lastOutcome?: EvaluationOutcome;
  totalToolsExecuted: number;
  totalAiCalls: number;
  isComplete: boolean;
}

export interface CandidateUrl {
  url: string;
  title: string;
  domain?: string;
  snippet?: string;
  position?: number;
  relevanceScore: number;
  relevance?: number;
  source: string;
  isOfficialWebsite?: boolean;
  isSocialProfile?: boolean;
  isDirectory?: boolean;
  discoveredAt: string;
}

export interface InternalLinkCandidate {
  text: string;
  href: string;
  fullUrl: string;
  semanticTarget?: string; // 'founder' | 'team' | 'pricing' | 'services' | 'contact' | 'about'
  priorityScore: number;
}

export interface PageSummary {
  url: string;
  title: string;
  httpStatus?: number;
  responseTimeMs?: number;
  contentSnippet: string;
  extractedEmails: string[];
  extractedPhones: string[];
  extractedFounders: string[];
  extractedPricing: string[];
  extractedServices: string[];
  internalLinks: Array<{ text: string; href: string; fullUrl: string }>;
  inspectedAt: string;
}

export interface FailedAction {
  action: string;
  tool: string;
  args: any;
  error: string;
  timestamp: string;
}

export interface SuccessfulAction {
  action: string;
  tool: string;
  args: any;
  summary: string;
  timestamp: string;
}

export interface ActionSelection {
  actionName: string;
  toolName: string;
  inputArgs: any;
  subtaskId?: string;
  rationale: string;
  expectedResult: string;
  fallbackStrategy?: string;
}

export interface PlannerObservation {
  action: string;
  tool: string;
  success: boolean;
  source: string;
  url?: string;
  pageTitle?: string;
  content?: string;
  extractedFacts: ExtractedFact[];
  discoveredUrls: string[];
  discoveredLinks: Array<{ text: string; href: string; fullUrl?: string }>;
  errors?: string;
  evidence: TaskEvidenceItem[];
  executionTimeMs: number;
  timestamp: string;
  rawResult?: any;
}

export interface TaskEvaluation {
  status: EvaluationOutcome;
  confidence: number;
  satisfiedRequirements: string[];
  missingRequirements: string[];
  completedFields: string[];
  verifiedFields: string[];
  candidateCount: number;
  remainingWork: number;
  targetQuantity: number;
  verifiedCount: number;
  goalProgress: number;
  progressPercentage: number;
  recommendation: string;
  shouldReplan: boolean;
  replanReason?: string;
}

export interface ReplanDecision {
  triggered: boolean;
  reason: string;
  actionTaken:
    | 'MODIFY_QUERY'
    | 'SWITCH_SOURCE'
    | 'FOLLOW_SECONDARY_LINK'
    | 'SWITCH_TOOL'
    | 'DISCARD_CANDIDATE_AND_SEARCH'
    | 'RETRY_WITH_BACKOFF'
    | 'CONCLUDE_PARTIAL';
  updatedPlan: ExecutionPlan;
  notes: string;
}

export interface UniversalPlannerOptions {
  taskId?: string;
  userRequestId?: string;
  userId?: string;
  userApiKey?: string;
  providerId: AIProviderId;
  model: string;
  messages: Array<{ role: string; content: string }>;
  defaultLocation?: string;
  autoSendProposals?: boolean;
  temperature?: number;
  maxTokens?: number;
  maxIterations?: number;
  sendEvent: (event: any) => void;
  abortSignal?: AbortSignal;
}
