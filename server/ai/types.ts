export type AIProviderId =
  | 'openai'
  | 'google'
  | 'openrouter'
  | 'anthropic'
  | 'xai'
  | 'deepseek'
  | 'huggingface'
  | 'ollama';

export interface ProviderCapabilities {
  streaming: boolean;
  toolCalling: boolean;
  vision: boolean;
}

export interface ModelInfo {
  id: string;
  provider: AIProviderId;
  name: string;
  description?: string;
  isFree?: boolean;
  contextLength?: number;
  capabilities?: ProviderCapabilities;
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
  configured: boolean;
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

export interface SelectedModel {
  provider: AIProviderId;
  model: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  name?: string;
  tool_call_id?: string;
}

export interface ChatStreamOptions {
  apiKey?: string;
  conversationId?: string;
  taskId?: string;
  providerRequestId?: string;
  systemPrompt?: string;
  messages: Array<ChatMessage>;
  model: string;
  temperature?: number;
  maxTokens?: number;
  onEvent: (event: ChatEvent) => void;
  abortSignal?: AbortSignal;
}

export type StreamChatOptions = ChatStreamOptions;

export interface ChatEvent {
  type: string;
  content?: string;
  message?: string;
  model?: string;
  provider?: string;
  tool?: string;
  result?: any;
  code?: string;
  [key: string]: any;
}

export interface AIProvider {
  readonly id: AIProviderId;
  readonly name: string;
  readonly description: string;
  readonly defaultModel: string;
  readonly capabilities: ProviderCapabilities;

  isConfigured(apiKey?: string): boolean;

  testConnection(apiKey?: string, model?: string): Promise<{
    success: boolean;
    message?: string;
    error?: string;
    model?: string;
    sampleReply?: string;
  }>;

  listModels(apiKey?: string): Promise<ModelInfo[]>;

  streamChat(options: ChatStreamOptions): Promise<void>;
}
