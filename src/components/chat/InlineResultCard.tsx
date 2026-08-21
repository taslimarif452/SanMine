import React from 'react';
import { TaskResult } from '../../types';

interface InlineResultCardProps {
  result?: TaskResult;
}

export const InlineResultCard: React.FC<InlineResultCardProps> = ({ result }) => {
  if (!result) return null;

  return (
    <div
      id="inline-agent-results"
      className="w-full max-w-[420px] bg-[#FFFFFF] border border-[#E5E2DC] rounded-xl p-4 shadow-2xs space-y-3 transition-all duration-200"
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-[#F2F1ED]">
        <div className="text-xs font-semibold text-[#1F1E1B]">
          Task completed
        </div>
        {result.duration && (
          <span className="text-[11px] font-mono text-[#9C988F]">
            {result.duration}
          </span>
        )}
      </div>

      {/* Structured Metrics */}
      <div className="space-y-2 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-[#6B6862]">businesses researched</span>
          <span className="font-mono font-medium text-[#1F1E1B]">
            {result.businessesFound}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-[#6B6862]">websites analyzed</span>
          <span className="font-mono font-medium text-[#1F1E1B]">
            {result.websitesAnalyzed}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-[#6B6862]">high-quality opportunities</span>
          <span className="font-mono font-medium text-[#C66A3D]">
            {result.highQualityLeads}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-[#6B6862]">proposals generated</span>
          <span className="font-mono font-medium text-[#1F1E1B]">
            {result.proposalsGenerated}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-[#6B6862]">proposals sent</span>
          <span className="font-mono font-medium text-[#3F7A5A]">
            {result.proposalsSent ?? result.proposalsGenerated}
          </span>
        </div>
      </div>
    </div>
  );
};
