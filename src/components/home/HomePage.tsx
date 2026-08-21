import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  Terminal as TerminalIcon,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  ArrowRight,
  ExternalLink,
  Plus,
  Minus,
  Sparkles,
  ShieldCheck,
  Globe,
  Code2,
  Cpu,
  Layers,
  Zap,
  Mail,
  Search,
  FileText,
  Building2,
  Lock,
  CheckCircle2,
  AlertCircle,
  X,
  MessageSquare,
  Bookmark,
  Share2,
  Laptop,
  Compass,
  FileCode,
  Box,
  Send
} from 'lucide-react';

/* -------------------------------------------------------------------------- */
/* DATA DEFINITIONS & COPY ACCURATE TO THE CLAUDE CODE STYLE SCREENSHOT       */
/* -------------------------------------------------------------------------- */

const PLATFORM_ICONS = [
  { name: 'Terminal', icon: '⌨️' },
  { name: 'Web', icon: '🌐' },
  { name: 'iOS', icon: '📱' },
  { name: 'Android', icon: '🤖' },
  { name: 'GitHub', icon: '🐙' },
  { name: 'VS Code', icon: '💻' },
  { name: 'JetBrains', icon: '⚡' },
  { name: 'Slack', icon: '💬' }
];

const LOGO_PARTNERS = [
  { name: 'NASA', logoText: 'NASA' },
  { name: 'asana', logoText: 'asana' },
  { name: 'Uber', logoText: 'Uber' },
  { name: 'PagerDuty', logoText: 'PagerDuty' },
  { name: 'Brex', logoText: 'BREX' }
];

const WHAT_YOU_CAN_DO_TABS = [
  {
    id: 'onboarding',
    label: 'Code & Research Onboarding',
    terminalPrompt: '> I need to map this codebase and market research. Can you explain it to me?',
    terminalOutput: [
      '● Analyzing workspace structure and market intelligence vectors...',
      '● Identified architecture: Full-stack agent runtime with ReAct decision engine.',
      '  - Frontend: Vite + React 18 with stacked overlay sliding viewport',
      '  - Backend: Node.js / Express with deterministic lifecycle state guards',
      '  - Discovery: Multi-source web search & headless DOM inspection',
      '  - Outreach: Restricted Google OAuth 2.0 (gmail.send only)',
      '● Ready to triage tasks, build grounded proposals, and execute tool commands.'
    ]
  },
  {
    id: 'triage',
    label: 'Triage Issues & Leads',
    terminalPrompt: '> sanmine triage --domain="enterprise-saas" --leads=5',
    terminalOutput: [
      '● Connecting to multi-source business registries and live web domains...',
      '  ✓ Lead 1: CloudPulse Analytics (Austin, TX) [Score: 96/100]',
      '  ✓ Lead 2: ApexFlow Automation (San Francisco, CA) [Score: 94/100]',
      '  ✓ Lead 3: DataKite Systems (Boston, MA) [Score: 91/100]',
      '● Verifying active websites and validated corporate emails...',
      '● Zero hallucination guarantee: 5/5 verified with live source quotes.'
    ]
  },
  {
    id: 'refactor',
    label: 'Refactor & Edit Code',
    terminalPrompt: '> sanmine edit --file="server/agent/brain/decisionEngine.ts" --optimize="checkpointing"',
    terminalOutput: [
      '● Reading decisionEngine.ts (1,624 lines)...',
      '● Applying deterministic checkpoint pre/post hooks to external tool dispatcher...',
      '● Verified exact-once action execution integrity for email and search actions.',
      '● Ran regression suite: 50 passed, 0 failed. Build 100% clean.'
    ]
  }
];

const ANNOUNCEMENTS = [
  {
    title: 'Dynamic workflows',
    desc: 'Tackle the most challenging tasks by executing across 10s to 100s of parallel subagents, and checking its work before anything reaches you.',
    date: 'May 28',
    type: 'Blog'
  },
  {
    title: 'Agent view',
    desc: 'One place to manage all your Sanmine Space sessions and background tasks.',
    date: 'May 11',
    type: 'Blog'
  },
  {
    title: 'Routines',
    desc: 'Configure a routine once, and it can run on a schedule, from an API call, or in response to an event.',
    date: 'Apr 14',
    type: 'Blog'
  },
  {
    title: 'Computer use & Web tools',
    desc: 'Sanmine Space navigates the live web, crawls DOM elements, and inspects live websites to complete complex research.',
    date: 'Mar 23',
    type: 'Blog'
  }
];

const TESTIMONIALS = [
  {
    company: 'ramp',
    logo: 'ramp ↗',
    quote:
      '"Sanmine Space has dramatically accelerated our team\'s operational efficiency. I can now write exploratory research, extract verifiable business contacts, and turn them into tailored proposals—pulling everything directly into our workflow."',
    author: 'Anton Brylkov, Staff Software Engineer'
  },
  {
    company: 'intercom',
    logo: 'intercom',
    quote:
      '"With Sanmine Space, we\'re not just automating research—we\'re elevating it to truly human quality. This lets support and sales teams think more strategically about customer experience with zero hallucinations."',
    author: 'Fergal Reid, VP of AI'
  },
  {
    company: 'notion',
    logo: 'N Notion',
    quote:
      '"Sanmine Space is moving our team up a level: we decide what needs to happen, and smooth the process so it can build and verify end-to-end. A big part of my day is now orchestrating autonomous workflows with peace of mind."',
    author: 'Simon Last, Co-Founder'
  }
];

const INTEGRATION_LOGOS = [
  { name: 'AWS', bg: 'bg-[#FF9900]/10', text: 'AWS' },
  { name: 'New Relic', bg: 'bg-[#1CE783]/10', text: 'new relic' },
  { name: 'Heroku', bg: 'bg-[#430098]/10', text: 'HEROKU' },
  { name: 'Datadog', bg: 'bg-[#632CA6]/10', text: 'DATADOG' },
  { name: 'MongoDB', bg: 'bg-[#13AA52]/10', text: 'MongoDB.' },
  { name: 'Elastic', bg: 'bg-[#005571]/10', text: 'elastic' },
  { name: 'Stripe', bg: 'bg-[#635BFF]/10', text: 'stripe' },
  { name: 'Kubernetes', bg: 'bg-[#326CE5]/10', text: 'kubernetes' },
  { name: 'Atlassian', bg: 'bg-[#0052CC]/10', text: 'ATLASSIAN' },
  { name: 'Dynatrace', bg: 'bg-[#1496FF]/10', text: 'dynatrace' },
  { name: 'GitHub', bg: 'bg-[#24292E]/10', text: 'GitHub' },
  { name: 'Terraform', bg: 'bg-[#844FBA]/10', text: 'HashiCorp Terraform' }
];

const FAQS = [
  {
    q: 'How do I get started with Sanmine Space?',
    a: 'You can launch Sanmine Space directly in your browser with 1-click Google Sign-In or install the CLI tool using `curl -fsSL https://sanmine.space/install.sh | bash`. It connects directly to your authorized Google Workspace and agent runtime without complex configuration.'
  },
  {
    q: 'What kinds of tasks can Sanmine Space handle?',
    a: 'Sanmine Space handles deep multi-domain web research, autonomous lead discovery with live website crawling, grounded proposal generation with 5-pillar persuasion architecture, and official Gmail outreach dispatch with explicit user approvals.'
  },
  {
    q: 'How does Sanmine Space work with my existing tools?',
    a: 'Sanmine Space integrates smoothly with your terminal, browser, IDE (VS Code, JetBrains), and cloud environments. It connects with Gmail using official Google REST APIs with restricted `gmail.send` scope—never reading or scanning your private inbox.'
  },
  {
    q: 'Is Sanmine Space secure and compliant?',
    a: 'Yes. Sanmine Space strictly enforces Zero Inbox Scanning, stores OAuth tokens encrypted with AES-256-GCM, and adheres to Google API Services User Data Policies. All web research is grounded to exact citations with zero hallucination.'
  },
  {
    q: 'What are the system requirements to run Sanmine Space?',
    a: 'Sanmine Space works on macOS, Linux, and Windows (via WSL or PowerShell). For browser-based workflows, any modern browser is fully supported.'
  },
  {
    q: 'How much does Sanmine Space cost?',
    a: 'Sanmine Space offers a flexible Pro tier starting at $17/month for individual builders, with Max 5x ($100/month) and Max 20x ($200/month) plans for high-frequency power users and enterprise teams.'
  }
];

