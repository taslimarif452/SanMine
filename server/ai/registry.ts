import { AIProvider, AIProviderId, ProviderInfo, ConfiguredModel } from './types.js';
import { OpenAIProvider } from './openai.js';
import { GeminiProvider } from './gemini.js';
import { OpenRouterProvider } from './openrouter.js';
import { AnthropicProvider } from './anthropic.js';
import { XAIProvider } from './xai.js';
import { DeepSeekProvider } from './deepseek.js';
import { HuggingFaceProvider } from './huggingface.js';
import { OllamaProvider } from './ollama.js';
import { loadPersistedData, savePersistedData } from './storage.js';

export function parseModelDetails(
  provider: AIProviderId,
  modelId: string,
  customName?: string,
  freeFlag?: boolean
): ConfiguredModel {
  const isFree = freeFlag !== undefined ? freeFlag : modelId.endsWith(':free') || modelId.includes('free') || provider === 'ollama';

  let displayName = customName?.trim();
  if (!displayName) {
    if (modelId === 'openrouter/free') displayName = 'OpenRouter Free Models (Auto)';
    else if (modelId === 'openai/gpt-oss-20b:free') displayName = 'GPT-OSS 20B (Free)';
    else if (modelId === 'meta-llama/llama-3.3-70b-instruct:free') displayName = 'Llama 3.3 70B';
    else if (modelId === 'deepseek/deepseek-r1:free') displayName = 'DeepSeek R1';
    else if (modelId === 'gemini-2.5-flash') displayName = 'Gemini 2.5 Flash';
    else if (modelId === 'gemini-2.5-pro') displayName = 'Gemini 2.5 Pro';
    else if (modelId === 'gemini-3.7-flash') displayName = 'Gemini 3.7 Flash';
    else if (modelId === 'gpt-4o') displayName = 'GPT-4o';
    else if (modelId === 'gpt-4o-mini') displayName = 'GPT-4o mini';
    else if (modelId === 'o3-mini') displayName = 'o3-mini';
    else if (modelId.startsWith('claude-3-7-sonnet')) displayName = 'Claude 3.7 Sonnet';
    else if (modelId.startsWith('claude-3-5-sonnet')) displayName = 'Claude 3.5 Sonnet';
    else if (modelId.startsWith('claude-3-5-haiku')) displayName = 'Claude 3.5 Haiku';
    else if (modelId.startsWith('claude-3-opus')) displayName = 'Claude 3 Opus';
    else if (modelId === 'grok-2-latest') displayName = 'Grok 2';
    else if (modelId === 'grok-2-vision-latest') displayName = 'Grok 2 Vision';
    else if (modelId === 'grok-beta') displayName = 'Grok Beta';
    else if (modelId === 'deepseek-chat') displayName = 'DeepSeek-V3';
    else if (modelId === 'deepseek-reasoner') displayName = 'DeepSeek-R1';
    else if (modelId === 'meta-llama/Llama-3.3-70B-Instruct') displayName = 'Llama 3.3 70B Instruct';
    else if (modelId === 'deepseek-ai/DeepSeek-R1') displayName = 'DeepSeek R1 (HF)';
    else if (modelId === 'llama3.2') displayName = 'Llama 3.2 (Local)';
    else if (modelId === 'llama3.3') displayName = 'Llama 3.3 (Local)';
    else if (modelId === 'deepseek-r1') displayName = 'DeepSeek R1 (Local)';
    else {
      let cleaned = modelId;
      if (cleaned.includes('/')) {
        cleaned = cleaned.split('/').slice(1).join('/');
      }
      cleaned = cleaned.replace(/:free$/i, '').replace(/[-_]/g, ' ');
      cleaned = cleaned
        .split(' ')
        .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : w))
        .join(' ');
      displayName = cleaned || modelId;
    }
  }

  return {
    provider,
    modelId,
    id: modelId,
    displayName,
    name: displayName,
    free: isFree,
    isFree,
    configuredAt: new Date().toISOString(),
  };
}

class ProviderRegistry {
  private providers: Map<AIProviderId, AIProvider> = new Map();
  private selectedModels: Map<AIProviderId, string> = new Map();
  private configuredModels: Map<AIProviderId, ConfiguredModel[]> = new Map();
  private activeSelection: { provider: AIProviderId; model: string } | null = null;

