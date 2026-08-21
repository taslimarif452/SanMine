import { searchRegistry } from './search/registry.js';
import { conductWebResearch, fetchWebPage, performGoogleWebSearch, executeGenericWebResearch } from './research/index.js';
import { browserTools } from './browser/index.js';
import { sendGmailMessage } from './gmail/oauth.js';
import { sendGmailSmtpMessage } from './gmail/smtp.js';
import { checkEmailAlreadySent, logOutreachAttempt } from './db/outreach.js';

export interface ToolExecutionContext {
  userId?: string;
  userApiKey?: string;
}

export interface ToolParameterSchema {
  type: string;
  description?: string;
  properties?: Record<
    string,
    {
      type: string;
      description: string;
      enum?: string[];
      items?: { type: string };
    }
  >;
  required?: string[];
}

export interface AgentTool {
  name: string;
  description: string;
  parameters: ToolParameterSchema;
  execute: (input: any, emitEvent?: (event: any) => void, context?: ToolExecutionContext) => Promise<any>;
}

// Registry of verified backend tools
const toolRegistry: Map<string, AgentTool> = new Map();

/**
 * 1. Business Search Tool
 * Calls active Business Search Provider. Returns real error if not configured.
 */
const searchBusinessesTool: AgentTool = {
  name: 'search_businesses',
  description:
    'Searches for local businesses, companies, or establishments matching a specific query and location using the active Business Search Provider configured in Settings.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search keyword or business type (e.g. "gyms", "dentists", "lawyers", "restaurants").',
      },
      location: {
        type: 'string',
        description: 'City, region, or geographic area (e.g. "Ranchi", "Bangalore", "New York").',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results to return (default 20, max 50).',
      },
    },
    required: ['query'],
  },
  execute: async (input, emitEvent) => {
    // Sanitize and bound parameters
    const rawQuery = typeof input?.query === 'string' ? input.query.trim() : 'businesses';
    const query = rawQuery.slice(0, 100) || 'businesses';
    const rawLocation = typeof input?.location === 'string' ? input.location.trim() : '';
    const location = rawLocation.slice(0, 100);
    const limit = typeof input?.limit === 'number' ? Math.min(Math.max(input.limit, 1), 50) : 20;

    const activeProvider = searchRegistry.getActiveProvider();

    emitEvent?.({
      type: 'tool.started',
      tool: 'search_businesses',
      message: `Searching for ${query}${location ? ` in ${location}` : ''}...`,
      detail: `Provider: ${activeProvider.name}`,
    });

    if (!searchRegistry.isConfigured()) {
      const errorMsg = 'BUSINESS_SEARCH_NOT_CONFIGURED';
      const detailMsg = 'Business search is temporarily unavailable. Please try again later.';

      emitEvent?.({
        type: 'tool.failed',
        tool: 'search_businesses',
        message: 'Business search is temporarily unavailable. Please try again later.',
        detail: detailMsg,
      });

      return {
        status: 'error',
        configured: false,
        error: errorMsg,
        message: detailMsg,
        businesses: [],
        totalFound: 0,
      };
    }

    try {
      const result = await searchRegistry.search({ query, location, limit });

      if (!result.success) {
        emitEvent?.({
          type: 'tool.failed',
          tool: 'search_businesses',
          message: result.message || 'Business search is temporarily unavailable. Please try again later.',
          detail: result.error,
        });
        return result;
      }

      emitEvent?.({
        type: 'tool.completed',
        tool: 'search_businesses',
        message: `Found ${result.businesses.length} businesses`,
        detail: `Provider: ${result.providerName}`,
      });

      return result;
    } catch (err: any) {
      emitEvent?.({
        type: 'tool.failed',
        tool: 'search_businesses',
        message: 'Business search is temporarily unavailable. Please try again later.',
      });
      return {
        status: 'error',
        error: 'BUSINESS_SEARCH_ERROR',
        message: 'Business search is temporarily unavailable. Please try again later.',
        businesses: [],
        totalFound: 0,
      };
    }
  },
};

/**
 * 2. Website Analysis Tool (Real live HTTP inspection)
 */
