import { aiRegistry } from './registry.js';
import { ModelInfo, AIProviderId } from './types.js';
import { POPULAR_GEMINI_MODELS } from './gemini.js';
import { POPULAR_OPENAI_MODELS } from './openai.js';
import { POPULAR_OPENROUTER_MODELS } from './openrouter.js';
import { POPULAR_ANTHROPIC_MODELS } from './anthropic.js';
import { POPULAR_XAI_MODELS } from './xai.js';
import { POPULAR_DEEPSEEK_MODELS } from './deepseek.js';
import { POPULAR_HUGGINGFACE_MODELS } from './huggingface.js';
import { POPULAR_OLLAMA_MODELS } from './ollama.js';

export function getPopularModelsForProvider(providerId: AIProviderId): ModelInfo[] {
  switch (providerId) {
    case 'google':
      return POPULAR_GEMINI_MODELS;
    case 'openai':
      return POPULAR_OPENAI_MODELS;
    case 'openrouter':
      return POPULAR_OPENROUTER_MODELS;
    case 'anthropic':
      return POPULAR_ANTHROPIC_MODELS;
    case 'xai':
      return POPULAR_XAI_MODELS;
    case 'deepseek':
      return POPULAR_DEEPSEEK_MODELS;
    case 'huggingface':
      return POPULAR_HUGGINGFACE_MODELS;
    case 'ollama':
      return POPULAR_OLLAMA_MODELS;
    default:
      return [];
  }
}

let cachedModels: ModelInfo[] = [];
let lastCacheTime = 0;
const CACHE_TTL_MS = 60 * 1000; // 1 minute cache

export async function fetchAllConfiguredModels(forceRefresh = false): Promise<{
  models: ModelInfo[];
  errors: Partial<Record<AIProviderId, string>>;
}> {
  const configuredProviders = aiRegistry.getConfigured();
  if (configuredProviders.length === 0) {
    cachedModels = [];
    return { models: [], errors: {} };
  }

  const now = Date.now();
  if (!forceRefresh && cachedModels.length > 0 && now - lastCacheTime < CACHE_TTL_MS) {
    // Return cached models filtered only to currently configured providers
    const configuredSet = new Set(configuredProviders.map((p) => p.id));
    const validCached = cachedModels.filter((m) => configuredSet.has(m.provider));
    return { models: validCached, errors: {} };
  }

  const errors: Partial<Record<AIProviderId, string>> = {};
  const modelPromises = configuredProviders.map(async (provider) => {
    try {
      const models = await provider.listModels();
      return models;
    } catch (err: any) {
      console.warn(`[Models] Failed to list models for configured provider ${provider.id}:`, err.message);
      errors[provider.id] = err?.message || 'Unable to load models';
      return getPopularModelsForProvider(provider.id);
    }
  });

  const results = await Promise.all(modelPromises);
  const flattened = results.flat();

  cachedModels = flattened;
  lastCacheTime = now;

  return { models: cachedModels, errors };
}

export async function fetchAllModels(forceRefresh = false): Promise<ModelInfo[]> {
  const result = await fetchAllConfiguredModels(forceRefresh);
  return result.models;
}

export async function fetchModelsForProvider(
  providerId: AIProviderId,
  apiKey?: string
): Promise<ModelInfo[]> {
  const provider = aiRegistry.get(providerId);
  if (!provider) return [];
  const popular = getPopularModelsForProvider(providerId);
  if (!apiKey && !provider.isConfigured()) {
    return popular;
  }
  try {
    const models = await provider.listModels(apiKey);
    if (models && models.length > 0) return models;
    return popular;
  } catch (err) {
    return popular;
  }
}

