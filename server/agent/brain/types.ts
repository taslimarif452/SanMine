/**
 * Universal Agent Brain Types
 *
 * Core interfaces for the LLM-driven Universal Agent Brain layer in SanMine Space.
 */

import { AIProviderId } from '../../ai/types.js';

export type UserIntentType =
  | 'DISCOVERY_AND_EXTRACTION'
  | 'WEBSITE_INSPECTION'
  | 'PROFILE_RESEARCH'
  | 'MULTI_STEP_RESEARCH'
  | 'SYSTEM_DIAGNOSTIC'
  | 'DIRECT_CHAT'
  | 'GENERAL_REASONING';

export type ActionDecisionType =
  | 'execute_tool'
  | 'replan'
  | 'complete'
  | 'ask_clarification'
  | 'report_unavailable';

export type SourceQualityType =
  | 'PRIMARY'
  | 'SECONDARY'
  | 'SEARCH_RESULT'
  | 'DIRECTORY'
  | 'MAP'
  | 'UNKNOWN';

export type ActionLifecycleState =
  | 'PLANNED'
  | 'PENDING'
  | 'EXECUTING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'INTERRUPTED';

export interface EntitySourceRecord {
  url: string;
  domain: string;
  title?: string;
  type: SourceQualityType;
  extractedFields: string[];
  evidenceQuotes: string[];
}

export interface EntityActionRecord {
  actionId: string;
  actionType: 'send_email' | 'generate_proposal' | 'browser_navigate' | 'search' | string;
  actionStatus: 'EMAIL_SENT' | 'EMAIL_FAILED' | 'PROPOSAL_GENERATED' | 'PROPOSAL_FAILED' | 'COMPLETED' | 'FAILED' | 'SUCCEEDED' | 'INTERRUPTED';
  lifecycleState?: ActionLifecycleState;
  executedAt: string;
  targetEntity: string;
  provider?: string;
  recipient?: string;
  subject?: string;
  messageId?: string;
  proposalId?: string;
  resultSummary?: string;
  errorReason?: string;
}

export interface BrainActionDecision {
  type: ActionDecisionType;
  toolName: string;
  toolArgs: Record<string, any>;
  rationale: string;
  expectedObservation: string;
  fallbackStrategy?: string;
  clarificationQuestion?: string;
  unavailableReason?: string;
}

export interface TrackedEntityState {
  id?: string;
  name: string;
  url?: string | null;
  website?: string | null;
  hasWebsite?: boolean;
  hasNoWebsiteVerified?: boolean;
  phone?: string;
  email?: string | null;
  emailStatus?: 'VERIFIED' | 'NOT_FOUND' | 'UNVERIFIED';
  emailSourceUrl?: string | null;
  emailEvidence?: string | null;
  emailConfidence?: number | 'high' | 'medium' | 'low';
  address?: string;
  rating?: number;
  reviewCount?: number;
  description?: string;
  services?: string;
  pricing?: string;
  websiteStatus?: 'VERIFIED_NO_WEBSITE' | 'WEBSITE_FOUND' | 'UNKNOWN' | string;
  websiteVerificationReason?: string;
  leadScore?: number;
  salesTier?: string;
  proposalMarkdown?: string;
  proposalSubject?: string;
  emailSent?: boolean;
  emailSendError?: string;
  status?:
    | 'DISCOVERED'
    | 'VERIFIED'
    | 'QUALIFIED'
    | 'PROCESSED'
    | 'SUCCESSFUL'
    | 'FAILED'
    | 'UNVERIFIED'
    | 'EXCLUDED'
    | 'CONTACT_FOUND'
    | 'PROPOSAL_GENERATED'
    | 'EMAIL_SENT'
    | 'REJECTED'
    | 'UNVERIFIABLE';
  pageInspected?: boolean;
  verificationStatus?: 'VERIFIED' | 'UNVERIFIED' | 'REJECTED' | 'PARTIAL';
  verificationReason?: string;
  rejectionReason?: string;
  verifiedAt?: string;
  sourceUrl?: string;
  sources?: EntitySourceRecord[];
  facts?: GroundedFact[];
  actionRecords?: EntityActionRecord[];
}

export interface BrainTaskPlan {
  goal: string;
  originalUserRequest?: string;
  userIntent: UserIntentType;
  entities: string[];
  requestedFields: string[];
  quantity: number;
  location?: string;
  constraints: string[];
  sourcePreference: 'google' | 'direct_website' | 'instagram' | 'linkedin' | 'twitter' | 'auto';
  discoveryStrategy: 'search_first' | 'direct_url' | 'multi_page_crawl' | 'direct_chat';
  browserRequired: boolean;
  toolsRequired: string[];
  expectedOutput: string;
  completionCriteria: string;
  requiredActions?: string[];
  externalActionsRequired?: boolean;
  emailActionsRequired?: boolean;
  proposalRequired?: boolean;
  noWebsiteRequired?: boolean;
  browserActionsRequired?: boolean;
  nextAction: BrainActionDecision;
  confidence?: number;
}

export interface GroundedFact {
  fact?: string;
  field: string;
  extractedValue: string;
  sourceUrl: string;
  sourceDomain?: string;
  sourceTitle?: string;
  pageTitle?: string; // backwards compatibility
  sourceType?: SourceQualityType;
  extractedAt?: string;
  timestamp?: string; // backwards compatibility
  confidence: number | 'high' | 'medium' | 'low';
  evidenceQuote?: string;
  evidenceText?: string; // backwards compatibility
  entityId?: string;
  entityName?: string;
  verified?: boolean;
  verificationReason?: string;
}