  constructor() {
    this.register(new OpenAIProvider());
    this.register(new GeminiProvider());
    this.register(new OpenRouterProvider());
    this.register(new AnthropicProvider());
    this.register(new XAIProvider());
    this.register(new DeepSeekProvider());
    this.register(new HuggingFaceProvider());
    this.register(new OllamaProvider());

    // Initialize default models
    this.selectedModels.set('openai', 'gpt-4o');
    this.selectedModels.set('google', 'gemini-2.5-flash');
    this.selectedModels.set('openrouter', 'openai/gpt-oss-20b:free');
    this.selectedModels.set('anthropic', 'claude-3-7-sonnet-20250219');
    this.selectedModels.set('xai', 'grok-2-latest');
    this.selectedModels.set('deepseek', 'deepseek-chat');
    this.selectedModels.set('huggingface', 'meta-llama/Llama-3.3-70B-Instruct');
    this.selectedModels.set('ollama', 'llama3.2');

    // Load persisted configurations from server storage
    this.loadPersistedState();
  }

  private loadPersistedState(): void {
    try {
      const persisted = loadPersistedData();
      const allIds = Array.from(this.providers.keys());

      // Restore persisted selected models
      if (persisted.selectedModels) {
        allIds.forEach((id) => {
          const model = persisted.selectedModels[id];
          if (typeof model === 'string' && model.trim().length > 0) {
            this.selectedModels.set(id, model.trim());
          }
        });
      }

      // Restore persisted configured models
      if (persisted.configuredModels) {
        allIds.forEach((id) => {
          const list = persisted.configuredModels?.[id];
          if (Array.isArray(list) && list.length > 0) {
            const valid = list.map((m) => parseModelDetails(id, m.modelId || m.id, m.name || m.displayName, m.isFree ?? m.free));
            this.configuredModels.set(id, valid);
          }
        });
      }

      // Ensure configured providers have at least their selected model in configuredModels
      this.getConfigured().forEach((prov) => {
        const existing = this.configuredModels.get(prov.id);
        if (!existing || existing.length === 0) {
          const sel = this.selectedModels.get(prov.id) || prov.defaultModel;
          this.configuredModels.set(prov.id, [parseModelDetails(prov.id, sel)]);
        }
      });

      // Restore persisted active selection if valid and configured
      if (
        persisted.activeSelection &&
        this.providers.has(persisted.activeSelection.provider) &&
        this.providers.get(persisted.activeSelection.provider)?.isConfigured() &&
        persisted.activeSelection.model
      ) {
        this.activeSelection = {
          provider: persisted.activeSelection.provider,
          model: persisted.activeSelection.model,
        };
      } else {
        this.autoSelectDefault();
      }
    } catch {
      this.autoSelectDefault();
    }
  }

  isConfigured(id: AIProviderId, apiKey?: string): boolean {
    const p = this.providers.get(id);
    return Boolean(p && p.isConfigured(apiKey));
  }

  private saveState(): void {
    try {
      const selectedModels: Partial<Record<AIProviderId, string>> = {};
      this.selectedModels.forEach((model, id) => {
        if (this.isConfigured(id) && model && model.trim()) {
          selectedModels[id] = model.trim();
        }
      });

      const configuredModels: Partial<Record<AIProviderId, ConfiguredModel[]>> = {};
      this.configuredModels.forEach((list, id) => {
        if (this.isConfigured(id) && list && list.length > 0) {
          configuredModels[id] = list;
        }
      });

      if (this.activeSelection && !this.isConfigured(this.activeSelection.provider)) {
        this.autoSelectDefault();
      }

      const existing = loadPersistedData();
      savePersistedData({
        ...existing,
        selectedModels,
        configuredModels,
        activeSelection: this.activeSelection,
      });
    } catch (err) {
      console.warn('[AI Registry] Failed to persist state:', err);
    }
  }

  private autoSelectDefault(): void {
    const configured = this.getConfigured();
    if (configured.length === 0) {
      this.activeSelection = null;
      return;
    }

    // Try current selection if still configured
    if (this.activeSelection && this.providers.get(this.activeSelection.provider)?.isConfigured()) {
      return;
    }

    const first = configured[0];
    const provModels = this.configuredModels.get(first.id) || [];
    const modelId = provModels[0]?.modelId || this.selectedModels.get(first.id) || first.defaultModel;

    this.activeSelection = {
      provider: first.id,
      model: modelId,
    };
  }

  register(provider: AIProvider): void {
    this.providers.set(provider.id, provider);
  }

  get(id: AIProviderId): AIProvider | undefined {
    return this.providers.get(id);
  }

  getAll(): AIProvider[] {
    return Array.from(this.providers.values());
  }

  getConfigured(apiKeyMap?: Partial<Record<AIProviderId, string>>): AIProvider[] {
    return this.getAll().filter((p) => p.isConfigured(apiKeyMap?.[p.id]));
  }

  setConfiguredModel(
    providerId: AIProviderId,
    modelId: string,
    customName?: string,
    isFree?: boolean
  ): ConfiguredModel {
    const model = parseModelDetails(providerId, modelId, customName, isFree);
    
    // Set as the configured model for this provider
    this.configuredModels.set(providerId, [model]);
    this.selectedModels.set(providerId, modelId);

    if (this.activeSelection?.provider === providerId) {
      this.activeSelection.model = modelId;
    } else if (!this.activeSelection || !this.providers.get(this.activeSelection.provider)?.isConfigured()) {
      this.activeSelection = { provider: providerId, model: modelId };
    }

    this.saveState();
    return model;
  }