const analyzeWebsiteTool: AgentTool = {
  name: 'analyze_website',
  description:
    'Performs real website analysis and diagnostic check on a live URL. Inspects response time, HTTP status, SSL security, mobile viewport meta, title, description, and page structure.',
  parameters: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'The full URL of the website to audit (e.g. "https://example.com").',
      },
    },
    required: ['url'],
  },
  execute: async (input, emitEvent) => {
    let targetUrl = (input?.url || '').trim();
    if (!targetUrl) {
      return {
        success: false,
        error: 'No URL provided for website analysis.',
      };
    }

    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
      targetUrl = `https://${targetUrl}`;
    }

    emitEvent?.({
      type: 'tool.started',
      tool: 'analyze_website',
      message: `Analyzing website: ${targetUrl}`,
    });

    const startTime = Date.now();
    const isHttps = targetUrl.startsWith('https://');

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(targetUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 SANMine-AuditBot/1.0',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        signal: controller.signal,
        redirect: 'follow',
      });

      clearTimeout(timeoutId);
      const responseTimeMs = Date.now() - startTime;
      const htmlText = await response.text();

      // Basic HTML parsing & diagnostics
      const titleMatch = htmlText.match(/<title[^>]*>([^<]*)<\/title>/i);
      const title = titleMatch ? titleMatch[1].trim() : '';

      const metaDescMatch = htmlText.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i);
      const metaDescription = metaDescMatch ? metaDescMatch[1].trim() : '';

      const hasViewport = /<meta[^>]*name=["']viewport["']/i.test(htmlText);
      const hasOpenGraph = /<meta[^>]*property=["']og:/i.test(htmlText);
      const h1Count = (htmlText.match(/<h1[^>]*>/gi) || []).length;
      const imgTags = htmlText.match(/<img[^>]*>/gi) || [];
      const imgMissingAlt = imgTags.filter((tag) => !/alt=["'][^"']+["']/i.test(tag)).length;
      const pageSizeKb = Math.round(Buffer.byteLength(htmlText, 'utf-8') / 1024);

      // Extract headings
      const h1Matches = Array.from(htmlText.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)).map((m) => m[1].replace(/<[^>]+>/g, '').trim()).filter(Boolean);
      const h2Matches = Array.from(htmlText.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)).map((m) => m[1].replace(/<[^>]+>/g, '').trim()).filter(Boolean);
      const h3Matches = Array.from(htmlText.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>/gi)).map((m) => m[1].replace(/<[^>]+>/g, '').trim()).filter(Boolean);
      const headings = {
        h1: h1Matches.slice(0, 5),
        h2: h2Matches.slice(0, 10),
        h3: h3Matches.slice(0, 10),
      };

      // Extract candidate services from h2 and h3 headings
      const servicesFound: string[] = [];
      for (const h of [...h2Matches, ...h3Matches]) {
        const cleanH = h.replace(/\s+/g, ' ').trim();
        if (
          cleanH.length >= 4 &&
          cleanH.length <= 60 &&
          !cleanH.toLowerCase().includes('about') &&
          !cleanH.toLowerCase().includes('contact') &&
          !cleanH.toLowerCase().includes('cookie') &&
          !cleanH.toLowerCase().includes('privacy') &&
          !cleanH.toLowerCase().includes('navigation') &&
          !cleanH.toLowerCase().includes('footer') &&
          !cleanH.toLowerCase().includes('menu') &&
          !cleanH.toLowerCase().includes('subscribe') &&
          !servicesFound.includes(cleanH)
        ) {
          servicesFound.push(cleanH);
        }
      }

      // Extract phone numbers (tel: links & standard regex)
      const phoneSet = new Set<string>();
      const telMatches = htmlText.matchAll(/href=["']tel:([^"']+)["']/gi);
      for (const t of telMatches) {
        if (t[1]) {
          const cleanPhone = t[1].replace(/[^\d+()\-\s]/g, '').trim();
          if (cleanPhone.length >= 7) phoneSet.add(cleanPhone);
        }
      }
      const rawPhones = htmlText.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g) || [];
      for (const p of rawPhones) {
        if (p.length >= 10 && !p.startsWith('199') && !p.startsWith('200')) {
          phoneSet.add(p.trim());
        }
      }
      const phoneNumbers = Array.from(phoneSet).slice(0, 3);

      // Extract social links
      const socialLinks: { platform: string; url: string }[] = [];
      const socialPlatforms = [
        { platform: 'Facebook', regex: /https?:\/\/(www\.)?facebook\.com\/[a-zA-Z0-9._-]+/i },
        { platform: 'Instagram', regex: /https?:\/\/(www\.)?instagram\.com\/[a-zA-Z0-9._-]+/i },
        { platform: 'LinkedIn', regex: /https?:\/\/(www\.)?linkedin\.com\/(company|in)\/[a-zA-Z0-9._-]+/i },
        { platform: 'Twitter', regex: /https?:\/\/(www\.)?(twitter|x)\.com\/[a-zA-Z0-9._-]+/i },
        { platform: 'YouTube', regex: /https?:\/\/(www\.)?youtube\.com\/[a-zA-Z0-9._-]+/i },
      ];
      for (const sp of socialPlatforms) {
        const match = htmlText.match(sp.regex);
        if (match) {
          socialLinks.push({ platform: sp.platform, url: match[0] });
        }
      }

      // Extract contact emails from page HTML (mailto: links & text email patterns)
      const extractedEmails = new Set<string>();
      const mailtoMatches = Array.from(htmlText.matchAll(/href=["']mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})["']/gi));
      for (const m of mailtoMatches) {
        if (m[1]) extractedEmails.add(m[1].toLowerCase().trim());
      }
      const rawEmailMatches = htmlText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
      for (const e of rawEmailMatches) {
        const clean = e.toLowerCase().trim();
        if (
          !clean.endsWith('.png') &&
          !clean.endsWith('.jpg') &&
          !clean.endsWith('.jpeg') &&
          !clean.endsWith('.webp') &&
          !clean.endsWith('.svg') &&
          !clean.includes('sentry') &&
          !clean.includes('wixpress') &&
          !clean.includes('example.com') &&
          !clean.includes('schema.org') &&
          !clean.includes('domain.com') &&
          !clean.includes('test.com')
        ) {
          extractedEmails.add(clean);
        }
      }
      const contactEmails = Array.from(extractedEmails).slice(0, 5);
      const primaryEmail = contactEmails[0] || undefined;

      // Extract calls to action & booking mechanisms
      const callsToAction: string[] = [];
      const bookingMechanisms: string[] = [];
      if (/book\s*(now|online|appointment)?/i.test(htmlText)) callsToAction.push('Book Online / Appointment');
      if (/free\s*(quote|consultation|estimate)/i.test(htmlText)) callsToAction.push('Free Quote / Consultation');
      if (/contact\s*us|get\s*in\s*touch/i.test(htmlText)) callsToAction.push('Contact Us Form');
      if (/schedule\s*(a\s*)?(call|visit|demo)/i.test(htmlText)) callsToAction.push('Schedule a Call/Visit');

      if (/<form[^>]*>/i.test(htmlText)) bookingMechanisms.push('Online Inquiry Form');
      if (telMatches) bookingMechanisms.push('Direct Telephone Call');
      if (mailtoMatches.length > 0) bookingMechanisms.push('Direct Email Link');

      // Extract trust signals
      const trustSignals: string[] = [];
      if (/certified|licensed|accredited|insured/i.test(htmlText)) trustSignals.push('Licensed & Certified Professionals');
      if (/\b\d{1,2}\+?\s*years(?:\s+of)?\s+experience/i.test(htmlText)) trustSignals.push('Established Industry Experience');
      if (/guarantee|100%\s*satisfaction/i.test(htmlText)) trustSignals.push('Satisfaction Guarantee');

      // Collect specific deficiencies
      const issues: string[] = [];
      if (!isHttps) issues.push('Website lacks HTTPS SSL security encryption.');
      if (!hasViewport) issues.push('Missing mobile viewport meta tag (poor mobile device responsiveness).');
      if (!metaDescription) issues.push('Missing search engine meta description tag (hurts Google SEO CTR).');
      if (h1Count === 0) issues.push('Missing H1 heading tag on homepage (weak on-page SEO structure).');
      if (responseTimeMs > 2000) issues.push(`Slow initial server response time (${responseTimeMs}ms > 2000ms threshold).`);
      if (imgMissingAlt > 0) issues.push(`${imgMissingAlt} images missing accessibility and image-search alt tags.`);

      const auditResult = {
        success: true,
        url: targetUrl,
        httpStatus: response.status,
        responseTimeMs,
        isHttps,
        pageTitle: title || '(No title tag found)',
        metaDescription: metaDescription || '(Missing)',
        hasMobileViewport: hasViewport,
        hasOpenGraph,
        h1Count,
        headings,
        servicesFound: servicesFound.slice(0, 6),
        phoneNumbers,
        socialLinks,
        callsToAction,
        bookingMechanisms,
        trustSignals,
        pageSizeKb,
        contactEmails,
        primaryEmail,
        issuesFoundCount: issues.length,
        identifiedIssues: issues,
        healthRating: issues.length === 0 ? 'Excellent' : issues.length <= 2 ? 'Fair' : 'Poor',
      };

      emitEvent?.({
        type: 'tool.completed',
        tool: 'analyze_website',
        message: `Audit complete: ${issues.length} issues identified (${responseTimeMs}ms response)`,
      });

      return auditResult;
    } catch (err: any) {
      const isTimeout = err.name === 'AbortError';
      const errorMsg = isTimeout
        ? 'Website connection timed out after 10s (slow or unreachable server).'
        : `Could not connect to website: ${err.message}`;

      emitEvent?.({
        type: 'tool.failed',
        tool: 'analyze_website',
        message: errorMsg,
      });

      return {
        success: false,
        url: targetUrl,
        error: errorMsg,
        isReachable: false,
        identifiedIssues: ['Website is unreachable or timing out on requests.'],
      };
    }
  },
};

