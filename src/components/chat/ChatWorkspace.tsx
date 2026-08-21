import React, { useState, useRef, useEffect } from 'react';
import {
  ArrowUp,
  ArrowDown,
  Search,
  Globe,
  Sparkles,
  Square,
  Terminal,
  AlertCircle,
  Copy,
  Check,
} from 'lucide-react';
import { useAgent } from '../../context/AgentContext';
import { InlineAgentActivity } from './InlineAgentActivity';
import { LiveBrowserPanel } from './LiveBrowserPanel';
import { ModelSelector } from './ModelSelector';
import { SendProposalModal } from './SendProposalModal';
import { MarkdownRenderer } from './MarkdownRenderer';

const SUGGESTED_PROMPTS = [
  {
    id: 'p1',
    title: 'Find 20 US AI SaaS companies',
    description: 'Delegate research: verify, inspect official sites, extract founder + email',
    prompt: 'Mujhe US mein 20 relevant SaaS companies find karo jo AI use karti hain, unki official websites check karo, founders aur contact email nikalo, aur verified report sources ke saath do.',
    icon: Search,
  },
  {
    id: 'p2',
    title: 'Leads + proposals + send via Gmail',
    description: 'Find businesses, draft proposals, send from your connected Gmail',
    prompt: 'India mein 20 restaurants find karo jinki websites outdated hain, unke contact details collect karo, proposal generate karo aur connected Gmail se bhej do.',
    icon: Terminal,
  },
  {
    id: 'p3',
    title: 'Inspect a website',
    description: 'Open the official site and extract pricing, services, contact email',
    prompt: 'Is website par jao aur pricing, services aur contact email nikalo: https://example.com',
    icon: Globe,
  },
  {
    id: 'p4',
    title: 'Just talk',
    description: 'Normal conversation, explanations, writing help',
    prompt: 'Explain how React state and useEffect work together.',
    icon: Sparkles,
  },
];

