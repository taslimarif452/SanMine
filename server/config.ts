import dotenv from 'dotenv';
import { aiRegistry } from './ai/registry.js';
import { AIProviderId, ProviderInfo, ModelInfo } from './ai/types.js';
import { loadPersistedData, savePersistedData } from './ai/storage.js';

dotenv.config();

export interface ServerAgentConfig {
  provider: AIProviderId;
  model: string;
  temperature: number;
  maxTokens: number;
  streaming: boolean;
  apiKey?: string;
}

export interface ClientAgentConfig {
  provider: AIProviderId;
  model: string;
  temperature: number;
  maxTokens: number;
  streaming: boolean;
  isConfigured: boolean;
  maskedApiKey: string;
  configuredProvidersCount: number;
}

// Global parameters
const persisted = loadPersistedData();
let globalParams = {
  temperature: persisted.globalParams?.temperature ?? 0.7,
  maxTokens: persisted.globalParams?.maxTokens ?? 4096,
  streaming: persisted.globalParams?.streaming ?? true,
};

export function getServerConfig() {
  const activeSelection = aiRegistry.getActiveSelection();
  const targetProviderId: AIProviderId = activeSelection?.provider || 'google';
  const provider = aiRegistry.get(targetProviderId);
  return {
    provider: targetProviderId,
    model: activeSelection?.model || provider?.defaultModel || '',
    temperature: globalParams.temperature,
    maxTokens: globalParams.maxTokens,
    streaming: globalParams.streaming,
    apiKey: '',
  };
}

export function maskApiKey(key: string): string {
  if (!key || typeof key !== 'string') return '';
  const trimmed = key.trim();
  if (trimmed.length <= 8) return '••••••••';
  const prefix = trimmed.slice(0, 7);
  const suffix = trimmed.slice(-4);
  return `${prefix}••••••••${suffix}`;
}

export function getClientConfig(): ClientAgentConfig {
  const activeSelection = aiRegistry.getActiveSelection();
  const configuredProviders = aiRegistry.getConfigured();
  const targetProviderId: AIProviderId = activeSelection?.provider || (configuredProviders[0]?.id || 'google');
  const activeProvider = aiRegistry.get(targetProviderId);

  const isConfigured = Boolean(activeProvider && activeProvider.isConfigured());

  return {
    provider: targetProviderId,
    model: activeSelection?.model || activeProvider?.defaultModel || '',
    temperature: globalParams.temperature,
    maxTokens: globalParams.maxTokens,
    streaming: globalParams.streaming,
    isConfigured,
    maskedApiKey: '',
    configuredProvidersCount: configuredProviders.length,
  };
}

export function updateServerConfig(updates: {
  provider?: AIProviderId;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  streaming?: boolean;
  apiKey?: string;
}): ClientAgentConfig {
  if (updates.temperature !== undefined) {
    globalParams.temperature = Math.max(0, Math.min(1, updates.temperature));
  }
  if (updates.maxTokens !== undefined) {
    globalParams.maxTokens = Math.max(128, Math.min(16384, updates.maxTokens));
  }
  if (updates.streaming !== undefined) {
    globalParams.streaming = Boolean(updates.streaming);
  }

  const activeSelection = aiRegistry.getActiveSelection();
  const targetProviderId = updates.provider || activeSelection?.provider || 'google';

  if (updates.model) {
    aiRegistry.setSelectedModel(targetProviderId, updates.model);
  }

  if (updates.provider) {
    const selectedModel = updates.model || aiRegistry.getSelectedModel(updates.provider) || aiRegistry.get(updates.provider)?.defaultModel || '';
    aiRegistry.setActiveSelection(updates.provider, selectedModel);
  }

  // Persist global parameters
  try {
    const currentPersisted = loadPersistedData();
    savePersistedData({
      ...currentPersisted,
      globalParams,
    });
  } catch (err) {
    console.warn('[Config] Failed to save global parameters:', err);
  }

  return getClientConfig();
}

export function removeProviderKey(providerId: AIProviderId): ClientAgentConfig {
  return getClientConfig();
}

