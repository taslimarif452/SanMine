export type ThemeMode = 'dark' | 'light';

export type AIProviderId =
  | 'openai'
  | 'google'
  | 'openrouter'
  | 'anthropic'
  | 'xai'
  | 'deepseek'
  | 'huggingface'
  | 'ollama';

export type BusinessSearchProviderId = 'web_research' | 'none';

export interface BusinessSearchProviderInfo {
  id: BusinessSearchProviderId;
  name: string;
  badge: string;
  description: string;
  requiresKey: boolean;
  isConfigured: boolean;
  maskedApiKey?: string;
  helpUrl: string;
  helpText: string;
  keyPlaceholder: string;
}

export type AgentStatus =
  | 'idle'
  | 'thinking'
  | 'running_tool'
  | 'responding'
  | 'completed'
  | 'error';

export type TaskStatus = 'idle' | 'planning' | 'running' | 'completed' | 'stopped' | 'error';

export type ToolEventType =
  | 'task.started'
  | 'message.start'
  | 'message.delta'
  | 'message.completed'
  | 'tool.started'
  | 'tool.progress'
  | 'tool.completed'
  | 'tool.failed'
  | 'task.completed'
  | 'task.failed'
  | 'error';

export interface ProviderCapabilities {
  streaming: boolean;
  toolCalling: boolean;
  vision: boolean;
}

export interface ConfiguredModel {
  provider: AIProviderId;
  modelId: string;
  id: string;
  displayName: string;
  name: string;
  free?: boolean;
  isFree?: boolean;
  configuredAt?: string;
}

export interface ProviderInfo {
  id: AIProviderId;
  name: string;
  description: string;
  defaultModel: string;
  isConfigured: boolean;
  configured?: boolean;
  maskedApiKey: string;
  selectedModel?: string;
  configuredModel?: {
    id: string;
    name: string;
    displayName?: string;
    isFree?: boolean;
  };
  configuredModels?: ConfiguredModel[];
  requiresApiKey: boolean;
  capabilities: ProviderCapabilities;
}

export interface ModelOption {
  id: string;
  provider: AIProviderId;
  name: string;
  description?: string;
  isFree?: boolean;
  contextLength?: number;
  capabilities?: ProviderCapabilities;
}

export interface SelectedModel {
  provider: AIProviderId;
  model: string;
}

export interface LiveBrowserState {
  sessionId?: string;
  mode?: 'live_browser' | 'http_fallback';
  status: 'idle' | 'navigating' | 'active' | 'closed' | 'error';
  url: string;
  title: string;
  isLoading?: boolean;
  screenshotBase64?: string;
  previewHtml?: string;
  pageText?: string;
  history?: Array<{ url: string; title: string; timestamp?: string | number }>;
  lastAction?: string;
  lastActionDetail?: string;
  extractedData?: any;
  error?: string;
}

export interface ExecutionEvent {
  type: string;
  tool?: string;
  stepId?: string;
  title?: string;
  status?: string;
  reason?: string;
  integration?: string;
  message?: string;
  detail?: string;
  content?: string;
  timestamp?: string;
  result?: any;
  code?: string;
  provider?: string;
  model?: string;
  sessionId?: string;
  mode?: 'live_browser' | 'http_fallback';
  url?: string;
  action?: string;
  screenshot?: string;
  data?: any;
  error?: string;
  browser?: Partial<LiveBrowserState>;
}

export interface ActivityStep {
  id: string;
  title: string;
  status: 'pending' | 'running' | 'completed' | 'warning' | 'error';
  detail?: string;
  timestamp?: string;
}

export interface TaskResult {
  title?: string;
  businessesFound?: number;
  websitesAnalyzed?: number;
  highQualityLeads?: number;
  contactEmailsFound?: number;
  proposalsGenerated?: number;
  proposalsSent?: number;
  duration?: string;
  summary?: string;
}

export interface TaskExecution {
  id: string;
  status: 'planning' | 'running' | 'completed' | 'error' | 'stopped';
  aiPersonalizationStatus?: 'completed' | 'unavailable' | 'not_requested';
  reason?: string;
  integration?: string;
  progress?: number;
  summary?: string;
  steps: ActivityStep[];
  result?: TaskResult;
  isExpanded?: boolean;
  browserSession?: LiveBrowserState;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  text?: string;
  timestamp: string;
  sender?: 'user' | 'agent';
  isError?: boolean;
  isStreaming?: boolean;
  provider?: AIProviderId;
  model?: string;
  executionEvents?: ExecutionEvent[];
  execution?: TaskExecution;
  result?: TaskResult;
  browserSession?: LiveBrowserState;
}

export interface ConversationThread {
  id: string;
  title: string;
  timestamp?: string;
  createdAt: string;
  updatedAt: string;
  group?: 'Today' | 'Yesterday' | 'Previous 7 days' | 'Older';
  messages: ChatMessage[];
  taskStatus?: TaskStatus;
  selectedModel?: SelectedModel;
  isCustomTitle?: boolean;
}

export interface AgentConfig {
  provider: AIProviderId;
  model: string;
  temperature: number;
  maxTokens: number;
  streaming: boolean;
  isConfigured: boolean;
  maskedApiKey: string;
  configuredProvidersCount?: number;
}

export interface GmailStatus {
  connected: boolean;
  configured: boolean;
  scope?: string;
  email?: string;
  updatedAt?: string;
  hasRefreshToken?: boolean;
}

export interface SmtpStatus {
  connected: boolean;
  email: string | null;
  provider: 'gmail_smtp';
  host?: string;
  port?: number;
  updatedAt?: string;
}

export type EmailDispatchProvider = 'oauth' | 'smtp' | 'auto';

export interface SendProposalParams {
  recipientEmail: string;
  subject: string;
  body: string;
  businessName?: string;
  provider?: 'oauth' | 'smtp';
}

export interface SendEmailResponse {
  success: boolean;
  messageId?: string;
  threadId?: string;
  message?: string;
  error?: string;
  provider?: 'gmail_api' | 'gmail_smtp';
}

