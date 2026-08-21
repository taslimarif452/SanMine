import express from 'express';
import { aiRegistry, parseModelDetails } from './ai/registry.js';
import { fetchAllModels, fetchModelsForProvider, fetchAllConfiguredModels } from './ai/models.js';
import { POPULAR_GEMINI_MODELS } from './ai/gemini.js';
import { POPULAR_OPENAI_MODELS } from './ai/openai.js';
import { POPULAR_OPENROUTER_MODELS } from './ai/openrouter.js';
import { AIProviderId, ConfiguredModel } from './ai/types.js';
import { searchRegistry } from './search/registry.js';
import { BusinessSearchProviderId } from './search/types.js';
import { orchestrateAgentTask } from './agent.js';
import { gmailRouter } from './gmail/routes.js';
import { chatsRouter } from './chats/routes.js';
import { settingsRouter } from './settings/routes.js';
import { optionalAuth, requireAuth } from './auth/firebase.js';
import {
  initializeChatSchema,
  getChatById,
  createChat,
  saveMessage,
  updateChatTitle,
} from './db/chats.js';
import {
  initializeOutreachSchema,
  getUserPreferences,
  saveUserPreferences,
} from './db/outreach.js';
import {
  initializeSmtpSchema,
} from './db/smtp.js';
import {
  initializeAiKeysSchema,
  saveUserAiApiKey,
  getUserAiProvidersStatus,
  getDecryptedUserApiKey,
  deleteUserAiApiKey,
  ProviderConfigStatus,
  ProvidersStatusMap,
  ALL_AI_PROVIDERS,
} from './db/aiKeys.js';
import { logNeonDbStartupDiagnostic } from './db/neon.js';
import {
  getClientConfig,
  updateServerConfig,
  removeProviderKey,
} from './config.js';
import { resolveUserAiCredential } from './ai/credentialResolver.js';
import { browserSessionManager } from './browser/index.js';

export async function getUserConfiguredModelsList(userId?: string): Promise<{
  models: ConfiguredModel[];
  activeSelection: { provider: AIProviderId; model: string } | null;
  providers: ProvidersStatusMap;
}> {
  if (!userId) {
    const registryModels = aiRegistry.getConfiguredModels();
    const active = aiRegistry.getActiveSelection();
    const providersStatus = {} as ProvidersStatusMap;
    for (const p of ALL_AI_PROVIDERS) {
      providersStatus[p] = { configured: aiRegistry.isConfigured(p), maskedKey: '' };
    }
    return {
      models: registryModels,
      activeSelection: active,
      providers: providersStatus,
    };
  }

  const providersStatus = await getUserAiProvidersStatus(userId);
  const userPrefs = await getUserPreferences(userId);
  const models: ConfiguredModel[] = [];

  const defaultModels: Record<AIProviderId, string> = {
    google: 'gemini-3.7-flash',
    openai: 'gpt-4o',
    openrouter: 'openai/gpt-oss-20b:free',
    anthropic: 'claude-3-7-sonnet-20250219',
    xai: 'grok-2-latest',
    deepseek: 'deepseek-chat',
    huggingface: 'meta-llama/Llama-3.3-70B-Instruct',
    ollama: 'llama3.2',
  };

  const supportedProviders: AIProviderId[] = ALL_AI_PROVIDERS;

  // Populate ONLY user-configured models from PostgreSQL preferences and active state
  for (const prov of supportedProviders) {
    if (providersStatus[prov]?.configured) {
      const configuredForProv = userPrefs?.configuredModels?.[prov];
      const modelIds: string[] = [];

      if (Array.isArray(configuredForProv) && configuredForProv.length > 0) {
        modelIds.push(...configuredForProv);
      } else if (typeof configuredForProv === 'string' && configuredForProv.trim().length > 0) {
        modelIds.push(configuredForProv.trim());
      } else if (userPrefs?.activeProvider === prov && userPrefs?.activeModel) {
        modelIds.push(userPrefs.activeModel);
      } else {
        modelIds.push(defaultModels[prov]);
      }

      // Filter against duplicate model IDs and add only exact configured models
      const uniqueIds = Array.from(new Set(modelIds.filter(Boolean)));
      for (const mId of uniqueIds) {
        models.push(parseModelDetails(prov, mId));
      }
    }
  }

  // Determine active selection from PostgreSQL user preferences
  let activeProvider: AIProviderId | null = null;
  let activeModel: string | null = null;

  if (userPrefs?.activeProvider) {
    const rawProv = (userPrefs.activeProvider === 'gemini' ? 'google' : userPrefs.activeProvider) as AIProviderId;
    if (supportedProviders.includes(rawProv) && providersStatus[rawProv]?.configured) {
      activeProvider = rawProv;
      activeModel =
        userPrefs.activeModel ||
        models.find((m) => m.provider === activeProvider)?.modelId ||
        defaultModels[activeProvider];
    }
  }

  if (!activeProvider) {
    for (const prov of supportedProviders) {
      if (providersStatus[prov]?.configured) {
        activeProvider = prov;
        activeModel = models.find((m) => m.provider === prov)?.modelId || defaultModels[prov];
        break;
      }
    }
  }

  // Ensure active model is in the models list if activeProvider is configured
  if (activeProvider && activeModel) {
    const exists = models.some((m) => m.provider === activeProvider && m.modelId === activeModel);
    if (!exists) {
      models.push(parseModelDetails(activeProvider, activeModel));
    }
  }

  // Fallback to runtime registry only if user has no DB configured keys and server has registry models
  if (models.length === 0) {
    const fallback = aiRegistry.getConfiguredModels();
    if (fallback.length > 0) {
      return {
        models: fallback,
        activeSelection: aiRegistry.getActiveSelection(),
        providers: providersStatus,
      };
    }
  }

  return {
    models,
    activeSelection: activeProvider && activeModel ? { provider: activeProvider, model: activeModel } : null,
    providers: providersStatus,
  };
}