const TECHNICAL_DOCS = [
  {
    title: 'Sanmine Space documentation',
    tag: 'Developer docs',
    desc: 'Explore the comprehensive CLI and API reference guides for autonomous agent workflows.'
  },
  {
    title: 'Common workflows',
    tag: 'Developer docs',
    desc: 'Step-by-step blueprints for multi-lead research, website inspection, and customized proposal pipelines.'
  },
  {
    title: 'Using SANMINE.md files',
    tag: 'Blog',
    desc: 'Define workspace-level instructions, project rules, and persistent persona memories for your agent.'
  },
  {
    title: 'Introduction to agentic reasoning',
    tag: 'Blog',
    desc: 'Learn how our deterministic ReAct loops evaluate observations and prevent hallucinated facts.'
  },
  {
    title: 'How teams use Sanmine Space',
    tag: 'Blog',
    desc: 'Case studies on scaling personalized outbound campaigns with 100% citation provenance.'
  },
  {
    title: 'Fix workflows faster with agent checkpoints',
    tag: 'Blog',
    desc: 'Deep dive into exactly-once action execution and rollback safety in AI-assisted development.'
  }
];

const SECTIONS_METADATA = [
  { id: 'hero', title: 'Sanmine Space' },
  { id: 'pricing', title: 'Pricing & Plans' },
  { id: 'announcements', title: 'Feature Announcements' },
  { id: 'capabilities', title: 'What You Can Do' },
  { id: 'where-you-work', title: 'Meets You Where You Work' },
  { id: 'testimonials', title: 'What Developers Are Saying' },
  { id: 'integrations', title: 'Command Line Integrations' },
  { id: 'faq', title: 'FAQ' },
  { id: 'rundown', title: 'Technical Rundown' },
  { id: 'footer-cta', title: 'Get Started' }
];

/* -------------------------------------------------------------------------- */
/* MAIN HOMEPAGE COMPONENT WITH STACKED OVERLAY SLIDING VIEWPORT TRANSITION   */
/* -------------------------------------------------------------------------- */