  addConfiguredModel(
    providerId: AIProviderId,
    modelId: string,
    customName?: string,
    isFree?: boolean
  ): ConfiguredModel {
    const model = parseModelDetails(providerId, modelId, customName, isFree);
    const existing = this.configuredModels.get(providerId) || [];
    const filtered = existing.filter((m) => m.modelId !== modelId);
    filtered.push(model);
    this.configuredModels.set(providerId, filtered);
    this.selectedModels.set(providerId, modelId);

    if (this.activeSelection?.provider === providerId) {
      this.activeSelection.model = modelId;
    }

    this.saveState();
    return model;
  }

  removeConfiguredModel(providerId: AIProviderId, modelId: string): boolean {
    const existing = this.configuredModels.get(providerId) || [];
    const filtered = existing.filter((m) => m.modelId !== modelId);
    this.configuredModels.set(providerId, filtered);

    if (this.selectedModels.get(providerId) === modelId) {
      if (filtered.length > 0) {
        this.selectedModels.set(providerId, filtered[0].modelId);
      }
    }

    if (this.activeSelection?.provider === providerId && this.activeSelection.model === modelId) {
      if (filtered.length > 0) {
        this.activeSelection.model = filtered[0].modelId;
      } else {
        this.autoSelectDefault();
      }
    }

    this.saveState();
    return true;
  }

  setSelectedModel(providerId: AIProviderId, model: string): void {
    if (model && model.trim()) {
      this.selectedModels.set(providerId, model.trim());
      if (this.activeSelection?.provider === providerId) {
        this.activeSelection.model = model.trim();
      }
      this.saveState();
    }
  }

  getSelectedModel(providerId: AIProviderId): string {
    return this.selectedModels.get(providerId) || this.providers.get(providerId)?.defaultModel || '';
  }

  getConfiguredModels(): ConfiguredModel[] {
    const configuredProviders = this.getConfigured();
    const result: ConfiguredModel[] = [];

    configuredProviders.forEach((p) => {
      const models = this.configuredModels.get(p.id) || [];
      if (models.length > 0) {
        result.push(...models);
      } else {
        // Fallback: selected model
        const sel = this.getSelectedModel(p.id) || p.defaultModel;
        result.push(parseModelDetails(p.id, sel));
      }
    });

    return result;
  }

  setActiveSelection(provider: AIProviderId, model: string): boolean {
    const provInstance = this.providers.get(provider);
    if (!provInstance || !provInstance.isConfigured()) {
      return false;
    }
    this.activeSelection = { provider, model };
    this.selectedModels.set(provider, model);
    this.saveState();
    return true;
  }

  getActiveSelection(): { provider: AIProviderId; model: string } | null {
    if (this.activeSelection && this.providers.get(this.activeSelection.provider)?.isConfigured()) {
      return this.activeSelection;
    }
    this.autoSelectDefault();
    return this.activeSelection;
  }

  private maskKey(key: string): string {
    if (!key || typeof key !== 'string') return '';
    const trimmed = key.trim();
    if (trimmed.length <= 8) return '••••••••';
    const start = trimmed.slice(0, 7);
    const end = trimmed.slice(-4);
    return `${start}...${end}`;
  }

  getInfoList(providersStatus?: Record<string, { configured?: boolean; maskedKey?: string }>): ProviderInfo[] {
    return this.getAll().map((p) => {
      const isConfigured = providersStatus ? Boolean(providersStatus[p.id]?.configured) : p.isConfigured();
      const maskedApiKey = providersStatus?.[p.id]?.maskedKey || '';
      const models = isConfigured ? this.configuredModels.get(p.id) || [] : [];
      const primaryModel = isConfigured
        ? models[0] || parseModelDetails(p.id, this.getSelectedModel(p.id) || p.defaultModel)
        : undefined;

      return {
        id: p.id,
        name: p.name,
        description: p.description,
        defaultModel: p.defaultModel,
        isConfigured,
        configured: isConfigured,
        maskedApiKey,
        selectedModel: isConfigured ? (primaryModel ? primaryModel.modelId : this.getSelectedModel(p.id)) : undefined,
        configuredModel: primaryModel
          ? {
              id: primaryModel.modelId,
              name: primaryModel.name,
              displayName: primaryModel.displayName,
              isFree: primaryModel.isFree,
            }
          : undefined,
        configuredModels: isConfigured ? models : [],
        requiresApiKey: true,
        capabilities: p.capabilities,
      };
    });
  }
}

export const aiRegistry = new ProviderRegistry();


