import React, { useState, useEffect } from 'react';
import {
  Cpu,
  ShieldCheck,
  Check,
  Eye,
  EyeOff,
  RotateCw,
  Sparkles,
  AlertCircle,
  Key,
  KeyRound,
  Lock,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  ExternalLink,
  ChevronRight,
  UserCheck,
  LogOut,
  Mail,
  Send,
  Loader2,
  Zap,
  History,
  Clock,
  Inbox,
  Copy,
} from 'lucide-react';
import { useAgent } from '../../context/AgentContext';
import { useAuth } from '../../context/AuthContext';
import { useGmail } from '../../context/GmailContext';
import {
  AIProviderId,
} from '../../types';
import { ProviderLogo } from '../common/ProviderLogo';

type SettingsSection = 'account' | 'gmail' | 'ai-providers' | 'security';

interface SectionMeta {
  id: SettingsSection;
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
}

const SECTIONS: SectionMeta[] = [
  {
    id: 'account',
    title: 'Account',
    subtitle: 'Google authentication profile and session status',
    icon: UserCheck,
  },
  {
    id: 'gmail',
    title: 'Gmail & Outreach',
    subtitle: 'Connect Gmail to send client proposals (gmail.send scope)',
    icon: Mail,
  },
  {
    id: 'ai-providers',
    title: 'AI Providers',
    subtitle: 'Gemini, OpenAI, OpenRouter, Claude, Grok, DeepSeek, Hugging Face, & Ollama',
    icon: Cpu,
  },
  {
    id: 'security',
    title: 'Security & Keys',
    subtitle: 'Server-side key storage and zero client exposure policy',
    icon: ShieldCheck,
  },
];

const PROVIDER_METADATA: Record<
  AIProviderId,
  {
    name: string;
    badge: string;
    description: string;
    keyPlaceholder: string;
    keyHelpUrl: string;
    keyHelpText: string;
    defaultModel: string;
  }
> = {
  google: {
    name: 'Google Gemini',
    badge: 'Direct Google AI',
    description: 'Frontier multimodal and reasoning models directly from Google AI.',
    keyPlaceholder: 'AIzaSy...',
    keyHelpUrl: 'https://aistudio.google.com/app/apikey',
    keyHelpText: 'Get a Gemini API Key in Google AI Studio',
    defaultModel: 'gemini-2.5-flash',
  },
  openai: {
    name: 'OpenAI',
    badge: 'Direct OpenAI',
    description: 'GPT-4o, GPT-4o mini, o3-mini, and o1 models directly from OpenAI.',
    keyPlaceholder: 'sk-proj-...',
    keyHelpUrl: 'https://platform.openai.com/api-keys',
    keyHelpText: 'Get an OpenAI API Key in OpenAI Dashboard',
    defaultModel: 'gpt-4o',
  },
  openrouter: {
    name: 'OpenRouter',
    badge: 'Multi-Model Gateway',
    description: 'Access hundreds of open-source and frontier models including free tiers.',
    keyPlaceholder: 'sk-or-v1-...',
    keyHelpUrl: 'https://openrouter.ai/keys',
    keyHelpText: 'Get an OpenRouter API Key in OpenRouter Dashboard',
    defaultModel: 'openai/gpt-oss-20b:free',
  },
  anthropic: {
    name: 'Anthropic Claude',
    badge: 'Direct Anthropic',
    description: 'Claude 3.7 Sonnet, Claude 3.5 Sonnet, and Claude 3.5 Haiku frontier models.',
    keyPlaceholder: 'sk-ant-api03-...',
    keyHelpUrl: 'https://console.anthropic.com/settings/keys',
    keyHelpText: 'Get an Anthropic API Key in Anthropic Console',
    defaultModel: 'claude-3-7-sonnet-20250219',
  },
  xai: {
    name: 'xAI Grok',
    badge: 'Direct xAI',
    description: 'Grok 2 latest and fast reasoning models directly from xAI.',
    keyPlaceholder: 'xai-...',
    keyHelpUrl: 'https://console.x.ai/',
    keyHelpText: 'Get an xAI API Key in xAI Console',
    defaultModel: 'grok-2-latest',
  },
  deepseek: {
    name: 'DeepSeek',
    badge: 'Direct DeepSeek',
    description: 'DeepSeek Chat (V3) and DeepSeek Reasoner (R1) high-efficiency models.',
    keyPlaceholder: 'sk-...',
    keyHelpUrl: 'https://platform.deepseek.com/api_keys',
    keyHelpText: 'Get a DeepSeek API Key in DeepSeek Platform',
    defaultModel: 'deepseek-chat',
  },
  huggingface: {
    name: 'Hugging Face',
    badge: 'Inference Providers',
    description: 'Llama 3.3, Mistral, Qwen, and open models via HF Inference Providers.',
    keyPlaceholder: 'hf_...',
    keyHelpUrl: 'https://huggingface.co/settings/tokens',
    keyHelpText: 'Get a User Access Token in Hugging Face Settings',
    defaultModel: 'meta-llama/Llama-3.3-70B-Instruct',
  },
  ollama: {
    name: 'Ollama',
    badge: 'Local & Self-Hosted',
    description: 'Local and self-hosted models running on your machine or private cloud.',
    keyPlaceholder: 'http://localhost:11434 (or token@http://host:11434)',
    keyHelpUrl: 'https://ollama.com/download',
    keyHelpText: 'Download Ollama or configure host URL',
    defaultModel: 'llama3.2',
  },
};

