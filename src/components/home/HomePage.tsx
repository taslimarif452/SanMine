import React, { useState, useRef, useEffect } from 'react';
import ReactFullpage from '@fullpage/react-fullpage';
import 'fullpage.js/dist/fullpage.min.css';
import { useAuth } from '../../context/AuthContext';
import {
  Search,
  Sparkles,
  Mail,
  ShieldCheck,
  Globe,
  FileText,
  CheckCircle2,
  Lock,
  ArrowRight,
  AlertCircle,
  X,
  Sliders,
  Send,
  Database,
  Building2,
  EyeOff
} from 'lucide-react';

const SECTION_MAP: Record<string, number> = {
  hero: 1,
  'section-hero': 1,
  'what-is-sanmine-space': 2,
  'section-what-is-sanmine-space': 2,
  'how-it-works': 3,
  'section-how-it-works': 3,
  'gmail-integration': 4,
  'section-gmail-integration': 4,
  'ai-features': 5,
  'section-ai-features': 5,
  'business-research': 6,
  'section-business-research': 6,
  trust: 7,
  'section-trust': 7,
  footer: 8,
  'section-footer': 8,
};

export const HomePage: React.FC = () => {
  const { signInWithGoogle, isAuthenticating, authError, clearAuthError } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState<boolean>(false);
  const fullpageApiRef = useRef<any>(null);

  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const handleSignIn = async () => {
    if (isAuthenticating) return;
    await signInWithGoogle();
  };

  // Direct URL hash normalization to ensure https://sanmine.space/ stays completely clean
  const normalizeUrl = () => {
    if (typeof window !== 'undefined' && window.location.hash) {
      const hashKey = window.location.hash.replace(/^#/, '');
      const targetIndex = SECTION_MAP[hashKey];
      if (targetIndex && fullpageApiRef.current) {
        try {
          fullpageApiRef.current.moveTo(targetIndex);
        } catch {
          // Ignore
        }
      }
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  };

  useEffect(() => {
    normalizeUrl();
    window.addEventListener('hashchange', normalizeUrl);
    return () => {
      window.removeEventListener('hashchange', normalizeUrl);
    };
  }, []);

  const handleNavClick = (e: React.SyntheticEvent, target: string | number) => {
    e.preventDefault();
    e.stopPropagation();
    const targetIndex = typeof target === 'number' ? target : SECTION_MAP[target] || 1;
    if (fullpageApiRef.current) {
      try {
        fullpageApiRef.current.moveTo(targetIndex);
      } catch {
        // Fallback
      }
    }
    // Clean URL without adding history or hash fragment
    if (typeof window !== 'undefined' && window.location.hash) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F6F2] text-[#1F1E1B] font-sans antialiased selection:bg-[#C66A3D]/20 selection:text-[#1F1E1B]">
      {/* ------------------------------------------------------------- */}
      {/* Navigation Header (Fixed across FullPage sections)            */}
      {/* ------------------------------------------------------------- */}
      <header
        id="main-header"
        className="fixed top-0 left-0 right-0 z-40 bg-[#F7F6F2]/90 backdrop-blur-md border-b border-[#E5E2DC]"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div
            className="flex items-center gap-3 cursor-pointer select-none"
            onClick={(e) => handleNavClick(e, 'hero')}
          >
            <img
              src="https://res.cloudinary.com/dbqmhnahl/image/upload/v1787146942/ChatGPT_Image_Aug_19_2026_07_00_19_PM_jpzwzg.png"
              alt="SanMine Space Logo"
              className="w-8 h-8 object-contain rounded-lg shadow-2xs"
              referrerPolicy="no-referrer"
            />
            <div className="flex items-baseline gap-2">
              <span className="font-bold text-lg tracking-tight text-[#1F1E1B]">
                SanMine Space
              </span>
              <span className="hidden sm:inline-block text-[11px] font-medium uppercase tracking-wider text-[#C66A3D] bg-[#C66A3D]/10 px-2 py-0.5 rounded-full">
                AI Outreach & Research
              </span>
            </div>
          </div>

          <nav className="flex items-center gap-2 sm:gap-4">
            <button
              type="button"
              onClick={(e) => handleNavClick(e, 'what-is-sanmine-space')}
              className="hidden md:inline-block text-xs font-medium text-[#6B6862] hover:text-[#1F1E1B] transition-colors px-2 py-1 cursor-pointer bg-transparent border-0"
            >
              What is SanMine Space?
            </button>
            <button
              type="button"
              onClick={(e) => handleNavClick(e, 'how-it-works')}
              className="hidden md:inline-block text-xs font-medium text-[#6B6862] hover:text-[#1F1E1B] transition-colors px-2 py-1 cursor-pointer bg-transparent border-0"
            >
              How It Works
            </button>
            <button
              type="button"
              onClick={(e) => handleNavClick(e, 'gmail-integration')}
              className="hidden md:inline-block text-xs font-medium text-[#6B6862] hover:text-[#1F1E1B] transition-colors px-2 py-1 cursor-pointer bg-transparent border-0"
            >
              Gmail Integration
            </button>
            <button
              type="button"
              onClick={(e) => handleNavClick(e, 'ai-features')}
              className="hidden md:inline-block text-xs font-medium text-[#6B6862] hover:text-[#1F1E1B] transition-colors px-2 py-1 cursor-pointer bg-transparent border-0"
            >
              AI Features
            </button>
            <button
              type="button"
              onClick={(e) => handleNavClick(e, 'trust')}
              className="hidden md:inline-block text-xs font-medium text-[#6B6862] hover:text-[#1F1E1B] transition-colors px-2 py-1 cursor-pointer bg-transparent border-0"
            >
              Trust & Privacy
            </button>

            <button
              id="header-btn-get-started"
              type="button"
              onClick={() => setShowAuthModal(true)}
              className="inline-flex items-center gap-2 bg-[#1F1E1B] hover:bg-[#33312C] text-[#FFFFFF] text-xs sm:text-sm font-medium px-4 py-2 rounded-xl transition-all shadow-xs cursor-pointer"
            >
              <span>Get Started</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </nav>
        </div>
      </header>

      {/* ------------------------------------------------------------- */}
      {/* FullPage.js Snap-Scroll Sections Container                    */}
      {/* ------------------------------------------------------------- */}
      <ReactFullpage
        licenseKey="Gplv3-license#1"
        credits={{ enabled: false }}
        scrollingSpeed={prefersReducedMotion ? 0 : 700}
        scrollOverflow={true}
        navigation={true}
        navigationPosition="right"
        navigationTooltips={[
          'Home',
          'Overview',
          'How It Works',
          'Gmail Integration',
          'AI Features',
          'Research Data',
          'Trust & Privacy',
          'Footer',
        ]}
        showActiveTooltip={false}
        lockAnchors={true}
        recordHistory={false}
        animateAnchor={false}
        responsiveWidth={960}
        responsiveHeight={640}
        paddingTop="64px"
        fixedElements="#main-header"
        keyboardScrolling={true}
        afterRender={() => {
          normalizeUrl();
        }}
        afterLoad={() => {
          normalizeUrl();
        }}
        onLeave={() => {
          normalizeUrl();
        }}
        render={({ fullpageApi }) => {
          fullpageApiRef.current = fullpageApi;

          return (
            <ReactFullpage.Wrapper>
              {/* ------------------------------------------------------------- */}
              {/* 1. HERO SECTION                                               */}
              {/* ------------------------------------------------------------- */}
              <div className="section bg-[#F7F6F2] border-b border-[#E5E2DC]">
                <section id="section-hero" className="relative py-8 sm:py-12 overflow-hidden w-full">
                  {/* Ambient subtle warm gradients */}
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[450px] bg-gradient-to-b from-[#EBE7DF]/80 via-[#EAE5DC]/30 to-transparent blur-3xl pointer-events-none -z-10" />
                  <div className="absolute top-1/3 -left-20 w-72 h-72 bg-[#C66A3D]/5 rounded-full blur-3xl pointer-events-none -z-10" />

                  <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-6 sm:space-y-8">
                    {/* Badge */}
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#FFFFFF] border border-[#E5E2DC] shadow-2xs text-xs text-[#6B6862]">
                      <Sparkles className="w-3.5 h-3.5 text-[#C66A3D]" />
                      <span>AI-Powered Workspace for Research & Outreach</span>
                    </div>

                    {/* Main Title & Purpose Explanation */}
                    <div className="space-y-4 sm:space-y-5">
                      <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-[#1F1E1B] leading-tight">
                        SanMine Space
                      </h1>
                      <p className="text-lg sm:text-2xl font-semibold text-[#1F1E1B] max-w-3xl mx-auto leading-snug">
                        An AI-powered workspace for researching information, organizing ideas, and creating professional proposals and outreach.
                      </p>
                      <p className="max-w-3xl mx-auto text-sm sm:text-base lg:text-lg text-[#6B6862] leading-relaxed">
                        SanMine Space combines AI-assisted research, conversations, proposal generation, and Gmail-powered outreach tools in one workspace.
                      </p>
                    </div>

                    {/* Hero Core Capabilities Pills */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 max-w-4xl mx-auto text-left pt-1">
                      <div className="p-3.5 bg-[#FFFFFF] border border-[#E5E2DC] rounded-xl shadow-2xs flex flex-col gap-1">
                        <Search className="w-4 h-4 text-[#C66A3D]" />
                        <span className="text-xs font-semibold text-[#1F1E1B]">AI Research</span>
                        <span className="text-[11px] text-[#9C988F]">Explore information with AI</span>
                      </div>
                      <div className="p-3.5 bg-[#FFFFFF] border border-[#E5E2DC] rounded-xl shadow-2xs flex flex-col gap-1">
                        <Globe className="w-4 h-4 text-[#3F7A5A]" />
                        <span className="text-xs font-semibold text-[#1F1E1B]">Information Discovery</span>
                        <span className="text-[11px] text-[#9C988F]">Discover web & business data</span>
                      </div>
                      <div className="p-3.5 bg-[#FFFFFF] border border-[#E5E2DC] rounded-xl shadow-2xs flex flex-col gap-1">
                        <Sliders className="w-4 h-4 text-[#2563EB]" />
                        <span className="text-xs font-semibold text-[#1F1E1B]">Workspace</span>
                        <span className="text-[11px] text-[#9C988F]">Organize conversations & ideas</span>
                      </div>
                      <div className="p-3.5 bg-[#FFFFFF] border border-[#E5E2DC] rounded-xl shadow-2xs flex flex-col gap-1">
                        <FileText className="w-4 h-4 text-[#7C3AED]" />
                        <span className="text-xs font-semibold text-[#1F1E1B]">Proposal Creation</span>
                        <span className="text-[11px] text-[#9C988F]">Draft structured proposals</span>
                      </div>
                      <div className="col-span-2 sm:col-span-1 p-3.5 bg-[#FFFFFF] border border-[#E5E2DC] rounded-xl shadow-2xs flex flex-col gap-1">
                        <Mail className="w-4 h-4 text-[#C66A3D]" />
                        <span className="text-xs font-semibold text-[#1F1E1B]">Gmail Outreach</span>
                        <span className="text-[11px] text-[#9C988F]">Send authorized emails</span>
                      </div>
                    </div>

                    {/* Primary CTA Buttons */}
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-3.5 pt-2">
                      <button
                        id="hero-btn-get-started"
                        type="button"
                        onClick={() => setShowAuthModal(true)}
                        className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 bg-[#C66A3D] hover:bg-[#B55B2E] text-[#FFFFFF] text-sm font-semibold px-6 py-3.5 rounded-xl transition-all shadow-sm cursor-pointer"
                      >
                        <span>Get Started with SanMine Space</span>
                        <ArrowRight className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={(e) => handleNavClick(e, 'what-is-sanmine-space')}
                        className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-[#FFFFFF] hover:bg-[#FAF9F5] text-[#1F1E1B] text-sm font-medium px-5 py-3.5 rounded-xl border border-[#E5E2DC] transition-colors shadow-2xs cursor-pointer"
                      >
                        <span>What is SanMine Space?</span>
                      </button>
                    </div>

                    {/* Compliance & Trust Badge */}
                    <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-[#6B6862] pt-1">
                      <div className="flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4 text-[#3F7A5A]" />
                        <span>Google OAuth Verified Architecture</span>
                      </div>
                      <span className="text-[#D0CCC3]">•</span>
                      <div className="flex items-center gap-1.5">
                        <EyeOff className="w-4 h-4 text-[#6B6862]" />
                        <span>Zero Inbox Reading or Scanning</span>
                      </div>
                      <span className="text-[#D0CCC3]">•</span>
                      <div className="flex items-center gap-1.5">
                        <Lock className="w-4 h-4 text-[#6B6862]" />
                        <span>User-Controlled Send Permissions</span>
                      </div>
                    </div>
                  </div>
                </section>
              </div>

              {/* ------------------------------------------------------------- */}
              {/* 2. WHAT IS SANMINE SPACE?                                     */}
              {/* ------------------------------------------------------------- */}
              <div className="section bg-[#FFFFFF] border-b border-[#E5E2DC]">
                <section id="section-what-is-sanmine-space" className="py-8 sm:py-12 w-full">
                  <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="text-center max-w-3xl mx-auto space-y-3 sm:space-y-4 mb-8 sm:mb-10">
                      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#F7F6F2] border border-[#E5E2DC] text-xs font-semibold text-[#C66A3D]">
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Platform Overview</span>
                      </div>
                      <h2 className="text-2xl sm:text-4xl font-bold tracking-tight text-[#1F1E1B]">
                        What is SanMine Space?
                      </h2>
                      <p className="text-sm sm:text-base lg:text-lg text-[#6B6862] leading-relaxed">
                        SanMine Space is an AI-powered workspace designed to help users research topics, work with information, develop proposals, and prepare professional outreach from one place.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                      {/* AI Research */}
                      <div className="p-5 sm:p-6 rounded-2xl bg-[#F7F6F2] border border-[#E5E2DC] space-y-2.5 sm:space-y-3">
                        <div className="w-10 h-10 rounded-xl bg-[#FFFFFF] border border-[#E5E2DC] flex items-center justify-center text-[#C66A3D] shadow-2xs">
                          <Search className="w-5 h-5" />
                        </div>
                        <h3 className="text-base font-bold text-[#1F1E1B]">
                          AI Research
                        </h3>
                        <p className="text-sm text-[#6B6862] leading-relaxed">
                          Research and explore information with AI assistance. Explore industry data, verify public company websites, and analyze market opportunities.
                        </p>
                      </div>

                      {/* Workspace */}
                      <div className="p-5 sm:p-6 rounded-2xl bg-[#F7F6F2] border border-[#E5E2DC] space-y-2.5 sm:space-y-3">
                        <div className="w-10 h-10 rounded-xl bg-[#FFFFFF] border border-[#E5E2DC] flex items-center justify-center text-[#3F7A5A] shadow-2xs">
                          <Sliders className="w-5 h-5" />
                        </div>
                        <h3 className="text-base font-bold text-[#1F1E1B]">
                          Workspace
                        </h3>
                        <p className="text-sm text-[#6B6862] leading-relaxed">
                          Organize conversations, ideas, and work in one place. Collaborate with intelligent chat assistants and maintain structured project notes.
                        </p>
                      </div>

                      {/* Proposal Creation */}
                      <div className="p-5 sm:p-6 rounded-2xl bg-[#F7F6F2] border border-[#E5E2DC] space-y-2.5 sm:space-y-3">
                        <div className="w-10 h-10 rounded-xl bg-[#FFFFFF] border border-[#E5E2DC] flex items-center justify-center text-[#2563EB] shadow-2xs">
                          <FileText className="w-5 h-5" />
                        </div>
                        <h3 className="text-base font-bold text-[#1F1E1B]">
                          Proposal Creation
                        </h3>
                        <p className="text-sm text-[#6B6862] leading-relaxed">
                          Turn research and conversations into structured proposals. Draft tailored recommendations and review every sentence before sending.
                        </p>
                      </div>

                      {/* Gmail Outreach */}
                      <div className="p-5 sm:p-6 rounded-2xl bg-[#F7F6F2] border border-[#E5E2DC] space-y-2.5 sm:space-y-3">
                        <div className="w-10 h-10 rounded-xl bg-[#FFFFFF] border border-[#E5E2DC] flex items-center justify-center text-[#7C3AED] shadow-2xs">
                          <Mail className="w-5 h-5" />
                        </div>
                        <h3 className="text-base font-bold text-[#1F1E1B]">
                          Gmail Outreach
                        </h3>
                        <p className="text-sm text-[#6B6862] leading-relaxed">
                          Connect a Google account to send outreach emails through Gmail. SanMine Space uses restricted <code className="text-[#C66A3D] font-mono text-xs">gmail.send</code> permissions solely to dispatch proposals you explicitly approve.
                        </p>
                      </div>
                    </div>
                  </div>
                </section>
              </div>

              {/* ------------------------------------------------------------- */}
              {/* 3. HOW SANMINE SPACE WORKS                                    */}
              {/* ------------------------------------------------------------- */}
              <div className="section bg-[#FFFFFF] border-b border-[#E5E2DC]">
                <section id="section-how-it-works" className="py-8 sm:py-12 w-full">
                  <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="text-center max-w-2xl mx-auto space-y-2.5 sm:space-y-3 mb-8 sm:mb-10">
                      <h2 className="text-xs font-bold uppercase tracking-wider text-[#C66A3D]">
                        Workflow & Operations
                      </h2>
                      <h3 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#1F1E1B]">
                        How SanMine Space Works
                      </h3>
                      <p className="text-xs sm:text-sm text-[#6B6862] leading-relaxed">
                        SanMine Space provides a structured step-by-step pipeline from initial market research to authorized outreach delivery.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                      {/* Step 1 */}
                      <div className="p-5 sm:p-6 rounded-2xl bg-[#F7F6F2] border border-[#E5E2DC] flex flex-col justify-between space-y-3 sm:space-y-4">
                        <div className="space-y-2.5 sm:space-y-3">
                          <div className="w-8 h-8 rounded-lg bg-[#FFFFFF] border border-[#E5E2DC] flex items-center justify-center font-mono font-bold text-xs text-[#1F1E1B]">
                            01
                          </div>
                          <h4 className="text-sm sm:text-base font-semibold text-[#1F1E1B]">
                            Sign in to SanMine Space
                          </h4>
                          <p className="text-xs text-[#6B6862] leading-relaxed">
                            Authenticate securely using your Google account to initialize your private workspace session and access project tools.
                          </p>
                        </div>
                        <div className="pt-2 border-t border-[#E5E2DC]/60 flex items-center gap-2 text-[11px] text-[#9C988F]">
                          <ShieldCheck className="w-3.5 h-3.5 text-[#3F7A5A]" />
                          <span>Secure account authentication</span>
                        </div>
                      </div>

                      {/* Step 2 */}
                      <div className="p-5 sm:p-6 rounded-2xl bg-[#F7F6F2] border border-[#E5E2DC] flex flex-col justify-between space-y-3 sm:space-y-4">
                        <div className="space-y-2.5 sm:space-y-3">
                          <div className="w-8 h-8 rounded-lg bg-[#FFFFFF] border border-[#E5E2DC] flex items-center justify-center font-mono font-bold text-xs text-[#1F1E1B]">
                            02
                          </div>
                          <h4 className="text-sm sm:text-base font-semibold text-[#1F1E1B]">
                            Research Businesses & Public Web Data
                          </h4>
                          <p className="text-xs text-[#6B6862] leading-relaxed">
                            Query target business categories, inspect public websites, analyze market offerings, and gather open business context.
                          </p>
                        </div>
                        <div className="pt-2 border-t border-[#E5E2DC]/60 flex items-center gap-2 text-[11px] text-[#9C988F]">
                          <Globe className="w-3.5 h-3.5 text-[#2563EB]" />
                          <span>Public domain data analysis</span>
                        </div>
                      </div>

                      {/* Step 3 */}
                      <div className="p-5 sm:p-6 rounded-2xl bg-[#F7F6F2] border border-[#E5E2DC] flex flex-col justify-between space-y-3 sm:space-y-4">
                        <div className="space-y-2.5 sm:space-y-3">
                          <div className="w-8 h-8 rounded-lg bg-[#FFFFFF] border border-[#E5E2DC] flex items-center justify-center font-mono font-bold text-xs text-[#1F1E1B]">
                            03
                          </div>
                          <h4 className="text-sm sm:text-base font-semibold text-[#1F1E1B]">
                            AI Opportunity Analysis & Proposal Generation
                          </h4>
                          <p className="text-xs text-[#6B6862] leading-relaxed">
                            Configured AI models analyze company offerings to synthesize insights and generate highly tailored, professional proposals.
                          </p>
                        </div>
                        <div className="pt-2 border-t border-[#E5E2DC]/60 flex items-center gap-2 text-[11px] text-[#9C988F]">
                          <Sparkles className="w-3.5 h-3.5 text-[#C66A3D]" />
                          <span>Contextual pitch generation</span>
                        </div>
                      </div>

                      {/* Step 4 */}
                      <div className="p-5 sm:p-6 rounded-2xl bg-[#F7F6F2] border border-[#E5E2DC] flex flex-col justify-between space-y-3 sm:space-y-4">
                        <div className="space-y-2.5 sm:space-y-3">
                          <div className="w-8 h-8 rounded-lg bg-[#FFFFFF] border border-[#E5E2DC] flex items-center justify-center font-mono font-bold text-xs text-[#1F1E1B]">
                            04
                          </div>
                          <h4 className="text-sm sm:text-base font-semibold text-[#1F1E1B]">
                            Review & Customize Proposals
                          </h4>
                          <p className="text-xs text-[#6B6862] leading-relaxed">
                            Review every draft proposal inside the workspace. Edit text, adjust tone, and approve the exact outreach copy before sending.
                          </p>
                        </div>
                        <div className="pt-2 border-t border-[#E5E2DC]/60 flex items-center gap-2 text-[11px] text-[#9C988F]">
                          <FileText className="w-3.5 h-3.5 text-[#7C3AED]" />
                          <span>Full user editorial control</span>
                        </div>
                      </div>

                      {/* Step 5 */}
                      <div className="p-5 sm:p-6 rounded-2xl bg-[#F7F6F2] border border-[#E5E2DC] flex flex-col justify-between space-y-3 sm:space-y-4">
                        <div className="space-y-2.5 sm:space-y-3">
                          <div className="w-8 h-8 rounded-lg bg-[#FFFFFF] border border-[#E5E2DC] flex items-center justify-center font-mono font-bold text-xs text-[#1F1E1B]">
                            05
                          </div>
                          <h4 className="text-sm sm:text-base font-semibold text-[#1F1E1B]">
                            Optionally Connect Gmail
                          </h4>
                          <p className="text-xs text-[#6B6862] leading-relaxed">
                            Users who wish to perform outreach directly can connect their Gmail account via Google OAuth with restricted send permissions.
                          </p>
                        </div>
                        <div className="pt-2 border-t border-[#E5E2DC]/60 flex items-center gap-2 text-[11px] text-[#9C988F]">
                          <Sliders className="w-3.5 h-3.5 text-[#C66A3D]" />
                          <span>Optional integration setting</span>
                        </div>
                      </div>

                      {/* Step 6 */}
                      <div className="p-5 sm:p-6 rounded-2xl bg-[#F7F6F2] border border-[#E5E2DC] flex flex-col justify-between space-y-3 sm:space-y-4">
                        <div className="space-y-2.5 sm:space-y-3">
                          <div className="w-8 h-8 rounded-lg bg-[#FFFFFF] border border-[#E5E2DC] flex items-center justify-center font-mono font-bold text-xs text-[#1F1E1B]">
                            06
                          </div>
                          <h4 className="text-sm sm:text-base font-semibold text-[#1F1E1B]">
                            Send Authorized Outreach Emails
                          </h4>
                          <p className="text-xs text-[#6B6862] leading-relaxed">
                            Send explicitly approved outreach emails directly through your own Gmail account. SanMine Space never reads or scans your inbox.
                          </p>
                        </div>
                        <div className="pt-2 border-t border-[#E5E2DC]/60 flex items-center gap-2 text-[11px] text-[#9C988F]">
                          <Send className="w-3.5 h-3.5 text-[#3F7A5A]" />
                          <span>Strictly user-authorized dispatch</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </section>
              </div>

              {/* ------------------------------------------------------------- */}
              {/* 4. GMAIL INTEGRATION TRANSPARENCY                             */}
              {/* ------------------------------------------------------------- */}
              <div className="section bg-[#F7F6F2] border-b border-[#E5E2DC]">
                <section id="section-gmail-integration" className="py-8 sm:py-12 w-full">
                  <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="bg-[#FFFFFF] border border-[#E5E2DC] rounded-3xl p-5 sm:p-8 lg:p-10 shadow-[0_4px_24px_rgba(0,0,0,0.03)] space-y-6 sm:space-y-8">
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-5 border-b border-[#E5E2DC]">
                        <div className="space-y-1.5">
                          <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#C66A3D]">
                            <Mail className="w-4 h-4" />
                            <span>Transparent Google API Usage</span>
                          </div>
                          <h3 className="text-xl sm:text-2xl font-bold tracking-tight text-[#1F1E1B]">
                            Gmail Integration & OAuth Scope Notice
                          </h3>
                        </div>
                        <div className="px-3 py-1.5 rounded-xl bg-[#F7F6F2] border border-[#E5E2DC] text-xs font-mono text-[#6B6862]">
                          Scope: <code className="text-[#C66A3D] font-semibold">gmail.send</code>
                        </div>
                      </div>

                      {/* Core Disclosure Statement */}
                      <div className="p-4 sm:p-5 rounded-2xl bg-[#FFFBF8] border border-[#F4E3D7] text-xs sm:text-sm text-[#5C3822] leading-relaxed">
                        <p className="font-semibold text-[#1F1E1B] mb-1">Official Integration Notice:</p>
                        &ldquo;SanMine Space can connect to your Gmail account to send emails that you authorize through the application.&rdquo;
                      </div>

                      {/* Clear Permissions Grid */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                        {/* What SanMine Space Does */}
                        <div className="p-4 sm:p-5 rounded-2xl bg-[#F7F6F2] border border-[#E5E2DC] space-y-3">
                          <div className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-[#1F1E1B]">
                            <CheckCircle2 className="w-4 h-4 text-[#3F7A5A]" />
                            <span>What the Gmail Integration Does</span>
                          </div>
                          <ul className="space-y-2 text-xs text-[#6B6862] leading-relaxed">
                            <li className="flex items-start gap-2">
                              <span className="text-[#3F7A5A] font-bold">✓</span>
                              <span>Uses official Google Gmail REST API via secure OAuth 2.0.</span>
                            </li>
                            <li className="flex items-start gap-2">
                              <span className="text-[#3F7A5A] font-bold">✓</span>
                              <span>Requests strictly the <code className="bg-[#EAE6DF] px-1 py-0.5 rounded text-[#1F1E1B]">https://www.googleapis.com/auth/gmail.send</code> permission.</span>
                            </li>
                            <li className="flex items-start gap-2">
                              <span className="text-[#3F7A5A] font-bold">✓</span>
                              <span>Designed solely to dispatch proposals you explicitly approve.</span>
                            </li>
                            <li className="flex items-start gap-2">
                              <span className="text-[#3F7A5A] font-bold">✓</span>
                              <span>Allows users to disconnect and revoke access at any time with one click.</span>
                            </li>
                          </ul>
                        </div>

                        {/* What SanMine Space Never Does */}
                        <div className="p-4 sm:p-5 rounded-2xl bg-[#F7F6F2] border border-[#E5E2DC] space-y-3">
                          <div className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-[#1F1E1B]">
                            <EyeOff className="w-4 h-4 text-[#C66A3D]" />
                            <span>Permissions SanMine Space Never Requests</span>
                          </div>
                          <ul className="space-y-2 text-xs text-[#6B6862] leading-relaxed">
                            <li className="flex items-start gap-2">
                              <span className="text-[#C66A3D] font-bold">✗</span>
                              <span>Does <strong>NOT</strong> request permission to read your emails or inbox.</span>
                            </li>
                            <li className="flex items-start gap-2">
                              <span className="text-[#C66A3D] font-bold">✗</span>
                              <span>Does <strong>NOT</strong> scan, analyze, or process existing inbox messages.</span>
                            </li>
                            <li className="flex items-start gap-2">
                              <span className="text-[#C66A3D] font-bold">✗</span>
                              <span>Does <strong>NOT</strong> request permission to modify or delete Gmail messages.</span>
                            </li>
                            <li className="flex items-start gap-2">
                              <span className="text-[#C66A3D] font-bold">✗</span>
                              <span>Never accesses contacts, drafts, or trash folders.</span>
                            </li>
                          </ul>
                        </div>
                      </div>
                    </div>
                  </div>
                </section>
              </div>

              {/* ------------------------------------------------------------- */}
              {/* 5. AI FEATURES                                                */}
              {/* ------------------------------------------------------------- */}
              <div className="section bg-[#FFFFFF] border-b border-[#E5E2DC]">
                <section id="section-ai-features" className="py-8 sm:py-12 w-full">
                  <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8 sm:space-y-10">
                    <div className="text-center max-w-2xl mx-auto space-y-2.5 sm:space-y-3">
                      <h2 className="text-xs font-bold uppercase tracking-wider text-[#C66A3D]">
                        Intelligence Architecture
                      </h2>
                      <h3 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#1F1E1B]">
                        Supported AI Features & Capabilities
                      </h3>
                      <p className="text-xs sm:text-sm text-[#6B6862] leading-relaxed">
                        SanMine Space supports configured AI providers (Google Gemini, OpenAI, and OpenRouter) to power intelligent, interactive business workflows.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
                      <div className="p-5 sm:p-6 rounded-2xl bg-[#F7F6F2] border border-[#E5E2DC] space-y-2.5 sm:space-y-3">
                        <div className="w-10 h-10 rounded-xl bg-[#FFFFFF] border border-[#E5E2DC] flex items-center justify-center text-[#C66A3D]">
                          <Sparkles className="w-5 h-5" />
                        </div>
                        <h4 className="text-sm sm:text-base font-semibold text-[#1F1E1B]">
                          Conversational AI
                        </h4>
                        <p className="text-xs text-[#6B6862] leading-relaxed">
                          Interactive chat assistant in the workspace to plan outreach campaigns, explore target niches, and refine messaging strategies.
                        </p>
                      </div>

                      <div className="p-5 sm:p-6 rounded-2xl bg-[#F7F6F2] border border-[#E5E2DC] space-y-2.5 sm:space-y-3">
                        <div className="w-10 h-10 rounded-xl bg-[#FFFFFF] border border-[#E5E2DC] flex items-center justify-center text-[#3F7A5A]">
                          <Search className="w-5 h-5" />
                        </div>
                        <h4 className="text-sm sm:text-base font-semibold text-[#1F1E1B]">
                          Research Analysis
                        </h4>
                        <p className="text-xs text-[#6B6862] leading-relaxed">
                          AI extraction of core services, value propositions, and opportunity signals from publicly available company information.
                        </p>
                      </div>

                      <div className="p-5 sm:p-6 rounded-2xl bg-[#F7F6F2] border border-[#E5E2DC] space-y-2.5 sm:space-y-3">
                        <div className="w-10 h-10 rounded-xl bg-[#FFFFFF] border border-[#E5E2DC] flex items-center justify-center text-[#2563EB]">
                          <FileText className="w-5 h-5" />
                        </div>
                        <h4 className="text-sm sm:text-base font-semibold text-[#1F1E1B]">
                          Proposal Generation
                        </h4>
                        <p className="text-xs text-[#6B6862] leading-relaxed">
                          Automated drafting of structured business proposals, tailored recommendations, and customized value offerings.
                        </p>
                      </div>

                      <div className="p-5 sm:p-6 rounded-2xl bg-[#F7F6F2] border border-[#E5E2DC] space-y-2.5 sm:space-y-3">
                        <div className="w-10 h-10 rounded-xl bg-[#FFFFFF] border border-[#E5E2DC] flex items-center justify-center text-[#7C3AED]">
                          <Sliders className="w-5 h-5" />
                        </div>
                        <h4 className="text-sm sm:text-base font-semibold text-[#1F1E1B]">
                          Outreach Personalization
                        </h4>
                        <p className="text-xs text-[#6B6862] leading-relaxed">
                          Adaptive customization of email subject lines, body copy, and tone to match specific business contexts and industry terminology.
                        </p>
                      </div>
                    </div>
                  </div>
                </section>
              </div>

              {/* ------------------------------------------------------------- */}
              {/* 6. BUSINESS RESEARCH & DATA PROCESSING                        */}
              {/* ------------------------------------------------------------- */}
              <div className="section bg-[#F7F6F2] border-b border-[#E5E2DC]">
                <section id="section-business-research" className="py-8 sm:py-12 w-full">
                  <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8 sm:space-y-10">
                    <div className="text-center max-w-2xl mx-auto space-y-2.5 sm:space-y-3">
                      <h2 className="text-xs font-bold uppercase tracking-wider text-[#C66A3D]">
                        Public Information Processing
                      </h2>
                      <h3 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#1F1E1B]">
                        Business Research & Public Web Data
                      </h3>
                      <p className="text-xs sm:text-sm text-[#6B6862] leading-relaxed">
                        SanMine Space gathers and synthesizes publicly available business information to help users prepare relevant, high-quality proposals.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                      <div className="p-4 sm:p-5 rounded-2xl bg-[#FFFFFF] border border-[#E5E2DC] space-y-2 sm:space-y-2.5">
                        <div className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-[#1F1E1B]">
                          <Building2 className="w-4 h-4 text-[#C66A3D]" />
                          <span>Business Identification</span>
                        </div>
                        <p className="text-xs text-[#6B6862] leading-relaxed">
                          Public business name, trading category, industry classification, and operating brand profiles.
                        </p>
                      </div>

                      <div className="p-4 sm:p-5 rounded-2xl bg-[#FFFFFF] border border-[#E5E2DC] space-y-2 sm:space-y-2.5">
                        <div className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-[#1F1E1B]">
                          <Globe className="w-4 h-4 text-[#3F7A5A]" />
                          <span>Website & Online Presence</span>
                        </div>
                        <p className="text-xs text-[#6B6862] leading-relaxed">
                          Official website URLs, public web page text, service descriptions, and published product catalogs.
                        </p>
                      </div>

                      <div className="p-4 sm:p-5 rounded-2xl bg-[#FFFFFF] border border-[#E5E2DC] space-y-2 sm:space-y-2.5">
                        <div className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-[#1F1E1B]">
                          <Mail className="w-4 h-4 text-[#2563EB]" />
                          <span>Public Contact Information</span>
                        </div>
                        <p className="text-xs text-[#6B6862] leading-relaxed">
                          Publicly listed inquiries, contact emails, official inquiry form endpoints, and published phone lines.
                        </p>
                      </div>

                      <div className="p-4 sm:p-5 rounded-2xl bg-[#FFFFFF] border border-[#E5E2DC] space-y-2 sm:space-y-2.5">
                        <div className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-[#1F1E1B]">
                          <Database className="w-4 h-4 text-[#7C3AED]" />
                          <span>Location & Service Area</span>
                        </div>
                        <p className="text-xs text-[#6B6862] leading-relaxed">
                          Geographic operating region, city/state presence, and public business directory listings.
                        </p>
                      </div>

                      <div className="p-4 sm:p-5 rounded-2xl bg-[#FFFFFF] border border-[#E5E2DC] space-y-2 sm:space-y-2.5">
                        <div className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-[#1F1E1B]">
                          <FileText className="w-4 h-4 text-[#C66A3D]" />
                          <span>Reviews & Feedback</span>
                        </div>
                        <p className="text-xs text-[#6B6862] leading-relaxed">
                          Public customer ratings, directory reviews, and market reputation signals used to tailor proposal tone.
                        </p>
                      </div>

                      <div className="p-4 sm:p-5 rounded-2xl bg-[#FFFFFF] border border-[#E5E2DC] space-y-2 sm:space-y-2.5">
                        <div className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-[#1F1E1B]">
                          <ShieldCheck className="w-4 h-4 text-[#3F7A5A]" />
                          <span>Ethical Data Handling</span>
                        </div>
                        <p className="text-xs text-[#6B6862] leading-relaxed">
                          All data is gathered strictly from open, public sources and used solely for research, lead discovery, and outreach.
                        </p>
                      </div>
                    </div>
                  </div>
                </section>
              </div>

              {/* ------------------------------------------------------------- */}
              {/* 7. PRIVACY & TRUST SECTION                                    */}
              {/* ------------------------------------------------------------- */}
              <div className="section bg-[#FFFFFF] border-b border-[#E5E2DC]">
                <section id="section-trust" className="py-8 sm:py-12 w-full">
                  <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6 sm:space-y-8">
                    <div className="text-center space-y-2.5 sm:space-y-3">
                      <h2 className="text-xs font-bold uppercase tracking-wider text-[#3F7A5A]">
                        Security & Privacy Commitments
                      </h2>
                      <h3 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#1F1E1B]">
                        Privacy & Trust by Design
                      </h3>
                      <p className="text-xs sm:text-sm text-[#6B6862] leading-relaxed">
                        We prioritize data transparency, user control, and security standards across every layer of the platform.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5 text-left">
                      <div className="p-4 sm:p-5 rounded-2xl bg-[#F7F6F2] border border-[#E5E2DC] space-y-2">
                        <div className="flex items-center gap-2 font-semibold text-xs sm:text-sm text-[#1F1E1B]">
                          <ShieldCheck className="w-4 h-4 text-[#3F7A5A]" />
                          <span>Account Protection</span>
                        </div>
                        <p className="text-xs text-[#6B6862] leading-relaxed">
                          User accounts are authenticated securely via Google Sign-In and Firebase Authentication with strict workspace partitioning.
                        </p>
                      </div>

                      <div className="p-4 sm:p-5 rounded-2xl bg-[#F7F6F2] border border-[#E5E2DC] space-y-2">
                        <div className="flex items-center gap-2 font-semibold text-xs sm:text-sm text-[#1F1E1B]">
                          <Lock className="w-4 h-4 text-[#C66A3D]" />
                          <span>Server-Side Credential Handling</span>
                        </div>
                        <p className="text-xs text-[#6B6862] leading-relaxed">
                          OAuth access tokens and configured API keys are encrypted with AES-256-GCM and stored exclusively in secure server-side databases.
                        </p>
                      </div>

                      <div className="p-4 sm:p-5 rounded-2xl bg-[#F7F6F2] border border-[#E5E2DC] space-y-2">
                        <div className="flex items-center gap-2 font-semibold text-xs sm:text-sm text-[#1F1E1B]">
                          <Sliders className="w-4 h-4 text-[#2563EB]" />
                          <span>Complete User Control</span>
                        </div>
                        <p className="text-xs text-[#6B6862] leading-relaxed">
                          You decide whether to connect your Gmail account, and you can revoke integration access immediately at any time.
                        </p>
                      </div>

                      <div className="p-4 sm:p-5 rounded-2xl bg-[#F7F6F2] border border-[#E5E2DC] space-y-2">
                        <div className="flex items-center gap-2 font-semibold text-xs sm:text-sm text-[#1F1E1B]">
                          <EyeOff className="w-4 h-4 text-[#7C3AED]" />
                          <span>No Selling of Personal Data</span>
                        </div>
                        <p className="text-xs text-[#6B6862] leading-relaxed">
                          SanMine Space does not sell user data, research lists, or personal information to third-party data brokers or advertisers.
                        </p>
                      </div>
                    </div>
                  </div>
                </section>
              </div>

              {/* ------------------------------------------------------------- */}
              {/* 8. FOOTER SECTION (fp-auto-height)                            */}
              {/* ------------------------------------------------------------- */}
              <div className="section fp-auto-height bg-[#F7F6F2]">
                <footer className="w-full bg-[#F7F6F2] border-t border-[#E5E2DC] py-8 sm:py-12">
                  <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex flex-col md:flex-row items-center justify-between gap-6 pb-6 sm:pb-8 border-b border-[#E5E2DC]">
                      <div className="flex items-center gap-3">
                        <img
                          src="https://res.cloudinary.com/dbqmhnahl/image/upload/v1787146942/ChatGPT_Image_Aug_19_2026_07_00_19_PM_jpzwzg.png"
                          alt="SanMine Space Logo"
                          className="w-7 h-7 object-contain rounded-md"
                          referrerPolicy="no-referrer"
                        />
                        <span className="font-bold text-base tracking-tight text-[#1F1E1B]">
                          SanMine Space
                        </span>
                        <span className="text-xs text-[#9C988F]">
                          — AI Business Intelligence & Outreach
                        </span>
                      </div>

                      {/* Essential Policy Links */}
                      <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 text-xs font-medium text-[#6B6862]">
                        <a
                          href="/privacy"
                          className="hover:text-[#1F1E1B] underline underline-offset-4 transition-colors"
                        >
                          Privacy Policy
                        </a>
                        <a
                          href="/terms"
                          className="hover:text-[#1F1E1B] underline underline-offset-4 transition-colors"
                        >
                          Terms of Service
                        </a>
                        <button
                          type="button"
                          onClick={(e) => handleNavClick(e, 'gmail-integration')}
                          className="hover:text-[#1F1E1B] transition-colors cursor-pointer bg-transparent border-0 p-0 text-xs font-medium text-[#6B6862]"
                        >
                          OAuth Disclosure
                        </button>
                        <a
                          href="mailto:support.sanminespace@gmail.com"
                          className="hover:text-[#1F1E1B] underline underline-offset-4 transition-colors"
                        >
                          Support: support.sanminespace@gmail.com
                        </a>
                        <a
                          href="https://tavqeer-hussain.web.app/"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-[#1F1E1B] transition-colors"
                        >
                          Contact Developer
                        </a>
                      </div>
                    </div>

                    <div className="pt-4 sm:pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#9C988F]">
                      <p>© {new Date().getFullYear()} SanMine Space. All rights reserved.</p>
                      <p className="text-center sm:text-right">
                        Built for secure business research, lead discovery, and authorized outreach.
                      </p>
                    </div>
                  </div>
                </footer>
              </div>
            </ReactFullpage.Wrapper>
          );
        }}
      />

      {/* ------------------------------------------------------------- */}
      {/* AUTHENTICATION MODAL                                          */}
      {/* ------------------------------------------------------------- */}
      {showAuthModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-transparent animate-in fade-in-50"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowAuthModal(false);
          }}
        >
          <div className="w-full max-w-md bg-[#FFFFFF] border border-[#E5E2DC] rounded-3xl p-6 sm:p-8 shadow-[0_16px_50px_rgba(0,0,0,0.12)] relative space-y-6">
            <button
              type="button"
              onClick={() => setShowAuthModal(false)}
              className="absolute top-5 right-5 p-1.5 rounded-full text-[#9C988F] hover:text-[#1F1E1B] hover:bg-[#F7F6F2] transition-colors cursor-pointer"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Header Branding */}
            <div className="text-center space-y-2.5 flex flex-col items-center pt-2">
              <img
                src="https://res.cloudinary.com/dbqmhnahl/image/upload/v1787146942/ChatGPT_Image_Aug_19_2026_07_00_19_PM_jpzwzg.png"
                alt="SanMine Space Logo"
                className="w-12 h-12 object-contain rounded-xl shadow-xs"
                referrerPolicy="no-referrer"
              />
              <h3 className="text-xl font-bold tracking-tight text-[#1F1E1B]">
                Welcome to SanMine Space
              </h3>
              <p className="text-xs text-[#6B6862] max-w-xs">
                Sign in with your Google account to access your AI business research & outreach workspace.
              </p>
            </div>

            {/* Error Alert Banner */}
            {authError && (
              <div className="p-3.5 rounded-xl bg-[#FFFBFB] border border-[#F8D7DA] text-xs text-[#991B1B] flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-[#DC2626] shrink-0 mt-0.5" />
                <div className="flex-1 leading-relaxed">{authError}</div>
                <button
                  type="button"
                  onClick={clearAuthError}
                  className="text-[#991B1B] hover:text-[#7F1D1D] p-0.5 rounded cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Google Authentication Button */}
            <div className="space-y-3">
              <button
                id="modal-btn-google-sign-in"
                type="button"
                onClick={handleSignIn}
                disabled={isAuthenticating}
                className={`w-full flex items-center justify-center gap-3 py-3.5 px-4 rounded-xl text-sm font-medium border border-[#E5E2DC] bg-[#FFFFFF] hover:bg-[#FAF9F5] active:bg-[#F2F1ED] text-[#1F1E1B] transition-all shadow-2xs cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${
                  isAuthenticating ? 'ring-2 ring-[#C66A3D]/30' : 'hover:border-[#D5D2CC]'
                }`}
              >
                {isAuthenticating ? (
                  <div className="flex items-center gap-2">
                    <svg
                      className="animate-spin h-4 w-4 text-[#C66A3D]"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    <span className="text-[#6B6862]">Connecting to Google...</span>
                  </div>
                ) : (
                  <>
                    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                      <path
                        fill="#4285F4"
                        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                      />
                    </svg>
                    <span className="font-semibold text-sm">Continue with Google</span>
                  </>
                )}
              </button>

              <div className="flex items-center justify-center gap-1.5 text-[11px] text-[#9C988F] pt-2">
                <ShieldCheck className="w-3.5 h-3.5 text-[#3F7A5A]" />
                <span>Secure authentication via Google Identity</span>
              </div>
            </div>

            <div className="pt-2 border-t border-[#E5E2DC] text-center text-[11px] text-[#9C988F]">
              By continuing, you agree to SanMine Space&apos;s{' '}
              <a href="/terms" className="underline hover:text-[#1F1E1B]">Terms</a>{' '}
              and{' '}
              <a href="/privacy" className="underline hover:text-[#1F1E1B]">Privacy Policy</a>.
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