/**
 * 3. Lead Scoring Tool (Deterministic calculation)
 */
const calculateLeadScoreTool: AgentTool = {
  name: 'calculate_lead_score',
  description:
    'Deterministically calculates a sales lead conversion score (0-100) and sales tier based on actual website audit findings and digital presence deficiencies.',
  parameters: {
    type: 'object',
    properties: {
      businessName: {
        type: 'string',
        description: 'Name of the business.',
      },
      hasWebsite: {
        type: 'boolean',
        description: 'Whether the business possesses an active website.',
      },
      websiteUrl: {
        type: 'string',
        description: 'URL of the business website (if available).',
      },
      issuesFound: {
        type: 'string',
        description: 'Comma-separated list or JSON string of verified issues from website audit.',
      },
      rating: {
        type: 'number',
        description: 'Customer rating (1.0 to 5.0) if known.',
      },
      reviewsCount: {
        type: 'number',
        description: 'Number of customer reviews if known.',
      },
    },
    required: ['businessName', 'hasWebsite'],
  },
  execute: async (input, emitEvent) => {
    const businessName = input?.businessName || 'Business Lead';
    const hasWebsite = Boolean(input?.hasWebsite);
    const rating = typeof input?.rating === 'number' ? input.rating : undefined;
    const reviewsCount = typeof input?.reviewsCount === 'number' ? input.reviewsCount : undefined;

    emitEvent?.({
      type: 'tool.started',
      tool: 'calculate_lead_score',
      message: `Calculating lead score for ${businessName}...`,
    });

    let score = 100;
    const penaltyBreakdown: Array<{ factor: string; pointsDeducted: number }> = [];

    if (!hasWebsite) {
      // Missing website is prime opportunity for web design agency
      score = 25;
      penaltyBreakdown.push({
        factor: 'No active website found (High demand for web presence creation)',
        pointsDeducted: 75,
      });
    } else {
      let issues: string[] = [];
      if (typeof input?.issuesFound === 'string') {
        try {
          const parsed = JSON.parse(input.issuesFound);
          if (Array.isArray(parsed)) issues = parsed;
          else issues = input.issuesFound.split(',').map((s: string) => s.trim());
        } catch {
          issues = input.issuesFound.split(',').map((s: string) => s.trim());
        }
      }

      for (const issue of issues) {
        const lower = issue.toLowerCase();
        if (lower.includes('viewport') || lower.includes('mobile')) {
          score -= 25;
          penaltyBreakdown.push({ factor: 'Non-mobile friendly / Missing viewport meta', pointsDeducted: 25 });
        } else if (lower.includes('https') || lower.includes('ssl')) {
          score -= 20;
          penaltyBreakdown.push({ factor: 'Unsecured HTTP connection', pointsDeducted: 20 });
        } else if (lower.includes('slow') || lower.includes('response time')) {
          score -= 15;
          penaltyBreakdown.push({ factor: 'Slow server response (>2s)', pointsDeducted: 15 });
        } else if (lower.includes('meta description') || lower.includes('seo')) {
          score -= 15;
          penaltyBreakdown.push({ factor: 'Missing search engine meta tags', pointsDeducted: 15 });
        } else if (lower.includes('h1') || lower.includes('heading')) {
          score -= 10;
          penaltyBreakdown.push({ factor: 'Improper SEO heading hierarchy', pointsDeducted: 10 });
        }
      }

      if (reviewsCount !== undefined && reviewsCount < 10) {
        score -= 10;
        penaltyBreakdown.push({ factor: 'Low online review volume (<10 reviews)', pointsDeducted: 10 });
      }

      if (rating !== undefined && rating < 4.0) {
        score -= 10;
        penaltyBreakdown.push({ factor: 'Sub-4.0 customer rating', pointsDeducted: 10 });
      }
    }

    score = Math.max(10, Math.min(100, score));

    // Determine priority
    let tier = 'Standard Lead';
    let urgency = 'Medium';
    if (score <= 45) {
      tier = '🔥 Hot Lead (High Redesign & SEO Need)';
      urgency = 'Immediate Outreach Recommended';
    } else if (score <= 75) {
      tier = '⚡ Warm Lead (Specific Optimization Opportunity)';
      urgency = 'Targeted Pitch';
    } else {
      tier = '✓ Optimized (Low Redesign Priority)';
      urgency = 'Maintenance Only';
    }

    const result = {
      businessName,
      leadHealthScore: score,
      salesTier: tier,
      outreachUrgency: urgency,
      penaltyBreakdown,
      recommendedOffer:
        score <= 45
          ? 'Complete Responsive Redesign + Core Web Vitals + Local SEO Setup'
          : score <= 75
          ? 'SEO & Mobile Performance Optimization Package'
          : 'Brand Reputation & Review Growth System',
    };

    emitEvent?.({
      type: 'tool.completed',
      tool: 'calculate_lead_score',
      message: `Scored ${businessName}: ${score}/100 (${tier})`,
    });

    return result;
  },
};