export function cleanChatTitleFromText(text: string): string {
  let trimmed = text.trim().replace(/^["']|["']$/g, '');
  if (trimmed.startsWith('/')) {
    trimmed = trimmed.slice(1).trim();
  }
  if (!trimmed) return 'New Chat';
  const firstSentence = trimmed.split(/[.\n?!]/)[0].trim();
  if (firstSentence.length <= 36) {
    return firstSentence;
  }
  const truncated = firstSentence.slice(0, 36);
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > 18) {
    return truncated.slice(0, lastSpace).trim();
  }
  return truncated.trim();
}

let schemasInitialized = false;
export function ensureDatabaseSchemasInitialized(): void {
  if (schemasInitialized) return;
  schemasInitialized = true;

  try {
    // Safe Neon database startup diagnostic
    logNeonDbStartupDiagnostic();

    // Initialize Neon PostgreSQL database schema asynchronously without blocking serverless function invocation
    initializeChatSchema().catch((err) => {
      console.warn('[Server Startup] Neon schema init notice:', err?.message || err);
    });
    initializeOutreachSchema().catch((err) => {
      console.warn('[Server Startup] Neon outreach schema init notice:', err?.message || err);
    });
    initializeSmtpSchema().catch((err) => {
      console.warn('[Server Startup] Neon SMTP schema init notice:', err?.message || err);
    });
    initializeAiKeysSchema().catch((err) => {
      console.warn('[Server Startup] Neon AI Keys schema init notice:', err?.message || err);
    });
  } catch (err: any) {
    console.warn('[Server Startup] Neon initialization notice:', err?.message || err);
  }
}

export function createExpressApp(): express.Application {
  const app = express();

  app.use(express.json());

  // Vercel serverless rewrite handler & path normalizer
  app.use((req, res, next) => {
    const forwardedUri =
      (req.headers['x-forwarded-uri'] as string) ||
      (req.headers['x-vercel-matched-path'] as string) ||
      (req.headers['x-matched-path'] as string);

    if (
      forwardedUri &&
      (req.url === '/api/index' ||
        req.url.startsWith('/api/index?') ||
        req.url === '/index' ||
        req.url.startsWith('/index?'))
    ) {
      req.url = forwardedUri;
    }
    next();
  });

  // Health check - dependency-light (Phase 13)
  app.get(['/api/health', '/health'], (req, res) => {
    res.json({
      ok: true,
      service: 'SanMine Space',
      status: 'healthy',
      runtime: 'vercel',
      timestamp: new Date().toISOString(),
    });
  });

  // Safe Router Debug Endpoint (Task 6)
  app.get(['/api/router-debug', '/router-debug'], (req, res) => {
    res.json({
      pathname: req.path,
      originalUrl: req.originalUrl,
      url: req.url,
      forwardedUri: (req.headers['x-forwarded-uri'] as string) || null,
      matchedPath: (req.headers['x-matched-path'] as string) || (req.headers['x-vercel-matched-path'] as string) || null,
      queryKeys: Object.keys(req.query || {}),
      timestamp: new Date().toISOString(),
    });
  });

  // Safe Production Diagnostics Endpoint (Phase 13)
  app.get(['/api/diagnostic', '/diagnostic'], (req, res) => {
    res.json({
      ok: true,
      runtime: 'vercel',
      nodeVersion: process.version,
      timestamp: new Date().toISOString(),
      env: {
        hasDatabaseUrl: !!(process.env.DATABASE_URL || process.env.NEON_DATABASE_URL),
        hasGoogleClientId: !!process.env.GOOGLE_CLIENT_ID,
        hasGoogleClientSecret: !!process.env.GOOGLE_CLIENT_SECRET,
        hasGoogleRedirectUri: !!process.env.GOOGLE_REDIRECT_URI,
        hasGeminiKey: !!process.env.GEMINI_API_KEY,
        hasOpenAiKey: !!process.env.OPENAI_API_KEY,
        hasOpenRouterKey: !!process.env.OPENROUTER_API_KEY,
        hasEncryptionKey: !!process.env.CREDENTIAL_ENCRYPTION_KEY,
        hasFirebaseAdminKey: !!process.env.FIREBASE_SERVICE_ACCOUNT_KEY,
        appUrl: process.env.APP_URL || 'https://sanmine.space',
      },
      diagnostics: {
        databaseConfigured: !!(process.env.DATABASE_URL || process.env.NEON_DATABASE_URL),
        firebaseConfigured: !!(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || process.env.FIREBASE_CONFIG),
        gmailConfigured: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
        geminiConfigured: !!process.env.GEMINI_API_KEY,
      },
    });
  });

  // ==========================================
  // MULTI-PROVIDER AI API ENDPOINTS
  // ==========================================

  // 1. List user AI provider configuration (Authenticated, PostgreSQL Source of Truth)
  app.get(['/api/ai/providers', '/ai/providers'], requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      const providersStatus = await getUserAiProvidersStatus(userId);
      const userPrefs = await getUserPreferences(userId);
      const activeProvider = userPrefs?.activeProvider
        ? (userPrefs.activeProvider === 'gemini' ? 'google' : userPrefs.activeProvider)
        : 'google';
      const defaultModels: Record<string, string> = {
        google: 'gemini-3.7-flash',
        openai: 'gpt-4o',
        openrouter: 'openai/gpt-oss-20b:free',
        anthropic: 'claude-3-7-sonnet-20250219',
        xai: 'grok-2-latest',
        deepseek: 'deepseek-chat',
        huggingface: 'meta-llama/Llama-3.3-70B-Instruct',
        ollama: 'llama3.2',
      };
      const activeModel = userPrefs?.activeModel || defaultModels[activeProvider] || 'gemini-3.7-flash';

      return res.json({
        ok: true,
        providers: providersStatus,
        activeProvider,
        activeModel,
      });
    } catch (error: any) {
      console.error('[AI Providers GET Error]:', error.message);
      const status = error.code === 'CONFIGURATION_ERROR' ? 503 : error.code === 'DATABASE_ERROR' ? 503 : 500;
      return res.status(status).json({
        ok: false,
        error: error.message || 'Failed to retrieve provider configuration',
        code: error.code || 'DATABASE_ERROR',
      });
    }
  });

  // 2. Save & set active AI provider API key (Authenticated, AES-256-GCM encrypted, PostgreSQL persistence)
  app.post(['/api/ai/providers', '/ai/providers'], requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      const { provider, apiKey, model } = req.body || {};

      const validProviders: AIProviderId[] = ALL_AI_PROVIDERS;
      if (!provider || !validProviders.includes(provider as AIProviderId)) {
        return res.status(400).json({
          ok: false,
          error: `Invalid provider: must be one of ${ALL_AI_PROVIDERS.join(', ')}`,
          code: 'INVALID_PROVIDER',
        });
      }

      if (typeof apiKey !== 'string' || !apiKey.trim()) {
        return res.status(400).json({
          ok: false,
          error: 'API key cannot be empty',
          code: 'INVALID_API_KEY',
        });
      }

      const trimmedKey = apiKey.trim();
      const targetProvider = provider as AIProviderId;

      // 1. Encrypt and persist key in PostgreSQL
      const { maskedKey } = await saveUserAiApiKey(userId, targetProvider, trimmedKey);

      // 2. Persist active provider and model preference in PostgreSQL
      const defaultModels: Record<AIProviderId, string> = {
        google: 'gemini-3.7-flash',
        openai: 'gpt-4o',
        openrouter: 'openai/gpt-oss-20b:free',
        anthropic: 'claude-3-7-sonnet-20250219',
        xai: 'grok-2-latest',
        deepseek: 'deepseek-chat',
        huggingface: 'meta-llama/Llama-3.3-70B-Instruct',
        ollama: 'llama3.2',
      };
      const userPrefs = await getUserPreferences(userId);
      const chosenModel =
        (typeof model === 'string' && model.trim().length > 0 ? model.trim() : undefined) ||
        (userPrefs?.activeProvider === targetProvider && userPrefs?.activeModel ? userPrefs.activeModel : undefined) ||
        defaultModels[targetProvider];

      const existingConfiguredModels = userPrefs?.configuredModels || {};
      const updatedConfiguredModels: Record<string, string[] | string> = {
        ...existingConfiguredModels,
        [targetProvider]: [chosenModel],
      };

      await saveUserPreferences(userId, {
        activeProvider: targetProvider,
        activeModel: chosenModel,
        configuredModels: updatedConfiguredModels,
      });

      // 3. Update active model selection in local registry metadata
      aiRegistry.setConfiguredModel(targetProvider, chosenModel);
      aiRegistry.setActiveSelection(targetProvider, chosenModel);

      // 4. Return safe metadata ONLY (never return the plaintext key)
      return res.json({
        ok: true,
        provider: targetProvider,
        configured: true,
        maskedKey,
        activeProvider: targetProvider,
        activeModel: chosenModel,
      });
    } catch (err: any) {
      console.error('[AI Providers POST Error]:', err.message);
      const status =
        err.code === 'CONFIGURATION_ERROR' ? 503 :
        err.code === 'DATABASE_ERROR' ? 503 :
        err.code === 'INVALID_PROVIDER' ? 400 :
        err.code === 'INVALID_API_KEY' ? 400 :
        500;

      return res.status(status).json({
        ok: false,
        error: err.message || 'Failed to save provider API key',
        code: err.code || 'DATABASE_ERROR',
      });
    }
  });

  // 1a2. Delete Provider API Key from PostgreSQL and In-Memory Cache
  app.delete(['/api/ai/providers/:provider', '/ai/providers/:provider'], optionalAuth, async (req, res) => {
    try {
      const providerParam = req.params.provider?.toLowerCase() as AIProviderId;
      const provider = providerParam || (req.body?.provider?.toLowerCase() as AIProviderId);

      if (!provider || !ALL_AI_PROVIDERS.includes(provider)) {
        return res.status(400).json({
          ok: false,
          error: `Invalid provider "${provider}". Must be one of: ${ALL_AI_PROVIDERS.join(', ')}`,
        });
      }

      const userId = req.user?.id;
      if (userId) {
        await deleteUserAiApiKey(userId, provider);
      } else {
        // Only if unauthenticated/anonymous in dev mode, clear server storage fallback
        removeProviderKey(provider);
      }

      return res.json({
        ok: true,
        success: true,
        message: `API key removed for ${provider}`,
        provider,
      });
    } catch (err: any) {
      console.error('[AI Provider Key Delete Error]:', err.message);
      return res.status(500).json({
        ok: false,
        error: err.message || 'Failed to remove provider API key',
      });
    }
  });

  app.delete(['/api/ai/providers', '/ai/providers'], optionalAuth, async (req, res) => {
    try {
      const provider = (req.body?.provider || req.query?.provider)?.toLowerCase() as AIProviderId;
      if (!provider || !ALL_AI_PROVIDERS.includes(provider)) {
        return res.status(400).json({
          ok: false,
          error: `Provider name is required. Must be one of: ${ALL_AI_PROVIDERS.join(', ')}`,
        });
      }

      const userId = req.user?.id;
      if (userId) {
        await deleteUserAiApiKey(userId, provider);
      } else {
        removeProviderKey(provider);
      }

      return res.json({
        ok: true,
        success: true,
        message: `API key removed for ${provider}`,
        provider,
      });
    } catch (err: any) {
      console.error('[AI Provider Key Delete Error]:', err.message);
      return res.status(500).json({
        ok: false,
        error: err.message || 'Failed to remove provider API key',
      });
    }
  });

  // 1b. Get only user-configured models for Chat Model Selector (Authenticated PostgreSQL Source of Truth)
  app.get(['/api/ai/configured-models', '/ai/configured-models'], optionalAuth, async (req, res) => {
    try {
      const result = await getUserConfiguredModelsList(req.user?.id);
      res.json({
        ok: true,
        models: result.models,
        activeSelection: result.activeSelection,
        providers: result.providers,
      });
    } catch (error: any) {
      console.error('[Configured Models GET Error]:', error.message);
      res.status(500).json({ ok: false, error: error.message || 'Failed to fetch configured models', models: [] });
    }
  });

  // 2. List models across all providers or a specific provider
  app.get(['/api/ai/models', '/ai/models'], async (req, res) => {
    try {
      const providerParam = req.query.provider as AIProviderId | undefined;
      const refreshParam = req.query.refresh === 'true';

      if (providerParam) {
        const provider = aiRegistry.get(providerParam);
        if (!provider) {
          return res.status(404).json({ models: [], error: `Provider "${providerParam}" not found.` });
        }
        try {
          const models = await fetchModelsForProvider(providerParam);
          return res.json({ models, success: true });
        } catch (err: any) {
          return res.json({ models: [], error: err?.message || 'Unable to load models', discoveryFailed: true });
        }
      }

      const { models, errors } = await fetchAllConfiguredModels(refreshParam);
      res.json({ models, errors });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to fetch models' });
    }
  });

  // 6. Set active model selection (Persists to PostgreSQL preferences)
  app.post(['/api/ai/select-model', '/ai/select-model'], optionalAuth, async (req, res) => {
    try {
      const { provider, model } = req.body || {};
      if (!provider || !model) {
        return res.status(400).json({ ok: false, error: 'Provider and model are required' });
      }

      const canonicalProvider = (provider === 'gemini' ? 'google' : provider) as AIProviderId;
      const provInstance = aiRegistry.get(canonicalProvider);
      if (!provInstance) {
        return res.status(400).json({
          ok: false,
          error: `Provider "${provider}" is not recognized.`,
        });
      }

      aiRegistry.setConfiguredModel(canonicalProvider, model);
      aiRegistry.setActiveSelection(canonicalProvider, model);

      if (req.user?.id) {
        try {
          const userPrefs = await getUserPreferences(req.user.id);
          const existingConfiguredModels = userPrefs?.configuredModels || {};
          const existingForProv = existingConfiguredModels[canonicalProvider];

          let provModels: string[];
          if (Array.isArray(existingForProv)) {
            provModels = existingForProv.includes(model) ? existingForProv : [...existingForProv, model];
          } else if (typeof existingForProv === 'string') {
            provModels = existingForProv === model ? [existingForProv] : [existingForProv, model];
          } else {
            provModels = [model];
          }

          await saveUserPreferences(req.user.id, {
            activeProvider: canonicalProvider,
            activeModel: model,
            configuredModels: {
              ...existingConfiguredModels,
              [canonicalProvider]: provModels,
            },
          });
        } catch (err: any) {
          console.warn('[Neon DB] Error saving active model in preferences:', err.message);
        }
      }

      res.json({
        ok: true,
        success: true,
        activeSelection: { provider: canonicalProvider, model },
      });
    } catch (error: any) {
      res.status(500).json({ ok: false, error: error.message || 'Failed to set active selection' });
    }
  });

  // ==========================================
  // BUSINESS SEARCH PROVIDERS API ENDPOINTS (SERVER-OWNED)
  // =======================================================

  // List Business Search Provider status (Safe public info, no secrets)
  app.get(['/api/search/providers', '/search/providers'], optionalAuth, (req, res) => {
    try {
      const providers = searchRegistry.getInfoList();
      const activeProviderId = searchRegistry.getActiveProviderId();
      const isConfigured = searchRegistry.isConfigured();

      res.json({
        managedBySanmine: true,
        isConfigured,
        providers,
        activeProviderId,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to get search provider status' });
    }
  });

  // Business Search status endpoint
  app.get(['/api/search/status', '/search/status'], optionalAuth, (req, res) => {
    res.json({
      managedBySanmine: true,
      isConfigured: searchRegistry.isConfigured(),
      activeProviderId: searchRegistry.getActiveProviderId(),
    });
  });

  // Disallow user modification of server search keys
  app.post(['/api/search/providers/:providerId', '/search/providers/:providerId'], optionalAuth, (req, res) => {
    return res.status(400).json({
      error: 'Business Search is server-owned and managed by SanMine Space. API keys cannot be set via client requests.',
    });
  });

  // Disallow user deletion of server search keys
  app.delete(['/api/search/providers/:providerId', '/search/providers/:providerId'], optionalAuth, (req, res) => {
    return res.status(400).json({
      error: 'Business Search is server-owned and managed by SanMine Space.',
    });
  });

  // Test search provider connection (Server-side verification)
  app.post(['/api/search/providers/:providerId/test', '/search/providers/:providerId/test'], async (req, res) => {
    try {
      const providerId = req.params.providerId as BusinessSearchProviderId;
      const provider = searchRegistry.get(providerId);
      if (!provider) {
        return res.status(404).json({ success: false, error: `Search provider "${providerId}" not found.` });
      }

      const testResult = await provider.testConnection();
      res.json(testResult);
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Search provider test failed.',
      });
    }
  });

  // Select active search provider
  app.post(['/api/search/select', '/search/select'], (req, res) => {
    res.json({
      success: true,
      activeProviderId: searchRegistry.getActiveProviderId(),
      providers: searchRegistry.getInfoList(),
    });
  });

  // ==========================================
  // UNIFIED STREAMING CHAT ENDPOINT
  // ==========================================
  const handleChatStream = async (req: express.Request, res: express.Response) => {
    const {
      messages,
      provider: reqProvider,
      model: reqModel,
      temperature,
      maxTokens,
      chatId,
      title,
      defaultLocation,
      autoSendProposals,
    } = req.body || {};

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Messages array is required' });
    }

    // Determine target provider and model
    let targetProviderId: AIProviderId | undefined = reqProvider;
    let targetModel: string | undefined = reqModel;

    // If provider is not explicitly passed, infer from model or active selection
    if (!targetProviderId) {
      if (targetModel) {
        if (targetModel.startsWith('gemini-')) {
          targetProviderId = 'google';
        } else if (targetModel.startsWith('gpt-') || targetModel.startsWith('o1') || targetModel.startsWith('o3') || targetModel.startsWith('chatgpt-')) {
          targetProviderId = 'openai';
        } else if (targetModel.startsWith('claude-')) {
          targetProviderId = 'anthropic';
        } else if (targetModel.startsWith('grok-')) {
          targetProviderId = 'xai';
        } else if (targetModel.startsWith('deepseek-')) {
          targetProviderId = 'deepseek';
        } else if (
          targetModel.startsWith('meta-llama/') ||
          targetModel.startsWith('Qwen/') ||
          targetModel.startsWith('mistralai/')
        ) {
          targetProviderId = 'huggingface';
        } else if (
          targetModel.startsWith('llama') ||
          targetModel.startsWith('mistral') ||
          targetModel.startsWith('qwen') ||
          targetModel.startsWith('gemma') ||
          targetModel.startsWith('phi')
        ) {
          targetProviderId = 'ollama';
        } else if (targetModel.includes('/')) {
          targetProviderId = 'openrouter';
        }
      }
    }

    if (!targetProviderId) {
      const active = aiRegistry.getActiveSelection();
      if (active) {
        targetProviderId = active.provider;
        if (!targetModel) targetModel = active.model;
      }
    }

    if (!targetProviderId) {
      return res.status(400).json({
        type: 'provider_error',
        error: 'No AI providers configured. Add an API key in Settings.',
      });
    }

    const providerInstance = aiRegistry.get(targetProviderId);

    if (!providerInstance) {
      return res.status(400).json({
        type: 'provider_error',
        error: `Requested provider "${targetProviderId}" is not recognized.`,
      });
    }

    const authUser = req.user;
    const effectiveApiKey = await resolveUserAiCredential({
      userId: authUser?.id,
      providerId: targetProviderId,
    });

    if (!effectiveApiKey && !providerInstance.isConfigured()) {
      return res.status(400).json({
        type: 'authentication_error',
        provider: targetProviderId,
        error: `${providerInstance.name} is not configured. Add an API key in Settings.`,
      });
    }

    if (!targetModel) {
      targetModel = aiRegistry.getSelectedModel(targetProviderId) || providerInstance.defaultModel;
    }

    // Diagnostic request tracking
    const userRequestId = `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

    // Database persistence setup for authenticated users
    let activeChatId = chatId;
    const lastUserMsg = messages[messages.length - 1];

    if (authUser && lastUserMsg && lastUserMsg.role === 'user') {
      try {
        if (activeChatId) {
          const existingChat = await getChatById(activeChatId, authUser.id);
          if (!existingChat) {
            const newChat = await createChat({
              userId: authUser.id,
              title: typeof title === 'string' && title !== 'New Chat' ? title : cleanChatTitleFromText(lastUserMsg.content),
              id: activeChatId,
            });
            activeChatId = newChat.id;
          }
        } else {
          const newChat = await createChat({
            userId: authUser.id,
            title: cleanChatTitleFromText(lastUserMsg.content),
          });
          activeChatId = newChat.id;
        }

        // Save user message immediately to Neon PostgreSQL
        await saveMessage({
          chatId: activeChatId,
          userId: authUser.id,
          role: 'user',
          content: lastUserMsg.content,
          metadata: {
            provider: targetProviderId,
            model: targetModel,
          },
        });
        console.log(`[MESSAGE SAVED] chatId=${activeChatId} role=user`);
      } catch (dbErr: any) {
        console.warn('[Neon DB] Pre-stream save user message warning:', dbErr.message);
      }
    }

    // Set up SSE headers (with Vercel/proxy anti-buffering)
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    let accumulatedAssistantText = '';
    const executionEvents: any[] = [];
    let finalTaskResult: any = null;
    let streamFailed = false;

    const sendEvent = (data: any) => {
      // Intercept and accumulate streaming assistant response safely
      if (data && typeof data === 'object') {
        if (data.type === 'message.delta' && typeof data.content === 'string') {
          accumulatedAssistantText += data.content;
        } else if (data.type === 'message.completed' && typeof data.content === 'string') {
          accumulatedAssistantText = data.content;
        } else if (data.type === 'task.completed') {
          if (data.result) finalTaskResult = data.result;
        } else if (data.type === 'error' || data.type === 'task.failed') {
          streamFailed = true;
        }
        if (data.type?.startsWith('tool.') || data.type?.startsWith('task.')) {
          executionEvents.push(data);
        }
      }
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    const abortController = new AbortController();

    // Only abort if client disconnects before the response has finished
    res.on('close', () => {
      if (!res.writableEnded) {
        abortController.abort();
      }
    });

    try {
      await orchestrateAgentTask({
        userRequestId,
        chatId: activeChatId,
        userId: authUser?.id,
        userApiKey: effectiveApiKey,
        defaultLocation,
        autoSendProposals,
        messages,
        providerId: targetProviderId,
        model: targetModel,
        temperature,
        maxTokens,
        sendEvent,
        abortSignal: abortController.signal,
      });

      // Save the completed assistant message to Neon PostgreSQL upon successful stream
      if (authUser && activeChatId && !streamFailed && accumulatedAssistantText.trim()) {
        try {
          await saveMessage({
            chatId: activeChatId,
            userId: authUser.id,
            role: 'assistant',
            content: accumulatedAssistantText,
            metadata: {
              provider: targetProviderId,
              model: targetModel,
              taskResult: finalTaskResult,
              executionEvents: executionEvents.slice(0, 50),
            },
          });
          console.log(`[MESSAGE SAVED] chatId=${activeChatId} role=assistant`);

          // If chat title was default, auto-update with derived title
          const curChat = await getChatById(activeChatId, authUser.id);
          if (curChat && (curChat.title === 'New Chat' || curChat.title === 'New Session') && lastUserMsg) {
            const derivedTitle = cleanChatTitleFromText(lastUserMsg.content);
            if (derivedTitle) {
              await updateChatTitle(activeChatId, authUser.id, derivedTitle);
            }
          }
        } catch (dbSaveErr: any) {
          console.warn('[Neon DB] Post-stream save assistant message warning:', dbSaveErr.message);
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error(`[AI ERROR] requestId=${userRequestId} provider=${targetProviderId}:`, err.message);
        sendEvent({
          type: 'error',
          message: err.message || `Streaming error from ${providerInstance.name}`,
          provider: targetProviderId,
          model: targetModel,
          code: 'STREAM_ERROR',
        });
      }
    } finally {
      res.write('data: [DONE]\n\n');
      res.end();
    }
  };

  app.post(['/api/ai/chat', '/ai/chat', '/api/agent/chat', '/agent/chat'], optionalAuth, handleChatStream);

  // ==========================================
  // CHATS & MESSAGES REST API (NEON POSTGRESQL)
  // ==========================================
  app.use(['/api/chats', '/chats'], chatsRouter);

  // ==========================================
  // SETTINGS & USER ENCRYPTED API KEYS
  // ==========================================
  app.use(['/api/settings', '/settings'], settingsRouter);

  // ==========================================
  // BACKWARD COMPATIBILITY ENDPOINTS
  // ==========================================
  app.get(['/api/agent/config', '/agent/config'], (req, res) => {
    try {
      const config = getClientConfig();
      res.json(config);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to get configuration' });
    }
  });

  app.post(['/api/agent/config', '/agent/config'], (req, res) => {
    try {
      const { provider, model, temperature, maxTokens, streaming, apiKey } = req.body;
      const updated = updateServerConfig({
        provider,
        model,
        temperature: typeof temperature === 'number' ? temperature : undefined,
        maxTokens: typeof maxTokens === 'number' ? maxTokens : undefined,
        streaming: typeof streaming === 'boolean' ? streaming : undefined,
        apiKey: typeof apiKey === 'string' ? apiKey : undefined,
      });
      res.json({ success: true, config: updated });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to update configuration' });
    }
  });

  app.get(['/api/agent/models', '/agent/models'], async (req, res) => {
    try {
      const models = await fetchAllModels();
      res.json({ models });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to fetch models' });
    }
  });

  // ==========================================
  // LIVE BROWSER REST API
  // ==========================================
  app.get(['/api/browser/status', '/browser/status'], (req, res) => {
    return res.json({
      status: 'operational',
      activeSessionsCount: browserSessionManager.getActiveCount(),
      timestamp: new Date().toISOString(),
    });
  });

  app.get(['/api/browser/sessions', '/browser/sessions'], requireAuth, (req, res) => {
    try {
      const userId = req.user!.id;
      const sessions = browserSessionManager.listUserSessions(userId);
      return res.json({ ok: true, sessions });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  });

  app.post(['/api/browser/session/close', '/browser/session/close'], requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      const { sessionId } = req.body || {};
      if (!sessionId) {
        return res.status(400).json({ ok: false, error: 'sessionId is required' });
      }
      const success = await browserSessionManager.closeSession(sessionId, userId);
      return res.json({ ok: true, closed: success });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ==========================================
  // GMAIL REST API & OAUTH ENDPOINTS
  // ==========================================
  app.use(['/api/gmail', '/gmail'], gmailRouter);

  // Fallback 404 handler for API routes only
  app.use('/api', (req, res) => {
    res.status(404).json({
      error: `Not Found: Cannot ${req.method} ${req.originalUrl || req.url}`,
      code: 'NOT_FOUND',
    });
  });

  // Express global error handler
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('[Express Server Error]:', err?.message || err, err?.stack);
    if (res.headersSent) {
      return next(err);
    }
    const status = Number(err.status || err.statusCode) || 500;
    return res.status(status).json({
      error: err.message || 'Internal Server Error',
      code: err.code || 'INTERNAL_ERROR',
      requestId: (req.headers['x-vercel-id'] as string) || (req.headers['x-request-id'] as string) || undefined,
    });
  });

  return app;
}
