import React, { useState } from 'react';
import {
  Check,
  Circle,
  Loader2,
  AlertCircle,
  X,
  ChevronDown,
  ChevronUp,
  Square,
  Globe,
  Compass,
  Search,
  Scan,
  Mail,
} from 'lucide-react';
import { ActivityStep } from '../../types';
import { useAgent } from '../../context/AgentContext';

interface InlineAgentActivityProps {
  status: 'planning' | 'running' | 'completed' | 'error' | 'stopped';
  aiPersonalizationStatus?: 'completed' | 'unavailable' | 'not_requested';
  reason?: string;
  steps: ActivityStep[];
  summary?: string;
  defaultExpanded?: boolean;
}

export const InlineAgentActivity: React.FC<InlineAgentActivityProps> = ({
  status,
  aiPersonalizationStatus,
  reason,
  steps,
  summary,
  defaultExpanded,
}) => {
  const { stopTask } = useAgent();
  const [isManuallyExpanded, setIsManuallyExpanded] = useState<boolean | null>(
    defaultExpanded !== undefined ? defaultExpanded : null
  );

  const isCompleted = status === 'completed';
  const isRunning = status === 'running' || status === 'planning';
  const isStopped = status === 'stopped';
  const isError = status === 'error';
  const isRateLimitedPersonalization =
    status === 'completed' &&
    aiPersonalizationStatus === 'unavailable' &&
    reason === 'rate_limited';

  const isUnavailable =
    aiPersonalizationStatus === 'unavailable' ||
    steps.some((s) => s.status === 'warning') ||
    (summary ? summary.includes('AI personalization unavailable') : false);

  // If user interacted, use that state; otherwise running/stopped/error/rate_limited = expanded, normal completed = collapsed
  const isExpanded =
    isManuallyExpanded !== null
      ? isManuallyExpanded
      : (isRunning || isStopped || isError || isRateLimitedPersonalization);

  // Derive dynamic summary
  const displaySummary =
    summary ||
    (isCompleted
      ? isUnavailable
        ? 'Task completed · AI personalization unavailable'
        : 'Task completed'
      : isStopped
      ? reason === 'integration_required'
        ? 'Task stopped · Integration required'
        : 'Task stopped'
      : isError
      ? 'Task failed'
      : 'Agent is working');

  // Compact Completed / Stopped State (Single Row with Expand/Collapse)
  if (!isExpanded && !isRunning) {
    return (
      <div
        id="inline-agent-activity-collapsed"
        className="w-full bg-[#FFFFFF] border border-[#E5E2DC] rounded-xl p-3 shadow-2xs transition-all duration-150"
      >
        <button
          type="button"
          onClick={() => setIsManuallyExpanded(true)}
          className="w-full flex items-center justify-between text-left group cursor-pointer"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            {isCompleted ? (
              isUnavailable ? (
                <div className="w-5 h-5 rounded-full bg-[#FDF2E9] flex items-center justify-center text-[#C66A3D] shrink-0">
                  <AlertCircle className="w-3.5 h-3.5" />
                </div>
              ) : (
                <div className="w-5 h-5 rounded-full bg-[#EBF3ED] flex items-center justify-center text-[#3F7A5A] shrink-0">
                  <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                </div>
              )
            ) : isStopped ? (
              <div className="w-5 h-5 rounded-full bg-[#FDF2E9] flex items-center justify-center text-[#C66A3D] shrink-0">
                <AlertCircle className="w-3.5 h-3.5" />
              </div>
            ) : (
              <div className="w-5 h-5 rounded-full bg-[#FEF2F2] flex items-center justify-center text-[#DC2626] shrink-0">
                <X className="w-3.5 h-3.5 stroke-[2.5]" />
              </div>
            )}
            <span className="text-xs font-medium text-[#1F1E1B] truncate">
              {displaySummary}
            </span>
          </div>

          <div className="flex items-center gap-1 text-[11px] text-[#6B6862] group-hover:text-[#1F1E1B] shrink-0 transition-colors pl-2">
            <span className="hidden sm:inline">Details</span>
            <ChevronDown className="w-3.5 h-3.5 text-[#6B6862] group-hover:text-[#1F1E1B]" />
          </div>
        </button>
      </div>
    );
  }

  // Expanded Active / Completed / Stopped View
  return (
    <div
      id="inline-agent-activity-expanded"
      className="w-full bg-[#FFFFFF] border border-[#E5E2DC] rounded-xl p-4 shadow-2xs space-y-3.5 transition-all duration-200"
    >
      {/* Activity Header */}
      <div className="flex items-center justify-between pb-2.5 border-b border-[#F2F1ED]">
        <div className="flex items-center gap-2">
          {isRunning ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[#C66A3D]" />
              <span className="text-xs font-semibold text-[#1F1E1B]">
                Agent is working
              </span>
            </>
          ) : isCompleted ? (
            <>
              {isUnavailable ? (
                <div className="w-4 h-4 rounded-full bg-[#FDF2E9] flex items-center justify-center text-[#C66A3D]">
                  <AlertCircle className="w-3 h-3 text-[#C66A3D]" />
                </div>
              ) : (
                <div className="w-4 h-4 rounded-full bg-[#EBF3ED] flex items-center justify-center text-[#3F7A5A]">
                  <Check className="w-3 h-3 stroke-[2.5]" />
                </div>
              )}
              <span className="text-xs font-semibold text-[#1F1E1B]">
                {displaySummary}
              </span>
            </>
          ) : isStopped ? (
            <>
              <div className="w-4 h-4 rounded-full bg-[#FDF2E9] flex items-center justify-center text-[#C66A3D]">
                <AlertCircle className="w-3 h-3 text-[#C66A3D]" />
              </div>
              <span className="text-xs font-semibold text-[#1F1E1B]">
                {displaySummary}
              </span>
            </>
          ) : (
            <>
              <div className="w-4 h-4 rounded-full bg-[#FEF2F2] flex items-center justify-center text-[#DC2626]">
                <X className="w-3 h-3 stroke-[2.5] text-[#DC2626]" />
              </div>
              <span className="text-xs font-semibold text-[#1F1E1B]">
                {displaySummary}
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isRunning && (
            <button
              type="button"
              onClick={stopTask}
              className="flex items-center gap-1 text-[11px] font-medium text-[#6B6862] hover:text-[#DC2626] hover:bg-[#F2F1ED] px-2 py-0.5 rounded transition-colors cursor-pointer"
            >
              <Square className="w-2.5 h-2.5 fill-current" />
              <span>Stop</span>
            </button>
          )}

          {!isRunning && (
            <button
              type="button"
              onClick={() => setIsManuallyExpanded(false)}
              className="flex items-center gap-1 text-[11px] text-[#6B6862] hover:text-[#1F1E1B] transition-colors cursor-pointer"
            >
              <span>Collapse</span>
              <ChevronUp className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Rate-limited personalization informational notice */}
      {isRateLimitedPersonalization && (
        <div
          id="notice-rate-limited-personalization"
          className="rounded-lg bg-[#FAF7F2] border border-[#EBDCCF] px-3.5 py-2.5 text-xs text-[#6E4B2E] flex items-start gap-2.5"
        >
          <AlertCircle className="w-4 h-4 text-[#C66A3D] shrink-0 mt-0.5" />
          <div className="leading-relaxed font-normal">
            Core research completed successfully. Only optional AI rewriting/personalization was rate-limited.
          </div>
        </div>
      )}

      {/* Step by Step Execution Feed */}
      <div className="space-y-3 pt-0.5">
        {steps.map((step, idx) => {
          const isStepCompleted = step.status === 'completed';
          const isStepRunning = step.status === 'running';
          const isStepError = step.status === 'error';

          return (
            <div key={step.id ? `${step.id}-${idx}` : `step-${idx}`} className="flex items-start gap-2.5 text-xs">
              {/* Status Icon */}
              <div className="mt-0.5 shrink-0 flex items-center justify-center">
                {isStepCompleted ? (
                  <Check className="w-3.5 h-3.5 text-[#3F7A5A] stroke-[2.5]" />
                ) : isStepRunning ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[#C66A3D]" />
                ) : step.status === 'warning' ? (
                  <AlertCircle className="w-3.5 h-3.5 text-[#C66A3D]" />
                ) : isStepError ? (
                  <X className="w-3.5 h-3.5 text-[#DC2626] stroke-[2.5]" />
                ) : (
                  <Circle className="w-3.5 h-3.5 text-[#D9D5CC]" />
                )}
              </div>

              {/* Title & Detail */}
              <div className="flex-1 min-w-0">
                <div
                  className={`font-medium leading-tight break-words flex items-center gap-1.5 ${
                    isStepRunning || isStepCompleted || isStepError || step.status === 'warning'
                      ? 'text-[#1F1E1B]'
                      : 'text-[#6B6862]'
                  }`}
                >
                  <span>{step.title}</span>
                  {step.title.toLowerCase().includes('live browser') && (
                    <span className="text-[9px] font-mono font-semibold px-1 py-0.2 rounded bg-[#FAF6F2] text-[#C66A3D] border border-[#C66A3D]/30">
                      LIVE BROWSER
                    </span>
                  )}
                </div>

                {step.detail && (
                  <div
                    className={`text-[11px] mt-0.5 leading-normal break-words ${
                      isStepRunning
                        ? 'text-[#C66A3D]'
                        : step.status === 'warning'
                        ? 'text-[#8C5D39]'
                        : isStepError
                        ? 'text-[#6B6862]'
                        : isStepCompleted
                        ? 'text-[#6B6862]'
                        : 'text-[#9C988F]'
                    }`}
                  >
                    {step.detail}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