/**
 * 4. Proposal Generation Tool
 */
const generateProposalTool: AgentTool = {
  name: 'generate_proposal',
  description:
    'Generates a structured, professional business pitch proposal addressing specific verified technical deficiencies and audit findings.',
  parameters: {
    type: 'object',
    properties: {
      businessName: {
        type: 'string',
        description: 'Name of the business.',
      },
      websiteUrl: {
        type: 'string',
        description: 'Website URL (if applicable).',
      },
      identifiedWeaknesses: {
        type: 'string',
        description: 'Summary or list of identified issues to solve.',
      },
      targetService: {
        type: 'string',
        description: 'Main service offer (e.g. "Mobile Responsive Redesign", "Local SEO & Speed Optimization").',
      },
    },
    required: ['businessName'],
  },
  execute: async (input, emitEvent) => {
    const businessName = input?.businessName || 'Prospective Client';
    const websiteUrlRaw = (input?.websiteUrl || '').trim();
    const weaknessRaw = (input?.identifiedWeaknesses || input?.weakness || '').trim();
    const businessType = input?.businessType || 'Business';
    const location = input?.location || 'India';
    const targetService = input?.targetService || 'Website Modernization & Search Visibility Overhaul';

    // Distinguish a business that has a live site from one that does not.
    const noSiteIndicators = [
      !websiteUrlRaw,
      /pending setup|none|no website|n\/a|no online/i.test(websiteUrlRaw),
      /no website|no online|no website presence|has no website|without a website/i.test(weaknessRaw),
    ];
    const hasLiveSite = !noSiteIndicators.some(Boolean);

    emitEvent?.({
      type: 'tool.started',
      tool: 'generate_proposal',
      message: `Generating proposal for ${businessName}...`,
    });

    const proposalMarkdown = hasLiveSite
      ? `### Strategic Website & Growth Proposal for ${businessName}

**Prepared for:** ${businessName}  
**Current Website:** ${websiteUrlRaw}  
**Primary Focus:** ${targetService}

---

#### 1. Executive Summary
During a technical audit of ${businessName}'s current website, we identified high-impact opportunities to dramatically improve conversion rates, mobile user experience, and search engine discoverability.

#### 2. Key Diagnostic Findings
- **Existing Site Deficiencies:** ${weaknessRaw || 'Mobile responsiveness, page load latency, and local SEO structure'}
- **Impact on Customer Acquisition:** Modern search algorithms prioritize fast, mobile-first websites. Addressing these points directly increases incoming phone calls and booking conversions.

#### 3. Recommended Scope of Work
1. **Responsive Mobile-First Refactor:** Rebuild the existing layout to scale flawlessly across smartphones, tablets, and desktops.
2. **Speed & Core Web Vitals Optimization:** Sub-1 second initial content render time for zero drop-off.
3. **Local SEO & Schema Markup:** Direct Google Maps & local ranking enhancements to outrank competitors.
4. **Conversion Call-to-Actions:** Prominent click-to-call, WhatsApp, and booking buttons.

#### 4. Implementation Timeline
- **Discovery & Wireframing:** Days 1–3
- **Development & Performance Tuning:** Days 4–7
- **QA, SEO Audit & Launch:** Days 8–10

---
*Ready to review? We can deploy a staging preview tailored specifically for ${businessName}.*`
      : `### Website & Growth Proposal for ${businessName}

**Prepared for:** ${businessName}  
**Current Website:** None found  
**Primary Focus:** Establishing a modern online presence

---

#### 1. Executive Summary
${businessName} currently has no active website, which means potential customers in ${location} searching online cannot find you, compare you, or contact you. This proposal outlines how we will build a modern, mobile-first website from the ground up so you capture local search demand.

#### 2. Why This Matters Now
- **Missing Online Presence:** ${businessName} has no discoverable website, so it is invisible on Google, Google Maps, and local directories.
- **Missed Customer Demand:** Nearby customers actively searching for this service have no way to reach you digitally.
- **Competitive Gap:** Competitors with even a basic site outrank businesses with no site at all.

#### 3. Recommended Scope of Work
1. **Brand New Responsive Website:** A clean, fast, mobile-first site built from scratch, tailored to ${businessType || businessName}.
2. **Google Business Profile & Local SEO:** Set up local listing, schema markup, and directory citations so you appear on Google Maps.
3. **Lead-Gen Landing Design:** Prominent click-to-call, WhatsApp, and booking buttons that turn visitors into customers.
4. **Launch & Training:** Staging preview, QA, and a simple content handover so you can keep it updated.

#### 4. Implementation Timeline
- **Discovery & Wireframing:** Days 1–3
- **Design & Development:** Days 4–9
- **Launch & Local SEO Setup:** Days 10–12

---
*Ready to give ${businessName} a website that brings in customers? We can start with a staging preview right away.*`;

    emitEvent?.({
      type: 'tool.completed',
      tool: 'generate_proposal',
      message: `Proposal created for ${businessName}`,
    });

    return {
      success: true,
      businessName,
      targetService,
      hasLiveSite,
      proposalMarkdown,
    };
  },
};

