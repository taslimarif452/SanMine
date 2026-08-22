import React, { createContext, useContext, useState, useEffect, useRef, ReactNode, useCallback } from 'react';
import {
  ThemeMode,
  AgentStatus,
  TaskStatus,
  ChatMessage,
  ConversationThread,
  AgentConfig,
  ModelOption,
  ConfiguredModel,
  ExecutionEvent,
  ActivityStep,
  AIProviderId,
  ProviderInfo,
  SelectedModel,
  BusinessSearchProviderId,
  BusinessSearchProviderInfo,
  LiveBrowserState,
} from '../types';
import { useAuth } from './AuthContext';

export function getConversationGroup(dateStr: string): 'Today' | 'Yesterday' | 'Previous 7 days' | 'Older' {
  if (!dateStr) return 'Today';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return 'Today';

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 86400000;
  const startOfSevenDaysAgo = startOfToday - 7 * 86400000;

  const targetTime = date.getTime();
  if (targetTime >= startOfToday) {
    return 'Today';
  } else if (targetTime >= startOfYesterday) {
    return 'Yesterday';
  } else if (targetTime >= startOfSevenDaysAgo) {
    return 'Previous 7 days';
  } else {
    return 'Older';
  }
}

export function cleanTitleFromPrompt(text: string): string {
  let trimmed = text.trim().replace(/^["']|["']$/g, '');
  if (trimmed.startsWith('/')) {
    trimmed = trimmed.slice(1).trim();
  }
  if (!trimmed) return 'New Chat';

  // Take first sentence or up to 32 chars
  const firstSentence = trimmed.split(/[.\n?!]/)[0].trim();
  if (firstSentence.length <= 32) {
    return firstSentence;
  }

  // Word-boundary friendly trim
  const truncated = firstSentence.slice(0, 32);
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > 16) {
    return truncated.slice(0, lastSpace).trim();
  }
  return truncated.trim();
}

function generateUuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

interface AgentContextType {
  // Navigation & View
  currentView: 'chat' | 'settings';
  setCurrentView: (view: 'chat' | 'settings') => void;
  navigateToChat: () => void;
  openSettings: () => void;

  // Theme & Layout
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean | ((prev: boolean) => boolean)) => void;
  mobileSidebarOpen: boolean;
  setMobileSidebarOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  toggleMobileSidebar: () => void;
  closeMobileSidebar: () => void;

  // Conversation Management
  conversations: ConversationThread[];
  currentConversationId: string;
  isLoadingChats: boolean;
  createConversation: () => string;
  createNewTask: () => void;
  resetConversation: () => void;
  renameConversation: (id: string, newTitle: string) => void;
  deleteConversation: (id: string) => void;
  selectConversation: (id: string) => void;

  // Active Thread Chat & Execution State
  messages: ChatMessage[];
  isLoadingMessages: boolean;
  agentStatus: AgentStatus;
  taskStatus: TaskStatus;
  currentPrompt: string;
  setCurrentPrompt: (p: string) => void;
  submitPrompt: (promptText: string) => Promise<void>;
  stopTask: () => void;

  // Multi-Provider AI Architecture
  providers: ProviderInfo[];
  configuredModels: ConfiguredModel[];
  selectedModel: SelectedModel;
  setSelectedModel: (selection: SelectedModel) => void;
  selectModel: (provider: AIProviderId, model: string) => Promise<void>;
  availableModels: ModelOption[];
  isLoadingConfig: boolean;
  isLoadingModels: boolean;
  refreshProviders: () => Promise<void>;
  saveAiProviderKey: (
    provider: AIProviderId,
    apiKey: string,
    model?: string
  ) => Promise<{ ok: boolean; error?: string; maskedKey?: string }>;
  deleteAiProviderKey: (
    provider: AIProviderId
  ) => Promise<{ ok: boolean; error?: string }>;
  deleteAccount: () => Promise<{ ok: boolean; error?: string }>;
  refreshConfiguredModels: () => Promise<void>;
  refreshModels: (providerId?: AIProviderId, forceRefresh?: boolean) => Promise<void>;

  // Business Search Providers
  searchProviders: BusinessSearchProviderInfo[];
  activeSearchProviderId: BusinessSearchProviderId;
  isLoadingSearchProviders: boolean;
  refreshSearchProviders: () => Promise<void>;
  saveSearchProviderConfig: (
    providerId: BusinessSearchProviderId,
    data: { apiKey?: string; setActive?: boolean }
  ) => Promise<{ success: boolean; error?: string }>;
  removeSearchProviderKey: (providerId: BusinessSearchProviderId) => Promise<{ success: boolean; error?: string }>;
  testSearchProviderConnection: (
    providerId: BusinessSearchProviderId,
    apiKey?: string
  ) => Promise<{ success: boolean; message?: string; error?: string }>;
  selectSearchProvider: (providerId: BusinessSearchProviderId) => Promise<{ success: boolean; error?: string }>;

  // Config update helper
  config: AgentConfig;
  refreshConfig: () => Promise<void>;
  saveConfig: (newConfig: Partial<AgentConfig>) => Promise<{ success: boolean; error?: string }>;

  // Tool Event Stream
  executionEvents: ExecutionEvent[];
}

const DEFAULT_CONFIG: AgentConfig = {
  provider: 'openrouter',
  model: 'openai/gpt-oss-20b:free',
  temperature: 0.7,
  maxTokens: 4096,
  streaming: true,
  isConfigured: false,
  maskedApiKey: '',
  configuredProvidersCount: 0,
};

const DEFAULT_SELECTED_MODEL: SelectedModel = {
  provider: 'openrouter',
  model: 'openai/gpt-oss-20b:free',
};

const AgentContext = createContext<AgentContextType | undefined>(undefined);

