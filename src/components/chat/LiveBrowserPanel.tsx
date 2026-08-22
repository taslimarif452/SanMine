import React, { useState } from 'react';
import {
  Globe,
  Lock,
  RotateCw,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  X,
  Compass,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  Search,
  Phone,
  Mail,
  MapPin,
  Sparkles,
} from 'lucide-react';
import { LiveBrowserState } from '../../types';

interface LiveBrowserPanelProps {
  browserState: LiveBrowserState;
  onClose?: () => void;
  onRefresh?: () => void;
  onNavigate?: (url: string) => void;
  className?: string;
  defaultExpanded?: boolean;
}

export const LiveBrowserPanel: React.FC<LiveBrowserPanelProps> = ({
  browserState,
  onClose,
  onRefresh,
  onNavigate,
  className = '',
  defaultExpanded = true,
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [copied, setCopied] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const {
    url = 'about:blank',
    title = 'Live Browser Session',
    mode = 'http_fallback',
    status = 'idle',
    isLoading = false,
    screenshotBase64,
    lastAction,
    lastActionDetail,
    history = [],
    extractedData,
    error,
  } = browserState;

  // A visual browser panel is only valid for a real live-browser runtime.
  // HTTP inspection results remain in the report/activity stream and are not
  // presented as a simulated browser window.
  if (mode !== 'live_browser') return null;

  const isNavigating = status === 'navigating' || isLoading;

  const handleCopyUrl = () => {
    if (url && url !== 'about:blank') {
      navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const cleanDomain = () => {
    try {
      if (!url || url === 'about:blank') return 'Live Browser';
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  };

  return (
    <div
      id="live-browser-panel"
      className={`border border-[#E5E2DC] dark:border-[#2E2C29] bg-[#FFFFFF] dark:bg-[#1C1B18] rounded-xl shadow-sm overflow-hidden transition-all duration-300 ${
        isExpanded ? 'my-3' : 'my-2'
      } ${className}`}
    >
      {/* Top Browser Chrome Bar */}
      <div className="flex items-center justify-between px-3.5 py-2.5 bg-[#FAF8F5] dark:bg-[#24221E] border-b border-[#EAE6DF] dark:border-[#2E2C29] select-none">
        {/* Left: Window Dots, Status Badge & Mode Badge */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#E5534B] opacity-80" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#E5A738] opacity-80" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#57AB5A] opacity-80" />
          </div>

          <div className="h-3.5 w-[1px] bg-[#E0DCD5] dark:bg-[#383530] mx-0.5" />

          {/* Mode Badge: this component is mounted only for a real browser runtime. */}
          <div
            id="browser-mode-badge"
            className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-[#EBF3ED] text-[#2E6B48] border border-[#2E6B48]/30 dark:bg-[#1C2920] dark:text-[#57AB5A]"
            title="Connected to a live browser runtime"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#3F7A5A] animate-pulse" />
            <span>LIVE BROWSER</span>
          </div>

          {/* Status Badge */}
          <div className="hidden sm:flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#F0ECE1] dark:bg-[#2D2B26] text-[#6B6862] dark:text-[#A8A49D]">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isNavigating
                  ? 'bg-[#C66A3D] animate-ping'
                  : status === 'active'
                  ? 'bg-[#3F7A5A]'
                  : status === 'error'
                  ? 'bg-[#E5534B]'
                  : 'bg-[#8C887B]'
              }`}
            />
            <span>{isNavigating ? 'Navigating...' : status === 'active' ? 'Active' : status === 'error' ? 'Error' : 'Ready'}</span>
          </div>
        </div>

        {/* Center: Address Bar */}
        <div className="flex-1 max-w-xl mx-3">
          <div className="flex items-center gap-2 px-3 py-1 bg-[#FFFFFF] dark:bg-[#171614] border border-[#E0DCD5] dark:border-[#383530] rounded-lg text-xs transition-colors hover:border-[#C66A3D]/50 focus-within:border-[#C66A3D]">
            <Lock className="w-3 h-3 text-[#3F7A5A] shrink-0" />
            <span className="font-medium text-[#1F1E1B] dark:text-[#F7F6F2] truncate max-w-[120px] sm:max-w-[180px]">
              {cleanDomain()}
            </span>
            <span className="text-[#8C887B] dark:text-[#6B6862] truncate flex-1 font-mono text-[11px]">
              {url.replace(/^https?:\/\/[^/]+/, '') || '/'}
            </span>

            {isNavigating && (
              <RotateCw className="w-3 h-3 text-[#C66A3D] animate-spin shrink-0" />
            )}

            <button
              id="browser-copy-url-btn"
              onClick={handleCopyUrl}
              title="Copy URL"
              className="p-0.5 text-[#8C887B] hover:text-[#1F1E1B] dark:hover:text-[#F7F6F2] transition-colors rounded"
            >
              {copied ? <Check className="w-3 h-3 text-[#3F7A5A]" /> : <Copy className="w-3 h-3" />}
            </button>

            {url && url !== 'about:blank' && (
              <a
                id="browser-open-external-btn"
                href={url}
                target="_blank"
                rel="noreferrer noopener"
                title="Open website in new tab"
                className="p-0.5 text-[#8C887B] hover:text-[#C66A3D] transition-colors rounded"
              >
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        </div>

        {/* Right: Controls & Expand Toggle */}
        <div className="flex items-center gap-1">
          {history.length > 1 && (
            <button
              id="browser-history-toggle-btn"
              onClick={() => setShowHistory(!showHistory)}
              className={`p-1.5 rounded-md text-xs font-medium transition-colors ${
                showHistory
                  ? 'bg-[#EAE6DF] dark:bg-[#33302B] text-[#1F1E1B] dark:text-[#F7F6F2]'
                  : 'text-[#6B6862] hover:bg-[#EAE6DF] dark:hover:bg-[#2E2C29]'
              }`}
              title="View History"
            >
              <Compass className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            id="browser-expand-toggle-btn"
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 rounded-md text-[#6B6862] hover:text-[#1F1E1B] dark:hover:text-[#F7F6F2] hover:bg-[#EAE6DF] dark:hover:bg-[#2E2C29] transition-colors"
            title={isExpanded ? 'Minimize Viewport' : 'Expand Viewport'}
          >
            {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>

          {onClose && (
            <button
              id="browser-close-panel-btn"
              onClick={onClose}
              className="p-1.5 rounded-md text-[#6B6862] hover:text-[#E5534B] hover:bg-[#EAE6DF] dark:hover:bg-[#2E2C29] transition-colors"
              title="Close Browser View"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* History Drawer */}
      {showHistory && history.length > 0 && (
        <div className="px-3.5 py-2 bg-[#F5F2EB] dark:bg-[#1E1D1A] border-b border-[#EAE6DF] dark:border-[#2E2C29] flex items-center gap-2 overflow-x-auto text-xs">
          <span className="text-[11px] font-semibold text-[#8C887B] uppercase tracking-wider shrink-0">
            Session History:
          </span>
          {history.map((h, i) => (
            <button
              key={i}
              onClick={() => onNavigate?.(h.url)}
              className="px-2 py-0.5 rounded bg-[#FFFFFF] dark:bg-[#262420] border border-[#E0DCD5] dark:border-[#383530] text-[#4B4842] dark:text-[#D9D5CC] truncate max-w-[200px] hover:border-[#C66A3D] transition-colors"
              title={h.title || h.url}
            >
              {h.title || h.url}
            </button>
          ))}
        </div>
      )}

      {/* Main Viewport */}
      {isExpanded && (
        <div className="relative bg-[#FBFBFA] dark:bg-[#141311] overflow-hidden min-h-[220px] max-h-[460px] flex items-center justify-center">
          {/* Error Banner Overlay */}
          {error && (
            <div className="absolute top-2 left-2 right-2 z-30 bg-[#FFF5F5] dark:bg-[#2D1616] border border-[#F5C2C2] dark:border-[#5A2525] rounded-lg p-2.5 flex items-center gap-2 text-xs text-[#C53030] dark:text-[#FC8181] shadow-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span className="font-medium truncate">{error}</span>
            </div>
          )}

          {/* Loading Shimmer Overlay */}
          {isNavigating && (
            <div className="absolute inset-0 z-20 bg-[#FAF8F5]/80 dark:bg-[#1C1B18]/80 backdrop-blur-[2px] flex flex-col items-center justify-center gap-3">
              <div className="relative">
                <div className="w-10 h-10 rounded-full border-2 border-[#E5E2DC] dark:border-[#33302B] border-t-[#C66A3D] animate-spin" />
                <Globe className="w-5 h-5 text-[#C66A3D] absolute top-2.5 left-2.5" />
              </div>
              <div className="text-center">
                <p className="text-xs font-semibold text-[#1F1E1B] dark:text-[#F7F6F2]">
                  Autonomous Agent Browsing
                </p>
                <p className="text-[11px] text-[#6B6862] dark:text-[#A8A49D] font-mono mt-0.5 max-w-sm truncate px-4">
                  {url}
                </p>
              </div>
            </div>
          )}

          {/* Screenshot / Visual Snapshot Render */}
          {screenshotBase64 ? (
            <div className="w-full h-full max-h-[440px] overflow-y-auto flex items-start justify-center p-2">
              <img
                src={screenshotBase64}
                alt={title || 'Browser Viewport'}
                className="w-full h-auto rounded-lg shadow-sm border border-[#EAE6DF] dark:border-[#2E2C29] object-contain"
              />
            </div>
          ) : (
            <div className="p-8 text-center flex flex-col items-center justify-center gap-2 text-[#8C887B]">
              <Globe className="w-8 h-8 text-[#C66A3D]/60 animate-pulse" />
              <p className="text-xs font-medium text-[#4B4842] dark:text-[#D9D5CC]">
                {title || 'Navigating web pages & extracting public listings...'}
              </p>
              <p className="text-[11px] text-[#8C887B] font-mono max-w-md truncate">
                {url}
              </p>
            </div>
          )}

          {/* Bottom Live Action Overlay */}
          {(lastAction || lastActionDetail) && (
            <div className="absolute bottom-2 left-2 right-2 z-10 pointer-events-none">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#1F1E1B]/90 dark:bg-[#121110]/95 backdrop-blur-md text-[#FAF7F2] text-xs shadow-md border border-white/10 max-w-full">
                <Sparkles className="w-3.5 h-3.5 text-[#C66A3D] shrink-0" />
                <span className="font-medium truncate">
                  {lastActionDetail || `Agent Action: ${lastAction}`}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Footer Info Strip */}
      <div className="px-3.5 py-2 bg-[#FAF8F5] dark:bg-[#201F1B] border-t border-[#EAE6DF] dark:border-[#2E2C29] flex items-center justify-between text-xs text-[#6B6862] dark:text-[#A8A49D]">
        <div className="flex items-center gap-3 truncate">
          <span className="font-semibold text-[#1F1E1B] dark:text-[#F7F6F2] truncate">
            {title || cleanDomain()}
          </span>
          {extractedData && typeof extractedData === 'object' && (
            <div className="hidden sm:flex items-center gap-2">
              {extractedData.phone && (
                <span className="flex items-center gap-1 text-[11px] text-[#C66A3D] bg-[#F7F0EB] dark:bg-[#2D231C] px-2 py-0.5 rounded">
                  <Phone className="w-3 h-3" /> {extractedData.phone}
                </span>
              )}
              {extractedData.email && (
                <span className="flex items-center gap-1 text-[11px] text-[#3F7A5A] bg-[#EBF3ED] dark:bg-[#1C2820] px-2 py-0.5 rounded">
                  <Mail className="w-3 h-3" /> {extractedData.email}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="text-[11px] text-[#8C887B] dark:text-[#6B6862] shrink-0">
          Live browser view
        </div>
      </div>
    </div>
  );
};