export const HomePage: React.FC = () => {
  const { signInWithGoogle, isAuthenticating, authError, clearAuthError } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState<boolean>(false);
  const [activeSection, setActiveSection] = useState<number>(0);
  const [billingPlan, setBillingPlan] = useState<'individual' | 'team'>('individual');
  const [activeCapTab, setActiveCapTab] = useState<string>('onboarding');
  const [copiedInstall, setCopiedInstall] = useState<boolean>(false);
  const [expandedFaq, setExpandedFaq] = useState<number | null>(0);
  const [newsletterEmail, setNewsletterEmail] = useState<string>('');
  const [newsletterSubscribed, setNewsletterSubscribed] = useState<boolean>(false);

  // Wheel & touch scroll lock refs (180ms snap timeout)
  const isTransitioningRef = useRef<boolean>(false);
  const touchStartYRef = useRef<number>(0);
  const lastScrollTimeRef = useRef<number>(0);
  const totalSections = SECTIONS_METADATA.length;

  const handleSignIn = async () => {
    if (isAuthenticating) return;
    await signInWithGoogle();
  };

  const goToSection = useCallback(
    (targetIndex: number) => {
      if (targetIndex < 0 || targetIndex >= totalSections) return;
      if (isTransitioningRef.current) return;

      isTransitioningRef.current = true;
      setActiveSection(targetIndex);

      // Snap timeout: 600ms transition + 180ms snap settle
      setTimeout(() => {
        isTransitioningRef.current = false;
      }, 780);
    },
    [totalSections]
  );

  const handleNext = useCallback(() => {
    goToSection(activeSection + 1);
  }, [activeSection, goToSection]);

  const handlePrev = useCallback(() => {
    goToSection(activeSection - 1);
  }, [activeSection, goToSection]);

  // Mouse wheel listener with snap transition
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (showAuthModal) return;

      const now = Date.now();
      if (now - lastScrollTimeRef.current < 200) {
        e.preventDefault();
        return;
      }

      if (Math.abs(e.deltaY) > 20) {
        e.preventDefault();
        lastScrollTimeRef.current = now;

        if (e.deltaY > 0) {
          handleNext();
        } else {
          handlePrev();
        }
      }
    };

    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      window.removeEventListener('wheel', handleWheel);
    };
  }, [handleNext, handlePrev, showAuthModal]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (showAuthModal) return;
      if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ') {
        e.preventDefault();
        handleNext();
      } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
        e.preventDefault();
        handlePrev();
      } else if (e.key === 'Home') {
        e.preventDefault();
        goToSection(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        goToSection(totalSections - 1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleNext, handlePrev, goToSection, totalSections, showAuthModal]);

  // Mobile Touch Swipe Handling
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartYRef.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (showAuthModal) return;
    const touchEndY = e.changedTouches[0].clientY;
    const deltaY = touchStartYRef.current - touchEndY;

    if (Math.abs(deltaY) > 40) {
      if (deltaY > 0) {
        handleNext();
      } else {
        handlePrev();
      }
    }
  };

  const handleCopyInstall = () => {
    navigator.clipboard.writeText('curl -fsSL https://sanmine.space/install.sh | bash');
    setCopiedInstall(true);
    setTimeout(() => setCopiedInstall(false), 2200);
  };

  const handleNewsletterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newsletterEmail) return;
    setNewsletterSubscribed(true);
    setTimeout(() => {
      setNewsletterEmail('');
    }, 3000);
  };

  const currentTab = WHAT_YOU_CAN_DO_TABS.find(t => t.id === activeCapTab) || WHAT_YOU_CAN_DO_TABS[0];

  return (
    <div
      id="sanmine-landing-root"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      className="fixed inset-0 w-screen h-screen overflow-hidden bg-[#F7F6F2] text-[#1F1E1B] font-sans antialiased selection:bg-[#D25234]/20 selection:text-[#1F1E1B]"
    >
      {/* ------------------------------------------------------------- */}
      {/* Top Main Navigation Bar (Claude Code Style)                   */}
      {/* ------------------------------------------------------------- */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-[#F7F6F2]/95 backdrop-blur-md border-b border-[#E5E2DC]/80">
        {/* Main top bar */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-12 flex items-center justify-between text-xs">
          {/* Logo & Brand Name */}
          <div
            onClick={() => goToSection(0)}
            className="flex items-center gap-2 cursor-pointer select-none group"
          >
            {/* Sanmine Starburst Icon */}
            <div className="w-5 h-5 flex items-center justify-center text-[#D25234]">
              <Sparkles className="w-4 h-4 fill-current" />
            </div>
            <span className="font-serif text-base font-bold tracking-tight text-[#1F1E1B] group-hover:text-[#D25234] transition-colors">
              Sanmine Space
            </span>
          </div>

          {/* Navigation Links */}
          <nav className="hidden lg:flex items-center gap-5 text-[#4D4B46] font-medium">
            <div className="flex items-center gap-1 hover:text-[#1F1E1B] cursor-pointer">
              <span>Meet Agent</span>
              <ChevronDown className="w-3 h-3 text-[#9C988F]" />
            </div>
            <div className="flex items-center gap-1 hover:text-[#1F1E1B] cursor-pointer">
              <span>Platform</span>
              <ChevronDown className="w-3 h-3 text-[#9C988F]" />
            </div>
            <div className="flex items-center gap-1 hover:text-[#1F1E1B] cursor-pointer">
              <span>Solutions</span>
              <ChevronDown className="w-3 h-3 text-[#9C988F]" />
            </div>
            <button
              type="button"
              onClick={() => goToSection(1)}
              className="hover:text-[#1F1E1B] cursor-pointer"
            >
              Pricing
            </button>
            <div className="flex items-center gap-1 hover:text-[#1F1E1B] cursor-pointer">
              <span>Resources</span>
              <ChevronDown className="w-3 h-3 text-[#9C988F]" />
            </div>
          </nav>

          {/* Right Action Buttons */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowAuthModal(true)}
              className="text-[#4D4B46] hover:text-[#1F1E1B] font-medium hidden sm:inline-block cursor-pointer transition-colors"
            >
              Login
            </button>
            <button
              type="button"
              onClick={() => setShowAuthModal(true)}
              className="text-[#4D4B46] hover:text-[#1F1E1B] font-medium hidden md:inline-block cursor-pointer transition-colors"
            >
              Contact sales
            </button>
            <button
              id="header-btn-try-sanmine"
              type="button"
              onClick={() => setShowAuthModal(true)}
              className="bg-[#141413] hover:bg-[#2A2825] active:bg-[#000000] text-[#FFFFFF] font-medium px-3.5 py-1.5 rounded-full transition-all text-xs cursor-pointer shadow-2xs"
            >
              Try Sanmine Space
            </button>
          </div>
        </div>

        {/* Secondary Sub-bar */}
        <div className="border-t border-[#EAE6DF] bg-[#F7F6F2]/80 px-4 sm:px-6 lg:px-8 py-1 flex items-center justify-between text-[11px] text-[#6B6862]">
          <span className="font-semibold text-[#1F1E1B]">Sanmine Space</span>
          <button
            type="button"
            onClick={() => goToSection(1)}
            className="flex items-center gap-1 hover:text-[#1F1E1B] cursor-pointer font-medium"
          >
            <span>Explore here</span>
            <ArrowRight className="w-3 h-3 text-[#D25234]" />
          </button>
        </div>
      </header>

      {/* ------------------------------------------------------------- */}
      {/* Right Edge Floating Pill Navigator                            */}
      {/* ------------------------------------------------------------- */}
      <div className="fixed right-3 sm:right-5 top-1/2 -translate-y-1/2 z-50 hidden md:flex flex-col items-center gap-2.5 bg-[#FFFFFF]/80 backdrop-blur-md p-1.5 rounded-full border border-[#E5E2DC] shadow-xs">
        {SECTIONS_METADATA.map((sec, idx) => {
          const isActive = activeSection === idx;
          return (
            <button
              key={sec.id}
              type="button"
              onClick={() => goToSection(idx)}
              aria-label={`Go to ${sec.title}`}
              className="group relative flex items-center justify-center cursor-pointer p-0.5"
            >
              <span
                className={`block rounded-full transition-all duration-300 ${
                  isActive
                    ? 'w-2 h-5 bg-[#D25234] rounded-full'
                    : 'w-1.5 h-1.5 bg-[#D5D2CA] group-hover:bg-[#9C988F]'
                }`}
              />
              <span className="absolute right-7 top-1/2 -translate-y-1/2 px-2 py-0.5 rounded bg-[#1F1E1B] text-[#FFFFFF] text-[10px] font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 shadow-md">
                {sec.title}
              </span>
            </button>
          );
        })}
      </div>

      {/* ------------------------------------------------------------- */}
      {/* Bottom Floating Step Pill (Prev / Next)                       */}
      {/* ------------------------------------------------------------- */}
      <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 bg-[#FFFFFF]/90 backdrop-blur-md px-3 py-1 rounded-full border border-[#E5E2DC] shadow-xs text-xs font-mono text-[#6B6862]">
        <button
          type="button"
          onClick={handlePrev}
          disabled={activeSection === 0}
          className="p-1 rounded hover:bg-[#F7F6F2] hover:text-[#1F1E1B] disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
          aria-label="Previous section"
        >
          <ChevronUp className="w-3.5 h-3.5" />
        </button>
        <span className="px-1 text-[11px] text-[#1F1E1B] font-semibold">
          {activeSection + 1} / {totalSections}
        </span>
        <button
          type="button"
          onClick={handleNext}
          disabled={activeSection === totalSections - 1}
          className="p-1 rounded hover:bg-[#F7F6F2] hover:text-[#1F1E1B] disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
          aria-label="Next section"
        >
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* ============================================================= */}
      {/* STACKED OVERLAY SLIDING DECK CONTAINER                        */}
      {/* Section 0 is at bottom (z-10, stays pinned)                   */}
      {/* Subsequent sections slide in at translateY(100% -> 0%)        */}
      {/* ============================================================= */}
      <main className="relative w-full h-full">

        {/* ----------------------------------------------------------- */}
        {/* SECTION 0: HERO (CLAUDE CODE STYLE)                         */}
        {/* ----------------------------------------------------------- */}
        <section
          id="section-hero"
          style={{
            zIndex: 10,
            transform: activeSection > 0 ? 'scale(0.98)' : 'translateY(0%)',
            opacity: activeSection > 0 ? 0.7 : 1,
            transition: 'transform 600ms cubic-bezier(0.16, 1, 0.3, 1), opacity 600ms ease'
          }}
          className="absolute inset-0 w-full h-full bg-[#F7F6F2] pt-20 pb-12 px-4 sm:px-6 lg:px-8 flex items-center justify-center overflow-y-auto"
        >
          <div className="max-w-6xl w-full mx-auto space-y-6">
            {/* Top Grid: Hero Heading & Interactive Preview */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              {/* Left Column: Editorial Headline & CTAs */}
              <div className="lg:col-span-5 space-y-4 text-left">
                <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl font-normal tracking-tight text-[#1F1E1B] leading-[1.08]">
                  Sanmine Space
                </h1>
                <p className="text-sm sm:text-base text-[#5C5952] leading-relaxed max-w-md">
                  Work with Sanmine Space directly in your workflow. Research, verify, synthesize proposals, and coordinate outreach from your terminal, IDE, and web browser.
                </p>

                {/* Primary CTA Buttons */}
                <div className="space-y-2 pt-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowAuthModal(true)}
                      className="inline-flex items-center gap-2 bg-[#141413] hover:bg-[#2A2825] text-[#FFFFFF] text-xs font-semibold px-4 py-2.5 rounded-lg transition-all shadow-xs cursor-pointer"
                    >
                      <DownloadIcon className="w-3.5 h-3.5" />
                      <span>Get Sanmine Space</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => goToSection(8)}
                      className="inline-flex items-center gap-1.5 text-xs text-[#5C5952] hover:text-[#1F1E1B] px-3 py-2 rounded-lg hover:bg-[#EAE6DF]/60 transition-colors cursor-pointer"
                    >
                      <span>Read documentation</span>
                      <ExternalLink className="w-3 h-3 text-[#9C988F]" />
                    </button>
                  </div>
                  <div className="text-[11px] text-[#9C988F]">
                    Available for macOS, Linux, and Windows.
                  </div>
                </div>
              </div>

              {/* Right Column: Sleek Claude Code Style Interface Mockup */}
              <div className="lg:col-span-7">
                <div className="w-full bg-[#FFFFFF] rounded-2xl border border-[#E5E2DC] shadow-[0_12px_36px_rgba(0,0,0,0.06)] overflow-hidden text-xs">
                  {/* Window Bar */}
                  <div className="bg-[#FAF9F5] px-3 py-2 border-b border-[#E5E2DC] flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#E5B558]" />
                      <span className="w-2.5 h-2.5 rounded-full bg-[#5FB878]" />
                      <span className="w-2.5 h-2.5 rounded-full bg-[#D25234]" />
                      <span className="ml-2 font-mono text-[11px] text-[#6B6862]">
                        sanmine-agent / fix-the-double-charge-bug.ts
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-[#9C988F]">
                      <span className="text-[#3F7A5A] font-semibold">● Agent Active</span>
                    </div>
                  </div>

                  {/* UI Body Split */}
                  <div className="grid grid-cols-12 min-h-[260px]">
                    {/* Left Mini Sidebar */}
                    <div className="col-span-4 bg-[#FAF9F5] border-r border-[#E5E2DC] p-3 space-y-3 font-mono text-[11px]">
                      <div className="text-[10px] uppercase font-bold text-[#9C988F] tracking-wider">
                        Sessions
                      </div>
                      <div className="space-y-1 text-[#5C5952]">
                        <div className="p-1.5 rounded bg-[#EAE6DF] text-[#1F1E1B] font-semibold">
                          + New session
                        </div>
                        <div className="p-1 rounded hover:bg-[#EAE6DF]/50 flex items-center gap-1">
                          <span>⚡ Routines</span>
                        </div>
                        <div className="p-1 rounded hover:bg-[#EAE6DF]/50 flex items-center gap-1">
                          <span>⚙ Customize</span>
                        </div>
                      </div>
                      <div className="text-[10px] uppercase font-bold text-[#9C988F] tracking-wider pt-2">
                        Scheduled
                      </div>
                      <div className="text-[11px] text-[#6B6862]">
                        Weekly dependency audit
                      </div>
                    </div>

                    {/* Right Workspace Preview */}
                    <div className="col-span-8 p-4 space-y-3 font-sans text-xs bg-[#FFFFFF]">
                      <div className="p-2.5 rounded-lg bg-[#F0F7FF] border border-[#D0E5FF] text-[#1E40AF] text-[11px] leading-relaxed">
                        <strong>We're seeing duplicate charges when customers double-click the pay button. Can you find and fix it?</strong>
                      </div>
                      <div className="text-[11px] text-[#5C5952] space-y-1.5 font-mono">
                        <div>Read 3 files, searched the checkout flow →</div>
                        <div className="p-2 rounded bg-[#FAF9F5] border border-[#E5E2DC] text-[10px] text-[#1F1E1B] leading-normal">
                          <span className="text-[#D25234] font-semibold">Plan:</span> Reproduce the double submit against a test charge front cause. <code className="bg-[#EAE6DF] px-1 rounded">createCharge()</code> generates a new idempotency key per call instead of per checkout session.
                        </div>
                      </div>
                      <div className="pt-2 flex items-center justify-between border-t border-[#E5E2DC] text-[11px]">
                        <span className="text-[#9C988F]">Describe a task or ask a question</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-mono bg-[#FAF9F5] border border-[#E5E2DC] px-1.5 py-0.5 rounded text-[#5C5952]">Auto</span>
                          <button
                            type="button"
                            onClick={() => setShowAuthModal(true)}
                            className="bg-[#D25234] text-[#FFFFFF] px-2 py-0.5 rounded text-[11px] font-semibold hover:bg-[#BE4528] cursor-pointer"
                          >
                            Send
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Other Ways to Use Row */}
            <div className="pt-2 text-center space-y-2">
              <div className="text-[11px] text-[#9C988F]">
                Other ways to use Sanmine Space
              </div>
              <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 text-xs text-[#5C5952]">
                {PLATFORM_ICONS.map((p) => (
                  <div key={p.name} className="flex flex-col items-center gap-1 group cursor-pointer">
                    <span className="text-base group-hover:scale-110 transition-transform">{p.icon}</span>
                    <span className="text-[10px] text-[#6B6862] group-hover:text-[#1F1E1B]">{p.name}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Social Proof Logos */}
            <div className="pt-4 border-t border-[#E5E2DC]/80 flex flex-wrap items-center justify-around gap-6 text-[#9C988F] font-bold text-sm">
              {LOGO_PARTNERS.map((partner) => (
                <span key={partner.name} className="hover:text-[#1F1E1B] transition-colors tracking-wide">
                  {partner.logoText}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* ----------------------------------------------------------- */}
        {/* SECTION 1: "GET STARTED WITH SANMINE SPACE" & PRICING       */}
        {/* ----------------------------------------------------------- */}
        <section
          id="section-pricing"
          style={{
            zIndex: 20,
            transform: activeSection >= 1 ? 'translateY(0%)' : 'translateY(100%)',
            transition: 'transform 600ms cubic-bezier(0.16, 1, 0.3, 1)'
          }}
          className="absolute inset-0 w-full h-full bg-[#FFFFFF] pt-20 pb-12 px-4 sm:px-6 lg:px-8 flex items-center justify-center border-t border-[#E5E2DC] shadow-2xl overflow-y-auto"
        >
          <div className="max-w-5xl w-full mx-auto space-y-6">
            {/* Hand-drawn line flower/sprout icon */}
            <div className="text-center space-y-3">
              <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-[#F7F6F2] border border-[#E5E2DC] text-[#D25234]">
                <SproutIcon className="w-5 h-5" />
              </div>
              <h2 className="font-serif text-3xl sm:text-4xl font-normal tracking-tight text-[#1F1E1B]">
                Get started with Sanmine Space
              </h2>

              {/* Individual / Team Switcher */}
              <div className="inline-flex p-0.5 rounded-full bg-[#F7F6F2] border border-[#E5E2DC] text-xs font-medium text-[#6B6862]">
                <button
                  type="button"
                  onClick={() => setBillingPlan('individual')}
                  className={`px-3 py-1 rounded-full transition-all cursor-pointer ${
                    billingPlan === 'individual'
                      ? 'bg-[#FFFFFF] text-[#1F1E1B] font-semibold shadow-2xs'
                      : 'hover:text-[#1F1E1B]'
                  }`}
                >
                  👤 Individual
                </button>
                <button
                  type="button"
                  onClick={() => setBillingPlan('team')}
                  className={`px-3 py-1 rounded-full transition-all cursor-pointer ${
                    billingPlan === 'team'
                      ? 'bg-[#FFFFFF] text-[#1F1E1B] font-semibold shadow-2xs'
                      : 'hover:text-[#1F1E1B]'
                  }`}
                >
                  👥 Team & Enterprise
                </button>
              </div>
            </div>

            {/* 3 Pricing Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {/* Card 1: Pro */}
              <div className="p-6 rounded-2xl bg-[#FFFFFF] border border-[#E5E2DC] space-y-4 shadow-xs flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="w-8 h-8 rounded-full bg-[#F7F6F2] flex items-center justify-center text-[#1F1E1B]">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <h3 className="text-lg font-bold text-[#1F1E1B]">Pro</h3>
                  <p className="text-xs text-[#6B6862] leading-relaxed">
                    Sanmine Space is included in your Pro plan. Perfect for short coding sprints in small codebases.
                  </p>
                </div>
                <div className="space-y-3 pt-4 border-t border-[#E5E2DC]">
                  <div className="text-2xl font-bold text-[#1F1E1B]">
                    $17 <span className="text-xs font-normal text-[#9C988F]">/ month</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowAuthModal(true)}
                    className="w-full py-2.5 rounded-lg bg-[#141413] hover:bg-[#2A2825] text-[#FFFFFF] text-xs font-semibold transition-colors cursor-pointer"
                  >
                    Try Sanmine Space
                  </button>
                </div>
              </div>

              {/* Card 2: Max 5x */}
              <div className="p-6 rounded-2xl bg-[#FFFFFF] border border-[#D25234]/40 space-y-4 shadow-sm flex flex-col justify-between relative">
                <div className="absolute -top-2.5 right-4 bg-[#D25234] text-[#FFFFFF] text-[10px] font-bold px-2 py-0.5 rounded-full">
                  POPULAR
                </div>
                <div className="space-y-3">
                  <div className="w-8 h-8 rounded-full bg-[#D25234]/10 text-[#D25234] flex items-center justify-center">
                    <Zap className="w-4 h-4" />
                  </div>
                  <h3 className="text-lg font-bold text-[#1F1E1B]">Max 5x</h3>
                  <p className="text-xs text-[#6B6862] leading-relaxed">
                    Sanmine Space is included in your Max plan. Great value for everyday use in larger codebases.
                  </p>
                </div>
                <div className="space-y-3 pt-4 border-t border-[#E5E2DC]">
                  <div className="text-2xl font-bold text-[#1F1E1B]">
                    $100 <span className="text-xs font-normal text-[#9C988F]">/ month</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowAuthModal(true)}
                    className="w-full py-2.5 rounded-lg bg-[#141413] hover:bg-[#2A2825] text-[#FFFFFF] text-xs font-semibold transition-colors cursor-pointer"
                  >
                    Try Sanmine Space
                  </button>
                </div>
              </div>

              {/* Card 3: Max 20x */}
              <div className="p-6 rounded-2xl bg-[#FFFFFF] border border-[#E5E2DC] space-y-4 shadow-xs flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="w-8 h-8 rounded-full bg-[#F7F6F2] flex items-center justify-center text-[#1F1E1B]">
                    <Layers className="w-4 h-4" />
                  </div>
                  <h3 className="text-lg font-bold text-[#1F1E1B]">Max 20x</h3>
                  <p className="text-xs text-[#6B6862] leading-relaxed">
                    Even more Sanmine Space included in your Max plan. Great value for power users with the most access.
                  </p>
                </div>
                <div className="space-y-3 pt-4 border-t border-[#E5E2DC]">
                  <div className="text-2xl font-bold text-[#1F1E1B]">
                    $200 <span className="text-xs font-normal text-[#9C988F]">/ month</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowAuthModal(true)}
                    className="w-full py-2.5 rounded-lg bg-[#141413] hover:bg-[#2A2825] text-[#FFFFFF] text-xs font-semibold transition-colors cursor-pointer"
                  >
                    Try Sanmine Space
                  </button>
                </div>
              </div>
            </div>

            <div className="text-center text-[10px] text-[#9C988F]">
              Usage limits apply. Prices shown don't include applicable tax. Enterprise contracts available on request.
            </div>
          </div>
        </section>

        {/* ----------------------------------------------------------- */}
        {/* SECTION 2: LATEST FEATURE ANNOUNCEMENTS                     */}
        {/* ----------------------------------------------------------- */}
        <section
          id="section-announcements"
          style={{
            zIndex: 30,
            transform: activeSection >= 2 ? 'translateY(0%)' : 'translateY(100%)',
            transition: 'transform 600ms cubic-bezier(0.16, 1, 0.3, 1)'
          }}
          className="absolute inset-0 w-full h-full bg-[#F7F6F2] pt-20 pb-12 px-4 sm:px-6 lg:px-8 flex items-center justify-center border-t border-[#E5E2DC] shadow-2xl overflow-y-auto"
        >
          <div className="max-w-4xl w-full mx-auto space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
              {/* Left Column: Megaphone Header */}
              <div className="md:col-span-4 space-y-3">
                <div className="w-10 h-10 rounded-full bg-[#FFFFFF] border border-[#E5E2DC] flex items-center justify-center text-[#D25234] shadow-2xs">
                  <MegaphoneIcon className="w-5 h-5" />
                </div>
                <h2 className="font-serif text-2xl sm:text-3xl font-normal text-[#1F1E1B]">
                  Latest feature announcements
                </h2>
              </div>

              {/* Right Column: List of updates */}
              <div className="md:col-span-8 space-y-4">
                {ANNOUNCEMENTS.map((item, i) => (
                  <div
                    key={i}
                    className="p-4 rounded-xl bg-[#FFFFFF] border border-[#E5E2DC] hover:border-[#D5D2CC] transition-all space-y-1.5 shadow-2xs"
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-bold text-[#1F1E1B]">
                        {item.title}
                      </h3>
                      <span className="text-[10px] font-mono text-[#9C988F]">{item.date}</span>
                    </div>
                    <p className="text-xs text-[#6B6862] leading-relaxed">
                      {item.desc}
                    </p>
                    <div className="text-[10px] text-[#D25234] font-medium pt-1">
                      {item.type} ↗
                    </div>
                  </div>
                ))}

                <div className="pt-2 text-center">
                  <button
                    type="button"
                    onClick={() => setShowAuthModal(true)}
                    className="inline-flex items-center gap-1 text-xs text-[#5C5952] hover:text-[#1F1E1B] border border-[#E5E2DC] bg-[#FFFFFF] px-4 py-2 rounded-lg shadow-2xs cursor-pointer"
                  >
                    <span>View changelog</span>
                    <ExternalLink className="w-3 h-3 text-[#9C988F]" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ----------------------------------------------------------- */}
        {/* SECTION 3: "WHAT COULD YOU DO WITH SANMINE SPACE?"          */}
        {/* ----------------------------------------------------------- */}
        <section
          id="section-capabilities"
          style={{
            zIndex: 40,
            transform: activeSection >= 3 ? 'translateY(0%)' : 'translateY(100%)',
            transition: 'transform 600ms cubic-bezier(0.16, 1, 0.3, 1)'
          }}
          className="absolute inset-0 w-full h-full bg-[#FFFFFF] pt-20 pb-12 px-4 sm:px-6 lg:px-8 flex items-center justify-center border-t border-[#E5E2DC] shadow-2xl overflow-y-auto"
        >
          <div className="max-w-5xl w-full mx-auto space-y-6">
            {/* Header with Briefcase Icon */}
            <div className="text-center space-y-3">
              <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-[#F7F6F2] border border-[#E5E2DC] text-[#D25234]">
                <BriefcaseIcon className="w-5 h-5" />
              </div>
              <h2 className="font-serif text-3xl sm:text-4xl font-normal tracking-tight text-[#1F1E1B]">
                What could you do with Sanmine Space?
              </h2>

              {/* Install snippet pill */}
              <div className="inline-flex items-center gap-2 p-1.5 px-3 rounded-full bg-[#F7F6F2] border border-[#E5E2DC] text-xs font-mono">
                <span className="font-bold text-[#1F1E1B]">Get Sanmine Space</span>
                <span className="text-[#9C988F]">|</span>
                <span className="text-[#6B6862]">curl -fsSL https://sanmine.space/install.sh | bash</span>
                <button
                  type="button"
                  onClick={handleCopyInstall}
                  className="p-1 text-[#9C988F] hover:text-[#1F1E1B] cursor-pointer"
                  title="Copy command"
                >
                  {copiedInstall ? <Check className="w-3 h-3 text-[#3F7A5A]" /> : <Copy className="w-3 h-3" />}
                </button>
              </div>
            </div>

            {/* Tab Pill Buttons */}
            <div className="flex flex-wrap items-center justify-center gap-2 text-xs font-mono">
              {WHAT_YOU_CAN_DO_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveCapTab(tab.id)}
                  className={`px-3 py-1.5 rounded-full border transition-all cursor-pointer ${
                    activeCapTab === tab.id
                      ? 'bg-[#141413] text-[#FFFFFF] border-[#141413] font-semibold'
                      : 'bg-[#F7F6F2] text-[#6B6862] border-[#E5E2DC] hover:border-[#D5D2CC]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Terminal Window & Explanation Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left Dark Terminal Preview */}
              <div className="lg:col-span-7 bg-[#141413] text-[#F7F6F2] rounded-2xl border border-[#383632] shadow-lg p-4 font-mono text-xs space-y-3">
                <div className="flex items-center gap-1.5 pb-2 border-b border-[#2A2825]">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#D25234]" />
                  <span className="w-2.5 h-2.5 rounded-full bg-[#E5B558]" />
                  <span className="w-2.5 h-2.5 rounded-full bg-[#5FB878]" />
                  <span className="ml-2 text-[10px] text-[#9C988F]">sanmine-space-cli</span>
                </div>
                <div className="text-[#D25234] font-semibold">{currentTab.terminalPrompt}</div>
                <div className="space-y-1 text-[11px] text-[#D5D2CA] leading-relaxed">
                  {currentTab.terminalOutput.map((line, idx) => (
                    <div key={idx} className={line.includes('✓') ? 'text-[#5FB878]' : ''}>
                      {line}
                    </div>
                  ))}
                </div>
              </div>

              {/* Right Feature Explanation Bullets */}
              <div className="lg:col-span-5 space-y-4 text-left">
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-[#1F1E1B]">Code & System Onboarding</h3>
                  <p className="text-xs text-[#6B6862] leading-relaxed">
                    Sanmine Space maps and explains entire codebases in a few seconds. It uses agentic search to understand project structure without manually selecting context files.
                  </p>
                </div>
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-[#1F1E1B]">Turn Intent into Executions</h3>
                  <p className="text-xs text-[#6B6862] leading-relaxed">
                    Stop bouncing between tools. Sanmine Space integrates with your terminal to handle the entire workflow—reading issues, writing code, running tests, and submitting PRs.
                  </p>
                </div>
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-[#1F1E1B]">Make Powerful Edits</h3>
                  <p className="text-xs text-[#6B6862] leading-relaxed">
                    Sanmine Space's understanding of dependencies enables it to make powerful, multi-file edits that work.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ----------------------------------------------------------- */}
        {/* SECTION 4: "MEETS YOU WHERE YOU WORK"                       */}
        {/* ----------------------------------------------------------- */}
        <section
          id="section-where-you-work"
          style={{
            zIndex: 50,
            transform: activeSection >= 4 ? 'translateY(0%)' : 'translateY(100%)',
            transition: 'transform 600ms cubic-bezier(0.16, 1, 0.3, 1)'
          }}
          className="absolute inset-0 w-full h-full bg-[#F7F6F2] pt-20 pb-12 px-4 sm:px-6 lg:px-8 flex items-center justify-center border-t border-[#E5E2DC] shadow-2xl overflow-y-auto"
        >
          <div className="max-w-5xl w-full mx-auto space-y-6">
            {/* Header with Terminal Icon */}
            <div className="text-center space-y-3">
              <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-[#FFFFFF] border border-[#E5E2DC] text-[#D25234]">
                <CodeIcon className="w-5 h-5" />
              </div>
              <h2 className="font-serif text-3xl sm:text-4xl font-normal tracking-tight text-[#1F1E1B]">
                Meets you where you code & work
              </h2>
            </div>

            {/* 3 Environment Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {/* Card 1: Terminal */}
              <div className="p-5 rounded-2xl bg-[#FFFFFF] border border-[#E5E2DC] space-y-3 shadow-xs">
                <div className="h-36 rounded-xl bg-[#141413] text-[#D5D2CA] p-3 font-mono text-[10px] space-y-1 overflow-hidden">
                  <div className="text-[#D25234]">$ Welcome to Sanmine Space!</div>
                  <div className="text-[#5FB878]">● Read 12 candidate leads...</div>
                  <div className="text-[#9C988F]">● Grounded 5 proposals</div>
                  <div className="text-[#FFFFFF]">✓ Execution completed</div>
                </div>
                <h3 className="text-sm font-bold text-[#1F1E1B]">Start in your terminal</h3>
                <p className="text-xs text-[#6B6862] leading-relaxed">
                  Super powerful terminal integration. Works with all your CLI tools alongside any IDE.
                </p>
                <div className="pt-2 border-t border-[#E5E2DC] text-[10px] font-mono text-[#D25234]">
                  curl -fsSL https://sanmine.space/install.sh
                </div>
              </div>

              {/* Card 2: IDE Integration */}
              <div className="p-5 rounded-2xl bg-[#FFFFFF] border border-[#E5E2DC] space-y-3 shadow-xs">
                <div className="h-36 rounded-xl bg-[#23272E] text-[#ABB2BF] p-3 font-mono text-[10px] space-y-1 overflow-hidden border border-[#383C44]">
                  <div className="text-[#61AFEF]">// Sanmine Space for VS Code</div>
                  <div>Can you add tests for this file?</div>
                  <div className="text-[#98C379]">✓ decisionEngine.test.ts</div>
                  <div className="text-[#E5C07B]">50/50 test assertions passed</div>
                </div>
                <h3 className="text-sm font-bold text-[#1F1E1B]">Integrate with your editor</h3>
                <p className="text-xs text-[#6B6862] leading-relaxed">
                  Native extensions for VS Code (+ Cursor, Devin Desktop) and JetBrains IDEs.
                </p>
                <div className="pt-2 border-t border-[#E5E2DC] flex items-center gap-2 text-[10px] text-[#6B6862]">
                  <span className="bg-[#FAF9F5] px-2 py-0.5 rounded border border-[#E5E2DC]">VS Code</span>
                  <span className="bg-[#FAF9F5] px-2 py-0.5 rounded border border-[#E5E2DC]">JetBrains</span>
                </div>
              </div>

              {/* Card 3: Browser & Web App */}
              <div className="p-5 rounded-2xl bg-[#FFFFFF] border border-[#E5E2DC] space-y-3 shadow-xs">
                <div className="h-36 rounded-xl bg-[#FAF9F5] text-[#1F1E1B] p-3 font-sans text-[10px] space-y-1 overflow-hidden border border-[#E5E2DC]">
                  <div className="font-bold flex items-center justify-between">
                    <span>Sanmine Space Web</span>
                    <span className="text-[#5FB878]">● Live</span>
                  </div>
                  <div className="p-1.5 rounded bg-[#FFFFFF] border border-[#E5E2DC] text-[9px] text-[#6B6862]">
                    Session: #outreach-march-2026
                  </div>
                  <div className="text-[9px] text-[#3F7A5A]">5 Proposals Dispatched via Gmail</div>
                </div>
                <h3 className="text-sm font-bold text-[#1F1E1B]">Access anywhere</h3>
                <p className="text-xs text-[#6B6862] leading-relaxed">
                  Quick access from browser, mobile app, or Sanmine Space desktop for parallel work on the go.
                </p>
                <div className="pt-2 border-t border-[#E5E2DC] flex items-center gap-2 text-[10px]">
                  <button
                    type="button"
                    onClick={() => setShowAuthModal(true)}
                    className="text-[#D25234] font-semibold hover:underline cursor-pointer"
                  >
                    Open in browser →
                  </button>
                </div>
              </div>
            </div>

            {/* Bottom Callout Banner */}
            <div className="p-4 rounded-2xl bg-[#FFFFFF] border border-[#E5E2DC] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs shadow-2xs">
              <div className="flex items-center gap-3">
                <MessageSquare className="w-5 h-5 text-[#D25234]" />
                <span className="font-medium text-[#1F1E1B]">Kick off autonomous agent tasks directly in Slack or Gmail</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowAuthModal(true)}
                  className="bg-[#FAF9F5] hover:bg-[#EAE6DF] text-[#1F1E1B] px-3 py-1.5 rounded-lg border border-[#E5E2DC] font-medium cursor-pointer"
                >
                  Add to Slack
                </button>
                <button
                  type="button"
                  onClick={() => setShowAuthModal(true)}
                  className="bg-[#141413] text-[#FFFFFF] px-3 py-1.5 rounded-lg font-medium cursor-pointer"
                >
                  Learn more
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* ----------------------------------------------------------- */}
        {/* SECTION 5: "WHAT DEVELOPERS ARE SAYING" (TESTIMONIALS)      */}
        {/* ----------------------------------------------------------- */}
        <section
          id="section-testimonials"
          style={{
            zIndex: 60,
            transform: activeSection >= 5 ? 'translateY(0%)' : 'translateY(100%)',
            transition: 'transform 600ms cubic-bezier(0.16, 1, 0.3, 1)'
          }}
          className="absolute inset-0 w-full h-full bg-[#FFFFFF] pt-20 pb-12 px-4 sm:px-6 lg:px-8 flex items-center justify-center border-t border-[#E5E2DC] shadow-2xl overflow-y-auto"
        >
          <div className="max-w-4xl w-full mx-auto space-y-6">
            <div className="text-center space-y-2">
              <h2 className="font-serif text-3xl sm:text-4xl font-normal tracking-tight text-[#1F1E1B]">
                What developers are saying
              </h2>
            </div>

            {/* Testimonials List */}
            <div className="space-y-4">
              {TESTIMONIALS.map((t, idx) => (
                <div
                  key={idx}
                  className="p-5 rounded-2xl bg-[#F7F6F2] border border-[#E5E2DC] grid grid-cols-1 md:grid-cols-12 gap-4 items-center"
                >
                  <div className="md:col-span-3 text-lg font-bold font-mono text-[#1F1E1B]">
                    {t.logo}
                  </div>
                  <div className="md:col-span-9 space-y-2">
                    <p className="text-xs text-[#5C5952] leading-relaxed italic">
                      {t.quote}
                    </p>
                    <div className="text-[11px] font-semibold text-[#1F1E1B]">
                      {t.author}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ----------------------------------------------------------- */}
        {/* SECTION 6: COMMAND LINE TOOLS INTEGRATIONS                  */}
        {/* ----------------------------------------------------------- */}
        <section
          id="section-integrations"
          style={{
            zIndex: 70,
            transform: activeSection >= 6 ? 'translateY(0%)' : 'translateY(100%)',
            transition: 'transform 600ms cubic-bezier(0.16, 1, 0.3, 1)'
          }}
          className="absolute inset-0 w-full h-full bg-[#F7F6F2] pt-20 pb-12 px-4 sm:px-6 lg:px-8 flex items-center justify-center border-t border-[#E5E2DC] shadow-2xl overflow-y-auto"
        >
          <div className="max-w-5xl w-full mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            {/* Left Grid of Tool Logos */}
            <div className="lg:col-span-6 grid grid-cols-3 sm:grid-cols-4 gap-3 bg-[#FFFFFF] p-5 rounded-3xl border border-[#E5E2DC] shadow-xs">
              {INTEGRATION_LOGOS.map((tool) => (
                <div
                  key={tool.name}
                  className={`p-3 rounded-xl ${tool.bg} border border-[#E5E2DC] flex flex-col items-center justify-center text-center space-y-1 hover:scale-105 transition-transform`}
                >
                  <span className="text-xs font-bold text-[#1F1E1B]">{tool.text}</span>
                </div>
              ))}
            </div>

            {/* Right Explanation Text */}
            <div className="lg:col-span-6 space-y-4 text-left">
              <h2 className="font-serif text-3xl sm:text-4xl font-normal tracking-tight text-[#1F1E1B]">
                Connects with your favorite command line tools
              </h2>
              <p className="text-xs sm:text-sm text-[#6B6862] leading-relaxed">
                Your terminal is where real work happens. Sanmine Space connects with the tools that power development—deployment, databases, monitoring, version control. Rather than adding another interface to juggle, it enhances your existing stack.
              </p>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setShowAuthModal(true)}
                  className="bg-[#141413] hover:bg-[#2A2825] text-[#FFFFFF] text-xs font-semibold px-4 py-2.5 rounded-lg transition-colors cursor-pointer"
                >
                  Explore Integrations
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* ----------------------------------------------------------- */}
        {/* SECTION 7: FAQ ACCORDION                                    */}
        {/* ----------------------------------------------------------- */}
        <section
          id="section-faq"
          style={{
            zIndex: 80,
            transform: activeSection >= 7 ? 'translateY(0%)' : 'translateY(100%)',
            transition: 'transform 600ms cubic-bezier(0.16, 1, 0.3, 1)'
          }}
          className="absolute inset-0 w-full h-full bg-[#FFFFFF] pt-20 pb-12 px-4 sm:px-6 lg:px-8 flex items-center justify-center border-t border-[#E5E2DC] shadow-2xl overflow-y-auto"
        >
          <div className="max-w-3xl w-full mx-auto space-y-6">
            <div className="text-center space-y-3">
              <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-[#F7F6F2] border border-[#E5E2DC] text-[#D25234]">
                <QuestionIcon className="w-5 h-5" />
              </div>
              <h2 className="font-serif text-3xl sm:text-4xl font-normal tracking-tight text-[#1F1E1B]">
                FAQ
              </h2>
            </div>

            {/* Accordion List */}
            <div className="space-y-2 text-left">
              {FAQS.map((faq, idx) => {
                const isOpen = expandedFaq === idx;
                return (
                  <div
                    key={idx}
                    className="border border-[#E5E2DC] rounded-xl overflow-hidden bg-[#F7F6F2]/50 transition-colors"
                  >
                    <button
                      type="button"
                      onClick={() => setExpandedFaq(isOpen ? null : idx)}
                      className="w-full px-4 py-3 text-left text-xs font-bold text-[#1F1E1B] flex items-center justify-between hover:bg-[#F7F6F2] cursor-pointer"
                    >
                      <span>{faq.q}</span>
                      <span className="text-[#9C988F] text-sm">
                        {isOpen ? '−' : '+'}
                      </span>
                    </button>
                    {isOpen && (
                      <div className="px-4 pb-3 text-xs text-[#6B6862] leading-relaxed border-t border-[#E5E2DC]/50 bg-[#FFFFFF]">
                        {faq.a}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ----------------------------------------------------------- */}
        {/* SECTION 8: "GET THE TECHNICAL RUNDOWN" (DOC CARDS)          */}
        {/* ----------------------------------------------------------- */}
        <section
          id="section-rundown"
          style={{
            zIndex: 90,
            transform: activeSection >= 8 ? 'translateY(0%)' : 'translateY(100%)',
            transition: 'transform 600ms cubic-bezier(0.16, 1, 0.3, 1)'
          }}
          className="absolute inset-0 w-full h-full bg-[#F7F6F2] pt-20 pb-12 px-4 sm:px-6 lg:px-8 flex items-center justify-center border-t border-[#E5E2DC] shadow-2xl overflow-y-auto"
        >
          <div className="max-w-5xl w-full mx-auto space-y-6">
            <div className="text-center space-y-3">
              <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-[#FFFFFF] border border-[#E5E2DC] text-[#D25234]">
                <CompassIcon className="w-5 h-5" />
              </div>
              <h2 className="font-serif text-3xl sm:text-4xl font-normal tracking-tight text-[#1F1E1B]">
                Get the technical rundown
              </h2>
            </div>

            {/* 6 Doc Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {TECHNICAL_DOCS.map((doc, idx) => (
                <div
                  key={idx}
                  className="p-4 rounded-xl bg-[#FFFFFF] border border-[#E5E2DC] space-y-2 hover:border-[#D25234]/40 transition-colors shadow-2xs cursor-pointer flex flex-col justify-between"
                  onClick={() => setShowAuthModal(true)}
                >
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-mono text-[#D25234] bg-[#D25234]/10 px-2 py-0.5 rounded">
                      {doc.tag}
                    </span>
                    <h3 className="text-xs font-bold text-[#1F1E1B]">{doc.title}</h3>
                    <p className="text-[11px] text-[#6B6862] leading-relaxed">{doc.desc}</p>
                  </div>
                  <div className="pt-2 text-[10px] text-[#9C988F] flex items-center gap-1">
                    <span>Read guide</span>
                    <ArrowRight className="w-2.5 h-2.5" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ----------------------------------------------------------- */}
        {/* SECTION 9: DARK FOOTER CTA & NEWSLETTER (CLAUDE CODE STYLE) */}
        {/* ----------------------------------------------------------- */}
        <section
          id="section-footer-cta"
          style={{
            zIndex: 100,
            transform: activeSection >= 9 ? 'translateY(0%)' : 'translateY(100%)',
            transition: 'transform 600ms cubic-bezier(0.16, 1, 0.3, 1)'
          }}
          className="absolute inset-0 w-full h-full bg-[#141413] text-[#F7F6F2] pt-20 pb-8 px-4 sm:px-6 lg:px-8 flex flex-col justify-between border-t border-[#383632] shadow-2xl overflow-y-auto"
        >
          <div className="max-w-6xl w-full mx-auto space-y-8 my-auto">
            {/* Top Split: Create what's exciting + Newsletter */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start border-b border-[#2A2825] pb-8">
              {/* Left Column */}
              <div className="lg:col-span-7 space-y-4">
                <h2 className="font-serif text-3xl sm:text-4xl font-normal text-[#FFFFFF] leading-tight">
                  Create what's exciting.<br />Maintain what's essential.
                </h2>
                <p className="text-xs text-[#9C988F]">
                  Use Sanmine Space where you work.
                </p>
                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAuthModal(true)}
                    className="bg-[#D25234] hover:bg-[#BE4528] text-[#FFFFFF] text-xs font-semibold px-4 py-2.5 rounded-lg transition-colors cursor-pointer shadow-xs"
                  >
                    Get Sanmine Space
                  </button>
                  <div className="p-2 rounded-lg bg-[#2A2825] border border-[#383632] font-mono text-[11px] text-[#D5D2CA] flex items-center gap-2">
                    <span>curl -fsSL https://sanmine.space/install.sh | bash</span>
                    <button
                      type="button"
                      onClick={handleCopyInstall}
                      className="text-[#9C988F] hover:text-[#FFFFFF]"
                    >
                      {copiedInstall ? <Check className="w-3 h-3 text-[#5FB878]" /> : <Copy className="w-3 h-3" />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Right Column: Newsletter */}
              <div className="lg:col-span-5 space-y-3 bg-[#1F1E1B] p-5 rounded-2xl border border-[#383632]">
                <div className="flex items-center gap-2 text-xs font-bold text-[#FFFFFF]">
                  <Mail className="w-4 h-4 text-[#D25234]" />
                  <span>Get the developer newsletter</span>
                </div>
                <p className="text-[11px] text-[#9C988F] leading-relaxed">
                  Product updates, how-tos, community spotlights, and more. Delivered monthly to your inbox.
                </p>
                <form onSubmit={handleNewsletterSubmit} className="flex gap-2">
                  <input
                    type="email"
                    required
                    placeholder="Enter your email"
                    value={newsletterEmail}
                    onChange={(e) => setNewsletterEmail(e.target.value)}
                    className="flex-1 bg-[#141413] border border-[#383632] rounded-lg px-3 py-1.5 text-xs text-[#FFFFFF] placeholder-[#6B6862] focus:outline-none focus:border-[#D25234]"
                  />
                  <button
                    type="submit"
                    className="bg-[#D25234] text-[#FFFFFF] px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-[#BE4528] cursor-pointer"
                  >
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </form>
                {newsletterSubscribed && (
                  <div className="text-[10px] text-[#5FB878] font-mono">
                    ✓ Subscribed! Welcome to Sanmine Space updates.
                  </div>
                )}
              </div>
            </div>

            {/* Bottom Footer Directory Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-6 text-[11px] text-[#9C988F]">
              <div className="space-y-2">
                <div className="font-bold text-[#FFFFFF] text-xs">Products</div>
                <div className="space-y-1">
                  <div>Sanmine Space</div>
                  <div>Agent Runtime</div>
                  <div>Lead Discovery</div>
                  <div>Proposal Studio</div>
                  <div>Gmail Outreach</div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="font-bold text-[#FFFFFF] text-xs">Solutions</div>
                <div className="space-y-1">
                  <div>B2B Research</div>
                  <div>Code Refactoring</div>
                  <div>Automated Triage</div>
                  <div>Enterprise AI</div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="font-bold text-[#FFFFFF] text-xs">Resources</div>
                <div className="space-y-1">
                  <div>Documentation</div>
                  <div>API Reference</div>
                  <div>Changelog</div>
                  <div>Community</div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="font-bold text-[#FFFFFF] text-xs">Company</div>
                <div className="space-y-1">
                  <div>About Sanmine Space</div>
                  <div>Research Lab</div>
                  <div>Security</div>
                  <div>Careers</div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="font-bold text-[#FFFFFF] text-xs">Legal & Privacy</div>
                <div className="space-y-1">
                  <div>Privacy Policy</div>
                  <div>Terms of Service</div>
                  <div>Google API Disclosure</div>
                  <div>Zero Hallucination</div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="font-bold text-[#FFFFFF] text-xs">Brand</div>
                <div className="flex items-center gap-2 text-xs font-serif text-[#FFFFFF]">
                  <Sparkles className="w-4 h-4 text-[#D25234]" />
                  <span>Sanmine Space</span>
                </div>
                <p className="text-[10px] text-[#6B6862]">© {new Date().getFullYear()} Sanmine Space. All rights reserved.</p>
              </div>
            </div>
          </div>
        </section>

      </main>

      {/* ------------------------------------------------------------- */}
      {/* AUTHENTICATION MODAL (GOOGLE SIGN-IN)                         */}
      {/* ------------------------------------------------------------- */}
      {showAuthModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#141413]/70 backdrop-blur-sm p-4 animate-in fade-in-50">
          <div className="w-full max-w-md bg-[#FFFFFF] border border-[#E5E2DC] rounded-3xl p-6 sm:p-8 shadow-2xl relative space-y-5 text-center">
            <button
              type="button"
              onClick={() => setShowAuthModal(false)}
              className="absolute top-4 right-4 text-[#9C988F] hover:text-[#1F1E1B] p-1 rounded-full hover:bg-[#F7F6F2] transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex flex-col items-center space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-[#141413] flex items-center justify-center text-[#D25234] shadow-xs">
                <Sparkles className="w-6 h-6" />
              </div>
              <h2 className="font-serif text-2xl font-bold text-[#1F1E1B]">
                Welcome to Sanmine Space
              </h2>
              <p className="text-xs text-[#6B6862]">
                Sign in with your Google account to access autonomous agent sessions, proposal studio, and verified web research.
              </p>
            </div>

            {authError && (
              <div className="p-3 rounded-xl bg-[#FFF5F5] border border-[#F8D7DA] text-xs text-[#991B1B] text-left flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-[#DC2626] shrink-0 mt-0.5" />
                <div className="flex-1">{authError}</div>
                <button
                  type="button"
                  onClick={clearAuthError}
                  className="text-[#991B1B] p-0.5 rounded cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={handleSignIn}
              disabled={isAuthenticating}
              className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl text-sm font-semibold border border-[#E5E2DC] bg-[#FFFFFF] hover:bg-[#FAF9F5] text-[#1F1E1B] transition-all shadow-xs cursor-pointer disabled:opacity-60"
            >
              {isAuthenticating ? (
                <span>Connecting to Google...</span>
              ) : (
                <>
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z" />
                    <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z" />
                    <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z" />
                    <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z" />
                  </svg>
                  <span>Continue with Google</span>
                </>
              )}
            </button>

            <div className="text-[11px] text-[#9C988F] flex items-center justify-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-[#3F7A5A]" />
              <span>Restricted permissions • Zero inbox reading</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* MINIMALIST LINE ICONS CORRESPONDING TO SCREENSHOT                          */
/* -------------------------------------------------------------------------- */

function SproutIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 20h10" />
      <path d="M12 20v-8" />
      <path d="M12 12a5 5 0 0 1 5-5c0 4-5 5-5 5Z" />
      <path d="M12 12a5 5 0 0 0-5-5c0 4 5 5 5 5Z" />
    </svg>
  );
}

function MegaphoneIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="m3 11 18-5v12L3 14v-3z" />
      <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
    </svg>
  );
}

function BriefcaseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect width="20" height="14" x="2" y="7" rx="2" ry="2" />
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </svg>
  );
}

function CodeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  );
}

function QuestionIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <path d="M12 17h.01" />
    </svg>
  );
}

function CompassIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15 9 22 12 15 15 12 22 9 15 2 12 9 9 12 2" />
    </svg>
  );
}

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" x2="12" y1="15" y2="3" />
    </svg>
  );
}