/**
 * 5. System Status Tool
 */
const systemStatusTool: AgentTool = {
  name: 'get_system_status',
  description: 'Returns real runtime information and tool availability for SanMine Space.',
  parameters: {
    type: 'object',
    properties: {
      checkType: {
        type: 'string',
        description: 'Specific system check component: "overview", "tools", or "connectivity".',
        enum: ['overview', 'tools', 'connectivity'],
      },
    },
    required: ['checkType'],
  },
  execute: async (input, emitEvent) => {
    emitEvent?.({
      type: 'tool.started',
      tool: 'get_system_status',
      message: 'Checking SanMine Space runtime status...',
    });

    const checkType = input?.checkType || 'overview';
    const activeSearch = searchRegistry.getActiveProvider();

    const status = {
      runtime: 'SanMine Space Autonomous AI Orchestrator',
      status: 'operational',
      availableBackendTools: Array.from(toolRegistry.keys()),
      searchProvider: {
        active: activeSearch.name,
        id: activeSearch.id,
        isConfigured: activeSearch.isConfigured(),
      },
      checkType,
      timestamp: new Date().toISOString(),
    };

    emitEvent?.({
      type: 'tool.completed',
      tool: 'get_system_status',
      message: `System operational. Search provider: ${activeSearch.name} (${activeSearch.isConfigured() ? 'Connected' : 'Unconfigured'})`,
    });

    return status;
  },
};