export const ChatWorkspace: React.FC = () => {
  const {
    messages,
    submitPrompt,
    agentStatus,
    stopTask,
  } = useAgent();

  const [inputVal, setInputVal] = useState<string>('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showScrollBottom, setShowScrollBottom] = useState<boolean>(false);
  const [proposalModalData, setProposalModalData] = useState<{
    isOpen: boolean;
    body: string;
    subject: string;
    businessName?: string;
  }>({
    isOpen: false,
    body: '',
    subject: 'Strategic Growth & Website Modernization Proposal',
  });
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isUserScrolledUpRef = useRef<boolean>(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dockedTextareaRef = useRef<HTMLTextAreaElement>(null);

  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    const distanceFromBottom = scrollHeight - (scrollTop + clientHeight);
    const isScrolledUp = distanceFromBottom > 120;
    setShowScrollBottom(isScrolledUp);
    isUserScrolledUpRef.current = isScrolledUp;
  };

  const scrollToBottom = () => {
    isUserScrolledUpRef.current = false;
    setShowScrollBottom(false);
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleCopy = async (id: string, textToCopy: string) => {
    if (!textToCopy) return;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(textToCopy);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = textToCopy;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopiedId(id);
      setTimeout(() => {
        setCopiedId((prev) => (prev === id ? null : prev));
      }, 2000);
    } catch (err) {
      console.error('Failed to copy text:', err);
    }
  };

  const isWorking =
    agentStatus === 'thinking' || agentStatus === 'running_tool' || agentStatus === 'responding';

  useEffect(() => {
    if (!isUserScrolledUpRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, agentStatus]);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputVal.trim() || isWorking) return;

    const query = inputVal.trim();
    setInputVal('');
    submitPrompt(query);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSuggestionClick = (prompt: string) => {
    setInputVal('');
    submitPrompt(prompt);
  };

  const hasMessages = messages.length > 0;
  const isSlashCommand = inputVal.trimStart().startsWith('/');

  return (
    <div
      id="chat-workspace"
      className="flex-1 flex flex-col h-full overflow-hidden relative bg-[#F7F6F2]"
    >
      {/* If No Messages: Clean Conversational Hero Center */}
      {!hasMessages ? (
        <div className="flex-1 overflow-y-auto flex flex-col items-center justify-between md:justify-center px-4 sm:px-6 md:px-8 py-6 pb-[max(1rem,env(safe-area-inset-bottom,0px))]">
          <div className="w-full max-w-[840px] flex flex-col items-center my-auto md:my-0">
            {/* Greeting Header */}
            <div className="text-center mb-4 md:mb-8 space-y-1.5 md:space-y-2 px-2">
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-semibold tracking-tight text-[#1F1E1B]">
                Good evening, Tavqeer.
              </h1>
              <p className="text-sm sm:text-base md:text-lg text-[#6B6862] font-normal">
                What do you want me to do?
              </p>
            </div>

            {/* Suggested Task Cards - Hidden on mobile, visible on desktop / tablet */}
            <div className="hidden md:grid w-full grid-cols-2 gap-3 mb-6">
              {SUGGESTED_PROMPTS.map((card) => {
                const Icon = card.icon;
                return (
                  <button
                    key={card.id}
                    id={`suggested-card-${card.id}`}
                    onClick={() => handleSuggestionClick(card.prompt)}
                    className="flex items-start gap-3.5 p-3 rounded-xl text-left transition-all duration-150 group cursor-pointer hover:bg-[#EFECE6]/60"
                  >
                    <div className="p-2 rounded-lg transition-colors">
                      <Icon className="w-4 h-4 text-[#C66A3D]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-xs font-semibold text-[#1F1E1B] group-hover:text-[#C66A3D] transition-colors">
                        {card.title}
                      </h3>
                      <p className="text-xs text-[#6B6862] line-clamp-1 mt-0.5">
                        {card.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Conversational Composer (Docked at bottom on mobile, centered on desktop) */}
          <div className="w-full max-w-[840px] relative group mt-auto md:mt-0 pt-2 md:pt-0">
            <div className="bg-[#FFFFFF] border border-[#E5E2DC] focus-within:border-[#C66A3D] focus-within:ring-1 focus-within:ring-[#C66A3D]/40 rounded-[16px] p-3 sm:p-4 transition-all duration-200 shadow-[0_4px_24px_rgba(0,0,0,0.03)] space-y-2">
              <textarea
                id="composer-input"
                ref={textareaRef}
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={2}
                placeholder="Ask SanMine to research, find leads, analyze data, create proposals, send emails, or complete a task..."
                className="w-full bg-transparent text-[#1F1E1B] placeholder-[#9C988F] text-sm md:text-[15px] resize-none focus:outline-none leading-relaxed px-1"
              />

              {/* Bottom Toolbar: Model Selector on Left, Mode Badge & Send on Right */}
              <div className="flex items-center justify-between pt-2.5 sm:pt-3 border-t border-[#F2F1ED] mt-1.5">
                <div className="flex items-center gap-2 relative">
                  <ModelSelector disabled={isWorking} dropUp={true} />
                </div>

                <div className="flex items-center gap-2.5">
                  {/* Send or Stop Button */}
                  {isWorking ? (
                    <button
                      id="btn-composer-stop"
                      type="button"
                      onClick={stopTask}
                      className="px-3 py-1.5 rounded-full bg-[#F2F1ED] hover:bg-[#EAE8E1] text-[#1F1E1B] text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer border border-[#E5E2DC]"
                      title="Stop Agent"
                    >
                      <Square className="w-3 h-3 fill-current text-[#DC2626]" />
                      <span>Stop</span>
                    </button>
                  ) : (
                    <button
                      id="btn-composer-send"
                      type="button"
                      onClick={() => handleSubmit()}
                      disabled={!inputVal.trim()}
                      className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                        inputVal.trim()
                          ? 'bg-[#C66A3D] hover:bg-[#B55B2E] text-white shadow-2xs cursor-pointer'
                          : 'bg-[#E5E2DC] text-[#9C988F] cursor-not-allowed'
                      }`}
                      title={isSlashCommand ? "Run Agent Task" : "Send Message"}
                    >
                      <ArrowUp className="w-4 h-4 stroke-[2.5]" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Helper Text beneath empty composer */}
            {!inputVal.trim() && (
              <div className="mt-2.5 text-center text-xs text-[#8C887F] space-y-1 px-2">
                <p className="font-medium text-[#6B6862]">
                  Describe the work. SanMine researches, verifies, and can send proposals from your connected Gmail.
                </p>
                <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[11px] text-[#9C988F]">
                  <button
                    type="button"
                    onClick={() => setInputVal('US mein 20 AI SaaS companies find karo')}
                    className="hover:text-[#C66A3D] font-mono text-[#7D7972] transition-colors cursor-pointer bg-[#F2F0EB]/60 px-1.5 py-0.5 rounded"
                  >
                    US mein 20 AI SaaS companies find karo
                  </button>
                  <span className="text-[#C5C2BA]">•</span>
                  <button
                    type="button"
                    onClick={() => setInputVal('is website par jao aur pricing nikalo')}
                    className="hover:text-[#C66A3D] font-mono text-[#7D7972] transition-colors cursor-pointer bg-[#F2F0EB]/60 px-1.5 py-0.5 rounded"
                  >
                    is website par jao aur pricing nikalo
                  </button>
                  <span className="text-[#C5C2BA]">•</span>
                  <button
                    type="button"
                    onClick={() => setInputVal('leads find karo, proposal banao aur Gmail se bhej do')}
                    className="hover:text-[#C66A3D] font-mono text-[#7D7972] transition-colors cursor-pointer bg-[#F2F0EB]/60 px-1.5 py-0.5 rounded"
                  >
                    leads find karo aur Gmail se bhej do
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Conversation Mode Stream - centered with generous padding, max-width 840px */
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-4 sm:px-6 md:px-8 pt-16 pb-6 w-full flex flex-col items-center"
        >
          <div className="w-full max-w-[840px] mx-auto space-y-6">
            {/* Messages Stream */}
            {messages.map((msg) => {
              const isUser = msg.role === 'user' || msg.sender === 'user';
              const executionWasLeftActive =
                !msg.isStreaming &&
                (msg.execution?.status === 'running' || msg.execution?.status === 'planning');
              const activityStatus = executionWasLeftActive
                ? 'completed'
                : msg.execution?.status;
              const activitySteps = executionWasLeftActive
                ? msg.execution?.steps.map((step) =>
                    step.status === 'running' ? { ...step, status: 'completed' as const } : step
                  )
                : msg.execution?.steps;

              return (
                <div key={msg.id} className="w-full space-y-4">
                  {isUser ? (
                    <div className="flex justify-end w-full group">
                      <div className="max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-3 bg-[#E5E2DC] text-[#1F1E1B] text-sm md:text-[15px] leading-relaxed shadow-2xs space-y-1.5">
                        <div className="whitespace-pre-wrap">{msg.content || msg.text}</div>
                        <div className="flex items-center justify-between gap-3 text-[10px] text-[#6F6B65] border-t border-[#DAD6CE] pt-1 font-mono">
                          <span>{msg.timestamp}</span>
                          <button
                            id={`btn-copy-user-${msg.id}`}
                            type="button"
                            onClick={() => handleCopy(msg.id, msg.content || msg.text || '')}
                            className="flex items-center gap-1 hover:text-[#1F1E1B] transition-colors cursor-pointer px-1.5 py-0.5 rounded hover:bg-[#D9D5CC]"
                            title="Copy message"
                          >
                            {copiedId === msg.id ? (
                              <>
                                <Check className="w-3 h-3 text-[#3F7A5A]" />
                                <span className="text-[#3F7A5A] font-sans font-medium">Copied!</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" />
                                <span className="font-sans">Copy</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="w-full space-y-3.5">
                      {/* Base44-style Live Browser Activity Panel */}
                      {(msg.browserSession || msg.execution?.browserSession) && (
                        <LiveBrowserPanel
                          browserState={msg.browserSession || msg.execution!.browserSession!}
                          defaultExpanded={msg.isStreaming || msg.execution?.status === 'running'}
                        />
                      )}

                      {/* Inline Agent Activity / Real Tool Progress */}
                      {msg.execution && msg.execution.steps && msg.execution.steps.length > 0 && (
                        <InlineAgentActivity
                          status={activityStatus || msg.execution.status}
                          aiPersonalizationStatus={msg.execution.aiPersonalizationStatus}
                          reason={msg.execution.reason}
                          steps={activitySteps || msg.execution.steps}
                          summary={executionWasLeftActive ? 'Task completed' : msg.execution.summary}
                        />
                      )}

                      {/* ChatGPT / Claude style AI Response: transparent prose sitting directly on the chat canvas */}
                      <div className="w-full bg-transparent border-0 shadow-none px-0 py-0.5 text-[#1F1E1B]">
                        {/* Message Body */}
                        {msg.isError ? (
                          <div className="rounded-xl p-4 border shadow-2xs bg-[#FEF2F2] border-[#FECACA] text-[#991B1B]">
                            <div className="flex items-center gap-1.5 text-xs font-semibold text-[#DC2626] mb-1">
                              <AlertCircle className="w-3.5 h-3.5" />
                              <span>Provider Alert</span>
                            </div>
                            <p className="text-sm">{msg.content || msg.text}</p>
                          </div>
                        ) : (msg.content || msg.text) ? (
                          <MarkdownRenderer
                            content={msg.content || msg.text || ''}
                            isStreaming={msg.isStreaming}
                          />
                        ) : msg.isStreaming ? (
                          <div className="flex items-center gap-2 py-2 text-sm text-[#9C988F]">
                            <span className="w-2 h-2 rounded-full bg-[#C66A3D] animate-pulse" />
                          </div>
                        ) : null}

                        {/* Copy button below response */}
                        {(msg.content || msg.text) && (
                          <div className="flex items-center justify-end gap-2 mt-2 pt-1 text-[11px] text-[#9C988F]">
                            <button
                              id={`btn-copy-msg-${msg.id}`}
                              type="button"
                              onClick={() => handleCopy(msg.id, msg.content || msg.text || '')}
                              className="flex items-center gap-1 hover:text-[#1F1E1B] transition-colors cursor-pointer px-2 py-1 rounded-md hover:bg-[#E5E2DC]/50 text-[#6B6862]"
                              title="Copy response"
                            >
                              {copiedId === msg.id ? (
                                <>
                                  <Check className="w-3 h-3 text-[#3F7A5A]" />
                                  <span className="text-[#3F7A5A] font-sans font-medium">Copied!</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3" />
                                  <span className="font-sans">Copy</span>
                                </>
                              )}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            <div ref={messagesEndRef} className="h-4" />
          </div>
        </div>
      )}

      {/* Docked Bottom Composer when messages exist */}
      {hasMessages && (
        <div className="w-full px-4 sm:px-6 md:px-8 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] relative z-20 flex flex-col items-center bg-transparent border-0 shadow-none">
          {/* Scroll to Bottom Button (ChatGPT-style) */}
          {showScrollBottom && (
            <button
              id="btn-scroll-to-bottom"
              type="button"
              onClick={scrollToBottom}
              className="absolute -top-12 left-1/2 -translate-x-1/2 z-30 w-9 h-9 rounded-full bg-[#FFFFFF] border border-[#E5E2DC] text-[#1F1E1B] hover:text-[#C66A3D] hover:border-[#C66A3D]/70 hover:bg-[#FAF9F5] shadow-[0_4px_16px_rgba(0,0,0,0.12)] flex items-center justify-center transition-all duration-200 cursor-pointer group hover:scale-105 active:scale-95"
              title="Scroll to latest chat"
              aria-label="Scroll to bottom"
            >
              <ArrowDown className="w-4 h-4 stroke-[2.4] text-[#6B6862] group-hover:text-[#C66A3D] group-hover:translate-y-0.5 transition-all" />
            </button>
          )}

          <div className="w-full max-w-[840px] mx-auto">
            <div className="bg-[#FFFFFF] border border-[#E5E2DC] focus-within:border-[#C66A3D] focus-within:ring-1 focus-within:ring-[#C66A3D]/40 rounded-[16px] p-3 sm:p-4 transition-all shadow-[0_2px_12px_rgba(0,0,0,0.03)] space-y-2">
              <textarea
                id="composer-docked-input"
                ref={dockedTextareaRef}
                rows={1}
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask SanMine to research, find leads, analyze data, create proposals, send emails, or complete a task..."
                className="w-full bg-transparent text-[#1F1E1B] placeholder-[#9C988F] text-xs md:text-sm resize-none focus:outline-none px-1 leading-relaxed max-h-32"
              />

              {/* Bottom Toolbar: Model Selector on left, Send/Stop on right */}
              <div className="flex items-center justify-between pt-2 border-t border-[#F2F1ED]">
                <div className="flex items-center gap-2">
                  <ModelSelector disabled={isWorking} dropUp={true} />
                </div>

                {isWorking ? (
                  <button
                    id="btn-docked-stop"
                    type="button"
                    onClick={stopTask}
                    className="px-2.5 py-1 rounded-full bg-[#F2F1ED] hover:bg-[#EAE8E1] text-[#1F1E1B] text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer border border-[#E5E2DC]"
                    title="Stop execution"
                  >
                    <Square className="w-3 h-3 fill-current text-[#DC2626]" />
                    <span>Stop</span>
                  </button>
                ) : (
                  <button
                    id="btn-docked-send"
                    type="button"
                    onClick={() => handleSubmit()}
                    disabled={!inputVal.trim()}
                    className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${
                      inputVal.trim()
                        ? 'bg-[#C66A3D] hover:bg-[#B55B2E] text-white shadow-2xs cursor-pointer'
                        : 'bg-[#E5E2DC] text-[#9C988F] cursor-not-allowed'
                    }`}
                    title={isSlashCommand ? "Run Agent Task" : "Send message"}
                  >
                    <ArrowUp className="w-3.5 h-3.5 stroke-[2.5]" />
                  </button>
                )}
              </div>
            </div>

            {/* Sub-docked helper hint */}
            {!inputVal.trim() && (
              <div className="mt-1.5 flex items-center justify-between text-[11px] text-[#8C887F] px-2">
                <span>Work is delegated automatically. <span className="font-mono font-medium text-[#C66A3D]">/</span> still forces Agent Mode.</span>
                <span className="hidden sm:inline text-[#9C988F]">Ex: <span className="font-mono text-[#7D7972]">US mein 20 AI SaaS companies find karo</span></span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Send Proposal Modal Dialog */}
      <SendProposalModal
        isOpen={proposalModalData.isOpen}
        onClose={() => setProposalModalData((prev) => ({ ...prev, isOpen: false }))}
        defaultBody={proposalModalData.body}
        defaultSubject={proposalModalData.subject}
        businessName={proposalModalData.businessName}
      />
    </div>
  );
};