const DEFAULT_MODELS_FOR_PROVIDER: Record<AIProviderId, { id: string; name: string; isFree?: boolean }[]> = {
  google: [
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
    { id: 'gemini-3.7-flash', name: 'Gemini 3.7 Flash' },
    { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro Preview' },
    { id: 'gemini-flash-latest', name: 'Gemini Flash Latest' },
  ],
  openai: [
    { id: 'gpt-4o', name: 'GPT-4o' },
    { id: 'gpt-4o-mini', name: 'GPT-4o mini' },
    { id: 'o3-mini', name: 'o3-mini' },
    { id: 'o1', name: 'o1' },
    { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
  ],
  openrouter: [
    { id: 'openrouter/free', name: 'OpenRouter Free Models (Auto)', isFree: true },
    { id: 'openai/gpt-oss-20b:free', name: 'GPT-OSS 20B (Free)', isFree: true },
    { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 3.3 70B Instruct · Free', isFree: true },
    { id: 'google/gemini-2.0-flash-exp:free', name: 'Gemini 2.0 Flash Exp · Free', isFree: true },
    { id: 'deepseek/deepseek-r1:free', name: 'DeepSeek R1 · Free', isFree: true },
    { id: 'qwen/qwen-2.5-72b-instruct:free', name: 'Qwen 2.5 72B Instruct · Free', isFree: true },
    { id: 'anthropic/claude-3.7-sonnet', name: 'Claude 3.7 Sonnet' },
    { id: 'openai/gpt-4o', name: 'GPT-4o' },
  ],
  anthropic: [
    { id: 'claude-3-7-sonnet-20250219', name: 'Claude 3.7 Sonnet' },
    { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' },
    { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku' },
    { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus' },
  ],
  xai: [
    { id: 'grok-2-latest', name: 'Grok 2 (Latest)' },
    { id: 'grok-2', name: 'Grok 2' },
    { id: 'grok-beta', name: 'Grok Beta' },
    { id: 'grok-2-vision-latest', name: 'Grok 2 Vision' },
  ],
  deepseek: [
    { id: 'deepseek-chat', name: 'DeepSeek Chat (V3)' },
    { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner (R1)' },
  ],
  huggingface: [
    { id: 'meta-llama/Llama-3.3-70B-Instruct', name: 'Llama 3.3 70B Instruct' },
    { id: 'mistralai/Mistral-7B-Instruct-v0.3', name: 'Mistral 7B Instruct' },
    { id: 'Qwen/Qwen2.5-72B-Instruct', name: 'Qwen 2.5 72B Instruct' },
    { id: 'deepseek-ai/DeepSeek-R1-Distill-Qwen-32B', name: 'DeepSeek R1 Distill Qwen 32B' },
  ],
  ollama: [
    { id: 'llama3.2', name: 'Llama 3.2' },
    { id: 'mistral', name: 'Mistral' },
    { id: 'qwen2.5', name: 'Qwen 2.5' },
    { id: 'llama3.3', name: 'Llama 3.3' },
    { id: 'deepseek-r1', name: 'DeepSeek R1' },
    { id: 'gemma2', name: 'Gemma 2' },
  ],
};

export const SettingsPage: React.FC = () => {
  const {
    providers,
    configuredModels,
    selectedModel,
    selectModel,
    availableModels,
    refreshModels,
    saveAiProviderKey,
    deleteAiProviderKey,
    deleteAccount,
    config,
    saveConfig,
    navigateToChat,
  } = useAgent();

  const { currentUser, getIdToken, signOut } = useAuth();

  const {
    status: gmailStatus,
    loading: gmailLoading,
    isConnecting: gmailConnecting,
    error: gmailError,
    refreshStatus: refreshGmailStatus,
    connectGmail,
    disconnectGmail,
    sendTestEmail,
    sendProposalEmail,

    smtpStatus,
    smtpLoading,
    smtpConnecting,
    smtpError,
    refreshSmtpStatus,
    connectSmtp,
    disconnectSmtp,
    sendSmtpTestEmail,
    hasAnyConnection,
  } = useGmail();

  const [selectedGmailTab, setSelectedGmailTab] = useState<'oauth' | 'smtp'>('oauth');
  const [smtpEmailInput, setSmtpEmailInput] = useState<string>('');
  const [smtpPasswordInput, setSmtpPasswordInput] = useState<string>('');
  const [showSmtpPassword, setShowSmtpPassword] = useState<boolean>(false);
  const [confirmDisconnectSmtp, setConfirmDisconnectSmtp] = useState<boolean>(false);
  const [smtpFeedback, setSmtpFeedback] = useState<{ success: boolean; message?: string; error?: string } | null>(null);

  const [testEmailRecipient, setTestEmailRecipient] = useState<string>('');
  const [testEmailProvider, setTestEmailProvider] = useState<'oauth' | 'smtp'>('oauth');
  const [isSendingTestEmail, setIsSendingTestEmail] = useState<boolean>(false);
  const [testEmailResult, setTestEmailResult] = useState<{ success: boolean; message?: string; error?: string } | null>(null);

  const [proposalRecipient, setProposalRecipient] = useState<string>('');
  const [proposalProvider, setProposalProvider] = useState<'oauth' | 'smtp'>('oauth');
  const [proposalSubject, setProposalSubject] = useState<string>('Strategic Website Modernization & Conversion Proposal');
  const [proposalBody, setProposalBody] = useState<string>(
    'Hi there,\n\nWe recently analyzed your business website and identified high-impact opportunities to dramatically improve page load speed, mobile responsiveness, and local search discoverability.\n\nWould you be open to a brief conversation this week to review our diagnostic findings?\n\nBest regards,\nSanMine Space Team'
  );
  const [proposalBusinessName, setProposalBusinessName] = useState<string>('');
  const [isSendingProposal, setIsSendingProposal] = useState<boolean>(false);
  const [proposalResult, setProposalResult] = useState<{ success: boolean; message?: string; error?: string } | null>(null);
  const [confirmDisconnectGmail, setConfirmDisconnectGmail] = useState<boolean>(false);

  // Autonomous Outreach Preference State
  const [autoSendProposals, setAutoSendProposals] = useState<boolean>(false);
  const [loadingPreferences, setLoadingPreferences] = useState<boolean>(false);
  const [savingPreferences, setSavingPreferences] = useState<boolean>(false);
  const [outreachHistory, setOutreachHistory] = useState<any[]>([]);
  const [loadingOutreachHistory, setLoadingOutreachHistory] = useState<boolean>(false);

  const [activeSection, setActiveSection] = useState<SettingsSection>('account');
  // On mobile: false = Screen 1 (Category List), true = Screen 2 (Selected Category Content)
  const [mobileDetailOpen, setMobileDetailOpen] = useState<boolean>(false);

  // Currently managed provider inside AI Providers tab
  const [editingProviderId, setEditingProviderId] = useState<AIProviderId>('google');

  // AI Provider Key State
  const [providerApiKeyInput, setProviderApiKeyInput] = useState<string>('');
  const [showProviderApiKey, setShowProviderApiKey] = useState<boolean>(false);
  const [isSavingProviderKey, setIsSavingProviderKey] = useState<boolean>(false);
  const [providerKeySaveResult, setProviderKeySaveResult] = useState<{
    success: boolean;
    message?: string;
    error?: string;
    maskedKey?: string;
  } | null>(null);

  // Form state for provider model selection
  const [selectedModelInput, setSelectedModelInput] = useState<string>('gemini-2.5-flash');
  const [customModelInput, setCustomModelInput] = useState<string>('');
  const [useCustomModel, setUseCustomModel] = useState<boolean>(false);

  // Generation parameters
  const [temperature, setTemperature] = useState<number>(config.temperature ?? 0.7);
  const [maxTokens, setMaxTokens] = useState<number>(config.maxTokens ?? 4096);
  const [streaming, setStreaming] = useState<boolean>(config.streaming ?? true);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Key Removal State
  const [confirmDeleteKey, setConfirmDeleteKey] = useState<boolean>(false);
  const [isDeletingKey, setIsDeletingKey] = useState<boolean>(false);

  // Account Deletion State
  const [confirmDeleteAccount, setConfirmDeleteAccount] = useState<boolean>(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState<boolean>(false);
  const [deleteAccountError, setDeleteAccountError] = useState<string | null>(null);

  const [isRefreshingModels, setIsRefreshingModels] = useState<boolean>(false);
  const [copiedEmail, setCopiedEmail] = useState<boolean>(false);
  const [feedbackBanner, setFeedbackBanner] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // When switching editing provider or when providers/configuredModels update, set initial state
  useEffect(() => {
    const p = providers.find((prov) => prov.id === editingProviderId);
    const providerConfiguredModels = configuredModels.filter((m) => m.provider === editingProviderId);

    if (providerConfiguredModels.length > 0) {
      setSelectedModelInput(providerConfiguredModels[0].modelId);
    } else if (p && p.selectedModel) {
      setSelectedModelInput(p.selectedModel);
    } else if (p && p.defaultModel) {
      setSelectedModelInput(p.defaultModel);
    } else {
      setSelectedModelInput(PROVIDER_METADATA[editingProviderId].defaultModel);
    }
    setCustomModelInput('');
    setUseCustomModel(false);
    setProviderApiKeyInput('');
    setProviderKeySaveResult(null);
  }, [editingProviderId, providers, configuredModels]);

  const handleSaveProviderKey = async () => {
    if (!providerApiKeyInput.trim()) {
      setProviderKeySaveResult({
        success: false,
        error: 'Please enter a valid API key.',
      });
      return;
    }

    setIsSavingProviderKey(true);
    setProviderKeySaveResult(null);

    const modelToSave = useCustomModel && customModelInput.trim() ? customModelInput.trim() : selectedModelInput;
    const res = await saveAiProviderKey(editingProviderId, providerApiKeyInput, modelToSave);
    setIsSavingProviderKey(false);

    if (res.ok) {
      setProviderApiKeyInput('');
      setProviderKeySaveResult({
        success: true,
        message: 'API key saved',
        maskedKey: res.maskedKey,
      });
      showFeedback('success', `API key saved and set active for ${PROVIDER_METADATA[editingProviderId].name}`);
    } else {
      setProviderKeySaveResult({
        success: false,
        error: res.error || 'Failed to save API key to PostgreSQL database',
      });
    }
  };

  const handleDeleteProviderKey = async () => {
    setIsDeletingKey(true);
    setProviderKeySaveResult(null);

    const res = await deleteAiProviderKey(editingProviderId);
    setIsDeletingKey(false);
    setConfirmDeleteKey(false);

    if (res.ok) {
      setProviderApiKeyInput('');
      setProviderKeySaveResult({
        success: true,
        message: `API key permanently removed for ${PROVIDER_METADATA[editingProviderId].name}.`,
      });
      showFeedback('success', `API key deleted for ${PROVIDER_METADATA[editingProviderId].name}`);
    } else {
      setProviderKeySaveResult({
        success: false,
        error: res.error || 'Failed to remove API key from database.',
      });
    }
  };

  const handleDeleteAccount = async () => {
    setIsDeletingAccount(true);
    setDeleteAccountError(null);

    const res = await deleteAccount();
    if (res.ok) {
      try {
        await signOut();
      } catch {}
      window.location.href = '/';
    } else {
      setIsDeletingAccount(false);
      setDeleteAccountError(res.error || 'Failed to permanently delete account. Please try again.');
    }
  };

  const showFeedback = (type: 'success' | 'error', message: string) => {
    setFeedbackBanner({ type, message });
    setTimeout(() => {
      setFeedbackBanner(null);
    }, 4000);
  };

  const loadPreferences = async () => {
    if (!currentUser) return;
    try {
      setLoadingPreferences(true);
      const token = await getIdToken();
      if (!token) return;
      const res = await fetch('/api/settings/preferences', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        setAutoSendProposals(Boolean(data.preferences?.autoSendProposals));
      }
    } catch (err) {
      console.warn('Error loading preferences:', err);
    } finally {
      setLoadingPreferences(false);
    }
  };

  const loadOutreachHistory = async () => {
    if (!currentUser) return;
    try {
      setLoadingOutreachHistory(true);
      const token = await getIdToken();
      if (!token) return;
      const res = await fetch('/api/settings/outreach-history', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        setOutreachHistory(Array.isArray(data.history) ? data.history : []);
      }
    } catch (err) {
      console.warn('Error loading outreach history:', err);
    } finally {
      setLoadingOutreachHistory(false);
    }
  };

  useEffect(() => {
    if (currentUser) {
      loadPreferences();
      loadOutreachHistory();
    }
  }, [currentUser]);

  const toggleAutoSend = async (newVal: boolean) => {
    try {
      setSavingPreferences(true);
      const token = await getIdToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const res = await fetch('/api/settings/preferences', {
        method: 'POST',
        headers,
        body: JSON.stringify({ autoSendProposals: newVal }),
      });
      if (res.ok) {
        setAutoSendProposals(newVal);
        showFeedback('success', `Outreach Automation turned ${newVal ? 'ON' : 'OFF'}.`);
      } else {
        showFeedback('error', 'Failed to save automation preference.');
      }
    } catch (err: any) {
      showFeedback('error', err.message || 'Failed to update preferences.');
    } finally {
      setSavingPreferences(false);
    }
  };

  // Filter models for currently edited provider with guaranteed fallback
  const apiModels = availableModels.filter((m) => m.provider === editingProviderId);
  const fallbackModels = DEFAULT_MODELS_FOR_PROVIDER[editingProviderId] || [];
  const providerModels = apiModels.length > 0 ? apiModels : fallbackModels;

  const handleSelectModel = (modelId: string) => {
    selectModel(editingProviderId, modelId);
    showFeedback('success', `Active model set to ${modelId}`);
  };

  // Refresh models from API
  const handleRefreshModels = async () => {
    setIsRefreshingModels(true);
    await refreshModels(editingProviderId, true);
    setIsRefreshingModels(false);
    showFeedback('success', 'Model catalog refreshed from provider API.');
  };

  // Save Generation Parameters
  const handleSaveParameters = async () => {
    setIsSaving(true);
    const res = await saveConfig({
      temperature,
      maxTokens,
      streaming,
    });
    setIsSaving(false);

    if (res.success) {
      showFeedback('success', 'Generation parameters updated.');
    } else {
      showFeedback('error', res.error || 'Failed to save parameters.');
    }
  };

  const editingProviderInfo = providers.find((p) => p.id === editingProviderId);
  const metadata = PROVIDER_METADATA[editingProviderId];

  // Helper counts for badges
  const configuredProvidersCount = providers.filter((p) => p.isConfigured).length;

  const currentSectionMeta = SECTIONS.find((s) => s.id === activeSection) || SECTIONS[0];

  // Mobile selection handler
  const handleSelectCategoryMobile = (sectionId: SettingsSection) => {
    setActiveSection(sectionId);
    setMobileDetailOpen(true);
  };

  // =========================================================================
  // RENDER CONTENT FOR SELECTED SECTION
  // =========================================================================
  const renderSectionContent = () => {
    switch (activeSection) {
      case 'account':
        return (
          <div className="space-y-6">
            <div className="bg-[#FFFFFF] border border-[#E5E2DC] rounded-2xl p-4 sm:p-6 space-y-5 shadow-2xs">
              <div className="flex items-center justify-between border-b border-[#E5E2DC] pb-3">
                <h2 className="text-xs sm:text-sm font-semibold text-[#1F1E1B] uppercase tracking-wider">
                  Google Account Profile
                </h2>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[#EBF3ED] text-[#245738]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#3F7A5A]"></span>
                  Authenticated
                </span>
              </div>

              {/* User Identity Details */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl bg-[#FAF9F5] border border-[#E5E2DC]">
                <div className="flex items-center gap-3.5 min-w-0">
                  {currentUser?.photoURL ? (
                    <img
                      src={currentUser.photoURL}
                      alt={currentUser.displayName || 'Google User'}
                      referrerPolicy="no-referrer"
                      className="w-12 h-12 rounded-full border border-[#E5E2DC] object-cover shadow-2xs shrink-0"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-[#FFFFFF] border border-[#E5E2DC] flex items-center justify-center text-lg font-bold text-[#C66A3D] shrink-0 shadow-2xs">
                      {(currentUser?.displayName?.[0] || currentUser?.email?.[0] || 'U').toUpperCase()}
                    </div>
                  )}

                  <div className="space-y-0.5 min-w-0">
                    <div className="text-sm font-semibold text-[#1F1E1B] truncate">
                      {currentUser?.displayName || 'SanMine Space User'}
                    </div>
                    <div className="text-xs text-[#6B6862] truncate">
                      {currentUser?.email}
                    </div>
                    <div className="text-[10px] text-[#9C988F] font-mono truncate">
                      UID: {currentUser?.uid}
                    </div>
                  </div>
                </div>

                <button
                  id="btn-settings-signout"
                  type="button"
                  onClick={() => signOut()}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-[#C66A3D] hover:bg-[#B55B2E] transition-colors cursor-pointer shadow-2xs shrink-0 flex items-center gap-2"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out</span>
                </button>
              </div>
            </div>

            {/* Support & Helpdesk Card */}
            <div className="bg-[#FFFFFF] border border-[#E5E2DC] rounded-2xl p-4 sm:p-6 space-y-5 shadow-2xs">
              <div className="flex items-center justify-between border-b border-[#E5E2DC] pb-3">
                <h2 className="text-xs sm:text-sm font-semibold text-[#1F1E1B] uppercase tracking-wider">
                  Support & Helpdesk
                </h2>
                <span className="text-xs text-[#9C988F]">
                  Inquiries & Help
                </span>
              </div>

              {/* Support Email */}
              <div className="p-4 rounded-xl bg-[#FAF9F5] border border-[#E5E2DC] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1 min-w-0">
                  <div className="text-xs font-semibold text-[#1F1E1B] flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-[#3F7A5A]" />
                    <span>Support & Helpdesk</span>
                  </div>
                  <p className="text-xs text-[#6B6862] leading-relaxed">
                    For application support, bug reports, and account help, contact our dedicated support inbox:
                  </p>
                  <div className="font-mono text-xs font-semibold text-[#1F1E1B] pt-0.5">
                    support.sanminespace@gmail.com
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <a
                    id="btn-send-support-email"
                    href="mailto:support.sanminespace@gmail.com"
                    className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-[#1F1E1B] bg-[#FFFFFF] border border-[#E5E2DC] hover:bg-[#F2F1ED] transition-colors shadow-2xs cursor-pointer"
                  >
                    <Mail className="w-3.5 h-3.5 text-[#C66A3D]" />
                    <span>Send Email</span>
                  </a>
                  <button
                    id="btn-copy-support-email"
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText('support.sanminespace@gmail.com');
                      setCopiedEmail(true);
                      setTimeout(() => setCopiedEmail(false), 2000);
                    }}
                    className="px-3 py-2 rounded-xl text-xs font-semibold text-[#6B6862] bg-[#FFFFFF] border border-[#E5E2DC] hover:bg-[#F2F1ED] hover:text-[#1F1E1B] transition-colors shadow-2xs cursor-pointer flex items-center gap-1.5"
                  >
                    {copiedEmail ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-[#3F7A5A]" />
                        <span>Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Legal & Governance Direct Links */}
              <div className="pt-2 flex flex-wrap items-center gap-4 text-xs text-[#6B6862] border-t border-[#E5E2DC]/60">
                <span className="font-medium text-[#1F1E1B]">Platform Policies:</span>
                <a href="/privacy" className="hover:text-[#1F1E1B] underline underline-offset-4 transition-colors">
                  Privacy Policy
                </a>
                <span>•</span>
                <a href="/terms" className="hover:text-[#1F1E1B] underline underline-offset-4 transition-colors">
                  Terms of Service
                </a>
              </div>
            </div>

            {/* Danger Zone: Account & Data Deletion */}
            <div className="bg-[#FFFFFF] border border-[#F5D5D0] rounded-2xl p-4 sm:p-6 space-y-4 shadow-2xs">
              <div className="flex items-center justify-between border-b border-[#F5D5D0] pb-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-[#D9381E]" />
                  <h2 className="text-xs sm:text-sm font-semibold text-[#D9381E] uppercase tracking-wider">
                    Danger Zone: Permanent Account Deletion
                  </h2>
                </div>
                <span className="text-[10px] font-mono font-semibold bg-[#FDF3F2] text-[#D9381E] px-2 py-0.5 rounded-full border border-[#F5D5D0]">
                  Irreversible
                </span>
              </div>

              <div className="p-4 rounded-xl bg-[#FDF3F2]/60 border border-[#F5D5D0] space-y-3">
                <div className="text-xs text-[#D9381E] space-y-1">
                  <div className="font-semibold">Permanently Delete Account & All Data</div>
                  <p className="text-xs text-[#6B6862] leading-relaxed">
                    Permanently delete your account profile, all chat sessions, messages, conversation memories, task checkpoints, saved AI provider API keys, Gmail credentials, and outreach dispatch history from the database.
                  </p>
                </div>

                {deleteAccountError && (
                  <div className="p-3 rounded-lg bg-[#FFFFFF] border border-[#F5D5D0] text-xs text-[#D9381E] flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{deleteAccountError}</span>
                  </div>
                )}

                {confirmDeleteAccount ? (
                  <div className="p-3.5 rounded-xl bg-[#FFFFFF] border border-[#F5D5D0] space-y-3">
                    <div className="text-xs font-semibold text-[#D9381E]">
                      Are you absolutely sure? This action cannot be undone.
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        id="btn-confirm-delete-account"
                        type="button"
                        disabled={isDeletingAccount}
                        onClick={handleDeleteAccount}
                        className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-[#D9381E] hover:bg-[#B82B14] disabled:opacity-50 transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs"
                      >
                        {isDeletingAccount ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>Deleting Account...</span>
                          </>
                        ) : (
                          <>
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Yes, Permanently Delete My Account</span>
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        disabled={isDeletingAccount}
                        onClick={() => {
                          setConfirmDeleteAccount(false);
                          setDeleteAccountError(null);
                        }}
                        className="px-3 py-2 rounded-xl text-xs font-semibold text-[#6B6862] bg-[#FAF9F5] border border-[#E5E2DC] hover:bg-[#F2F1ED] transition-colors cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-end pt-1">
                    <button
                      id="btn-initiate-delete-account"
                      type="button"
                      onClick={() => setConfirmDeleteAccount(true)}
                      className="px-4 py-2 rounded-xl text-xs font-semibold text-[#D9381E] bg-[#FFFFFF] border border-[#F5D5D0] hover:bg-[#FDF3F2] transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete Account & Data</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        );

      case 'gmail':
        return (
          <div className="space-y-6">
            {/* Header & Mode Switcher */}
            <div className="bg-[#FFFFFF] border border-[#E5E2DC] rounded-2xl p-4 sm:p-6 space-y-4 shadow-2xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E5E2DC] pb-3">
                <div className="flex items-center gap-2">
                  <h2 className="text-xs sm:text-sm font-semibold text-[#1F1E1B] uppercase tracking-wider">
                    Gmail Connection & Dispatch
                  </h2>
                  <span className="text-[10px] font-mono font-semibold bg-[#FAF6F2] text-[#C66A3D] px-2 py-0.5 rounded-full border border-[#C66A3D]/20">
                    Single Active Provider Policy
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {gmailStatus?.connected ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[#EBF3ED] text-[#245738]">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#3F7A5A]"></span>
                      OAuth Active
                    </span>
                  ) : null}
                  {smtpStatus?.connected ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[#EBF3ED] text-[#245738]">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#3F7A5A]"></span>
                      SMTP Active
                    </span>
                  ) : null}
                  {!gmailStatus?.connected && !smtpStatus?.connected && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[#FFF8F0] text-[#9A5228]">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#C66A3D]"></span>
                      No Connection
                    </span>
                  )}
                </div>
              </div>

              {/* Tab Selector: OAuth vs SMTP */}
              <div className="flex items-center gap-2 p-1 bg-[#FAF9F5] border border-[#E5E2DC] rounded-xl">
                <button
                  type="button"
                  onClick={() => setSelectedGmailTab('oauth')}
                  className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    selectedGmailTab === 'oauth'
                      ? 'bg-[#FFFFFF] text-[#1F1E1B] shadow-2xs border border-[#E5E2DC]'
                      : 'text-[#6B6862] hover:text-[#1F1E1B]'
                  }`}
                >
                  <ShieldCheck className="w-4 h-4 text-[#C66A3D]" />
                  <span>1. Google OAuth (API)</span>
                  {gmailStatus?.connected && (
                    <span className="w-2 h-2 rounded-full bg-[#3F7A5A]"></span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedGmailTab('smtp')}
                  className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    selectedGmailTab === 'smtp'
                      ? 'bg-[#FFFFFF] text-[#1F1E1B] shadow-2xs border border-[#E5E2DC]'
                      : 'text-[#6B6862] hover:text-[#1F1E1B]'
                  }`}
                >
                  <KeyRound className="w-4 h-4 text-[#C66A3D]" />
                  <span>2. Gmail SMTP (App Password)</span>
                  {smtpStatus?.connected && (
                    <span className="w-2 h-2 rounded-full bg-[#3F7A5A]"></span>
                  )}
                </button>
              </div>
            </div>

            {/* TAB 1: Google OAuth Content */}
            {selectedGmailTab === 'oauth' && (
              <div className="bg-[#FFFFFF] border border-[#E5E2DC] rounded-2xl p-4 sm:p-6 space-y-5 shadow-2xs">
                <div className="flex items-center justify-between border-b border-[#E5E2DC] pb-3">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-[#C66A3D]" />
                    <h3 className="text-xs sm:text-sm font-semibold text-[#1F1E1B] uppercase tracking-wider">
                      Google OAuth Authentication
                    </h3>
                  </div>
                  <span className="text-[10px] font-mono font-semibold text-[#6B6862]">
                    scope: gmail.send
                  </span>
                </div>

                {/* Exclusivity Alert: SMTP already connected */}
                {smtpStatus?.connected && (
                  <div className="p-3.5 rounded-xl bg-[#FFF8F0] border border-[#F5DEC7] flex items-start justify-between gap-3 text-xs text-[#9A5228]">
                    <div className="flex items-start gap-2.5">
                      <Lock className="w-4 h-4 text-[#C66A3D] shrink-0 mt-0.5" />
                      <div className="space-y-0.5">
                        <div className="font-semibold">SMTP Connection Active</div>
                        <div>
                          A Gmail account (<span className="font-mono font-medium">{smtpStatus.email}</span>) is already connected through SMTP. Disconnect the existing Gmail account before connecting through Google.
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedGmailTab('smtp')}
                      className="shrink-0 px-2.5 py-1 rounded-lg text-xs font-semibold bg-[#FFFFFF] border border-[#F5DEC7] text-[#9A5228] hover:bg-[#FDF3EA] transition-colors cursor-pointer"
                    >
                      Manage SMTP
                    </button>
                  </div>
                )}

                {gmailError && (
                  <div className="p-3.5 rounded-xl bg-[#FDF3F2] border border-[#F5D5D0] flex flex-col gap-2.5 text-xs text-[#D9381E]">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2.5">
                        <AlertCircle className="w-4 h-4 text-[#D9381E] shrink-0 mt-0.5" />
                        <div className="space-y-0.5">
                          <div className="font-semibold">OAuth Notice</div>
                          <div>{gmailError}</div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => refreshGmailStatus()}
                        className="shrink-0 px-2.5 py-1 rounded-lg text-xs font-semibold bg-[#FFFFFF] border border-[#F5D5D0] text-[#D9381E] hover:bg-[#FBE8E5] transition-colors cursor-pointer"
                      >
                        Retry
                      </button>
                    </div>
                    {!smtpStatus?.connected && (
                      <div className="pt-2 border-t border-[#F5D5D0]/60 flex items-center justify-between">
                        <span className="text-[#6B6862]">Prefer not to use OAuth or having popup issues?</span>
                        <button
                          type="button"
                          onClick={() => setSelectedGmailTab('smtp')}
                          className="px-2.5 py-1 rounded-lg font-semibold bg-[#C66A3D] text-white hover:bg-[#B55B2E] transition-colors cursor-pointer flex items-center gap-1.5"
                        >
                          <KeyRound className="w-3 h-3" />
                          <span>Connect via SMTP (App Password) instead</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Connected Details / Connect Action */}
                <div className="p-4 sm:p-5 rounded-xl bg-[#FAF9F5] border border-[#E5E2DC] space-y-4">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className="w-11 h-11 rounded-xl bg-[#FFFFFF] border border-[#E5E2DC] flex items-center justify-center text-[#C66A3D] shadow-2xs shrink-0">
                        <Mail className="w-5 h-5" />
                      </div>
                      <div className="space-y-0.5 min-w-0">
                        <div className="text-sm font-semibold text-[#1F1E1B] truncate">
                          {gmailStatus?.connected
                            ? `Connected: ${gmailStatus.email || 'Google Account'}`
                            : 'Connect via Google OAuth'}
                        </div>
                        <div className="text-xs text-[#6B6862]">
                          {gmailStatus?.connected
                            ? 'SanMine Space is authorized to send business proposals via Google Gmail API.'
                            : smtpStatus?.connected
                            ? 'Disabled while SMTP connection is active. Disconnect SMTP to connect via Google OAuth.'
                            : 'Connect with a single click using official Google OAuth popup.'}
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center gap-2">
                      {gmailStatus?.connected ? (
                        confirmDisconnectGmail ? (
                          <div className="flex items-center gap-1.5">
                            <button
                              id="btn-confirm-disconnect-gmail"
                              type="button"
                              onClick={async () => {
                                await disconnectGmail();
                                setConfirmDisconnectGmail(false);
                              }}
                              disabled={gmailLoading}
                              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-[#D9381E] hover:bg-[#B52B14] transition-colors cursor-pointer"
                            >
                              Confirm Disconnect
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDisconnectGmail(false)}
                              className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-[#6B6862] hover:bg-[#E5E2DC] transition-colors cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            id="btn-disconnect-gmail"
                            type="button"
                            onClick={() => setConfirmDisconnectGmail(true)}
                            className="px-3.5 py-2 rounded-xl text-xs font-medium text-[#D9381E] bg-[#FFFFFF] border border-[#F5D5D0] hover:bg-[#FDF3F2] transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Disconnect OAuth</span>
                          </button>
                        )
                      ) : (
                        <button
                          id="btn-connect-gmail"
                          type="button"
                          onClick={connectGmail}
                          disabled={gmailConnecting || Boolean(smtpStatus?.connected)}
                          className={`px-4 py-2 rounded-xl text-xs font-semibold text-white transition-colors shadow-2xs flex items-center gap-2 ${
                            smtpStatus?.connected
                              ? 'bg-[#9C988F] opacity-60 cursor-not-allowed'
                              : 'bg-[#C66A3D] hover:bg-[#B55B2E] cursor-pointer'
                          }`}
                        >
                          {gmailConnecting ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              <span>Connecting...</span>
                            </>
                          ) : (
                            <>
                              <ExternalLink className="w-3.5 h-3.5" />
                              <span>Connect with Google</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: Gmail SMTP Content */}
            {selectedGmailTab === 'smtp' && (
              <div className="bg-[#FFFFFF] border border-[#E5E2DC] rounded-2xl p-4 sm:p-6 space-y-5 shadow-2xs">
                <div className="flex items-center justify-between border-b border-[#E5E2DC] pb-3">
                  <div className="flex items-center gap-2">
                    <KeyRound className="w-4 h-4 text-[#C66A3D]" />
                    <h3 className="text-xs sm:text-sm font-semibold text-[#1F1E1B] uppercase tracking-wider">
                      Gmail SMTP Connection (App Password)
                    </h3>
                  </div>
                  <span className="text-[10px] font-mono font-semibold text-[#6B6862]">
                    smtp.gmail.com:465 / 587
                  </span>
                </div>

                {/* Exclusivity Alert: OAuth already connected */}
                {gmailStatus?.connected && (
                  <div className="p-3.5 rounded-xl bg-[#FFF8F0] border border-[#F5DEC7] flex items-start justify-between gap-3 text-xs text-[#9A5228]">
                    <div className="flex items-start gap-2.5">
                      <Lock className="w-4 h-4 text-[#C66A3D] shrink-0 mt-0.5" />
                      <div className="space-y-0.5">
                        <div className="font-semibold">Google OAuth Connection Active</div>
                        <div>
                          A Gmail account (<span className="font-mono font-medium">{gmailStatus.email || 'Google Account'}</span>) is already connected through Google. Disconnect the existing Gmail account before connecting Gmail manually through SMTP.
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedGmailTab('oauth')}
                      className="shrink-0 px-2.5 py-1 rounded-lg text-xs font-semibold bg-[#FFFFFF] border border-[#F5DEC7] text-[#9A5228] hover:bg-[#FDF3EA] transition-colors cursor-pointer"
                    >
                      Manage OAuth
                    </button>
                  </div>
                )}

                {/* Instructions Box */}
                <div className="p-4 rounded-xl bg-[#FAF9F5] border border-[#E5E2DC] space-y-3">
                  <div className="flex items-start gap-2.5">
                    <Lock className="w-4 h-4 text-[#C66A3D] shrink-0 mt-0.5" />
                    <div className="text-xs text-[#1F1E1B] space-y-1">
                      <span className="font-semibold block">How to connect with a Google App Password</span>
                      <p className="text-[#6B6862] leading-relaxed">
                        Gmail SMTP uses an encrypted 16-character <strong>App Password</strong> generated directly in your Google Account.
                        Do <em>not</em> use your personal account login password.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 text-[11px] text-[#4A4741]">
                    <div className="p-2 bg-[#FFFFFF] rounded-lg border border-[#E5E2DC]">
                      <span className="font-semibold block text-[#1F1E1B]">Step 1</span>
                      <span>Turn on 2-Step Verification in your Google Account.</span>
                    </div>
                    <div className="p-2 bg-[#FFFFFF] rounded-lg border border-[#E5E2DC]">
                      <span className="font-semibold block text-[#1F1E1B]">Step 2</span>
                      <span>Go to Google Account &gt; Security &gt; <strong>App Passwords</strong>.</span>
                    </div>
                    <div className="p-2 bg-[#FFFFFF] rounded-lg border border-[#E5E2DC]">
                      <span className="font-semibold block text-[#1F1E1B]">Step 3</span>
                      <span>Generate a 16-letter password and paste it below.</span>
                    </div>
                  </div>

                  <div className="pt-1">
                    <a
                      href="https://myaccount.google.com/apppasswords"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#C66A3D] hover:underline"
                    >
                      <span>Open Google App Passwords settings</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>

                {smtpError && (
                  <div className="p-3.5 rounded-xl bg-[#FDF3F2] border border-[#F5D5D0] flex items-start justify-between gap-3 text-xs text-[#D9381E]">
                    <div className="flex items-start gap-2.5">
                      <AlertCircle className="w-4 h-4 text-[#D9381E] shrink-0 mt-0.5" />
                      <div className="space-y-0.5">
                        <div className="font-semibold">SMTP Error</div>
                        <div>{smtpError}</div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => refreshSmtpStatus()}
                      className="shrink-0 px-2.5 py-1 rounded-lg text-xs font-semibold bg-[#FFFFFF] border border-[#F5D5D0] text-[#D9381E] hover:bg-[#FBE8E5] transition-colors cursor-pointer"
                    >
                      Retry
                    </button>
                  </div>
                )}

                {smtpFeedback && (
                  <div
                    className={`p-3.5 rounded-xl border flex items-start gap-2.5 text-xs ${
                      smtpFeedback.success
                        ? 'bg-[#EBF3ED] border-[#D5E5DA] text-[#245738]'
                        : 'bg-[#FDF3F2] border-[#F5D5D0] text-[#D9381E]'
                    }`}
                  >
                    {smtpFeedback.success ? (
                      <CheckCircle2 className="w-4 h-4 text-[#3F7A5A] shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-[#D9381E] shrink-0 mt-0.5" />
                    )}
                    <div>{smtpFeedback.message || smtpFeedback.error}</div>
                  </div>
                )}

                {/* SMTP Connection Form or Connected State */}
                {smtpStatus?.connected ? (
                  <div className="p-4 sm:p-5 rounded-xl bg-[#EBF3ED] border border-[#D5E5DA] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className="w-11 h-11 rounded-xl bg-[#FFFFFF] border border-[#D5E5DA] flex items-center justify-center text-[#245738] shadow-2xs shrink-0">
                        <KeyRound className="w-5 h-5" />
                      </div>
                      <div className="space-y-0.5 min-w-0">
                        <div className="text-sm font-semibold text-[#1F1E1B] truncate">
                          Gmail SMTP Connected
                        </div>
                        <div className="text-xs text-[#245738]">
                          Active: <span className="font-mono font-semibold">{smtpStatus.email}</span> (smtp.gmail.com:465)
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0">
                      {confirmDisconnectSmtp ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            id="btn-confirm-disconnect-smtp"
                            type="button"
                            onClick={async () => {
                              await disconnectSmtp();
                              setConfirmDisconnectSmtp(false);
                            }}
                            disabled={smtpLoading}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-[#D9381E] hover:bg-[#B52B14] transition-colors cursor-pointer"
                          >
                            Confirm Disconnect
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDisconnectSmtp(false)}
                            className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-[#6B6862] hover:bg-[#E5E2DC] transition-colors cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          id="btn-disconnect-smtp"
                          type="button"
                          onClick={() => setConfirmDisconnectSmtp(true)}
                          className="px-3.5 py-2 rounded-xl text-xs font-medium text-[#D9381E] bg-[#FFFFFF] border border-[#F5D5D0] hover:bg-[#FDF3F2] transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Disconnect SMTP</span>
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      setSmtpFeedback(null);
                      if (gmailStatus?.connected) {
                        setSmtpFeedback({
                          success: false,
                          error: 'A Gmail account is already connected through Google. Disconnect the existing Gmail account before connecting Gmail manually through SMTP.',
                        });
                        return;
                      }
                      if (!smtpEmailInput.trim() || !smtpEmailInput.includes('@')) {
                        setSmtpFeedback({ success: false, error: 'Please enter a valid Gmail address.' });
                        return;
                      }
                      if (!smtpPasswordInput.trim()) {
                        setSmtpFeedback({ success: false, error: 'Please enter your 16-character Google App Password.' });
                        return;
                      }

                      const res = await connectSmtp(smtpEmailInput.trim(), smtpPasswordInput.trim());
                      if (res.success) {
                        setSmtpFeedback({ success: true, message: 'Gmail SMTP verified and connected successfully!' });
                        setSmtpPasswordInput('');
                      } else {
                        setSmtpFeedback({ success: false, error: res.error || 'Failed to verify Gmail SMTP credentials.' });
                      }
                    }}
                    className="space-y-3.5 p-4 rounded-xl bg-[#FAF9F5] border border-[#E5E2DC]"
                  >
                    <div>
                      <label htmlFor="input-smtp-email" className="block text-xs font-semibold text-[#1F1E1B] mb-1">
                        Gmail Address
                      </label>
                      <input
                        id="input-smtp-email"
                        type="email"
                        required
                        disabled={Boolean(gmailStatus?.connected)}
                        value={smtpEmailInput}
                        onChange={(e) => setSmtpEmailInput(e.target.value)}
                        placeholder="yourname@gmail.com"
                        className="w-full px-3 py-2 rounded-lg border border-[#E5E2DC] bg-[#FFFFFF] text-xs text-[#1F1E1B] focus:outline-none focus:border-[#C66A3D] focus:ring-1 focus:ring-[#C66A3D] disabled:bg-[#F0EEEA] disabled:cursor-not-allowed"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label htmlFor="input-smtp-password" className="block text-xs font-semibold text-[#1F1E1B]">
                          Google App Password (16 Letters)
                        </label>
                        <button
                          type="button"
                          disabled={Boolean(gmailStatus?.connected)}
                          onClick={() => setShowSmtpPassword(!showSmtpPassword)}
                          className="text-[11px] text-[#6B6862] hover:text-[#1F1E1B] flex items-center gap-1 cursor-pointer disabled:cursor-not-allowed"
                        >
                          {showSmtpPassword ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                          <span>{showSmtpPassword ? 'Hide' : 'Show'}</span>
                        </button>
                      </div>
                      <input
                        id="input-smtp-password"
                        type={showSmtpPassword ? 'text' : 'password'}
                        required
                        disabled={Boolean(gmailStatus?.connected)}
                        value={smtpPasswordInput}
                        onChange={(e) => setSmtpPasswordInput(e.target.value)}
                        placeholder="xxxx xxxx xxxx xxxx"
                        className="w-full px-3 py-2 rounded-lg border border-[#E5E2DC] bg-[#FFFFFF] text-xs font-mono text-[#1F1E1B] focus:outline-none focus:border-[#C66A3D] focus:ring-1 focus:ring-[#C66A3D] disabled:bg-[#F0EEEA] disabled:cursor-not-allowed"
                      />
                      <p className="text-[11px] text-[#6B6862] mt-1">
                        Spaces in App Passwords are automatically handled. Stored using AES-256-GCM encryption on the server.
                      </p>
                    </div>

                    <div className="pt-2 flex justify-end">
                      <button
                        id="btn-connect-smtp"
                        type="submit"
                        disabled={smtpConnecting || Boolean(gmailStatus?.connected)}
                        className={`px-4 py-2 rounded-xl text-xs font-semibold text-white transition-colors shadow-2xs flex items-center gap-2 ${
                          gmailStatus?.connected
                            ? 'bg-[#9C988F] opacity-60 cursor-not-allowed'
                            : 'bg-[#C66A3D] hover:bg-[#B55B2E] cursor-pointer'
                        }`}
                      >
                        {smtpConnecting ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>Testing SMTP Handshake...</span>
                          </>
                        ) : (
                          <>
                            <KeyRound className="w-3.5 h-3.5" />
                            <span>Connect & Verify Gmail SMTP</span>
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}

            {/* Outreach Automation Control Card */}
            <div className="bg-[#FFFFFF] border border-[#E5E2DC] rounded-2xl p-4 sm:p-6 space-y-4 shadow-2xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E5E2DC] pb-4">
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                    autoSendProposals ? 'bg-[#C66A3D]/10 text-[#C66A3D]' : 'bg-[#F2EFE9] text-[#6B6862]'
                  }`}>
                    <Zap className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-[#1F1E1B]">Outreach Automation</h3>
                    <p className="text-xs text-[#6B6862]">Automatically send approved outreach without manual confirmation per lead</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                    autoSendProposals
                      ? 'bg-[#EBF3ED] text-[#245738] border border-[#D5E5DA]'
                      : 'bg-[#F2EFE9] text-[#6B6862] border border-[#E5E2DC]'
                  }`}>
                    {autoSendProposals ? 'AUTOMATION ON' : 'REVIEW MODE (OFF)'}
                  </span>
                  <button
                    id="btn-toggle-outreach-automation"
                    type="button"
                    disabled={savingPreferences || loadingPreferences}
                    onClick={() => toggleAutoSend(!autoSendProposals)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      autoSendProposals ? 'bg-[#C66A3D]' : 'bg-[#D3CEB9]'
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        autoSendProposals ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-[#FAF9F5] border border-[#E5E2DC] space-y-2 text-xs text-[#4A4741] leading-relaxed">
                <div className="font-semibold text-[#1F1E1B] flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-[#C66A3D]" />
                  <span>Autonomous Pipeline Behavior</span>
                </div>
                <p>
                  {autoSendProposals ? (
                    <span>
                      <strong>Active Mode:</strong> SanMine Space will automatically execute discovery, email extraction, website audits, proposal drafting, and send emails directly through your connected Gmail (OAuth or SMTP) without prompting for manual send confirmations.
                    </span>
                  ) : (
                    <span>
                      <strong>Review Mode:</strong> SanMine Space will generate proposals and hold them for your explicit review and manual confirmation before dispatching. Auto-send is never enabled silently.
                    </span>
                  )}
                </p>
                <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] text-[#6B6862]">
                  <span className="flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#3F7A5A]" /> 30-Day Anti-Duplicate Protection
                  </span>
                  <span className="flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#3F7A5A]" /> Extracted Contact Emails
                  </span>
                  <span className="flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#3F7A5A]" /> Audit History Logged
                  </span>
                </div>
              </div>
            </div>

            {/* Test Email Section */}
            <div className="bg-[#FFFFFF] border border-[#E5E2DC] rounded-2xl p-4 sm:p-6 space-y-4 shadow-2xs">
              <div className="flex items-center justify-between border-b border-[#E5E2DC] pb-3">
                <h3 className="text-xs sm:text-sm font-semibold text-[#1F1E1B] uppercase tracking-wider">
                  Send Test Email
                </h3>
                <span className="text-xs text-[#6B6862]">
                  Verify Gmail message transmission
                </span>
              </div>

              {/* Provider Selection for Test Email */}
              {gmailStatus?.connected && smtpStatus?.connected && (
                <div className="flex items-center gap-2 p-1 bg-[#FAF9F5] border border-[#E5E2DC] rounded-lg max-w-sm">
                  <button
                    type="button"
                    onClick={() => setTestEmailProvider('oauth')}
                    className={`flex-1 py-1 px-2.5 rounded text-xs font-semibold ${
                      testEmailProvider === 'oauth'
                        ? 'bg-[#FFFFFF] text-[#C66A3D] shadow-2xs'
                        : 'text-[#6B6862]'
                    }`}
                  >
                    Via OAuth
                  </button>
                  <button
                    type="button"
                    onClick={() => setTestEmailProvider('smtp')}
                    className={`flex-1 py-1 px-2.5 rounded text-xs font-semibold ${
                      testEmailProvider === 'smtp'
                        ? 'bg-[#FFFFFF] text-[#C66A3D] shadow-2xs'
                        : 'text-[#6B6862]'
                    }`}
                  >
                    Via SMTP
                  </button>
                </div>
              )}

              {testEmailResult && (
                <div
                  className={`p-3.5 rounded-xl border flex items-start gap-2.5 text-xs ${
                    testEmailResult.success
                      ? 'bg-[#EBF3ED] border-[#D5E5DA] text-[#245738]'
                      : 'bg-[#FDF3F2] border-[#F5D5D0] text-[#D9381E]'
                  }`}
                >
                  {testEmailResult.success ? (
                    <CheckCircle2 className="w-4 h-4 text-[#3F7A5A] shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-[#D9381E] shrink-0 mt-0.5" />
                  )}
                  <div>{testEmailResult.message || testEmailResult.error}</div>
                </div>
              )}

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                <input
                  id="input-test-email-recipient"
                  type="email"
                  value={testEmailRecipient}
                  onChange={(e) => setTestEmailRecipient(e.target.value)}
                  placeholder={currentUser?.email || 'your-email@example.com'}
                  className="flex-1 px-3 py-2 rounded-xl border border-[#E5E2DC] bg-[#FAF9F5] text-xs text-[#1F1E1B] focus:outline-none focus:border-[#C66A3D] focus:ring-1 focus:ring-[#C66A3D]"
                />
                <button
                  id="btn-send-test-email"
                  type="button"
                  disabled={isSendingTestEmail || !hasAnyConnection}
                  onClick={async () => {
                    const target = testEmailRecipient.trim() || currentUser?.email || '';
                    if (!target || !target.includes('@')) {
                      setTestEmailResult({ success: false, error: 'Please specify a valid recipient email.' });
                      return;
                    }
                    setIsSendingTestEmail(true);
                    setTestEmailResult(null);
                    const selectedMethod = gmailStatus?.connected && !smtpStatus?.connected
                      ? 'oauth'
                      : !gmailStatus?.connected && smtpStatus?.connected
                      ? 'smtp'
                      : testEmailProvider;

                    const res = await sendTestEmail(target, selectedMethod);
                    setTestEmailResult(res);
                    setIsSendingTestEmail(false);
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-[#1F1E1B] hover:bg-[#33312B] disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer shadow-2xs flex items-center justify-center gap-2 shrink-0"
                >
                  {isSendingTestEmail ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Sending Test...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      <span>Send Test Email</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Proposal Dispatch Sandbox Section */}
            <div className="bg-[#FFFFFF] border border-[#E5E2DC] rounded-2xl p-4 sm:p-6 space-y-4 shadow-2xs">
              <div className="flex items-center justify-between border-b border-[#E5E2DC] pb-3">
                <h3 className="text-xs sm:text-sm font-semibold text-[#1F1E1B] uppercase tracking-wider">
                  Send Proposal Sandbox
                </h3>
                <span className="text-xs text-[#6B6862]">
                  Explicit proposal delivery test
                </span>
              </div>

              {/* Provider Selection for Proposal Sandbox */}
              {gmailStatus?.connected && smtpStatus?.connected && (
                <div className="flex items-center gap-2 p-1 bg-[#FAF9F5] border border-[#E5E2DC] rounded-lg max-w-sm">
                  <button
                    type="button"
                    onClick={() => setProposalProvider('oauth')}
                    className={`flex-1 py-1 px-2.5 rounded text-xs font-semibold ${
                      proposalProvider === 'oauth'
                        ? 'bg-[#FFFFFF] text-[#C66A3D] shadow-2xs'
                        : 'text-[#6B6862]'
                    }`}
                  >
                    Via OAuth
                  </button>
                  <button
                    type="button"
                    onClick={() => setProposalProvider('smtp')}
                    className={`flex-1 py-1 px-2.5 rounded text-xs font-semibold ${
                      proposalProvider === 'smtp'
                        ? 'bg-[#FFFFFF] text-[#C66A3D] shadow-2xs'
                        : 'text-[#6B6862]'
                    }`}
                  >
                    Via SMTP
                  </button>
                </div>
              )}

              {proposalResult && (
                <div
                  className={`p-3.5 rounded-xl border flex items-start gap-2.5 text-xs ${
                    proposalResult.success
                      ? 'bg-[#EBF3ED] border-[#D5E5DA] text-[#245738]'
                      : 'bg-[#FDF3F2] border-[#F5D5D0] text-[#D9381E]'
                  }`}
                >
                  {proposalResult.success ? (
                    <CheckCircle2 className="w-4 h-4 text-[#3F7A5A] shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-[#D9381E] shrink-0 mt-0.5" />
                  )}
                  <div>{proposalResult.message || proposalResult.error}</div>
                </div>
              )}

              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-[#1F1E1B] mb-1">
                      Business / Client Name (Optional)
                    </label>
                    <input
                      type="text"
                      value={proposalBusinessName}
                      onChange={(e) => setProposalBusinessName(e.target.value)}
                      placeholder="e.g. Apex Health Clinic"
                      className="w-full px-3 py-2 rounded-xl border border-[#E5E2DC] bg-[#FAF9F5] text-xs text-[#1F1E1B] focus:outline-none focus:border-[#C66A3D] focus:ring-1 focus:ring-[#C66A3D]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#1F1E1B] mb-1">
                      Recipient Email Address
                    </label>
                    <input
                      type="email"
                      value={proposalRecipient}
                      onChange={(e) => setProposalRecipient(e.target.value)}
                      placeholder="client@company.com"
                      className="w-full px-3 py-2 rounded-xl border border-[#E5E2DC] bg-[#FAF9F5] text-xs text-[#1F1E1B] focus:outline-none focus:border-[#C66A3D] focus:ring-1 focus:ring-[#C66A3D]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#1F1E1B] mb-1">
                    Proposal Subject Line
                  </label>
                  <input
                    type="text"
                    value={proposalSubject}
                    onChange={(e) => setProposalSubject(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-[#E5E2DC] bg-[#FAF9F5] text-xs text-[#1F1E1B] focus:outline-none focus:border-[#C66A3D] focus:ring-1 focus:ring-[#C66A3D]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#1F1E1B] mb-1">
                    Proposal Body Content
                  </label>
                  <textarea
                    rows={4}
                    value={proposalBody}
                    onChange={(e) => setProposalBody(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-[#E5E2DC] bg-[#FAF9F5] text-xs font-mono text-[#1F1E1B] focus:outline-none focus:border-[#C66A3D] focus:ring-1 focus:ring-[#C66A3D] resize-y"
                  />
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    id="btn-settings-send-proposal"
                    type="button"
                    disabled={isSendingProposal || !hasAnyConnection}
                    onClick={async () => {
                      if (!proposalRecipient || !proposalRecipient.includes('@')) {
                        setProposalResult({ success: false, error: 'A valid recipient email is required.' });
                        return;
                      }
                      setIsSendingProposal(true);
                      setProposalResult(null);
                      const selectedMethod = gmailStatus?.connected && !smtpStatus?.connected
                        ? 'oauth'
                        : !gmailStatus?.connected && smtpStatus?.connected
                        ? 'smtp'
                        : proposalProvider;

                      const res = await sendProposalEmail({
                        recipientEmail: proposalRecipient.trim(),
                        subject: proposalSubject.trim(),
                        body: proposalBody.trim(),
                        businessName: proposalBusinessName.trim() || undefined,
                        provider: selectedMethod,
                      });
                      setProposalResult(res);
                      setIsSendingProposal(false);
                    }}
                    className="px-5 py-2 rounded-xl text-xs font-semibold text-white bg-[#C66A3D] hover:bg-[#B55B2E] disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer shadow-2xs flex items-center gap-2"
                  >
                    {isSendingProposal ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Dispatching Proposal...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5" />
                        <span>Send Proposal</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Outreach History & Audit Log */}
            <div className="bg-[#FFFFFF] border border-[#E5E2DC] rounded-2xl p-4 sm:p-6 space-y-4 shadow-2xs">
              <div className="flex items-center justify-between border-b border-[#E5E2DC] pb-3">
                <div className="flex items-center gap-2">
                  <History className="w-4 h-4 text-[#C66A3D]" />
                  <h3 className="text-xs sm:text-sm font-semibold text-[#1F1E1B] uppercase tracking-wider">
                    Outreach Dispatch History
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={loadOutreachHistory}
                  disabled={loadingOutreachHistory}
                  className="text-xs text-[#6B6862] hover:text-[#1F1E1B] flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <RotateCw className={`w-3.5 h-3.5 ${loadingOutreachHistory ? 'animate-spin' : ''}`} />
                  <span>Refresh</span>
                </button>
              </div>

              {outreachHistory.length === 0 ? (
                <div className="text-center py-6 text-xs text-[#6B6862] bg-[#FAF9F5] rounded-xl border border-[#E5E2DC] p-4">
                  <Inbox className="w-6 h-6 mx-auto mb-2 text-[#9C988F]" />
                  <p className="font-medium text-[#1F1E1B]">No outreach records yet</p>
                  <p className="text-[11px] text-[#6B6862] mt-0.5">
                    Automated and manual email deliveries will be tracked here in real-time with duplicate prevention logs.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-[#E5E2DC] text-[#9C988F] text-[11px] uppercase">
                        <th className="py-2 px-2 font-medium">Business / Recipient</th>
                        <th className="py-2 px-2 font-medium">Status</th>
                        <th className="py-2 px-2 font-medium">Details</th>
                        <th className="py-2 px-2 font-medium text-right">Timestamp</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E5E2DC]/60">
                      {outreachHistory.map((item, idx) => (
                        <tr key={item.id || idx} className="hover:bg-[#FAF9F5] transition-colors">
                          <td className="py-2.5 px-2">
                            <div className="font-medium text-[#1F1E1B]">{item.businessName || 'Local Business'}</div>
                            <div className="text-[11px] text-[#6B6862]">{item.recipientEmail}</div>
                          </td>
                          <td className="py-2.5 px-2">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                                item.status === 'sent'
                                  ? 'bg-[#EBF3ED] text-[#245738]'
                                  : item.status === 'skipped'
                                  ? 'bg-[#FAF0E6] text-[#A65B1A]'
                                  : 'bg-[#FDF3F2] text-[#D9381E]'
                              }`}
                            >
                              {item.status}
                            </span>
                          </td>
                          <td className="py-2.5 px-2 text-[11px] text-[#6B6862] max-w-[200px] truncate">
                            {item.status === 'sent'
                              ? item.subject || 'Strategic Website Modernization'
                              : item.errorMessage || item.reason || 'Completed'}
                          </td>
                          <td className="py-2.5 px-2 text-right text-[11px] text-[#6B6862] whitespace-nowrap">
                            {item.sentAt
                              ? new Date(item.sentAt).toLocaleString([], {
                                  month: 'short',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              : 'Recent'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        );

      case 'ai-providers':
        return (
          <div className="space-y-8">
            {/* Providers Selection Grid */}
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 pb-1">
                <h2 className="text-xs sm:text-sm font-semibold text-[#1F1E1B] uppercase tracking-wider">
                  AI Providers
                </h2>
                <span className="text-xs text-[#6B6862]">
                  Select a provider to configure
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                {(
                  [
                    'google',
                    'openai',
                    'openrouter',
                    'anthropic',
                    'xai',
                    'deepseek',
                    'huggingface',
                    'ollama',
                  ] as AIProviderId[]
                ).map((provId) => {
                  const p = providers.find((prov) => prov.id === provId);
                  const meta = PROVIDER_METADATA[provId];
                  const isConfigured = p?.isConfigured;
                  const isEditing = editingProviderId === provId;
                  const isActive = selectedModel.provider === provId;

                  return (
                    <button
                      key={provId}
                      type="button"
                      onClick={() => setEditingProviderId(provId)}
                      className={`p-3 rounded-xl text-left transition-all cursor-pointer flex flex-col justify-between gap-2.5 ${
                        isEditing
                          ? 'bg-[#FAF6F2] text-[#C66A3D]'
                          : 'hover:bg-[#FAF9F5] text-[#1F1E1B]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 w-full">
                        <div className="flex items-center gap-2 min-w-0">
                          <ProviderLogo provider={provId} className="w-4 h-4 shrink-0" />
                          <span className="text-sm font-semibold truncate">
                            {meta.name}
                          </span>
                        </div>

                        {isActive && (
                          <span className="text-[10px] font-semibold bg-[#C66A3D] text-white px-2 py-0.2 rounded-full shrink-0">
                            Active
                          </span>
                        )}
                      </div>

                      {/* Status & Key Mask */}
                      <div className="flex items-center justify-between text-xs w-full">
                        {isConfigured ? (
                          <div className="flex items-center gap-1.5 text-[#3F7A5A] font-medium min-w-0 truncate">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#3F7A5A] shrink-0" />
                            <span className="text-[11px] truncate">Configured</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-[#9C988F]">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#9C988F]/50 shrink-0" />
                            <span className="text-[11px]">Not configured</span>
                          </div>
                        )}

                        <span className={`text-[11px] font-medium flex items-center gap-0.5 shrink-0 ${isEditing ? 'text-[#C66A3D]' : 'text-[#6B6862]'}`}>
                          <span>{isEditing ? 'Selected' : 'Configure'}</span>
                          <ChevronRight className="w-3 h-3" />
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Dedicated Configuration Editor */}
            <div className="space-y-6 pt-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-[#E5E2DC] gap-2">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <ProviderLogo provider={editingProviderId} className="w-5 h-5 shrink-0" />
                  <h2 className="text-base sm:text-lg font-semibold text-[#1F1E1B]">
                    {metadata.name} Configuration
                  </h2>
                  {editingProviderInfo?.isConfigured && (
                    <span className="text-[11px] font-semibold bg-[#EBF3ED] text-[#3F7A5A] px-2 py-0.5 rounded-full flex items-center gap-1">
                      <Check className="w-3 h-3" />
                      Configured
                    </span>
                  )}
                </div>

                <a
                  href={metadata.keyHelpUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-[#C66A3D] hover:underline flex items-center gap-1 font-medium shrink-0"
                >
                  <span>{metadata.keyHelpText}</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              {/* API Key Configuration */}
              <div className="space-y-4">
                {/* Status indicator and Remove Key if currently configured */}
                {editingProviderInfo?.isConfigured && (
                  <div className="p-3.5 rounded-xl bg-[#FAF9F5] border border-[#E5E2DC] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0 text-xs text-[#245738]">
                      <CheckCircle2 className="w-4 h-4 text-[#3F7A5A] shrink-0" />
                      <div className="truncate">
                        <span className="font-semibold text-[#1F1E1B]">Configured Key:</span>{' '}
                        <span className="font-mono text-[#3F7A5A] font-semibold">{editingProviderInfo.maskedApiKey}</span>
                      </div>
                    </div>

                    {confirmDeleteKey ? (
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-[#D9381E] font-medium">Remove key?</span>
                        <button
                          id={`btn-confirm-delete-key-${editingProviderId}`}
                          type="button"
                          disabled={isDeletingKey}
                          onClick={handleDeleteProviderKey}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-[#D9381E] hover:bg-[#B82B14] disabled:opacity-50 transition-colors cursor-pointer flex items-center gap-1 shadow-2xs"
                        >
                          {isDeletingKey ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Trash2 className="w-3 h-3" />
                          )}
                          <span>Confirm</span>
                        </button>
                        <button
                          type="button"
                          disabled={isDeletingKey}
                          onClick={() => setConfirmDeleteKey(false)}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-[#6B6862] bg-[#FFFFFF] border border-[#E5E2DC] hover:bg-[#F2F1ED] transition-colors cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        id={`btn-delete-key-${editingProviderId}`}
                        type="button"
                        onClick={() => setConfirmDeleteKey(true)}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold text-[#D9381E] bg-[#FFFFFF] border border-[#F5D5D0] hover:bg-[#FDF3F2] transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Remove Key</span>
                      </button>
                    )}
                  </div>
                )}

                {/* Feedback Result Banners */}
                {providerKeySaveResult && (
                  <div
                    className={`p-3 rounded-xl text-xs flex items-center gap-2.5 ${
                      providerKeySaveResult.success
                        ? 'bg-[#EBF3ED] text-[#245738]'
                        : 'bg-[#FDF3F2] text-[#D9381E]'
                    }`}
                  >
                    {providerKeySaveResult.success ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-[#3F7A5A] shrink-0" />
                        <span className="font-medium">API key saved successfully</span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-4 h-4 text-[#D9381E] shrink-0" />
                        <span>{providerKeySaveResult.error}</span>
                      </>
                    )}
                  </div>
                )}

                {/* Key Input Field */}
                <div className="space-y-2">
                  <label
                    htmlFor={`input-api-key-${editingProviderId}`}
                    className="block text-xs font-semibold text-[#1F1E1B]"
                  >
                    {metadata.name} API Key
                  </label>

                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    <div className="relative flex-1">
                      <input
                        id={`input-api-key-${editingProviderId}`}
                        type={showProviderApiKey ? 'text' : 'password'}
                        value={providerApiKeyInput}
                        onChange={(e) => setProviderApiKeyInput(e.target.value)}
                        placeholder={
                          editingProviderInfo?.isConfigured
                            ? `Replace key (${editingProviderInfo.maskedApiKey})`
                            : metadata.keyPlaceholder
                        }
                        className="w-full bg-[#FFFFFF] border border-[#E5E2DC] rounded-xl px-3.5 py-2.5 pr-10 text-xs sm:text-sm font-mono text-[#1F1E1B] placeholder-[#9C988F] focus:outline-none focus:border-[#C66A3D]"
                      />
                      <button
                        type="button"
                        onClick={() => setShowProviderApiKey(!showProviderApiKey)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9C988F] hover:text-[#1F1E1B] cursor-pointer"
                        aria-label={showProviderApiKey ? 'Hide API key' : 'Show API key'}
                      >
                        {showProviderApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>

                    <button
                      id={`btn-save-key-${editingProviderId}`}
                      type="button"
                      disabled={isSavingProviderKey || !providerApiKeyInput.trim()}
                      onClick={handleSaveProviderKey}
                      className="px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-white bg-[#C66A3D] hover:bg-[#B55B2E] disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer flex items-center justify-center gap-2 shrink-0"
                    >
                      {isSavingProviderKey ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Saving...</span>
                        </>
                      ) : (
                        <>
                          <Lock className="w-3.5 h-3.5" />
                          <span>Save Key</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Model Selection */}
              <div className="space-y-3 pt-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                  <label htmlFor="select-provider-model" className="text-xs font-semibold text-[#1F1E1B]">
                    Default Model
                  </label>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={handleRefreshModels}
                      disabled={isRefreshingModels}
                      className="text-xs text-[#6B6862] hover:text-[#1F1E1B] flex items-center gap-1 cursor-pointer"
                    >
                      <RotateCw className={`w-3 h-3 ${isRefreshingModels ? 'animate-spin text-[#C66A3D]' : ''}`} />
                      <span>Refresh</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setUseCustomModel(!useCustomModel)}
                      className="text-xs text-[#C66A3D] hover:underline cursor-pointer font-medium"
                    >
                      {useCustomModel ? 'Use dropdown list' : 'Custom model ID'}
                    </button>
                  </div>
                </div>

                {!useCustomModel ? (
                  <select
                    id="select-provider-model"
                    value={selectedModelInput}
                    onChange={(e) => {
                      setSelectedModelInput(e.target.value);
                      handleSelectModel(e.target.value);
                    }}
                    className="w-full bg-[#FFFFFF] border border-[#E5E2DC] rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-[#1F1E1B] focus:outline-none focus:border-[#C66A3D] cursor-pointer"
                  >
                    {providerModels.length > 0 ? (
                      providerModels.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name || m.id} {m.isFree ? '(FREE)' : ''}
                        </option>
                      ))
                    ) : (
                      <option value={metadata.defaultModel}>{metadata.defaultModel}</option>
                    )}
                  </select>
                ) : (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={customModelInput}
                      onChange={(e) => setCustomModelInput(e.target.value)}
                      placeholder={`Enter custom model ID (e.g. ${metadata.defaultModel})`}
                      className="flex-1 bg-[#FFFFFF] border border-[#E5E2DC] rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-[#1F1E1B] placeholder-[#9C988F] focus:outline-none focus:border-[#C66A3D]"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (customModelInput.trim()) {
                          handleSelectModel(customModelInput.trim());
                        }
                      }}
                      className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-[#C66A3D] hover:bg-[#B55B2E] transition-colors cursor-pointer"
                    >
                      Set
                    </button>
                  </div>
                )}

                {/* Active Configured Models for this Provider */}
                {editingProviderInfo?.isConfigured && (
                  <div className="pt-1">
                    <div className="flex flex-wrap gap-1.5">
                      {configuredModels
                        .filter((m) => m.provider === editingProviderId)
                        .map((cm) => (
                          <div
                            key={cm.id || `${cm.provider}:${cm.modelId}`}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#FAF6F2] text-xs text-[#1F1E1B]"
                          >
                            <ProviderLogo provider={cm.provider} className="w-3.5 h-3.5 shrink-0" />
                            <span className="font-medium">{cm.name || cm.modelId}</span>
                            {(cm.isFree || cm.modelId.includes(':free')) && (
                              <span className="text-[9px] font-semibold text-[#3F7A5A] bg-[#EBF3ED] px-1 py-0.2 rounded">
                                FREE
                              </span>
                            )}
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Model Generation Defaults */}
              <div className="space-y-4 pt-4 border-t border-[#E5E2DC]">
                <h3 className="text-xs sm:text-sm font-semibold text-[#1F1E1B] uppercase tracking-wider">
                  Model Generation Defaults
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6">
                  {/* Temperature */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <label htmlFor="input-temperature" className="font-semibold text-[#1F1E1B]">Temperature</label>
                      <span className="font-mono text-[#6B6862]">{temperature.toFixed(2)}</span>
                    </div>
                    <input
                      id="input-temperature"
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={temperature}
                      onChange={(e) => setTemperature(parseFloat(e.target.value))}
                      className="w-full accent-[#C66A3D] cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] text-[#9C988F]">
                      <span>0.0 (Precise)</span>
                      <span>1.0 (Creative)</span>
                    </div>
                  </div>

                  {/* Max Tokens */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <label htmlFor="input-max-tokens" className="font-semibold text-[#1F1E1B]">Max Output Tokens</label>
                      <span className="font-mono text-[#6B6862]">{maxTokens}</span>
                    </div>
                    <input
                      id="input-max-tokens"
                      type="number"
                      min="128"
                      max="16384"
                      step="128"
                      value={maxTokens}
                      onChange={(e) => setMaxTokens(parseInt(e.target.value) || 4096)}
                      className="w-full bg-[#FFFFFF] border border-[#E5E2DC] rounded-xl px-3.5 py-2 text-xs sm:text-sm text-[#1F1E1B] focus:outline-none focus:border-[#C66A3D]"
                    />
                  </div>
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={handleSaveParameters}
                    className="w-full sm:w-auto px-4 py-2 rounded-xl text-xs font-semibold text-[#1F1E1B] bg-[#F2F1ED] hover:bg-[#EAE8E1] transition-colors cursor-pointer"
                  >
                    Save Parameters
                  </button>
                </div>
              </div>
            </div>
          </div>
        );

      case 'security':
        return (
          <div className="space-y-6">
            <div className="bg-[#FFFFFF] border border-[#E5E2DC] rounded-2xl p-4 sm:p-6 space-y-4 shadow-2xs">
              <h2 className="text-xs sm:text-sm font-semibold text-[#1F1E1B] uppercase tracking-wider border-b border-[#E5E2DC] pb-3">
                Security & Key Storage Policy
              </h2>

              <div className="space-y-3 text-xs text-[#6B6862] leading-relaxed">
                <div className="p-3.5 rounded-xl bg-[#FAF9F5] border border-[#E5E2DC] text-[#1F1E1B] flex items-start gap-3">
                  <ShieldCheck className="w-5 h-5 text-[#3F7A5A] shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold block mb-0.5">Zero Browser Key Exposure for All AI Models</span>
                    User API keys across all supported providers (Google Gemini, OpenAI, OpenRouter, Anthropic Claude, xAI Grok, DeepSeek, Hugging Face, & Ollama) are encrypted server-side with AES-256-GCM and stored in Neon PostgreSQL. Raw credentials are never stored in browser localStorage or transmitted in client telemetry payloads.
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-[#FAF9F5] border border-[#E5E2DC] text-[#1F1E1B] flex items-start gap-3">
                  <Key className="w-5 h-5 text-[#C66A3D] shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold block mb-0.5">Runtime Server Environment Variables</span>
                    Server administrators can also configure fallback AI provider keys via container environment variables (<code className="font-mono">GEMINI_API_KEY</code>, <code className="font-mono">OPENAI_API_KEY</code>, <code className="font-mono">OPENROUTER_API_KEY</code>, <code className="font-mono">ANTHROPIC_API_KEY</code>, <code className="font-mono">XAI_API_KEY</code>, <code className="font-mono">DEEPSEEK_API_KEY</code>, <code className="font-mono">HUGGINGFACE_API_KEY</code>, <code className="font-mono">OLLAMA_BASE_URL</code>).
                  </div>
                </div>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div id="settings-page" className="flex-1 flex flex-col h-full bg-[#F7F6F2] overflow-hidden">
      {/* Top Header / Breadcrumb Bar */}
      <div className="h-14 px-3 sm:px-6 md:px-8 border-b border-[#E5E2DC] flex items-center justify-between bg-[#F7F6F2] shrink-0 z-10">
        <div className="flex items-center gap-2 sm:gap-3 text-xs sm:text-sm text-[#1F1E1B] min-w-0">
          {/* On Mobile when detail is open: Back returns to category list */}
          {mobileDetailOpen ? (
            <button
              id="btn-mobile-back-to-categories"
              type="button"
              onClick={() => setMobileDetailOpen(false)}
              className="md:hidden flex items-center gap-1 text-[#6B6862] hover:text-[#1F1E1B] transition-colors font-medium cursor-pointer p-1.5 -ml-1.5 rounded-lg active:scale-95"
              aria-label="Back to settings menu"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="text-xs">Settings</span>
            </button>
          ) : (
            <button
              id="btn-back-to-chat"
              type="button"
              onClick={navigateToChat}
              className="flex items-center gap-1 text-[#6B6862] hover:text-[#1F1E1B] transition-colors font-medium cursor-pointer p-1.5 -ml-1.5 rounded-lg active:scale-95"
              aria-label="Back to chat workspace"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Back to Chat</span>
              <span className="sm:hidden text-xs">Chat</span>
            </button>
          )}

          <span className="text-[#9C988F]">/</span>
          <span className="font-semibold text-[#1F1E1B] truncate">
            {mobileDetailOpen ? currentSectionMeta.title : 'Settings'}
          </span>
        </div>

        {/* Right action on desktop: Direct return to chat */}
        <button
          type="button"
          onClick={navigateToChat}
          className="hidden md:flex items-center gap-1.5 text-xs font-medium text-[#6B6862] hover:text-[#1F1E1B] hover:bg-[#EAE8E1] px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
        >
          <span>Done</span>
        </button>
      </div>

      {/* Main Settings Body */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6 md:p-8 flex justify-center pb-[max(1.5rem,env(safe-area-inset-bottom,0px))]">
        <div className="w-full max-w-[1020px] space-y-6">
          {/* Feedback banner */}
          {feedbackBanner && (
            <div
              className={`p-3.5 rounded-xl text-xs flex items-center gap-2 border transition-all animate-in fade-in-50 ${
                feedbackBanner.type === 'success'
                  ? 'bg-[#EBF3ED] text-[#245738] border-[#A7D0B5]'
                  : 'bg-[#FFFBFB] text-[#991B1B] border-[#F8D7DA]'
              }`}
            >
              {feedbackBanner.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-[#3F7A5A] shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-[#DC2626] shrink-0" />
              )}
              <span className="break-words">{feedbackBanner.message}</span>
            </div>
          )}

          {/* ================================================================= */}
          {/* MOBILE VIEW (< md)                                               */}
          {/* ================================================================= */}
          <div className="md:hidden">
            {!mobileDetailOpen ? (
              /* SCREEN 1: Mobile Category List */
              <div className="space-y-4">
                <div className="space-y-1 pb-1">
                  <h1 className="text-xl font-semibold text-[#1F1E1B] tracking-tight">
                    Settings
                  </h1>
                  <p className="text-xs text-[#6B6862]">
                    Configure AI models, outreach integrations, and security policies.
                  </p>
                </div>

                <div className="space-y-1">
                  {SECTIONS.map((sec) => {
                    const Icon = sec.icon;
                    let badgeText = '';
                    if (sec.id === 'ai-providers' && configuredProvidersCount > 0) {
                      badgeText = `${configuredProvidersCount} connected`;
                    }

                    return (
                      <button
                        key={sec.id}
                        id={`mobile-settings-row-${sec.id}`}
                        type="button"
                        onClick={() => handleSelectCategoryMobile(sec.id)}
                        className="w-full p-3.5 rounded-xl flex items-center justify-between text-left hover:bg-[#FAF9F5] active:bg-[#F2F1ED] transition-colors cursor-pointer group"
                      >
                        <div className="flex items-center gap-3.5 min-w-0 pr-2">
                          <div className="w-9 h-9 rounded-xl bg-[#FAF6F2] flex items-center justify-center text-[#C66A3D] shrink-0">
                            <Icon className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-[#1F1E1B] group-hover:text-[#C66A3D] transition-colors">
                              {sec.title}
                            </div>
                            <div className="text-xs text-[#6B6862] line-clamp-1 mt-0.5">
                              {sec.subtitle}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {badgeText && (
                            <span className="text-[11px] font-medium text-[#6B6862] bg-[#F2F1ED] px-2 py-0.5 rounded-md">
                              {badgeText}
                            </span>
                          )}
                          <ChevronRight className="w-4 h-4 text-[#9C988F] group-hover:text-[#1F1E1B] transition-colors" />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              /* SCREEN 2: Mobile Selected Category Detail View */
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-1 border-b border-[#E5E2DC]">
                  <div>
                    <h1 className="text-lg font-semibold text-[#1F1E1B] tracking-tight">
                      {currentSectionMeta.title}
                    </h1>
                    <p className="text-xs text-[#6B6862]">
                      {currentSectionMeta.subtitle}
                    </p>
                  </div>
                </div>

                {renderSectionContent()}
              </div>
            )}
          </div>

          {/* ================================================================= */}
          {/* DESKTOP / TABLET VIEW (>= md)                                     */}
          {/* ================================================================= */}
          <div className="hidden md:block space-y-6">
            {/* Header */}
            <div className="space-y-1">
              <h1 className="text-2xl lg:text-3xl font-semibold text-[#1F1E1B] tracking-tight">
                Settings & Integrations
              </h1>
              <p className="text-sm text-[#6B6862]">
                Manage your AI model providers, API credentials, and autonomous agent parameters.
              </p>
            </div>

            {/* Desktop Two-Column Layout */}
            <div className="grid grid-cols-12 gap-6 items-start">
              {/* Left Column: Navigation list */}
              <div className="col-span-4 lg:col-span-3 space-y-1 sticky top-0">
                {SECTIONS.map((sec) => {
                  const Icon = sec.icon;
                  const isCurrent = activeSection === sec.id;
                  let badge = '';
                  if (sec.id === 'ai-providers' && configuredProvidersCount > 0) {
                    badge = `${configuredProvidersCount}`;
                  }

                  return (
                    <button
                      key={sec.id}
                      id={`tab-desktop-${sec.id}`}
                      type="button"
                      onClick={() => setActiveSection(sec.id)}
                      className={`w-full flex items-center justify-between p-3 rounded-xl text-left text-xs font-semibold transition-all cursor-pointer ${
                        isCurrent
                          ? 'bg-[#FAF6F2] text-[#C66A3D]'
                          : 'text-[#6B6862] hover:text-[#1F1E1B] hover:bg-[#FAF9F5]'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Icon className={`w-4 h-4 shrink-0 ${isCurrent ? 'text-[#C66A3D]' : 'text-[#9C988F]'}`} />
                        <span className="truncate">{sec.title}</span>
                      </div>

                      {badge && (
                        <span
                          className={`text-[10px] font-mono font-semibold px-1.5 py-0.2 rounded-md ${
                            isCurrent
                              ? 'bg-[#C66A3D] text-white'
                              : 'bg-[#F2F1ED] text-[#6B6862]'
                          }`}
                        >
                          {badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Right Column: Active section content */}
              <div className="col-span-8 lg:col-span-9">
                {renderSectionContent()}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