/**
 * 6. DateTime Tool
 */
const dateTimeTool: AgentTool = {
  name: 'get_current_datetime',
  description: 'Returns the current ISO and human-readable server timestamp and timezone.',
  parameters: {
    type: 'object',
    properties: {
      timezone: {
        type: 'string',
        description: 'Optional IANA timezone name (e.g. "Asia/Kolkata", "America/New_York", "UTC").',
      },
    },
  },
  execute: async (input, emitEvent) => {
    emitEvent?.({
      type: 'tool.started',
      tool: 'get_current_datetime',
      message: 'Fetching current datetime...',
    });

    const tz = input?.timezone || 'UTC';
    let formatted: string;
    try {
      formatted = new Intl.DateTimeFormat('en-US', {
        dateStyle: 'full',
        timeStyle: 'long',
        timeZone: tz,
      }).format(new Date());
    } catch {
      formatted = new Date().toUTCString();
    }

    emitEvent?.({
      type: 'tool.completed',
      tool: 'get_current_datetime',
      message: `Datetime resolved: ${formatted}`,
    });

    return {
      timezone: tz,
      formatted,
      iso: new Date().toISOString(),
    };
  },
};

/**
 * Google Search Discovery Tool
 */
const googleSearchTool: AgentTool = {
  name: 'google_search',
  description:
    'Searches Google / Web search index for verified live web pages, company official domains, social media profiles, and directory listings.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The search query or keyword (e.g. "Srinagar bakeries", "Zapier founder email", "site:instagram.com fashion store Srinagar").',
      },
      location: {
        type: 'string',
        description: 'Optional location filter.',
      },
      limit: {
        type: 'number',
        description: 'Number of results to return (default 10, max 20).',
      },
    },
    required: ['query'],
  },
  execute: async (input, emitEvent) => {
    const query = input?.query || '';
    const location = input?.location || '';
    const limit = input?.limit || 10;

    emitEvent?.({
      type: 'tool.started',
      tool: 'google_search',
      message: `Searching Google for "${query}"${location ? ` in ${location}` : ''}...`,
    });

    const result = await performGoogleWebSearch(query, {
      limit,
      locationFilter: location,
    });

    emitEvent?.({
      type: 'tool.completed',
      tool: 'google_search',
      message: `Found ${result.items.length} relevant results via ${result.engineUsed}`,
    });

    return result;
  },
};

/**
 * Autonomous Deep Web Research Tool
 */
