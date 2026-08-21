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

export interface AIModelInfo {
  name: string;
  provider: string;
  iconType: string;
  accent: string;
}

const AI_MODELS_LIST: AIModelInfo[] = [
  {
    name: 'OpenAI',
    provider: 'GPT-4o & o3-mini',
    iconType: 'openai',
    accent: '#10A37F'
  },
  {
    name: 'Anthropic Claude',
    provider: 'Claude 3.7 Sonnet',
    iconType: 'claude',
    accent: '#D97706'
  },
  {
    name: 'Google Gemini',
    provider: 'Gemini 2.5 Flash & Pro',
    iconType: 'gemini',
    accent: '#388bfd'
  },
  {
    name: 'OpenRouter',
    provider: 'Unified API Gateway',
    iconType: 'openrouter',
    accent: '#6366F1'
  },
  {
    name: 'DeepSeek',
    provider: 'DeepSeek R1 & V3',
    iconType: 'deepseek',
    accent: '#2563EB'
  },
  {
    name: 'Meta Llama',
    provider: 'Llama 3.3 70B',
    iconType: 'meta',
    accent: '#0668E1'
  },
  {
    name: 'Mistral AI',
    provider: 'Mistral Large 2',
    iconType: 'mistral',
    accent: '#EA580C'
  },
  {
    name: 'Groq',
    provider: 'LPU Ultra-Fast Inference',
    iconType: 'groq',
    accent: '#F43F5E'
  },
  {
    name: 'xAI Grok',
    provider: 'Grok 2 & Grok 3',
    iconType: 'grok',
    accent: '#18181B'
  },
  {
    name: 'Cohere',
    provider: 'Command R+ & Embed',
    iconType: 'cohere',
    accent: '#059669'
  },
  {
    name: 'Qwen',
    provider: 'Qwen 2.5 Coder',
    iconType: 'qwen',
    accent: '#7C3AED'
  }
];

/* -------------------------------------------------------------------------- */
/* REAL AUTHENTIC AI MODEL SVG LOGOS                                          */
/* -------------------------------------------------------------------------- */

