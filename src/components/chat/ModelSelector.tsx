import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, Sliders, Plus } from 'lucide-react';
import { useAgent } from '../../context/AgentContext';
import { AIProviderId, ConfiguredModel } from '../../types';
import { ProviderLogo } from '../common/ProviderLogo';

interface ModelSelectorProps {
  disabled?: boolean;
  dropUp?: boolean;
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({ disabled = false, dropUp = true }) => {
  const {
    configuredModels,
    selectedModel,
    selectModel,
    openSettings,
  } = useAgent();

  const [isOpen, setIsOpen] = useState<boolean>(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
        buttonRef.current?.focus();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  // Format short model name for display
  const formatModelDisplayName = (provider: AIProviderId, modelId: string, customName?: string) => {
    if (customName && customName.trim().length > 0) {
      return customName;
    }
    if (!modelId) return 'Select Model';
    if (modelId === 'openrouter/free') return 'OpenRouter Free Models (Auto)';
    if (modelId === 'openai/gpt-oss-20b:free') return 'GPT-OSS 20B (Free)';
    if (modelId === 'meta-llama/llama-3.3-70b-instruct:free') return 'Llama 3.3 70B · Free';
    if (modelId === 'deepseek/deepseek-r1:free') return 'DeepSeek R1 · Free';
    if (modelId === 'google/gemini-2.0-flash-exp:free') return 'Gemini 2.0 Flash · Free';
    if (modelId === 'gemini-2.5-flash') return 'Gemini 2.5 Flash';
    if (modelId === 'gemini-2.5-pro') return 'Gemini 2.5 Pro';
    if (modelId === 'gemini-3.7-flash') return 'Gemini 3.7 Flash';
    if (modelId === 'gemini-3.1-pro-preview') return 'Gemini 3.1 Pro Preview';
    if (modelId === 'gemini-flash-latest') return 'Gemini Flash Latest';
    if (modelId === 'gpt-4o') return 'GPT-4o';
    if (modelId === 'gpt-4o-mini') return 'GPT-4o mini';
    if (modelId === 'o3-mini') return 'o3-mini';
    if (modelId === 'o1') return 'o1';
    if (modelId === 'gpt-4-turbo') return 'GPT-4 Turbo';

    const parts = modelId.split('/');
    const shortName = parts[parts.length - 1] || modelId;
    return shortName.replace(':free', ' · Free');
  };

  const getProviderDisplayName = (provider: string) => {
    switch (provider) {
      case 'google':
        return 'GOOGLE GEMINI';
      case 'openai':
        return 'OPENAI';
      case 'openrouter':
        return 'OPENROUTER';
      default:
        return String(provider).toUpperCase();
    }
  };

  // Group configured models by provider
  const uniqueProviders = Array.from(new Set(configuredModels.map((m) => m.provider)));
  const isAnyConfigured = configuredModels.length > 0;

  const currentConfiguredModel = selectedModel?.model
    ? configuredModels.find(
        (m) =>
          m.provider === selectedModel.provider &&
          (m.modelId === selectedModel.model || m.id === selectedModel.model)
      )
    : null;

  const currentDisplayName = currentConfiguredModel
    ? formatModelDisplayName(currentConfiguredModel.provider, currentConfiguredModel.modelId, currentConfiguredModel.name)
    : selectedModel?.model && isAnyConfigured
    ? formatModelDisplayName(selectedModel.provider, selectedModel.model)
    : isAnyConfigured
    ? formatModelDisplayName(configuredModels[0].provider, configuredModels[0].modelId, configuredModels[0].name)
    : 'No AI models configured';

  return (
    <div className="relative inline-block" ref={dropdownRef}>
      {/* Model Selector Pill Button */}
      <button
        ref={buttonRef}
        id="btn-composer-model-selector"
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label="Select AI Model"
        onClick={() => {
          if (!disabled) setIsOpen((prev) => !prev);
        }}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
          disabled
            ? 'opacity-50 cursor-not-allowed text-[#9C988F] bg-[#F7F6F2] border border-[#E5E2DC]'
            : isOpen
            ? 'bg-[#FFFFFF] text-[#1F1E1B] border border-[#C66A3D] shadow-2xs'
            : 'bg-[#FAF9F5] hover:bg-[#FFFFFF] text-[#1F1E1B] border border-[#E5E2DC] hover:border-[#C66A3D]/40 shadow-2xs'
        }`}
        title={disabled ? 'Model selection disabled during response generation' : 'Select AI Model'}
      >
        <ProviderLogo
          provider={
            currentConfiguredModel
              ? currentConfiguredModel.provider
              : selectedModel?.provider || 'google'
          }
          className="w-3.5 h-3.5 shrink-0"
        />
        <span className="truncate max-w-[140px] sm:max-w-[180px] font-medium">
          {currentDisplayName}
        </span>
        <ChevronDown className={`w-3 h-3 text-[#9C988F] transition-transform duration-150 ${isOpen ? 'rotate-180 text-[#C66A3D]' : ''}`} />
      </button>

      {/* Compact Dropdown Menu */}
      {isOpen && (
        <div
          className={`absolute left-0 w-[calc(100vw-2.5rem)] sm:w-80 max-w-[320px] bg-[#FFFFFF] border border-[#E5E2DC] rounded-xl shadow-xl p-2 z-50 animate-in fade-in-50 space-y-2.5 max-h-[380px] overflow-y-auto ${
            dropUp ? 'bottom-full mb-2' : 'top-full mt-2'
          }`}
          role="listbox"
          aria-label="AI Models"
        >
          <div className="px-2 pt-1 pb-0.5 flex items-center justify-between text-[11px] font-semibold text-[#6B6862]">
            <span>AI MODELS</span>
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                openSettings();
              }}
              className="text-[#C66A3D] hover:underline flex items-center gap-1 cursor-pointer font-medium text-[11px]"
            >
              <Sliders className="w-3 h-3" />
              <span>Settings</span>
            </button>
          </div>

          {/* EMPTY STATE: When NO model is configured */}
          {!isAnyConfigured ? (
            <div className="py-4 px-3 text-center space-y-2 bg-[#FAF9F5] rounded-lg border border-[#E5E2DC]/60 my-1">
              <div className="text-xs font-semibold text-[#1F1E1B]">No AI models configured</div>
              <p className="text-[11px] text-[#6B6862] leading-relaxed">
                Connect an AI provider in Settings to start chatting.
              </p>
              <button
                type="button"
                id="btn-selector-open-settings"
                onClick={() => {
                  setIsOpen(false);
                  openSettings();
                }}
                className="mt-1 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-[#C66A3D] hover:bg-[#B55B2E] transition-colors cursor-pointer shadow-2xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Add AI Provider</span>
              </button>
            </div>
          ) : (
            /* CONFIGURED MODELS ONLY, GROUPED BY PROVIDER */
            uniqueProviders.map((provId) => {
              const provModels = configuredModels.filter((m) => m.provider === provId);

              return (
                <div key={provId} className="space-y-1">
                  <div className="px-2 flex items-center justify-between text-[10px] font-bold tracking-wider text-[#9C988F] uppercase">
                    <div className="flex items-center gap-1.5">
                      <ProviderLogo provider={provId} className="w-3.5 h-3.5" />
                      <span>{getProviderDisplayName(provId)}</span>
                    </div>
                    <span className="text-[#3F7A5A] font-mono text-[9px] bg-[#EBF3ED] px-1.5 py-0.2 rounded">
                      Configured
                    </span>
                  </div>

                  <div className="space-y-0.5">
                    {provModels.map((m) => {
                      const isSelected =
                        selectedModel.provider === provId &&
                        (selectedModel.model === m.modelId || selectedModel.model === m.id);

                      const isFree = m.isFree || m.modelId.includes(':free') || m.name?.includes('Free');

                      return (
                        <button
                          key={m.id || `${m.provider}:${m.modelId}`}
                          type="button"
                          role="option"
                          aria-selected={isSelected}
                          onClick={() => {
                            selectModel(provId, m.modelId);
                            setIsOpen(false);
                          }}
                          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer text-left ${
                            isSelected
                              ? 'bg-[#FAF6F2] text-[#C66A3D] font-medium border border-[#C66A3D]/20'
                              : 'text-[#1F1E1B] hover:bg-[#F7F6F2]'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 truncate">
                            <span className="truncate">
                              {formatModelDisplayName(m.provider, m.modelId, m.name)}
                            </span>
                            {isFree && (
                              <span className="text-[9px] font-semibold text-[#3F7A5A] bg-[#EBF3ED] px-1.5 py-0.2 rounded shrink-0">
                                FREE
                              </span>
                            )}
                          </div>
                          {isSelected && <Check className="w-3.5 h-3.5 text-[#C66A3D] shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}

          {/* Bottom Footer: Add / Manage AI Provider */}
          <div className="pt-2 border-t border-[#F2F1ED] px-1">
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                openSettings();
              }}
              className="w-full py-1.5 text-center text-xs text-[#C66A3D] font-medium hover:bg-[#FAF6F2] rounded-lg transition-colors flex items-center justify-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Configure Model in Settings</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