const deepWebResearchTool: AgentTool = {
  name: 'deep_web_research',
  description:
    'Autonomous web research engine that navigates websites, clicks/follows internal links (About, Team, Contact, Pricing, Services), inspects pages in the Live Browser, and extracts verified structured facts (Founders, Emails, Phones, Pricing, Services).',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The research query or entity name (e.g. "Acme Corp", "Srinagar bakeries", "find founder and email for example.com").',
      },
      targetUrl: {
        type: 'string',
        description: 'Optional direct target website URL to inspect.',
      },
      location: {
        type: 'string',
        description: 'Optional geographic location.',
      },
      specificFields: {
        type: 'string',
        description: 'Comma-separated fields to extract (e.g. "founder, email, pricing, services").',
      },
      limit: {
        type: 'number',
        description: 'Max entities to discover and inspect (default 5).',
      },
      sessionId: {
        type: 'string',
        description: 'Optional browser session ID.',
      },
    },
    required: ['query'],
  },
  execute: async (input, emitEvent, context) => {
    const query = input?.query || '';
    const targetUrl = input?.targetUrl;
    const location = input?.location;
    const limit = input?.limit || 5;
    const sessionId = input?.sessionId;
    const specificFields = typeof input?.specificFields === 'string'
      ? input.specificFields.split(',').map((s: string) => s.trim().toLowerCase())
      : [];

    return await executeGenericWebResearch({
      query,
      targetUrl,
      location,
      specificFields,
      limit,
      userId: context?.userId || 'anonymous',
      sessionId,
      emitEvent,
    });
  },
};

/**
 * Social Media Research Tool (Instagram, LinkedIn, Twitter/X, Facebook)
 */
const researchSocialTool: AgentTool = {
  name: 'research_social',
  description:
    'Performs targeted public social media research (Instagram, LinkedIn, Twitter, Facebook) using Google discovery and Live Browser inspection to extract profile bios, public emails, and contact handles.',
  parameters: {
    type: 'object',
    properties: {
      platform: {
        type: 'string',
        description: 'Target platform (e.g. "instagram", "linkedin", "twitter", "facebook").',
        enum: ['instagram', 'linkedin', 'twitter', 'facebook'],
      },
      query: {
        type: 'string',
        description: 'Search query (e.g. "fashion stores in Srinagar", "AI founders Bangalore").',
      },
      location: {
        type: 'string',
        description: 'Target location.',
      },
      limit: {
        type: 'number',
        description: 'Number of profiles to inspect (default 10).',
      },
      sessionId: {
        type: 'string',
        description: 'Optional browser session ID.',
      },
    },
    required: ['platform', 'query'],
  },
  execute: async (input, emitEvent, context) => {
    const platform = input?.platform || 'instagram';
    const query = input?.query || '';
    const location = input?.location || '';
    const limit = input?.limit || 10;
    const sessionId = input?.sessionId;

    const socialSiteMap: Record<string, 'instagram.com' | 'linkedin.com' | 'twitter.com' | 'facebook.com'> = {
      instagram: 'instagram.com',
      linkedin: 'linkedin.com',
      twitter: 'twitter.com',
      facebook: 'facebook.com',
    };

    return await executeGenericWebResearch({
      query,
      location,
      socialSite: socialSiteMap[platform] || 'instagram.com',
      limit,
      userId: context?.userId || 'anonymous',
      sessionId,
      emitEvent,
    });
  },
};

/**
 * 10. Send Email / Outreach Tool
 * Dispatches emails via configured Gmail OAuth or SMTP.
 */