export const AgentProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { currentUser, getIdToken } = useAuth();

  const [theme, setTheme] = useState<ThemeMode>('light');
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState<boolean>(false);
  const [currentView, setCurrentView] = useState<'chat' | 'settings'>('chat');

  const toggleMobileSidebar = () => setMobileSidebarOpen((prev) => !prev);
  const closeMobileSidebar = () => setMobileSidebarOpen(false);

  // Lock body scroll when mobile sidebar drawer is open
  useEffect(() => {
    if (mobileSidebarOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileSidebarOpen]);

  // Keyboard Escape listener to close mobile drawer
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && mobileSidebarOpen) {
        setMobileSidebarOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileSidebarOpen]);

  // Providers & Models
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [configuredModels, setConfiguredModels] = useState<ConfiguredModel[]>([]);
  const [selectedModel, setSelectedModelState] = useState<SelectedModel>(DEFAULT_SELECTED_MODEL);
  const [availableModels, setAvailableModels] = useState<ModelOption[]>([]);
  const [config, setConfig] = useState<AgentConfig>(DEFAULT_CONFIG);
  const [isLoadingConfig, setIsLoadingConfig] = useState<boolean>(true);
  const [isLoadingModels, setIsLoadingModels] = useState<boolean>(false);

  // Business Search Providers State
  const [searchProviders, setSearchProviders] = useState<BusinessSearchProviderInfo[]>([]);
  const [activeSearchProviderId, setActiveSearchProviderId] = useState<BusinessSearchProviderId>('none');
  const [isLoadingSearchProviders, setIsLoadingSearchProviders] = useState<boolean>(true);

  // Database-backed conversations state
  const [conversations, setConversations] = useState<ConversationThread[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string>('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoadingChats, setIsLoadingChats] = useState<boolean>(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState<boolean>(false);

  // ── SessionStorage chat cache (instant first paint) ──────────────────────
  // Keyed per-user. Holds the last-seen chat list and per-chat messages so the
  // UI can render immediately without blocking on Neon / migrate-local.
  const cacheKey = currentUser ? `sanmine_chat_cache_v1_${currentUser.uid}` : '';

  const readSessionCache = useCallback((): {
    chats?: ConversationThread[];
    messagesByChat?: Record<string, ChatMessage[]>;
    activeChatId?: string;
  } => {
    if (!cacheKey) return {};
    try {
      const raw = sessionStorage.getItem(cacheKey);
      if (!raw) return {};
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }, [cacheKey]);

  const writeSessionCache = useCallback(
    (patch: {
      chats?: ConversationThread[];
      messagesByChat?: Record<string, ChatMessage[]>;
      activeChatId?: string;
    }) => {
      if (!cacheKey) return;
      try {
        const prev = readSessionCache();
        const merged = {
          chats: patch.chats ?? prev.chats,
          messagesByChat: { ...(prev.messagesByChat || {}), ...(patch.messagesByChat || {}) },
          activeChatId: patch.activeChatId ?? prev.activeChatId,
        };
        sessionStorage.setItem(cacheKey, JSON.stringify(merged));
      } catch {
        // sessionStorage may be unavailable (private mode); ignore.
      }
    },
    [cacheKey, readSessionCache]
  );

  const [agentStatus, setAgentStatus] = useState<AgentStatus>('idle');
  const [currentPrompt, setCurrentPrompt] = useState<string>('');
  const [executionEvents, setExecutionEvents] = useState<ExecutionEvent[]>([]);

  // AbortController for active streaming requests
  const abortControllerRef = useRef<AbortController | null>(null);
  const isSubmittingRef = useRef<boolean>(false);

  // Synchronize URL path if applicable
  useEffect(() => {
    const handlePopState = () => {
      if (window.location.pathname === '/settings') {
        setCurrentView('settings');
      } else {
        setCurrentView('chat');
      }
    };

    if (window.location.pathname === '/settings') {
      setCurrentView('settings');
    }

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigateToChat = () => {
    setCurrentView('chat');
    setMobileSidebarOpen(false);
    if (window.location.pathname === '/settings') {
      window.history.pushState({}, '', '/');
    }
  };

  const openSettings = () => {
    setCurrentView('settings');
    setMobileSidebarOpen(false);
    if (window.location.pathname !== '/settings') {
      window.history.pushState({}, '', '/settings');
    }
  };

  // Helper to load messages for a specific chat from Neon PostgreSQL
  const loadChatMessages = useCallback(
    async (chatId: string, token: string): Promise<ChatMessage[]> => {
      try {
        const res = await fetch(`/api/chats/${chatId}/messages`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.messages)) {
            return data.messages.map((m: any) => ({
              id: m.id,
              role: m.role,
              sender: m.role === 'user' ? 'user' : 'agent',
              content: m.content,
              text: m.content,
              timestamp: new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              metadata: m.metadata,
              execution: m.metadata?.execution,
              result: m.metadata?.taskResult,
              executionEvents: m.metadata?.executionEvents,
            }));
          }
        }
      } catch (err) {
        console.warn(`Failed to load messages for chat ${chatId}:`, err);
      }
      return [];
    },
    []
  );

  // Load all user chats from Neon PostgreSQL upon Firebase Authentication
  const loadUserChatsFromDb = useCallback(async () => {
    if (!currentUser) {
      setConversations([]);
      setCurrentConversationId('');
      setMessages([]);
      return;
    }

    setIsLoadingChats(true);

    // 1. Instant first paint: hydrate chats + active-thread messages from the
    //    per-user sessionStorage cache. We do NOT await migration or the Neon
    //    fetch before rendering.
    const cached = readSessionCache();
    if (cached.chats && cached.chats.length > 0) {
      setConversations(cached.chats);
      const activeId =
        cached.activeChatId && cached.chats.some((c) => c.id === cached.activeChatId)
          ? cached.activeChatId
          : cached.chats[0].id;
      setCurrentConversationId(activeId);
      const cachedMsgs = cached.messagesByChat?.[activeId];
      if (cachedMsgs && cachedMsgs.length > 0) {
        setMessages(cachedMsgs);
      }
    }

    try {
      const token = await getIdToken();
      if (!token) return;

      // 2. One-time legacy localStorage migration — run in the BACKGROUND so it
      //    never blocks the chat list / first paint.
      const migrationKey = `sanmine_chats_migrated_${currentUser.uid}`;
      const hasMigrated = localStorage.getItem(migrationKey);
      if (!hasMigrated) {
        (async () => {
          try {
            const legacyStored =
              localStorage.getItem('sanmine_conversations_v3') ||
              localStorage.getItem('saneye_conversations_v3') ||
              localStorage.getItem('agentos_conversations_v3');

            if (legacyStored) {
              const parsed = JSON.parse(legacyStored);
              if (Array.isArray(parsed) && parsed.length > 0) {
                const chatsWithMessages = parsed.filter(
                  (c: any) => Array.isArray(c.messages) && c.messages.length > 0
                );
                if (chatsWithMessages.length > 0) {
                  await fetch('/api/chats/migrate-local', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({ chats: chatsWithMessages }),
                  });
                }
              }
            }
            localStorage.removeItem('sanmine_conversations_v3');
            localStorage.removeItem('saneye_conversations_v3');
            localStorage.removeItem('agentos_conversations_v3');
            localStorage.removeItem('sanmine_active_conversation_v3');
            localStorage.setItem(migrationKey, 'true');
          } catch (migrateErr) {
            console.warn('[Chats Migration Notice]:', migrateErr);
          }
        })();
      }

      // 3. Fetch the authoritative chat list from Neon PostgreSQL.
      const res = await fetch('/api/chats', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        const dbChats: Array<{ id: string; title: string; createdAt: string; updatedAt: string }> =
          data.chats || [];

        if (dbChats.length > 0) {
          const threads: ConversationThread[] = dbChats.map((c) => ({
            id: c.id,
            title: c.title,
            createdAt: c.createdAt,
            updatedAt: c.updatedAt,
            group: getConversationGroup(c.updatedAt || c.createdAt),
            messages: [],
            taskStatus: 'idle',
            selectedModel: { ...selectedModel },
            isCustomTitle: c.title !== 'New Chat',
          }));

          setConversations(threads);

          // Keep the currently-active chat from the cache if it still exists
          // server-side; otherwise default to the first chat.
          const firstChat =
            threads.find((t) => t.id === currentConversationId) || threads[0];
          setCurrentConversationId(firstChat.id);

          // 4. Load messages for the active chat (with isLoadingMessages).
          setIsLoadingMessages(true);
          try {
            const initialMsgs = await loadChatMessages(firstChat.id, token);
            setMessages(initialMsgs);
            setConversations((prev) =>
              prev.map((t) => (t.id === firstChat.id ? { ...t, messages: initialMsgs } : t))
            );
            writeSessionCache({
              chats: threads,
              messagesByChat: { [firstChat.id]: initialMsgs },
              activeChatId: firstChat.id,
            });
          } finally {
            setIsLoadingMessages(false);
          }
        } else {
          // User has zero chats in DB — create the initial chat (fire-and-forget
          // so first paint is not blocked; an empty thread renders immediately).
          const optimisticId = cached.chats?.[0]?.id || generateUuid();
          const now = new Date().toISOString();
          const optimisticThread: ConversationThread = {
            id: optimisticId,
            title: 'New Chat',
            createdAt: now,
            updatedAt: now,
            group: 'Today',
            messages: [],
            taskStatus: 'idle',
            selectedModel: { ...selectedModel },
            isCustomTitle: false,
          };
          setConversations([optimisticThread]);
          setCurrentConversationId(optimisticId);
          setMessages([]);
          writeSessionCache({
            chats: [optimisticThread],
            messagesByChat: { [optimisticId]: [] },
            activeChatId: optimisticId,
          });

          fetch('/api/chats', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ id: optimisticId, title: 'New Chat' }),
          }).catch((err) => console.warn('Failed to create initial chat on server:', err));
        }
      }
    } catch (err) {
      console.error('Failed to load user chats from Neon PostgreSQL:', err);
    } finally {
      setIsLoadingChats(false);
    }
  }, [currentUser, getIdToken, loadChatMessages, selectedModel, readSessionCache, writeSessionCache]);

  useEffect(() => {
    loadUserChatsFromDb();
  }, [currentUser]);

  // Fetch Configured Models from backend
  const refreshConfiguredModels = async () => {
    try {
      const token = await getIdToken();
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const res = await fetch('/api/ai/configured-models', { headers });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.models)) {
          setConfiguredModels(data.models);

          if (data.activeSelection?.provider && data.activeSelection?.model) {
            setSelectedModelState(data.activeSelection);
            setConfig((prev) => ({
              ...prev,
              provider: data.activeSelection.provider,
              model: data.activeSelection.model,
            }));
          } else if (data.models.length > 0) {
            setSelectedModelState((prev) => {
              const currentValid = data.models.some(
                (m: ConfiguredModel) => m.provider === prev.provider && (m.modelId === prev.model || m.id === prev.model)
              );
              if (!currentValid) {
                const first = data.models[0];
                return { provider: first.provider, model: first.modelId || first.id };
              }
              return prev;
            });
          }
        }
      }
    } catch (err) {
      console.warn('Failed to load configured models:', err);
    }
  };

  // Fetch Providers from backend
  const refreshProviders = async () => {
    try {
      setIsLoadingConfig(true);
      const token = await getIdToken();
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const res = await fetch('/api/ai/providers', { headers });
      if (res.ok) {
        const data = await res.json();
        
        const defaultProviderMeta: Record<AIProviderId, { name: string; desc: string; defModel: string }> = {
          google: { name: 'Google Gemini', desc: 'Frontier multimodal and reasoning models directly from Google AI.', defModel: 'gemini-2.5-flash' },
          openai: { name: 'OpenAI', desc: 'GPT-4o, GPT-4o mini, o3-mini, and o1 models directly from OpenAI.', defModel: 'gpt-4o' },
          openrouter: { name: 'OpenRouter', desc: 'Access hundreds of open-source and frontier models.', defModel: 'openai/gpt-oss-20b:free' },
          anthropic: { name: 'Anthropic Claude', desc: 'Claude 3.7 Sonnet, Claude 3.5 Sonnet, and Claude 3.5 Haiku frontier models.', defModel: 'claude-3-7-sonnet-20250219' },
          xai: { name: 'xAI Grok', desc: 'Grok 2 latest and fast reasoning models directly from xAI.', defModel: 'grok-2-latest' },
          deepseek: { name: 'DeepSeek', desc: 'DeepSeek Chat (V3) and DeepSeek Reasoner (R1) models.', defModel: 'deepseek-chat' },
          huggingface: { name: 'Hugging Face', desc: 'Llama 3.3, Mistral, Qwen, and open models via HF Inference.', defModel: 'meta-llama/Llama-3.3-70B-Instruct' },
          ollama: { name: 'Ollama', desc: 'Local and self-hosted models running on your machine or server.', defModel: 'llama3.2' },
        };

        const allProviderIds: AIProviderId[] = [
          'google',
          'openai',
          'openrouter',
          'anthropic',
          'xai',
          'deepseek',
          'huggingface',
          'ollama',
        ];

        let providerList: ProviderInfo[] = [];
        if (data.providers && typeof data.providers === 'object' && !Array.isArray(data.providers)) {
          providerList = allProviderIds.map((provId) => {
            const status = data.providers[provId] || { configured: false, maskedKey: '' };
            return {
              id: provId,
              name: defaultProviderMeta[provId]?.name || provId,
              description: defaultProviderMeta[provId]?.desc || '',
              defaultModel: defaultProviderMeta[provId]?.defModel || '',
              isConfigured: Boolean(status.configured),
              configured: Boolean(status.configured),
              maskedApiKey: status.maskedKey || '',
              requiresApiKey: true,
              capabilities: { streaming: true, toolCalling: true, vision: true },
            };
          });
        } else if (Array.isArray(data.providers)) {
          providerList = data.providers;
        }
        setProviders(providerList);

        const activeProvId = (data.activeProvider || 'google') as AIProviderId;
        const activeMeta = defaultProviderMeta[activeProvId] || defaultProviderMeta.google;
        const activeModel = data.activeModel || activeMeta.defModel;

        setSelectedModelState((prev) => ({
          provider: activeProvId,
          model: prev.provider === activeProvId && prev.model ? prev.model : activeModel,
        }));

        const configuredList = providerList.filter((p) => p.isConfigured || (p as any).configured);
        setConfig((prev) => ({
          ...prev,
          provider: activeProvId,
          model: prev.provider === activeProvId && prev.model ? prev.model : activeModel,
          isConfigured: configuredList.length > 0,
          configuredProvidersCount: configuredList.length,
        }));
      }
    } catch (err) {
      console.warn('Failed to load AI providers:', err);
    } finally {
      setIsLoadingConfig(false);
    }
  };

  // Save AI Provider API Key (AES-256-GCM encrypted in PostgreSQL)
  const saveAiProviderKey = async (
    provider: AIProviderId,
    apiKey: string,
    model?: string
  ): Promise<{ ok: boolean; error?: string; maskedKey?: string }> => {
    try {
      const token = await getIdToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch('/api/ai/providers', {
        method: 'POST',
        headers,
        body: JSON.stringify({ provider, apiKey: apiKey.trim(), model }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        return {
          ok: false,
          error: data.error || 'Failed to save API key to database',
        };
      }

      // Immediately refresh state across providers, configured models, and catalog
      await refreshProviders();
      await refreshConfiguredModels();
      await refreshModels();

      return {
        ok: true,
        maskedKey: data.maskedKey,
      };
    } catch (err: any) {
      return {
        ok: false,
        error: err.message || 'Network error while saving API key',
      };
    }
  };

  // Delete AI Provider API Key
  const deleteAiProviderKey = async (
    provider: AIProviderId
  ): Promise<{ ok: boolean; error?: string }> => {
    try {
      const token = await getIdToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch(`/api/ai/providers/${provider}`, {
        method: 'DELETE',
        headers,
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        return {
          ok: false,
          error: data.error || 'Failed to remove API key from database',
        };
      }

      await refreshProviders();
      await refreshConfiguredModels();
      await refreshModels();

      return { ok: true };
    } catch (err: any) {
      return {
        ok: false,
        error: err.message || 'Network error while removing API key',
      };
    }
  };

  // Delete Account and all user-owned data permanently
  const deleteAccount = async (): Promise<{ ok: boolean; error?: string }> => {
    try {
      const token = await getIdToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch('/api/settings/account', {
        method: 'DELETE',
        headers,
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        return {
          ok: false,
          error: data.error || 'Failed to delete account',
        };
      }

      // Reset client conversations, messages, and events
      setConversations([]);
      setMessages([]);
      setExecutionEvents([]);
      return { ok: true };
    } catch (err: any) {
      return {
        ok: false,
        error: err.message || 'Network error during account deletion',
      };
    }
  };

  // Fetch Models from backend (for Settings discovery)
  const refreshModels = async (providerId?: AIProviderId, forceRefresh = false) => {
    try {
      setIsLoadingModels(true);
      const url = providerId
        ? `/api/ai/models?provider=${providerId}${forceRefresh ? '&refresh=true' : ''}`
        : `/api/ai/models${forceRefresh ? '?refresh=true' : ''}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.models)) {
          setAvailableModels(data.models);
        }
      }
    } catch (err) {
      console.warn('Failed to load available models:', err);
    } finally {
      setIsLoadingModels(false);
    }
  };

  // Legacy config fetch
  const refreshConfig = async () => {
    await refreshProviders();
    await refreshConfiguredModels();
    await refreshModels();
    await refreshSearchProviders();
  };

  // Fetch Business Search Providers
  const refreshSearchProviders = async () => {
    setIsLoadingSearchProviders(true);
    try {
      const res = await fetch('/api/search/providers');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.providers)) {
          setSearchProviders(data.providers);
        }
        if (data.activeProviderId) {
          setActiveSearchProviderId(data.activeProviderId);
        }
      }
    } catch (err) {
      console.warn('Failed to load search providers:', err);
    } finally {
      setIsLoadingSearchProviders(false);
    }
  };

  useEffect(() => {
    refreshProviders();
    refreshConfiguredModels();
    refreshModels();
    refreshSearchProviders();
  }, [currentUser]);

  // Update selected model
  const selectModel = async (provider: AIProviderId, model: string) => {
    const newSelection = { provider, model };
    setSelectedModelState(newSelection);
    setConfig((prev) => ({ ...prev, provider, model }));

    setConversations((prev) =>
      prev.map((c) =>
        c.id === currentConversationId
          ? { ...c, selectedModel: newSelection, updatedAt: new Date().toISOString() }
          : c
      )
    );

    try {
      const token = await getIdToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      await fetch('/api/ai/select-model', {
        method: 'POST',
        headers,
        body: JSON.stringify(newSelection),
      });
      await refreshConfiguredModels();
    } catch (err) {
      console.warn('Failed to save active model selection to server:', err);
    }
  };

  // Save config (generation parameters)
  const saveConfig = async (newConfig: Partial<AgentConfig>) => {
    try {
      setConfig((prev) => ({
        ...prev,
        ...newConfig,
      }));
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to update config' };
    }
  };
  const saveSearchProviderConfig = async (
    providerId: BusinessSearchProviderId,
    data: { apiKey?: string; setActive?: boolean }
  ) => {
    try {
      const res = await fetch(`/api/search/providers/${providerId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        return { success: false, error: errJson.error || 'Failed to configure search provider.' };
      }

      const result = await res.json();
      if (Array.isArray(result.providers)) {
        setSearchProviders(result.providers);
      }
      if (result.activeProviderId) {
        setActiveSearchProviderId(result.activeProviderId);
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error configuring search provider.' };
    }
  };

  // Remove Business Search Provider Key
  const removeSearchProviderKey = async (providerId: BusinessSearchProviderId) => {
    try {
      const res = await fetch(`/api/search/providers/${providerId}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        return { success: false, error: errJson.error || 'Failed to remove search provider key.' };
      }

      const result = await res.json();
      if (Array.isArray(result.providers)) {
        setSearchProviders(result.providers);
      }
      if (result.activeProviderId) {
        setActiveSearchProviderId(result.activeProviderId);
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error removing search provider key.' };
    }
  };

  // Test Business Search Provider connection
  const testSearchProviderConnection = async (
    providerId: BusinessSearchProviderId,
    apiKey?: string
  ) => {
    try {
      const res = await fetch(`/api/search/providers/${providerId}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey }),
      });

      const data = await res.json();
      return data;
    } catch (err: any) {
      return {
        success: false,
        error: `Could not reach SanMine Space backend: ${err.message || 'Network error'}`,
      };
    }
  };

  // Select Active Business Search Provider
  const selectSearchProvider = async (providerId: BusinessSearchProviderId) => {
    try {
      const res = await fetch('/api/search/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId }),
      });

      const resData = await res.json();
      if (!res.ok) {
        return { success: false, error: resData.error || 'Failed to set active search provider' };
      }

      setActiveSearchProviderId(providerId);
      await refreshSearchProviders();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error selecting search provider.' };
    }
  };

  // Sync theme to DOM
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  // Switch active conversation thread and fetch messages from Neon PostgreSQL
  const selectConversation = async (id: string) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const thread = conversations.find((c) => c.id === id);
    if (thread) {
      setCurrentConversationId(id);
      setAgentStatus('idle');
      setExecutionEvents([]);
      if (thread.selectedModel) {
        setSelectedModelState(thread.selectedModel);
      }
      setMobileSidebarOpen(false);
      navigateToChat();
      writeSessionCache({ activeChatId: id });

      // Instant paint from cached / in-memory messages if we have them
      const cachedMsgs = readSessionCache().messagesByChat?.[id];
      if (cachedMsgs && cachedMsgs.length > 0) {
        setMessages(cachedMsgs);
      } else if (thread.messages && thread.messages.length > 0) {
        setMessages(thread.messages);
      } else {
        setMessages([]);
      }

      // Refresh persisted messages from Neon PostgreSQL (non-blocking paint)
      const token = await getIdToken();
      if (token) {
        setIsLoadingMessages(true);
        try {
          const msgs = await loadChatMessages(id, token);
          setMessages(msgs);
          setConversations((prev) =>
            prev.map((t) => (t.id === id ? { ...t, messages: msgs } : t))
          );
          writeSessionCache({ messagesByChat: { [id]: msgs } });
        } finally {
          setIsLoadingMessages(false);
        }
      }
    }
  };

  // Create a clean new task session in Neon PostgreSQL
  const createConversation = (): string => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setMobileSidebarOpen(false);
    const newId = generateUuid();
    const now = new Date().toISOString();
    const newThread: ConversationThread = {
      id: newId,
      title: 'New Chat',
      createdAt: now,
      updatedAt: now,
      group: 'Today',
      messages: [],
      taskStatus: 'idle',
      selectedModel: { ...selectedModel },
      isCustomTitle: false,
    };

    setConversations((prev) => [newThread, ...prev]);
    setCurrentConversationId(newId);
    setMessages([]);
    setAgentStatus('idle');
    setCurrentPrompt('');
    setExecutionEvents([]);
    navigateToChat();

    // Persist new chat record in Neon PostgreSQL
    getIdToken().then((token) => {
      if (token) {
        fetch('/api/chats', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ id: newId, title: 'New Chat' }),
        }).catch((err) => console.warn('Failed to create chat on server:', err));
      }
    });

    return newId;
  };

  const createNewTask = () => {
    createConversation();
  };

  const resetConversation = () => {
    createConversation();
  };

  // Rename a conversation in Neon PostgreSQL
  const renameConversation = (id: string, newTitle: string) => {
    const trimmed = newTitle.trim();
    if (!trimmed) return;

    const now = new Date().toISOString();
    setConversations((prev) =>
      prev.map((c) =>
        c.id === id
          ? {
              ...c,
              title: trimmed,
              isCustomTitle: true,
              updatedAt: now,
              group: getConversationGroup(now),
            }
          : c
      )
    );

    getIdToken().then((token) => {
      if (token) {
        fetch(`/api/chats/${id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ title: trimmed }),
        }).catch((err) => console.warn('Failed to update chat title on server:', err));
      }
    });
  };

  // Delete a conversation in Neon PostgreSQL
  const deleteConversation = (id: string) => {
    if (abortControllerRef.current && currentConversationId === id) {
      abortControllerRef.current.abort();
    }

    setConversations((prev) => {
      const remaining = prev.filter((c) => c.id !== id);

      if (currentConversationId === id) {
        if (remaining.length > 0) {
          const nextActive = remaining[0];
          setCurrentConversationId(nextActive.id);
          setMessages(nextActive.messages);
          setAgentStatus('idle');
          setExecutionEvents([]);
          if (nextActive.selectedModel) {
            setSelectedModelState(nextActive.selectedModel);
          }
        } else {
          // If no conversations remain, create fresh empty session
          const newId = generateUuid();
          const now = new Date().toISOString();
          const freshThread: ConversationThread = {
            id: newId,
            title: 'New Chat',
            createdAt: now,
            updatedAt: now,
            group: 'Today',
            messages: [],
            taskStatus: 'idle',
            selectedModel: { ...selectedModel },
            isCustomTitle: false,
          };
          setCurrentConversationId(newId);
          setMessages([]);
          setAgentStatus('idle');
          setExecutionEvents([]);
          return [freshThread];
        }
      }

      return remaining;
    });

    // Delete in Neon PostgreSQL
    getIdToken().then((token) => {
      if (token) {
        fetch(`/api/chats/${id}`, {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }).catch((err) => console.warn('Failed to delete chat on server:', err));
      }
    });

    navigateToChat();
  };

  // Stop active streaming task
  const stopTask = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setAgentStatus('idle');

    setMessages((prev) => {
      const stopped = prev.map((msg) =>
        msg.isStreaming
          ? {
              ...msg,
              isStreaming: false,
              content: msg.content + '\n\n*(Task stopped by user)*',
              text: (msg.text || msg.content) + '\n\n*(Task stopped by user)*',
              execution: msg.execution
                ? {
                    ...msg.execution,
                    status: 'stopped' as const,
                    summary: 'Execution stopped by user',
                  }
                : undefined,
            }
          : msg
      );

      setConversations((threads) =>
        threads.map((t) =>
          t.id === currentConversationId
            ? { ...t, messages: stopped, updatedAt: new Date().toISOString() }
            : t
        )
      );

      return stopped;
    });
  };

  // Submit prompt with authenticated Firebase Token to stream AI and persist in Neon
  const submitPrompt = async (promptText: string) => {
    if (!promptText.trim()) return;
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const nowIso = new Date().toISOString();
    const assistantMsgId = `msg-agent-${Date.now()}`;
    const userMsgId = `msg-user-${Date.now()}`;

    // Create user message
    const userMsg: ChatMessage = {
      id: userMsgId,
      role: 'user',
      sender: 'user',
      content: promptText,
      text: promptText,
      timestamp: timeStr,
      provider: selectedModel.provider,
      model: selectedModel.model,
    };

    // Prepare initial assistant message
    const initialAssistantMsg: ChatMessage = {
      id: assistantMsgId,
      role: 'assistant',
      sender: 'agent',
      content: '',
      text: '',
      timestamp: timeStr,
      isStreaming: true,
      provider: selectedModel.provider,
      model: selectedModel.model,
    };

    const updatedMessages = [...messages, userMsg, initialAssistantMsg];
    setMessages(updatedMessages);
    setAgentStatus('thinking');

    // Update conversation in list (auto-title if first message and not manually renamed)
    let activeChatTitle = 'New Chat';
    setConversations((prev) => {
      const existing = prev.find((c) => c.id === currentConversationId);
      const isFirst = !existing || existing.messages.length === 0;
      const shouldAutoTitle = isFirst && (!existing || !existing.isCustomTitle);
      const newTitle = shouldAutoTitle ? cleanTitleFromPrompt(promptText) : existing?.title || 'New Chat';
      activeChatTitle = newTitle;

      const updated = prev.map((c) =>
        c.id === currentConversationId
          ? {
              ...c,
              title: newTitle,
              updatedAt: nowIso,
              group: getConversationGroup(nowIso),
              messages: updatedMessages,
              selectedModel: { ...selectedModel },
            }
          : c
      );

      return updated.sort(
        (a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime()
      );
    });

    // Build payload messages
    const apiMessages = [...messages, userMsg].map((m) => ({
      role: m.role,
      content: m.content || m.text || '',
    }));

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const token = await getIdToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          messages: apiMessages,
          provider: selectedModel.provider,
          model: selectedModel.model,
          temperature: config.temperature,
          maxTokens: config.maxTokens,
          chatId: currentConversationId,
          title: activeChatTitle,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        const providerName =
          selectedModel.provider === 'google'
            ? 'Google Gemini'
            : selectedModel.provider === 'openai'
            ? 'OpenAI'
            : 'OpenRouter';

        const errorMessage =
          errJson.error ||
          (response.status === 401
            ? `${providerName} authentication failed. Please configure your API key in Settings.`
            : response.status === 429
            ? `${providerName} rate limit reached. Please try another model or wait a moment.`
            : `Failed to communicate with ${providerName} (HTTP ${response.status})`);

        setMessages((prev) => {
          const errored = prev.map((msg) =>
            msg.id === assistantMsgId
              ? {
                  ...msg,
                  isStreaming: false,
                  isError: true,
                  content: errorMessage,
                  text: errorMessage,
                }
              : msg
          );

          setConversations((threads) =>
            threads.map((t) =>
              t.id === currentConversationId
                ? { ...t, messages: errored, taskStatus: 'error', updatedAt: new Date().toISOString() }
                : t
            )
          );

          return errored;
        });
        setAgentStatus('error');
        return;
      }

      if (!response.body) {
        throw new Error('ReadableStream not supported by browser.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let accumulatedText = '';
      let activeExecution: {
        status: 'planning' | 'running' | 'completed' | 'error' | 'stopped';
        aiPersonalizationStatus?: 'completed' | 'unavailable' | 'not_requested';
        reason?: string;
        integration?: string;
        summary?: string;
        steps: ActivityStep[];
        browserSession?: LiveBrowserState;
      } | null = null;
      let currentBrowserState: LiveBrowserState | undefined = undefined;
      let thinkingIndicatorActive = false;
      let firstTokenReceived = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(':')) continue;
          if (trimmed === 'data: [DONE]') continue;

          if (trimmed.startsWith('data: ')) {
            try {
              const event: ExecutionEvent = JSON.parse(trimmed.slice(6));

              // Handle event types
              if (event.type === 'task.started') {
                setAgentStatus('thinking');

                // "Thinking..." is the fast, ChatGPT-style pulsing indicator.
                // It must NOT become a step in the completed activity list and
                // we never show the generic "Agent is working" headline.
                const startedMessage = event.message || '';
                thinkingIndicatorActive =
                  startedMessage === 'Thinking...' || startedMessage === '';
                firstTokenReceived = false;

                // Use the server-provided headline/plan (spoken plan) for the
                // activity summary when present.
                const summary =
                  (event as any).headline && (event as any).headline !== 'Agent is working'
                    ? (event as any).headline
                    : thinkingIndicatorActive
                    ? ''
                    : startedMessage !== 'Agent is working'
                    ? startedMessage
                    : '';

                // Only create the execution object if there is a real
                // headline/plan to show. Pure "Thinking..." does not need it.
                if (summary) {
                  const understandStep: ActivityStep = {
                    id: 'step_understand',
                    title: 'Understanding request',
                    status: 'completed',
                    detail: (event as any).plan || summary,
                  };
                  activeExecution = {
                    status: 'running',
                    summary,
                    steps: [understandStep],
                    browserSession: currentBrowserState,
                  };
                }
                setExecutionEvents((prev) => [...prev, event]);
                if (activeExecution) {
                  setMessages((prev) =>
                    prev.map((msg) =>
                      msg.id === assistantMsgId
                        ? {
                            ...msg,
                            browserSession: currentBrowserState,
                            execution: {
                              id: `exec-${assistantMsgId}`,
                              ...activeExecution!,
                            },
                          }
                        : msg
                    )
                  );
                }
              } else if (event.type === 'task.progress') {
                const stepId = event.stepId || `step_${(event.title || 'progress').toLowerCase().replace(/\s+/g, '_')}`;
                const progressStep: ActivityStep = {
                  id: stepId,
                  title: event.title || event.message || 'Processing',
                  status: (event.status as any) || 'completed',
                  detail: event.detail,
                };

                activeExecution = activeExecution
                  ? {
                      ...activeExecution,
                      browserSession: currentBrowserState,
                      steps: [
                        ...activeExecution.steps.filter((s) => s.id !== stepId),
                        progressStep,
                      ],
                    }
                  : {
                      status: 'running',
                      browserSession: currentBrowserState,
                      steps: [progressStep],
                    };

                setExecutionEvents((prev) => [...prev, event]);
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMsgId
                      ? {
                          ...msg,
                          browserSession: currentBrowserState,
                          execution: {
                            id: `exec-${assistantMsgId}`,
                            ...activeExecution!,
                          },
                        }
                      : msg
                  )
                );
              } else if (event.type === 'tool.started') {
                const stepId = event.stepId || `step_${event.tool || 'tool'}`;
                const toolStep: ActivityStep = {
                  id: stepId,
                  title: event.title || event.message || `Running ${event.tool}`,
                  status: 'running',
                  detail: event.detail,
                };

                activeExecution = activeExecution
                  ? {
                      ...activeExecution,
                      browserSession: currentBrowserState,
                      steps: [
                        ...activeExecution.steps.filter((s) => s.id !== stepId),
                        toolStep,
                      ],
                    }
                  : {
                      status: 'running',
                      browserSession: currentBrowserState,
                      steps: [toolStep],
                    };

                setExecutionEvents((prev) => [...prev, event]);
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMsgId
                      ? {
                          ...msg,
                          browserSession: currentBrowserState,
                          execution: {
                            id: `exec-${assistantMsgId}`,
                            ...activeExecution!,
                          },
                        }
                      : msg
                  )
                );
              } else if (event.type === 'tool.completed') {
                const stepId = event.stepId || `step_${event.tool || 'tool'}`;
                const completedStep: ActivityStep = {
                  id: stepId,
                  title: event.title || event.message || `Completed ${event.tool}`,
                  status: 'completed',
                  detail: event.detail,
                };

                activeExecution = activeExecution
                  ? {
                      ...activeExecution,
                      browserSession: currentBrowserState,
                      steps: [
                        ...activeExecution.steps.filter((s) => s.id !== stepId),
                        completedStep,
                      ],
                    }
                  : {
                      status: 'running',
                      browserSession: currentBrowserState,
                      steps: [completedStep],
                    };

                setExecutionEvents((prev) => [...prev, event]);
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMsgId
                      ? {
                          ...msg,
                          browserSession: currentBrowserState,
                          execution: {
                            id: `exec-${assistantMsgId}`,
                            ...activeExecution!,
                          },
                        }
                      : msg
                  )
                );
              } else if (event.type === 'tool.failed') {
                const stepId = event.stepId || `step_${event.tool || 'tool'}`;
                const errorStep: ActivityStep = {
                  id: stepId,
                  title: event.title || event.message || `Failed ${event.tool}`,
                  status: 'error',
                  detail: event.detail,
                };

                activeExecution = activeExecution
                  ? {
                      ...activeExecution,
                      browserSession: currentBrowserState,
                      steps: [
                        ...activeExecution.steps.filter((s) => s.id !== stepId),
                        errorStep,
                      ],
                    }
                  : {
                      status: 'running',
                      browserSession: currentBrowserState,
                      steps: [errorStep],
                    };

                setExecutionEvents((prev) => [...prev, event]);
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMsgId
                      ? {
                          ...msg,
                          browserSession: currentBrowserState,
                          execution: {
                            id: `exec-${assistantMsgId}`,
                            ...activeExecution!,
                          },
                        }
                      : msg
                  )
                );
              } else if (
                event.type === 'browser.session.started' ||
                event.type === 'browser.navigating' ||
                event.type === 'browser.page.loaded' ||
                event.type === 'browser.action' ||
                event.type === 'browser.screenshot' ||
                event.type === 'browser.content.extracted' ||
                event.type === 'browser.session.closed'
              ) {
                const prevHist = currentBrowserState?.history || [];
                const newUrl = event.url || currentBrowserState?.url || 'about:blank';
                const newTitle = event.title || currentBrowserState?.title;
                const newHist =
                  event.url && !prevHist.some((h) => h.url === event.url)
                    ? [...prevHist, { url: event.url, title: newTitle, timestamp: new Date().toISOString() }]
                    : prevHist;

                currentBrowserState = {
                  sessionId: event.sessionId || currentBrowserState?.sessionId || 'active-session',
                  mode: event.mode || currentBrowserState?.mode || 'http_fallback',
                  url: newUrl,
                  title: newTitle,
                  status:
                    event.type === 'browser.navigating'
                      ? 'navigating'
                      : event.type === 'browser.session.closed'
                      ? 'closed'
                      : event.error
                      ? 'error'
                      : 'active',
                  isLoading: event.type === 'browser.navigating',
                  screenshotBase64: event.screenshot || currentBrowserState?.screenshotBase64,
                  lastAction: event.action || (event.type === 'browser.navigating' ? 'navigate' : currentBrowserState?.lastAction),
                  lastActionDetail: event.detail || currentBrowserState?.lastActionDetail,
                  history: newHist,
                  extractedData: event.data || currentBrowserState?.extractedData,
                  error: event.error || currentBrowserState?.error,
                };

                if (activeExecution) {
                  activeExecution.browserSession = currentBrowserState;
                }

                setExecutionEvents((prev) => [...prev, event]);
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMsgId
                      ? {
                          ...msg,
                          browserSession: currentBrowserState,
                          execution: activeExecution
                            ? {
                                id: `exec-${assistantMsgId}`,
                                ...activeExecution,
                                browserSession: currentBrowserState,
                              }
                            : undefined,
                        }
                      : msg
                  )
                );
              } else if (event.type === 'message.delta') {
                // First assistant token clears the pulsing "Thinking..."
                if (!firstTokenReceived) {
                  firstTokenReceived = true;
                  thinkingIndicatorActive = false;
                }
                setAgentStatus('responding');
                if (typeof event.content === 'string') {
                  accumulatedText += event.content;
                  setMessages((prev) =>
                    prev.map((msg) =>
                      msg.id === assistantMsgId
                        ? {
                            ...msg,
                            content: accumulatedText,
                            text: accumulatedText,
                          }
                        : msg
                    )
                  );
                }
              } else if (event.type === 'message.completed') {
                if (typeof event.content === 'string') {
                  firstTokenReceived = true;
                  thinkingIndicatorActive = false;
                  accumulatedText = event.content;
                  setMessages((prev) =>
                    prev.map((msg) =>
                      msg.id === assistantMsgId
                        ? {
                            ...msg,
                            content: accumulatedText,
                            text: accumulatedText,
                          }
                        : msg
                    )
                  );
                }
              } else if (event.type === 'task.completed') {
                setAgentStatus('completed');
                setExecutionEvents((prev) => [...prev, event]);
                thinkingIndicatorActive = false;

                if (activeExecution) {
                  activeExecution = {
                    ...activeExecution,
                    status: 'completed',
                    summary:
                      event.message && event.message !== 'Agent is working'
                        ? event.message
                        : 'Task completed',
                  };
                }

                // If the server delivered the final answer only in
                // result.answer (no message.delta was streamed), copy it into
                // the assistant message content so the table/answer is visible.
                const resultAnswer =
                  event.result && typeof event.result.answer === 'string'
                    ? (event.result.answer as string)
                    : '';
                if (resultAnswer && !accumulatedText.trim()) {
                  accumulatedText = resultAnswer;
                }

                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMsgId
                      ? {
                          ...msg,
                          isStreaming: false,
                          content: accumulatedText || msg.content,
                          text: accumulatedText || msg.text,
                          result: event.result,
                          execution: activeExecution
                            ? {
                                id: `exec-${assistantMsgId}`,
                                ...activeExecution,
                                result: event.result,
                              }
                            : undefined,
                        }
                      : msg
                  )
                );

                // Persist the final assistant message to the session cache.
                if (currentConversationId) {
                  writeSessionCache({
                    messagesByChat: {
                      [currentConversationId]: [
                        ...(readSessionCache().messagesByChat?.[currentConversationId] || []),
                        ...[
                          {
                            id: userMsgId,
                            role: 'user' as const,
                            sender: 'user' as const,
                            content: promptText,
                            text: promptText,
                            timestamp: timeStr,
                          },
                          {
                            id: assistantMsgId,
                            role: 'assistant' as const,
                            sender: 'agent' as const,
                            content: accumulatedText,
                            text: accumulatedText,
                            timestamp: timeStr,
                            result: event.result,
                          },
                        ].filter((m) => m.content),
                      ],
                    },
                  });
                }
              } else if (event.type === 'task.failed') {
                setAgentStatus('error');
                setExecutionEvents((prev) => [...prev, event]);

                if (activeExecution) {
                  activeExecution = {
                    ...activeExecution,
                    status: 'error',
                    summary: event.message || 'Task encountered an error',
                  };
                }

                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMsgId
                      ? {
                          ...msg,
                          isStreaming: false,
                          isError: true,
                          execution: activeExecution
                            ? {
                                id: `exec-${assistantMsgId}`,
                                ...activeExecution,
                              }
                            : undefined,
                        }
                      : msg
                  )
                );
              } else if (event.type === 'error') {
                setAgentStatus('error');
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMsgId
                      ? {
                          ...msg,
                          isStreaming: false,
                          isError: true,
                          content: event.message || msg.content || 'An error occurred during execution.',
                          text: event.message || msg.text || 'An error occurred during execution.',
                        }
                      : msg
                  )
                );
              }
            } catch (parseError) {
              console.warn('Failed to parse SSE event payload:', parseError);
            }
          }
        }
      }

      // Finalize assistant message. Always mark execution.status completed so
      // the activity spinner never gets stuck after the stream closes.
      thinkingIndicatorActive = false;
      let finalizedMessages: ChatMessage[] = [];
      setMessages((prev) => {
        const finalized = prev.map((msg) =>
          msg.id === assistantMsgId
            ? {
                ...msg,
                isStreaming: false,
                content: accumulatedText || msg.content,
                text: accumulatedText || msg.text,
                execution: msg.execution
                  ? { ...msg.execution, status: 'completed' as const }
                  : msg.execution,
              }
            : msg
        );
        finalizedMessages = finalized;

        setConversations((threads) =>
          threads.map((t) =>
            t.id === currentConversationId
              ? {
                  ...t,
                  messages: finalized,
                  taskStatus: 'completed',
                  updatedAt: new Date().toISOString(),
                }
              : t
          )
        );

        return finalized;
      });

      // Refresh the cache with the finalized message list once React has
      // applied the state update above.
      if (currentConversationId && finalizedMessages.length > 0) {
        writeSessionCache({
          messagesByChat: { [currentConversationId]: finalizedMessages },
          activeChatId: currentConversationId,
        });
      }

      setAgentStatus('idle');
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log('Chat stream aborted by user');
      } else {
        console.error('Chat stream error:', err);
        setAgentStatus('error');
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMsgId
              ? {
                  ...msg,
                  isStreaming: false,
                  isError: true,
                  content: `Execution failed: ${err.message || 'Network error'}`,
                  text: `Execution failed: ${err.message || 'Network error'}`,
                }
              : msg
          )
        );
      }
    } finally {
      isSubmittingRef.current = false;
      abortControllerRef.current = null;
    }
  };

  return (
    <AgentContext.Provider
      value={{
        currentView,
        setCurrentView,
        navigateToChat,
        openSettings,
        theme,
        setTheme,
        toggleTheme,
        sidebarCollapsed,
        setSidebarCollapsed,
        mobileSidebarOpen,
        setMobileSidebarOpen,
        toggleMobileSidebar,
        closeMobileSidebar,
        conversations,
        currentConversationId,
        isLoadingChats,
        createConversation,
        createNewTask,
        resetConversation,
        renameConversation,
        deleteConversation,
        selectConversation,
        messages,
        isLoadingMessages,
        agentStatus,
        taskStatus:
          agentStatus === 'thinking' || agentStatus === 'running_tool' || agentStatus === 'responding'
            ? 'running'
            : agentStatus === 'error'
            ? 'error'
            : 'idle',
        currentPrompt,
        setCurrentPrompt,
        submitPrompt,
        stopTask,
        providers,
        configuredModels,
        selectedModel,
        setSelectedModel: (sel) => {
          setSelectedModelState(sel);
          setConfig((prev) => ({ ...prev, provider: sel.provider, model: sel.model }));
        },
        selectModel,
        availableModels,
        isLoadingConfig,
        isLoadingModels,
        refreshProviders,
        saveAiProviderKey,
        deleteAiProviderKey,
        deleteAccount,
        refreshConfiguredModels,
        refreshModels,
        searchProviders,
        activeSearchProviderId,
        isLoadingSearchProviders,
        refreshSearchProviders,
        saveSearchProviderConfig,
        removeSearchProviderKey,
        testSearchProviderConnection,
        selectSearchProvider,
        config,
        refreshConfig,
        saveConfig,
        executionEvents,
      }}
    >
      {children}
    </AgentContext.Provider>
  );
};

export const useAgent = (): AgentContextType => {
  const context = useContext(AgentContext);
  if (!context) {
    throw new Error('useAgent must be used within an AgentProvider');
  }
  return context;
};