export interface CandidateTarget {
  url: string;
  title: string;
  snippet?: string;
  domain?: string;
  relevanceScore?: number;
  isInspected?: boolean;
  isDestination?: boolean;
  /** Search attempt that produced this URL (0 Tavily, 1 Serper, 2+ HTML). */
  discoveryAttempt?: number;
  sourceEngine?: string;
}

export interface BrainObservation {
  toolName: string;
  toolArgs: Record<string, any>;
  success: boolean;
  executionTimeMs: number;
  browserState?: {
    url: string;
    title: string;
    snippet: string;
    headings?: { h1?: string[]; h2?: string[]; h3?: string[] };
    links?: Array<{ href: string; text: string }>;
    screenshotAvailable?: boolean;
    screenshotBase64?: string;
    isLiveMode?: boolean;
    mode?: 'live_browser' | 'http_fallback';
    status?: string;
    error?: string;
  };
  searchState?: {
    query: string;
    candidateUrls: CandidateTarget[];
    totalResults: number;
  };
  extractedData?: Record<string, any>;
  extractedFacts: GroundedFact[];
  error?: string;
  timestamp: string;
}

export interface GroundedEvidence {
  fact: string;
  sourceUrl: string;
  quote: string;
  timestamp: string;
}

export interface TaskActionExecutionRecord {
  actionId: string;
  status: 'pending' | 'executing' | 'completed' | 'failed' | 'interrupted';
  lifecycleState?: ActionLifecycleState;
  toolName: string;
  toolArgs: Record<string, any>;
  startedAt: string;
  completedAt?: string;
  observation?: BrainObservation;
  error?: string;
}

export interface BrainTaskState {
  taskId: string;
  userId?: string;
  chatId?: string;
  userPrompt: string;
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
  plan: BrainTaskPlan;
  currentIteration: number;
  maxIterations: number;
  verifiedEntities: Array<TrackedEntityState>;
  visitedUrls: Set<string>;
  visitedDomains: Set<string>;
  discoveredCandidates: CandidateTarget[];
  observations: BrainObservation[];
  extractedFacts: GroundedFact[];
  evidence: GroundedEvidence[];
  failedActions: Array<{
    toolName: string;
    args: any;
    error: string;
    timestamp: string;
  }>;
  executedActionIds: Set<string>;
  actionRecords?: EntityActionRecord[];
  pendingAction?: TaskActionExecutionRecord;
  status: 'PLANNING' | 'EXECUTING' | 'EVALUATING' | 'REPLANNING' | 'COMPLETED' | 'WAITING_FOR_INPUT' | 'FAILED' | 'STOPPED';
  replanCount: number;
  remainingWork: string;
  finalResponse?: string;
  requiredQuantity?: number;
  requestedCount?: number;
  discoveredCount?: number;
  qualifiedCount?: number;
  processedCount?: number;
  successfulCount?: number;
  failedCount?: number;
  excludedCount?: number;
  unverifiedCount?: number;
  remainingCount?: number;
  verifiedCount?: number;
  contactedCount?: number;
  sentCount?: number;
  remainingQuantity?: number;
  /** Backend-owned completion accounting for bounded web discovery. */
  requestedQuantity?: number;
  verifiedQuantity?: number;
  remaining?: number;
  searchAttempts?: number;
  queriesUsed?: string[];
  autoSendProposals?: boolean;
  gmailConnected?: boolean;
  /**
   * Set to true when the engine paused after preparing proposals/emails and asked
   * the user whether to send them. The task waits for an explicit confirmation.
   */
  awaitingEmailConfirmation?: boolean;
  /**
   * Set to true once the user explicitly confirmed sending the prepared emails
   * (auto-send off path). Emails are only dispatched when this is true (or auto-send on).
   */
  emailConfirmationGranted?: boolean;
  /**
   * Set to true when the user explicitly declined to send the prepared emails,
   * so the engine stops asking and completes without dispatching.
   */
  emailConfirmationDeclined?: boolean;
  /**
   * Number of consecutive discovery searches that returned ZERO candidates.
   * Used to stop the agent loop honestly instead of re-querying forever and
   * inventing data. Reset as soon as any search returns candidates.
   */
  consecutiveEmptySearches?: number;
  /** True once discovery has been exhausted (zero hits and no candidates). */
  searchExhausted?: boolean;
}

export interface UniversalBrainRunOptions {
  taskId?: string;
  userId?: string;
  chatId?: string;
  userApiKey?: string;
  providerId: AIProviderId;
  model: string;
  prompt: string;
  conversationHistory?: Array<{ role: string; content: string }>;
  defaultLocation?: string;
  autoSendProposals?: boolean;
  temperature?: number;
  maxTokens?: number;
  maxIterations?: number;
  sendEvent: (event: any) => void;
  abortSignal?: AbortSignal;
}

export interface UniversalBrainRunResult {
  success: boolean;
  finalAnswer: string;
  plan: BrainTaskPlan;
  state: BrainTaskState;
  verifiedCount: number;
  totalFacts: number;
  sourcesVerifiedCount: number;
  completion?: {
    requestedQuantity: number;
    verifiedQuantity: number;
    remaining: number;
    searchAttempts: number;
    queriesUsed: string[];
    visitedUrls: string[];
  };
  requestedQuantity?: number;
  verifiedQuantity?: number;
  remaining?: number;
  searchAttempts?: number;
  queriesUsed?: string[];
  visitedUrls?: string[];
}