export const sendEmailTool: AgentTool = {
  name: 'send_email',
  description:
    'Dispatches an email or outreach proposal to a verified recipient email address via configured Gmail OAuth or SMTP credentials.',
  parameters: {
    type: 'object',
    properties: {
      to: {
        type: 'string',
        description: 'Recipient email address (e.g. "owner@business.com").',
      },
      businessName: {
        type: 'string',
        description: 'Target business or recipient name.',
      },
      subject: {
        type: 'string',
        description: 'Subject line of the email.',
      },
      body: {
        type: 'string',
        description: 'Body text or markdown of the personalized outreach proposal.',
      },
    },
    required: ['to', 'subject', 'body'],
  },
  execute: async (args, emitEvent, context) => {
    const to = (args.to || '').trim();
    const subject = (args.subject || '').trim();
    const body = (args.body || '').trim();
    const businessName = (args.businessName || '').trim();
    const userId = context?.userId || 'anonymous';

    emitEvent?.({
      type: 'tool.progress',
      tool: 'send_email',
      message: `Dispatching outreach email to ${to} (${businessName || 'Business'})...`,
    });

    if (!to || !to.includes('@')) {
      throw new Error(`Invalid recipient email address: "${to}". A valid email address is required.`);
    }

    if (userId && userId !== 'anonymous') {
      const alreadySent = await checkEmailAlreadySent(userId, to);
      if (alreadySent) {
        await logOutreachAttempt({
          userId,
          recipientEmail: to,
          businessName,
          status: 'skipped',
          reason: 'already_contacted',
          subject,
        });
        return {
          success: false,
          skipped: true,
          reason: 'already_contacted',
          to,
          businessName,
          subject,
          error: 'Already contacted this recipient within the last 30 days.',
        };
      }
    }

    // Try Gmail OAuth first
    let res = await sendGmailMessage({
      userId,
      to,
      subject,
      bodyText: body,
    });

    // If OAuth is not connected or failed, try SMTP credentials if available
    if (!res.success && (res.error?.includes('GMAIL_NOT_CONNECTED') || res.error?.includes('GMAIL_NOT_CONFIGURED'))) {
      try {
        const smtpRes = await sendGmailSmtpMessage({
          userId,
          to,
          subject,
          bodyText: body,
        });
        if (smtpRes.success) {
          res = smtpRes;
        }
      } catch {
        // Keep original OAuth error
      }
    }

    if (!res.success) {
      if (userId && userId !== 'anonymous') {
        await logOutreachAttempt({
          userId,
          recipientEmail: to,
          businessName,
          subject,
          status: 'failed',
          errorMessage: res.error || 'Failed to dispatch email via connected mail provider.',
        });
      }
      throw new Error(
        res.error?.includes('GMAIL_NOT_CONNECTED') || res.error?.includes('GMAIL_NOT_CONFIGURED')
          ? 'Gmail is not connected. Connect Gmail (OAuth or SMTP) in Settings to send proposals.'
          : res.error || 'Failed to dispatch email via connected mail provider.'
      );
    }

    // Never claim a send without a real provider messageId. A "successful" provider
    // response that lacks a messageId is treated as a failed dispatch.
    if (!res.messageId) {
      if (userId && userId !== 'anonymous') {
        await logOutreachAttempt({
          userId,
          recipientEmail: to,
          businessName,
          subject,
          status: 'failed',
          errorMessage: 'Provider reported success but returned no message ID.',
        });
      }
      throw new Error('Provider reported success but returned no message ID. Email not confirmed as sent.');
    }

    if (userId && userId !== 'anonymous') {
      await logOutreachAttempt({
        userId,
        recipientEmail: to,
        businessName,
        subject,
        messageId: res.messageId,
        status: 'sent',
      });
    }

    return {
      success: true,
      to,
      businessName,
      subject,
      messageId: res.messageId,
      timestamp: new Date().toISOString(),
    };
  },
};

// Register all tools
toolRegistry.set(searchBusinessesTool.name, searchBusinessesTool);
toolRegistry.set(analyzeWebsiteTool.name, analyzeWebsiteTool);
toolRegistry.set(calculateLeadScoreTool.name, calculateLeadScoreTool);
toolRegistry.set(generateProposalTool.name, generateProposalTool);
toolRegistry.set(systemStatusTool.name, systemStatusTool);
toolRegistry.set(dateTimeTool.name, dateTimeTool);
toolRegistry.set(googleSearchTool.name, googleSearchTool);
toolRegistry.set(deepWebResearchTool.name, deepWebResearchTool);
toolRegistry.set(researchSocialTool.name, researchSocialTool);
toolRegistry.set(sendEmailTool.name, sendEmailTool);
for (const tool of browserTools) {
  toolRegistry.set(tool.name, tool);
}

export function getRegisteredTools(): AgentTool[] {
  return Array.from(toolRegistry.values());
}

export function getOpenRouterToolDefinitions() {
  return getRegisteredTools().map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

export function getOpenAIToolDefinitions() {
  return getOpenRouterToolDefinitions();
}

export function getGeminiToolDeclarations() {
  return getRegisteredTools().map((t) => ({
    name: t.name,
    description: t.description,
    parameters: {
      type: 'OBJECT' as any,
      properties: Object.entries(t.parameters.properties || {}).reduce((acc, [key, val]) => {
        acc[key] = {
          type: val.type.toUpperCase() as any,
          description: val.description,
          ...(val.enum ? { enum: val.enum } : {}),
        };
        return acc;
      }, {} as Record<string, any>),
      required: t.parameters.required || [],
    },
  }));
}

export async function executeTool(
  toolName: string,
  toolArgs: any,
  emitEvent?: (event: any) => void,
  context?: ToolExecutionContext
): Promise<any> {
  const tool = toolRegistry.get(toolName);
  if (!tool) {
    emitEvent?.({
      type: 'tool.failed',
      tool: toolName,
      message: `Tool "${toolName}" is not registered on backend.`,
    });
    throw new Error(`Tool "${toolName}" is not registered.`);
  }

  try {
    return await tool.execute(toolArgs, emitEvent, context);
  } catch (error: any) {
    emitEvent?.({
      type: 'tool.failed',
      tool: toolName,
      message: `Error executing ${toolName}: ${error.message || 'Unknown error'}`,
    });
    throw error;
  }
}