const renderModelIcon = (iconType: string) => {
  switch (iconType) {
    case 'openai':
      return (
        <svg className="w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 shrink-0 fill-current text-[#10A37F]" viewBox="0 0 24 24">
          <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.259 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7466-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1683a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4947zm-9.66-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1402-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1683a.0757.0757 0 0 1-.071 0l-4.8303-2.7866A4.504 4.504 0 0 1 2.3408 7.8956zm16.0993 3.8558L12.5973 8.3829l2.02-1.1636a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.402-.6862zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.407 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.6601zm-12.641-4.1444a4.4992 4.4992 0 0 1 3.53-1.8512 4.4755 4.4755 0 0 1 2.8764 1.0408l-.1419.0804-4.7783 2.7582a.7948.7948 0 0 0-.3927.6813v6.7369L6.874 13.914a.071.071 0 0 1-.038-.052V8.2794a4.4992 4.4992 0 0 1 1.9728-3.6967zm1.1118 7.4339l2.7913-1.6133 2.7913 1.6133v3.2267l-2.7913 1.6133-2.7913-1.6133z" />
        </svg>
      );
    case 'claude':
      return (
        <svg className="w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 shrink-0 fill-current text-[#D97706]" viewBox="0 0 24 24">
          <path d="M12 2C12.5 6.8 17.2 11.5 22 12C17.2 12.5 12.5 17.2 12 22C11.5 17.2 6.8 12.5 2 12C6.8 11.5 11.5 6.8 12 2Z" fill="#D97706" />
          <path d="M16.5 7.5C14.8 9.2 14.8 11.8 16.5 13.5C14.8 11.8 12.2 11.8 10.5 13.5C12.2 11.8 12.2 9.2 10.5 7.5C12.2 9.2 14.8 9.2 16.5 7.5Z" fill="#FAF9F5" opacity="0.3" />
        </svg>
      );
    case 'gemini':
      return (
        <svg className="w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 shrink-0" viewBox="0 0 24 24">
          <defs>
            <linearGradient id="gemini-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#1B72E8" />
              <stop offset="45%" stopColor="#8E24AA" />
              <stop offset="100%" stopColor="#E91E63" />
            </linearGradient>
          </defs>
          <path
            fill="url(#gemini-grad)"
            d="M12 0C12 6.627 6.627 12 0 12C6.627 12 12 17.373 12 24C12 17.373 17.373 12 24 12C17.373 12 12 6.627 12 0Z"
          />
        </svg>
      );
    case 'openrouter':
      return (
        <svg className="w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 shrink-0 text-[#6366F1]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="6" cy="6" r="3.5" fill="#6366F1" fillOpacity="0.25" />
          <circle cx="18" cy="6" r="3.5" fill="#6366F1" fillOpacity="0.25" />
          <circle cx="12" cy="18" r="3.5" fill="#6366F1" fillOpacity="0.25" />
          <path d="M8.8 8.2L10.5 15M15.2 8.2L13.5 15M9.5 6h5" />
        </svg>
      );
    case 'deepseek':
      return (
        <svg className="w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 shrink-0 fill-current text-[#2563EB]" viewBox="0 0 24 24">
          <path d="M2.5 13.5C2.5 7.5 7.8 3 13.5 3C18.2 3 21.8 5.8 22.5 9.8C22.7 11.2 21.5 12.5 20.2 12.8C18.5 13.2 16.5 12.2 15.2 11C14 9.8 12.2 9.5 10.8 10.5C9 11.8 6.5 13.5 2.5 13.5Z" />
          <circle cx="15" cy="7.5" r="1.5" className="fill-[#FFFFFF]" />
          <path d="M4 16C7 19.5 11.5 21 16 19.8C18.8 19 21.2 17 22 14.5" stroke="#2563EB" strokeWidth="2.2" fill="none" strokeLinecap="round" />
        </svg>
      );
    case 'meta':
      return (
        <svg className="w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 shrink-0 fill-current text-[#0668E1]" viewBox="0 0 24 24">
          <path d="M12 15.6c-2.3 0-4-1.7-4.8-3.6.8-1.9 2.5-3.6 4.8-3.6 2.3 0 4 1.7 4.8 3.6-.8 1.9-2.5 3.6-4.8 3.6zm0-9.2C7.9 6.4 4.5 9 2.8 12c1.7 3 5.1 5.6 9.2 5.6s7.5-2.6 9.2-5.6c-1.7-3-5.1-5.6-9.2-5.6z" />
          <path d="M6.5 12C7.2 10.3 8.8 9 12 9s4.8 1.3 5.5 3c-.7 1.7-2.3 3-5.5 3s-4.8-1.3-5.5-3z" fill="#0668E1" opacity="0.3" />
        </svg>
      );
    case 'mistral':
      return (
        <svg className="w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 shrink-0 fill-current text-[#EA580C]" viewBox="0 0 24 24">
          <rect x="2" y="3" width="4.5" height="4.5" rx="0.8" />
          <rect x="9.75" y="3" width="4.5" height="4.5" rx="0.8" />
          <rect x="17.5" y="3" width="4.5" height="4.5" rx="0.8" />
          <rect x="2" y="9.75" width="4.5" height="4.5" rx="0.8" />
          <rect x="9.75" y="9.75" width="4.5" height="4.5" rx="0.8" />
          <rect x="17.5" y="9.75" width="4.5" height="4.5" rx="0.8" />
          <rect x="2" y="16.5" width="4.5" height="4.5" rx="0.8" />
          <rect x="17.5" y="16.5" width="4.5" height="4.5" rx="0.8" />
        </svg>
      );
    case 'groq':
      return (
        <svg className="w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 shrink-0 fill-current text-[#F43F5E]" viewBox="0 0 24 24">
          <path d="M13.5 2L3 13.5H12L10.5 22L21 10.5H12L13.5 2Z" />
        </svg>
      );
    case 'grok':
      return (
        <svg className="w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 shrink-0 text-[#18181B]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 4L20 20M20 4L4 20" />
          <circle cx="12" cy="12" r="3.2" fill="currentColor" />
        </svg>
      );
    case 'cohere':
      return (
        <svg className="w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 shrink-0 fill-current text-[#059669]" viewBox="0 0 24 24">
          <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM12 18C8.69 18 6 15.31 6 12C6 8.69 8.69 6 12 6C15.31 6 18 8.69 18 12C18 15.31 15.31 18 12 18Z" opacity="0.25" />
          <path d="M12 5C8.13 5 5 8.13 5 12C5 15.87 8.13 19 12 19C15.87 19 19 15.87 19 12C19 8.13 15.87 5 12 5ZM12 15C10.34 15 9 13.66 9 12C9 10.34 10.34 9 12 9C13.66 9 15 10.34 15 12C15 13.66 13.66 15 12 15Z" />
        </svg>
      );
    case 'qwen':
      return (
        <svg className="w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 shrink-0 text-[#7C3AED]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2L21 7.2V16.8L12 22L3 16.8V7.2L12 2Z" fill="#7C3AED" fillOpacity="0.15" />
          <path d="M12 12L21 7.2M12 12V22M12 12L3 7.2" />
        </svg>
      );
    default:
      return <Cpu className="w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 text-[#1F1E1B]" />;
  }
};

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
      {/* Right Edge Floating Pill Navigator (Hidden from UI)           */}
      {/* ------------------------------------------------------------- */}
      {/* Hidden per user UI request */}

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

            {/* AI Models Multi-Provider Horizontal Marquee (Height: 500px) - "Trusted By & Connectivity" Sub-section */}
            <div
              id="ai-models-marquee-section"
              className="w-full h-[500px] min-h-[480px] max-h-[500px] flex flex-col justify-center items-center bg-transparent border-0 shadow-none overflow-hidden relative my-4 select-none"
            >
              {/* Sub-section Header */}
              <div className="text-center mb-14 sm:mb-16">
                <span className="text-sm sm:text-base md:text-lg uppercase tracking-[0.3em] font-bold text-[#8C887B]">
                  Trusted By & Connectivity
                </span>
              </div>

              {/* Left & Right Gradient masks for smooth continuous fade */}
              <div className="absolute left-0 top-0 bottom-0 w-24 sm:w-44 bg-gradient-to-r from-[#F7F6F2] to-transparent z-20 pointer-events-none" />
              <div className="absolute right-0 top-0 bottom-0 w-24 sm:w-44 bg-gradient-to-l from-[#F7F6F2] to-transparent z-20 pointer-events-none" />

              {/* Single Large Row Horizontal Marquee Showcase (Real Official Logo & Name, No Cards/Borders/Subtitles) */}
              <div className="overflow-hidden w-full py-4">
                <div className="animate-marquee gap-16 sm:gap-24 md:gap-32 items-center">
                  {[...AI_MODELS_LIST, ...AI_MODELS_LIST].map((model, idx) => (
                    <div
                      key={`${model.name}-marquee-${idx}`}
                      className="flex items-center gap-5 sm:gap-7 bg-transparent border-0 shadow-none p-0 cursor-pointer group shrink-0 transition-transform duration-200 hover:scale-105"
                    >
                      <div className="flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform duration-200">
                        {renderModelIcon(model.iconType)}
                      </div>
                      <span className="text-2xl sm:text-3xl md:text-4xl font-semibold text-[#1F1E1B] tracking-tight group-hover:text-[#D25234] transition-colors whitespace-nowrap font-serif sm:font-sans">
                        {model.name}
                      </span>
                    </div>
                  ))}
                </div>
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
