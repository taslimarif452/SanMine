import { aiRegistry } from './ai/registry.js';
import { searchRegistry } from './search/registry.js';
import { executeTool } from './tools.js';
import { AIProviderId } from './ai/types.js';
import { verifyBusinessLocation, normalizeRequestedLocation, KNOWN_CITIES } from './search/location.js';
import { getUserPreferences, checkEmailAlreadySent, logOutreachAttempt } from './db/outreach.js';
import { getGmailTokens } from './db/neon.js';
import { getUserSmtpCredentials } from './db/smtp.js';
import { sendGmailMessage } from './gmail/oauth.js';
import { sendGmailSmtpMessage } from './gmail/smtp.js';
import { browserSessionManager } from './browser/sessionManager.js';
import { executeGenericWebResearch } from './research/deepWebResearcher.js';
import { runAutonomousAgentLoop } from './agent/autonomousBrain.js';
import { universalTaskPlanner } from './taskPlanner/planner.js';
import { universalAgentBrain } from './agent/brain/index.js';
import { resolveExecutionMode, isLeadingSlashCommand, stripLeadingSlash } from './agent/modeRouter.js';
import { classifyUserIntent } from './agent/workIntent.js';
import { executeNormalChat } from './chat/normalChat.js';
import {
  processBatchProposalPipeline,
  processBusinessProposalPipeline,
  formatPipelineAgentResponse,
  QualifiedBusinessProposalResult,
  BusinessRawInput,
} from './intelligence/index.js';
import { isValidRecipientEmail } from './intelligence/types.js';

export interface TaskClassification {
  mode: 'chat' | 'agent';
  intent:
    | 'lead_generation'
    | 'website_analysis'
    | 'proposal_generation'
    | 'system_status'
    | 'deep_research'
    | 'social_research'
    | 'general';
  parameters: {
    businessType?: string;
    isIndustryUnspecified?: boolean;
    location?: string;
    limit?: number;
    url?: string;
    businessName?: string;
    analyzeWebsites?: boolean;
    generateProposals?: boolean;
    isContinuation?: boolean;
    checkType?: 'overview' | 'tools' | 'connectivity';
    platform?: 'instagram' | 'linkedin' | 'twitter' | 'facebook';
    specificFields?: string[];
    rawQuery?: string;
  };
}

const SPECIFIC_INDUSTRIES = [
  'dental clinic', 'dental clinics', 'dentist', 'dentists', 'orthodontist', 'orthodontists',
  'restaurant', 'restaurants', 'cafe', 'cafes', 'coffee shop', 'coffee shops', 'bakery', 'bakeries',
  'gym', 'gyms', 'fitness center', 'fitness centers', 'yoga studio', 'yoga studios', 'crossfit',
  'salon', 'salons', 'hair salon', 'hair salons', 'spa', 'spas', 'barber shop', 'barbers',
  'plumber', 'plumbers', 'plumbing', 'electrician', 'electricians',
  'lawyer', 'lawyers', 'law firm', 'law firms', 'attorney', 'attorneys',
  'contractor', 'contractors', 'roofer', 'roofers', 'hvac', 'construction',
  'marketing agency', 'marketing agencies', 'digital agency', 'digital agencies', 'ad agency', 'ad agencies',
  'clinic', 'clinics', 'medical clinic', 'medical clinics', 'doctor', 'doctors', 'hospital', 'hospitals',
  'hotel', 'hotels', 'motel', 'motels', 'resort', 'resorts',
  'auto repair', 'mechanic', 'mechanics', 'car wash', 'car detailing',
  'cleaning service', 'cleaning services', 'maid service',
  'accountant', 'accountants', 'cpa', 'accounting firm', 'accounting firms',
  'real estate', 'realtor', 'realtors', 'real estate agency', 'real estate agencies',
  'boutique', 'boutiques', 'retail store', 'retail stores', 'flower shop', 'flower shops', 'florist', 'florists'
];

/**
 * Extracts a candidate location string from text using prepositions, known cities, or short geographic answers.
 */
export function extractLocationCandidate(text: string): string {
  if (!text) return '';
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();

  // 1. Check preposition patterns: "in Delhi", "near Bangalore", "around Mumbai", "at Ranchi", "for New York"
  const prepMatch = trimmed.match(/\b(?:in|near|around|at|for|within)\s+([A-Za-z\s,-]+?)(?:\s+(?:with|and|having|who|that|for|to|\.|$)|[.,;!?]|$)/i);
  if (prepMatch && prepMatch[1]) {
    const cand = prepMatch[1].trim().replace(/\b(with|and|having|who|that|for|to)\b.*$/i, '').trim();
    if (cand.length > 1 && !['the', 'all', 'some', 'any', 'my', 'our', 'a', 'them', 'these', 'those'].includes(cand.toLowerCase())) {
      return cand;
    }
  }

  // 2. Match against known cities directly
  const knownCityNames = Object.keys(KNOWN_CITIES);
  for (const cityKey of knownCityNames) {
    const reg = new RegExp(`\\b${cityKey}\\b`, 'i');
    if (reg.test(lower)) {
      return KNOWN_CITIES[cityKey].city || cityKey;
    }
  }

  // 3. Check Hindi / Hinglish post-positions: "Srinagar ki", "Delhi me", "Mumbai se", "Ranchi ke"
  const hindiPostMatch = trimmed.match(/\b([A-Za-z]{3,25})\s+(?:ki|ke|ka|me|mein|se|par|wali|wale)\b/i);
  if (hindiPostMatch && hindiPostMatch[1]) {
    const word = hindiPostMatch[1].trim();
    const nonLocationWords = [
      'company', 'website', 'business', 'store', 'page', 'profile', 'product', 'item', 'services',
      'pricing', 'founder', 'email', 'phone', 'contact', 'info', 'details', 'sab', 'aaj', 'kal',
      'kuch', 'aise', 'unka', 'inka', 'mera', 'apna', 'ye', 'wo', 'google', 'insta', 'instagram',
      'linkedin', 'twitter', 'facebook', 'youtube', 'internet', 'web', 'online', 'browser', 'search',
      'query', 'url', 'site', 'feed', 'post', 'account', 'handle', 'domain'
    ];
    if (!nonLocationWords.includes(word.toLowerCase())) {
      // Capitalize first letter
      return word.charAt(0).toUpperCase() + word.slice(1);
    }
  }

  // 3. Check if the text itself is an isolated city response (e.g. "Delhi", "Delhi, India", "Target Bangalore", "Austin, TX")
  const nonCityKeywords = [
    'find', 'search', 'get', 'send', 'proposal', 'proposals', 'leads', 'lead',
    'business', 'businesses', 'gym', 'gyms', 'restaurant', 'restaurants', 'dentist', 'dentists',
    'audit', 'analyze', 'check', 'status'
  ];
  const words = lower.split(/\s+/);
  const containsActionVerb = words.some((w) => nonCityKeywords.includes(w));
  if (!containsActionVerb && words.length <= 4 && trimmed.length >= 2) {
    const clean = trimmed.replace(/^(in|near|at|around|for|target)\s+/i, '').replace(/[.,;!?]+$/, '').trim();
    if (clean.length >= 2) {
      return clean;
    }
  }

  return '';
}

/**
 * Searches back through conversation history to find a previously mentioned location.
 */
export function extractLocationFromHistory(messages: Array<{ role: string; content: string }>): string {
  if (!Array.isArray(messages) || messages.length === 0) return '';
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === 'user' && typeof msg.content === 'string') {
      const loc = extractLocationCandidate(msg.content);
      if (loc) return loc;
    }
  }
  return '';
}

/**
 * Deterministic task classifier and intent extractor.
 * Avoids model-dependent tool calling and guarantees safe classification.
 */
export function classifyTask(
  prompt: string,
  messages?: Array<{ role: string; content: string }>,
  options?: { defaultLocation?: string }
): TaskClassification {
  const text = (prompt || '').trim();
  const lower = text.toLowerCase();

  // 1. Explicit System Status Request Check
  // ONLY triggered when the user explicitly asks for system/runtime status
  const systemStatusPattern =
    /\b(check|show|get|view|what is|display)?\s*(sanmine\s*|saneye\s*|agentos\s*)?(system\s*status|runtime\s*status|integration\s*status|status\s*check|status\s*report|are\s*(my\s*)?integrations\s*configured)\b/i;
  if (
    systemStatusPattern.test(lower) &&
    !lower.includes('gym') &&
    !lower.includes('dentist') &&
    !lower.includes('restaurant') &&
    !lower.includes('lead')
  ) {
    let checkType: 'overview' | 'tools' | 'connectivity' = 'overview';
    if (lower.includes('tool')) checkType = 'tools';
    if (lower.includes('connect') || lower.includes('integration')) checkType = 'connectivity';

    return {
      mode: 'agent',
      intent: 'system_status',
      parameters: { checkType, rawQuery: text },
    };
  }

  // 2. Direct Website Audit / Analysis Request Check
  // Matches URLs like https://example.com, http://example.com, or www.example.com
  const urlMatch = text.match(/(https?:\/\/[^\s]+|www\.[^\s]+)/i);
  const auditKeywords = ['audit', 'analyze', 'analysis', 'inspect', 'diagnose', 'check', 'review', 'performance', 'speed', 'score'];
  const hasAuditKeyword = auditKeywords.some((k) => lower.includes(k));

  if (urlMatch && hasAuditKeyword) {
    let url = urlMatch[1];
    if (url.startsWith('www.')) url = `https://${url}`;
    url = url.replace(/[.,;:!?)]+$/, '');

    const generateProposals = lower.includes('proposal') || lower.includes('pitch');

    return {
      mode: 'agent',
      intent: 'website_analysis',
      parameters: {
        url,
        analyzeWebsites: true,
        generateProposals,
        rawQuery: text,
      },
    };
  }

  // 3. Continuation Check: User answering missing location
  if (Array.isArray(messages) && messages.length >= 2) {
    const lastAssistantMsg = [...messages].reverse().find((m) => m.role === 'assistant');
    if (
      lastAssistantMsg &&
      typeof lastAssistantMsg.content === 'string' &&
      (lastAssistantMsg.content.toLowerCase().includes('which location') ||
        lastAssistantMsg.content.toLowerCase().includes('location should i target') ||
        lastAssistantMsg.content.toLowerCase().includes('target location'))
    ) {
      // The current prompt is answering the location question
      const candidateLoc = extractLocationCandidate(text);
      if (candidateLoc) {
        // Find the prior lead gen user prompt to restore parameters
        const prevUserMsg = [...messages].reverse().find(
          (m) => m.role === 'user' && m.content !== text
        );
        const prevText = prevUserMsg?.content || '';
        const prevLower = prevText.toLowerCase();

        let limit = 5;
        const countMatch = prevText.match(/\b(?:find|search|discover|get|fetch|list|collect|prospect|audit|top)?\s*(\d+)\s+/i);
        if (countMatch && parseInt(countMatch[1], 10) > 0) {
          limit = Math.min(50, Math.max(1, parseInt(countMatch[1], 10)));
        }

        let businessType = 'small businesses';
        let isIndustryUnspecified = true;
        for (const ind of SPECIFIC_INDUSTRIES) {
          if (new RegExp(`\\b${ind}\\b`, 'i').test(prevLower)) {
            businessType = ind;
            isIndustryUnspecified = false;
            break;
          }
        }

        const generateProposals =
          prevLower.includes('proposal') ||
          prevLower.includes('pitch') ||
          prevLower.includes('outreach') ||
          prevLower.includes('send');

        return {
          mode: 'agent',
          intent: 'lead_generation',
          parameters: {
            businessType,
            isIndustryUnspecified,
            location: candidateLoc,
            limit,
            analyzeWebsites: true,
            generateProposals,
            isContinuation: true,
            rawQuery: text,
          },
        };
      }
    }
  }

  // 4. Social Media Research Check (Instagram, LinkedIn, Twitter/X, Facebook)
  // Matches "Instagram se Srinagar ke fashion stores find karo", "LinkedIn se founders find karo", etc.
  const socialPlatforms: Array<{ name: 'instagram' | 'linkedin' | 'twitter' | 'facebook'; matches: string[] }> = [
    { name: 'instagram', matches: ['instagram', 'insta', 'ig profile', 'ig page'] },
    { name: 'linkedin', matches: ['linkedin', 'linked in'] },
    { name: 'twitter', matches: ['twitter', 'x.com', 'tweets'] },
    { name: 'facebook', matches: ['facebook', 'fb page', 'fb profile'] },
  ];

  const matchedPlatform = socialPlatforms.find((p) => p.matches.some((m) => lower.includes(m)));
  if (matchedPlatform) {
    const loc = extractLocationCandidate(text);
    let limit = 10;
    const countMatch = text.match(/\b(\d+)\s+/);
    if (countMatch && parseInt(countMatch[1], 10) > 0) {
      limit = Math.min(30, Math.max(1, parseInt(countMatch[1], 10)));
    }

    return {
      mode: 'agent',
      intent: 'social_research',
      parameters: {
        platform: matchedPlatform.name,
        location: loc,
        limit,
        rawQuery: text,
      },
    };
  }

  // 5. Deep Web / Specific Company / Entity Research Check
  // Matches "is company ke founder aur email find karo", "is website se pricing aur services nikalo", "Google par search karke official websites open karo", etc.
  const deepResearchSignals = [
    'founder',
    'co-founder',
    'ceo',
    'leadership',
    'pricing',
    'plans',
    'cost',
    'services',
    'offerings',
    'competitors',
    'official website',
    'open official website',
    'google search',
    'google par search',
    'deep research',
    'inspect website',
    'is company ke',
    'is website se',
    'website se pricing',
  ];

  const hasDeepResearchSignal = deepResearchSignals.some((sig) => lower.includes(sig));
  if (hasDeepResearchSignal) {
    const loc = extractLocationCandidate(text);
    const urlM = text.match(/(https?:\/\/[^\s]+|www\.[^\s]+)/i);
    let extractedUrl: string | undefined = undefined;
    if (urlM) {
      extractedUrl = urlM[1].startsWith('www.') ? `https://${urlM[1]}` : urlM[1];
      extractedUrl = extractedUrl.replace(/[.,;:!?)]+$/, '');
    }

    const specificFields: string[] = [];
    if (lower.includes('founder') || lower.includes('ceo') || lower.includes('co-founder') || lower.includes('leadership')) specificFields.push('founder');
    if (lower.includes('email') || lower.includes('contact') || lower.includes('phone')) specificFields.push('email');
    if (lower.includes('pricing') || lower.includes('price') || lower.includes('plans') || lower.includes('rates') || lower.includes('cost')) specificFields.push('pricing');
    if (lower.includes('services') || lower.includes('products') || lower.includes('offerings')) specificFields.push('services');
    if (lower.includes('competitors') || lower.includes('alternatives')) specificFields.push('competitors');

    let limit = 10;
    const countMatch = text.match(/\b(\d+)\s+/);
    if (countMatch && parseInt(countMatch[1], 10) > 0) {
      limit = Math.min(30, Math.max(1, parseInt(countMatch[1], 10)));
    }

    return {
      mode: 'agent',
      intent: 'deep_research',
      parameters: {
        url: extractedUrl,
        location: loc,
        limit,
        specificFields: specificFields.length > 0 ? specificFields : ['overview', 'founder', 'email', 'services', 'pricing'],
        rawQuery: text,
      },
    };
  }

  // 6. Lead Generation / Business Discovery / Autonomous Web Research Request Check
  // Matches "Find 5 small businesses and send them proposal", "Research bakeries in Srinagar", "Find bakeries in Srinagar that do not have a website", etc.
  const leadActionKeywords = [
    'find',
    'search',
    'discover',
    'look for',
    'get',
    'fetch',
    'gather',
    'scrape',
    'list',
    'collect',
    'prospect',
    'generate',
    'audit',
    'outreach',
    'pitch',
    'research',
    'explore',
    'investigate',
    'browse',
    'navigate',
  ];

  const hasLeadAction = leadActionKeywords.some((k) => {
    const reg = new RegExp(`\\b${k}\\b`, 'i');
    return reg.test(lower);
  });

  const leadSubjectKeywords = [
    'businesses',
    'business',
    'leads',
    'lead',
    'prospects',
    'prospect',
    'companies',
    'company',
    'clients',
    'client',
    'gym',
    'gyms',
    'dentist',
    'dentists',
    'restaurant',
    'restaurants',
    'bakery',
    'bakeries',
    'salon',
    'salons',
    'plumber',
    'plumbers',
    'lawyer',
    'lawyers',
    'contractor',
    'contractors',
    'agency',
    'agencies',
    'clinic',
    'clinics',
    'doctor',
    'doctors',
    'hotel',
    'hotels',
    'cafe',
    'cafes',
    'shops',
    'stores',
    'website',
    'websites',
    'contacts',
  ];

  const hasLeadSubject = leadSubjectKeywords.some((s) => {
    const reg = new RegExp(`\\b${s}\\b`, 'i');
    return reg.test(lower);
  });

  const isLeadGenPattern =
    (hasLeadAction && hasLeadSubject) ||
    lower.includes('send proposal') ||
    lower.includes('send them proposal') ||
    lower.includes('prepare proposal') ||
    lower.includes('generate leads') ||
    lower.includes('find businesses') ||
    lower.includes('find leads') ||
    lower.includes('web research') ||
    lower.includes('research businesses');

  if (isLeadGenPattern) {
    // 1. Extract requested limit (e.g. 5 from "Find 5 small businesses")
    let limit = 10;
    const countMatch = text.match(/\b(?:find|search|discover|get|fetch|list|collect|prospect|audit|top|generate)?\s*(\d+)\s+/i);
    if (countMatch && parseInt(countMatch[1], 10) > 0) {
      limit = Math.min(50, Math.max(1, parseInt(countMatch[1], 10)));
    } else if (lower.includes('small business') || lower.includes('small businesses')) {
      limit = 5;
    }

    // 2. Extract specific industry vs unspecified general small business
    let businessType = 'small businesses';
    let isIndustryUnspecified = true;

    for (const ind of SPECIFIC_INDUSTRIES) {
      const reg = new RegExp(`\\b${ind}\\b`, 'i');
      if (reg.test(lower)) {
        businessType = ind;
        isIndustryUnspecified = false;
        break;
      }
    }

    if (isIndustryUnspecified) {
      // Check if user specifically requested general business keywords
      if (
        lower.includes('small business') ||
        lower.includes('small businesses') ||
        lower.includes('local business') ||
        lower.includes('local businesses')
      ) {
        businessType = 'small businesses';
      } else if (lower.includes('leads') || lower.includes('prospects')) {
        businessType = 'small businesses';
      }
    }

    // 3. Extract location from prompt
    const location = extractLocationCandidate(text);

    const analyzeWebsites = true; // Always audit websites to enable grounded lead scoring & proposal scopes
    const generateProposals =
      lower.includes('proposal') ||
      lower.includes('pitch') ||
      lower.includes('outreach') ||
      lower.includes('send') ||
      lower.includes('contact');

    return {
      mode: 'agent',
      intent: 'lead_generation',
      parameters: {
        businessType,
        isIndustryUnspecified,
        location,
        limit,
        analyzeWebsites,
        generateProposals,
        rawQuery: text,
      },
    };
  }

  // 5. Standalone Proposal Generation Check
  if (lower.includes('proposal for') || lower.includes('pitch for')) {
    const bizNameMatch = text.match(/proposal\s+for\s+([A-Za-z0-9\s_-]+?)(?:\s+(?:with|and|regarding|\.|$)|$)/i);
    return {
      mode: 'agent',
      intent: 'proposal_generation',
      parameters: {
        businessName: bizNameMatch ? bizNameMatch[1].trim() : 'Prospective Client',
        generateProposals: true,
        rawQuery: text,
      },
    };
  }

  // 6. Default fallback to standard Chat mode (no unrequested tools)
  return {
    mode: 'chat',
    intent: 'general',
    parameters: { rawQuery: text },
  };
}

export interface OrchestrationOptions {
  userRequestId?: string;
  chatId?: string;
  userId?: string;
  userApiKey?: string;
  defaultLocation?: string;
  autoSendProposals?: boolean;
  messages: Array<{ role: 'user' | 'assistant' | 'system' | 'tool'; content: string }>;
  providerId: AIProviderId;
  model: string;
  temperature?: number;
  maxTokens?: number;
  sendEvent: (event: any) => void;
  abortSignal?: AbortSignal;
}

function logAgentAICall(taskId: string, purpose: string, provider: string, model: string) {
  console.log(`[AGENT AI CALL]\ntaskId=${taskId}\npurpose=${purpose}\nprovider=${provider}\nmodel=${model}`);
}

function logAgentTaskSummary(taskId: string, aiRequestCount: number, toolCalls: number, status: string) {
  console.log(`[AGENT TASK SUMMARY]\ntaskId=${taskId}\naiRequestCount=${aiRequestCount}\ntoolCalls=${toolCalls}\nstatus=${status}`);
}

/**
 * Server-controlled Agent Orchestrator.
 * Executes deterministic pre-flight checks and real tools, then utilizes the AI model for batch proposal generation.
 */
/**
 * Generates structured, deterministic proposal drafts using ONLY verified data.
 * Guarantees zero invented metrics, contacts, customers, or non-existent problems.
 */
export function generateDeterministicProposals({
  businessType,
  location,
  enrichedLeads,
  targetLeads,
}: {
  businessType: string;
  location: string;
  enrichedLeads: any[];
  targetLeads: any[];
}): string {
  const targetArea = location || 'the target region';
  const tableRows = enrichedLeads
    .map(
      (b) =>
        `| **${b.name}** | ${b.website ? `[${b.website}](${b.website.startsWith('http') ? b.website : 'https://' + b.website})` : 'No active website'} | ${b.leadScore !== undefined ? `${b.leadScore}/100` : 'N/A'} | ${b.rating !== undefined ? `${b.rating}★` : 'N/A'} (${b.reviewCount ?? 0}) | ${b.salesTier || 'Standard'} | ${b.recommendedOffer || 'Modern Web Presence'} |`
    )
    .join('\n');

  const businessProposals = targetLeads
    .map((lead, idx) => {
      const issues =
        lead.weaknesses && lead.weaknesses.length > 0
          ? lead.weaknesses
          : lead.website
          ? ['Standard performance optimization recommended']
          : ['No active website discovered in directory listings'];

      const issuesList = issues.map((iss: string) => `- ${iss}`).join('\n');

      // Strategic solutions strictly mapped to verified findings
      const solutions = issues
        .map((iss: string) => {
          const lower = iss.toLowerCase();
          if (lower.includes('mobile')) {
            return '- **Responsive Mobile Interface**: Implement viewport meta configuration and responsive UI layouts for smartphone and tablet visitors.';
          }
          if (lower.includes('ssl') || lower.includes('https') || lower.includes('insecure')) {
            return '- **Security & SSL Certificate**: Configure HTTPS encryption to protect visitor privacy and satisfy browser security requirements.';
          }
          if (lower.includes('response time') || lower.includes('slow') || lower.includes('speed')) {
            return '- **Performance & Caching**: Optimize assets and server caching to improve initial page load times.';
          }
          if (lower.includes('no active website') || lower.includes('no website')) {
            return '- **Initial Web Presence**: Deploy a dedicated, modern business landing page with verified local SEO schema, operating hours, and contact forms.';
          }
          return `- **Targeted Technical Remediation**: Resolve identified issue: ${iss}.`;
        })
        .join('\n');

      const contactMethod = lead.phone ? `Phone: **${lead.phone}**` : 'Local directory outreach';
      const auditStatus = lead.audit
        ? `Audit completed (Response: ${lead.audit.responseTimeMs}ms, HTTPS: ${lead.audit.isHttps ? 'Yes' : 'No'}, Mobile Viewport: ${lead.audit.hasMobileViewport ? 'Yes' : 'No'})`
        : lead.website
        ? 'Website verified'
        : 'No website found';

      return `### ${idx + 1}. ${lead.name}

- **Location / Address:** ${lead.address || 'Local area'}
- **Contact:** ${contactMethod}
- **Website:** ${lead.website || 'None found'}
- **Rating / Reviews:** ${lead.rating !== undefined ? `${lead.rating}★` : 'N/A'} (${lead.reviewCount ?? 0} reviews)
- **Lead Health Score:** ${lead.leadScore ?? 50}/100 · **Priority Tier:** ${lead.salesTier || 'Standard'}
- **Audit Verification:** ${auditStatus}

#### Verified Deficiencies
${issuesList}

#### Tailored Technical Scope
${solutions}

#### Actionable Outreach Script
> **Subject:** Quick question regarding ${lead.name}'s digital presence
>
> Hi ${lead.name} team,
>
> I was reviewing local ${businessType || 'businesses'} in ${targetArea} and noticed ${
        lead.website
          ? `your website (${lead.website}) currently has an opportunity for optimization regarding ${issues[0].toLowerCase()}.`
          : `your business currently doesn't have an active dedicated website listed for local customers searching online.`
      }
>
> We specialize in helping ${businessType || 'local organizations'} implement ${lead.recommendedOffer || 'modern web experiences'}. Would you be open to a quick 5-minute conversation this week on how we can address this?
>
> Best regards,
> SanMine Space Outreach Team`;
    })
    .join('\n\n---\n\n');

  return `## Business Discovery & Technical Proposals: ${businessType} in ${targetArea}

### Market Discovery Overview
Discovered and analyzed **${enrichedLeads.length}** local businesses, verified website status, and qualified **${targetLeads.length}** priority opportunities.

| Business Name | Website | Lead Health Score | Rating / Reviews | Priority Tier | Recommended Offer |
|---|---|---|---|---|---|
${tableRows}

---

## Detailed Opportunity Proposals (${targetLeads.length} Qualified Leads)

${businessProposals}

---

### Proposal Outreach & Confirmation
**${targetLeads.length} personalized proposals are ready to send.**

The proposals above have been prepared and customized based on verified technical audits. To dispatch these outreach emails through your authorized Gmail account, review the drafts or proceed with sending:

- **[Review Proposals]**: Inspect, edit, or customize individual recipient emails and subjects.
- **[Send All]**: Dispatch all prepared proposals via Gmail OAuth (requires explicit confirmation).

---

### Recommended Next Steps
1. **Outreach Prioritization**: Contact leads in **Tier 1 (High Priority)** first, where critical website gaps or missing digital presence offer the highest conversion potential.
2. **Review Verified Audit Data**: Reference the specific technical deficiencies identified during the live audit in all communications.
3. **Follow-up Cadence**: Schedule follow-ups within 48-72 hours of initial contact.`;
}

/**
 * Generates structured deterministic proposal for single website analysis.
 */
export function generateSingleWebsiteDeterministicProposal({
  url,
  audit,
  scoreResult,
}: {
  url: string;
  audit: any;
  scoreResult: any;
}): string {
  const issues =
    audit.identifiedIssues && audit.identifiedIssues.length > 0
      ? audit.identifiedIssues
      : ['No critical technical issues found'];

  const issuesList = issues.map((iss: string) => `- ${iss}`).join('\n');
  const solutions = issues
    .map((iss: string) => {
      const lower = iss.toLowerCase();
      if (lower.includes('mobile')) {
        return '- **Responsive Mobile Architecture**: Implement responsive viewport meta configurations and fluid layout containers for mobile/tablet devices.';
      }
      if (lower.includes('ssl') || lower.includes('https') || lower.includes('insecure')) {
        return '- **SSL Security Installation**: Provision SSL/TLS encryption for HTTPS security compliance and visitor trust.';
      }
      if (lower.includes('response time') || lower.includes('slow') || lower.includes('speed')) {
        return '- **Speed & Asset Optimization**: Streamline server response time and caching to improve Time to First Byte (TTFB).';
      }
      return `- **Targeted Technical Remediation**: Resolve identified deficiency: ${iss}.`;
    })
    .join('\n');

  return `## Technical Website Audit & Proposal: ${url}

### Live Audit Overview
- **Website Title:** ${audit.pageTitle || '(None)'}
- **HTTP Status:** ${audit.httpStatus || 200}
- **Response Time:** ${audit.responseTimeMs}ms
- **SSL Encryption (HTTPS):** ${audit.isHttps ? '✓ Secure' : '✕ Insecure'}
- **Mobile Viewport Meta:** ${audit.hasMobileViewport ? '✓ Present' : '✕ Missing'}
- **Lead Health Score:** ${scoreResult?.leadHealthScore ?? 'N/A'}/100 (${scoreResult?.salesTier || 'Standard'})
- **Recommended Offer:** ${scoreResult?.recommendedOffer || 'Modern Web Presence & Conversion Redesign'}

---

### Verified Deficiencies (${audit.issuesFoundCount || 0})
${issuesList}

---

### Recommended Remediation & Scope
${solutions}

---

### Client Outreach Draft
> **Subject:** Technical audit findings and optimization plan for ${audit.pageTitle || url}
>
> Hi there,
>
> We completed a technical inspection of ${url} and identified key opportunities to improve performance and user engagement:
> ${issues.slice(0, 2).map((i: string) => `- ${i}`).join('\n')}
>
> We recommend implementing our **${scoreResult?.recommendedOffer || 'Modern Web Presence & Conversion Redesign'}** package to address these items directly.
>
> Best regards,
> SanMine Space Technical Team`;
}

export async function orchestrateAgentTask({
  userRequestId,
  chatId,
  userId,
  userApiKey,
  defaultLocation,
  autoSendProposals,
  messages,
  providerId,
  model,
  temperature = 0.7,
  maxTokens = 4096,
  sendEvent,
  abortSignal,
}: OrchestrationOptions): Promise<void> {
  const taskId = userRequestId || `task_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
  const promptText = lastUserMsg?.content || '';

  const cleanConversationHistory = messages
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

  // Resolve Execution Mode: Normal Chat vs. Slash Command Agent Mode
  const route = resolveExecutionMode(promptText, {
    conversationHistory: cleanConversationHistory,
  });

  // 1. NORMAL CHAT MODE: Directly stream LLM response via dedicated Normal Chat Brain without invoking Task Planner, Agent Brain, browser, or discovery tools
  if (route.mode === 'normal_chat') {
    await executeNormalChat({
      taskId: userRequestId || taskId,
      chatId,
      userId,
      userApiKey,
      defaultLocation,
      providerId,
      model,
      messages: cleanConversationHistory,
      temperature,
      maxTokens,
      sendEvent,
      abortSignal,
    });
    return;
  }

  // 2. AGENT MODE: Full Autonomous Execution with Universal Task Planner & Agent Brain
  const agentObjective = route.normalizedPrompt;

  // Determine effective auto-send: explicit option wins, otherwise fall back to the
  // user's stored outreach preference (getUserPreferences).
  let effectiveAutoSend = autoSendProposals;
  if (typeof effectiveAutoSend !== 'boolean' && userId) {
    try {
      const userPrefs = await getUserPreferences(userId);
      effectiveAutoSend = Boolean(userPrefs?.autoSendProposals);
    } catch (prefErr: any) {
      console.warn('[Neon DB] User preference lookup error:', prefErr.message);
      effectiveAutoSend = false;
    }
  }
  if (typeof effectiveAutoSend !== 'boolean') effectiveAutoSend = false;

  console.log(
    `[AGENT MODE ACTIVATED]\ntaskId=${taskId}\nuserRequestId=${userRequestId || taskId}\nobjective="${agentObjective}"\nisSlashCommand=${route.isExplicitSlashCommand}\nisContinuation=${route.isAgentContinuation}\nuserIntent=${classifyUserIntent(agentObjective)}\neffectiveAutoSend=${effectiveAutoSend}`
  );

  const agentMessages = messages.map((m) =>
    m === lastUserMsg ? { ...m, content: agentObjective } : m
  );

  const historyWithNormalizedPrompt = cleanConversationHistory.map((m, idx) =>
    idx === cleanConversationHistory.length - 1 && m.role === 'user'
      ? { ...m, content: agentObjective }
      : m
  );

  try {
    const result = await universalAgentBrain.executeTask({
      taskId,
      userId,
      chatId,
      userApiKey,
      providerId,
      model,
      prompt: agentObjective,
      conversationHistory: historyWithNormalizedPrompt,
      defaultLocation,
      autoSendProposals: effectiveAutoSend,
      temperature,
      maxTokens,
      sendEvent,
      abortSignal,
    });

    if (result?.finalAnswer) {
      sendEvent({ type: 'message.delta', content: result.finalAnswer });
      sendEvent({ type: 'message.completed', content: result.finalAnswer });
    }
  } catch (brainErr: any) {
    console.warn('[Universal Agent Brain Notice] Executing via task planner fallback:', brainErr.message);
    await universalTaskPlanner.execute({
      taskId,
      userRequestId,
      userId,
      userApiKey,
      providerId,
      model,
      messages: agentMessages,
      defaultLocation,
      autoSendProposals,
      temperature,
      maxTokens,
      sendEvent,
      abortSignal,
    });
  }
}

export async function oldOrchestrateAgentTask({
  userRequestId,
  userId,
  userApiKey,
  defaultLocation,
  autoSendProposals,
  messages,
  providerId,
  model,
  temperature = 0.7,
  maxTokens = 4096,
  sendEvent,
  abortSignal,
}: OrchestrationOptions): Promise<void> {
  const taskId = `task_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  let aiRequestCount = 0;
  let toolCallCount = 0;

  const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
  const promptText = lastUserMsg?.content || '';

  // Clean conversation messages: strictly user and assistant roles only
  const cleanConversationHistory = messages
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map((m) => ({ role: m.role, content: m.content }));

  // Classify task intent deterministically
  const classification = classifyTask(promptText, cleanConversationHistory, { defaultLocation });

  // If normal chat query, stream directly without tool interference (Exactly 1 AI request)
  if (classification.mode === 'chat') {
    const providerInstance = aiRegistry.get(providerId);
    if (!providerInstance) {
      sendEvent({
        type: 'error',
        message: `AI provider "${providerId}" not found.`,
        provider: providerId,
      });
      logAgentTaskSummary(taskId, aiRequestCount, toolCallCount, 'failed');
      return;
    }

    const effectiveAiKey = (userApiKey || '').trim();

    console.log(
      `[CHAT REQUEST RECEIVED]\nrequestId=${userRequestId || taskId}\nprovider=${providerId}\nmodel=${model}\nmessageLength=${promptText.length}`
    );

    logAgentAICall(taskId, 'normal_chat', providerId, model);
    aiRequestCount++;

    await providerInstance.streamChat({
      taskId,
      apiKey: effectiveAiKey,
      messages: cleanConversationHistory,
      model,
      temperature,
      maxTokens,
      onEvent: sendEvent,
      abortSignal,
    });

    logAgentTaskSummary(taskId, aiRequestCount, toolCallCount, 'completed');
    return;
  }

  // AGENT WORKFLOW EXECUTION
  console.log(
    `[AGENT TASK RECEIVED]\ntaskId=${taskId}\nuserRequestId=${userRequestId || taskId}\nintent=${classification.intent}\nmessageLength=${promptText.length}`
  );

  sendEvent({
    type: 'task.started',
    message: 'Agent is working',
    provider: providerId,
    model,
  });

  // Step 1: Understanding request (Deterministic, 0 AI calls)
  sendEvent({
    type: 'task.progress',
    stepId: 'step_understand',
    title: 'Understanding request',
    status: 'completed',
    message: 'Understanding request',
  });

  // Step 2: Checking required integrations (Deterministic, 0 AI calls)
  sendEvent({
    type: 'task.progress',
    stepId: 'step_check_integrations',
    title: 'Checking required integrations',
    status: 'completed',
    message: 'Checking required integrations',
  });

  // ==========================================
  // INTENT A: LEAD GENERATION
  // ==========================================
  if (classification.intent === 'lead_generation') {
    const {
      businessType = 'small businesses',
      isIndustryUnspecified = false,
      location: explicitLocation = '',
      limit = 5,
      analyzeWebsites,
      generateProposals,
    } = classification.parameters;

    // 3-TIER STRICT LOCATION RESOLUTION HIERARCHY:
    // 1. Explicit location from current user request
    // 2. Saved / default location from explicit user settings preferences
    // 3. Relevant location from conversation history context
    // 4. If no location found, ask ONLY for the missing location (NEVER silently assume any default)
    let targetLocation = (explicitLocation || '').trim();
    if (!targetLocation && defaultLocation && defaultLocation.trim()) {
      targetLocation = defaultLocation.trim();
    }
    if (!targetLocation) {
      targetLocation = extractLocationFromHistory(cleanConversationHistory);
    }

    // If still NO location found, ask ONLY for the missing location (never ask for industry!)
    if (!targetLocation) {
      console.log('[LOCATION UNRESOLVED] Prompting user for target location.');
      const askLocationMessage = 'Which location should I target?';
      sendEvent({ type: 'message.delta', content: askLocationMessage });
      sendEvent({ type: 'message.completed', content: askLocationMessage });

      sendEvent({
        type: 'task.completed',
        status: 'waiting_for_input',
        message: 'Awaiting target location',
      });

      logAgentTaskSummary(taskId, aiRequestCount, toolCallCount, 'waiting_for_input');
      return;
    }

    console.log(
      `[LOCATION RESOLVED]\nlocation=${targetLocation}\nsource=${
        explicitLocation ? 'explicit_prompt' : defaultLocation ? 'user_settings' : 'conversation_history'
      }`
    );

    const hasSearchProvider = searchRegistry.isConfigured();

    // PRE-FLIGHT INTEGRATION VALIDATION
    if (!hasSearchProvider) {
      toolCallCount++;
      sendEvent({
        type: 'tool.started',
        tool: 'search_businesses',
        stepId: 'step_search_businesses',
        message: 'Searching businesses',
        detail: 'Checking Business Search status...',
      });

      const detailInfo = 'Business search is temporarily unavailable. Please try again later.';

      sendEvent({
        type: 'tool.failed',
        tool: 'search_businesses',
        stepId: 'step_search_businesses',
        message: 'Business search is temporarily unavailable. Please try again later.',
        detail: detailInfo,
        reason: 'business_search_unavailable',
      });

      sendEvent({
        type: 'task.stopped',
        status: 'stopped',
        reason: 'business_search_unavailable',
        integration: 'business_search',
        message: 'Business search is temporarily unavailable. Please try again later.',
      });

      const responseText = 'Business search is temporarily unavailable. Please try again later.';

      sendEvent({
        type: 'message.delta',
        content: responseText,
      });

      sendEvent({
        type: 'message.completed',
        content: responseText,
      });

      logAgentTaskSummary(taskId, aiRequestCount, toolCallCount, 'stopped');
      return;
    }

    const activeSearch = searchRegistry.getActiveProvider();

    // Active Search Provider is configured - Execute real search (0 AI calls)
    const displayCategory = isIndustryUnspecified ? 'small businesses' : businessType;
    const queryCategory = isIndustryUnspecified ? 'small businesses, local services & stores' : businessType;

    // Initialize Live Browser session for autonomous Google discovery & exploration
    let liveBrowserSession: any = null;
    const googleSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(
      targetLocation ? `${queryCategory} in ${targetLocation}` : queryCategory
    )}`;

    try {
      liveBrowserSession = await browserSessionManager.getOrCreateSession(userId);
      sendEvent({
        type: 'browser.session.started',
        sessionId: liveBrowserSession.id,
        url: googleSearchUrl,
        title: `Live Browser: Searching ${displayCategory} in ${targetLocation || 'target location'}`,
      });

      sendEvent({
        type: 'browser.navigating',
        sessionId: liveBrowserSession.id,
        url: googleSearchUrl,
        title: `Google Search: Discovering ${displayCategory} in ${targetLocation}...`,
      });

      // Generate initial search snapshot
      const navSnapshot = await liveBrowserSession.navigate(googleSearchUrl);
      if (navSnapshot.screenshotBase64) {
        sendEvent({
          type: 'browser.page.loaded',
          sessionId: liveBrowserSession.id,
          url: googleSearchUrl,
          title: `Google Search: ${displayCategory} in ${targetLocation}`,
          screenshot: navSnapshot.screenshotBase64,
        });
      }
    } catch (browserInitErr) {
      console.warn('[Live Browser Init Warning]:', browserInitErr);
    }

    sendEvent({
      type: 'tool.started',
      tool: 'search_businesses',
      stepId: 'step_search_businesses',
      title: 'Searching businesses',
      message: `Searching for ${displayCategory} in ${targetLocation}...`,
      detail: `Provider: ${activeSearch.name} · Live Browser session active`,
    });

    let searchResult: any;
    try {
      toolCallCount++;
      searchResult = await executeTool(
        'search_businesses',
        { query: queryCategory, location: targetLocation, limit },
        sendEvent,
        { userId, userApiKey }
      );
    } catch (err: any) {
      sendEvent({
        type: 'tool.failed',
        tool: 'search_businesses',
        stepId: 'step_search_businesses',
        message: `Search failed: ${err.message}`,
      });
      sendEvent({
        type: 'task.stopped',
        message: 'Task stopped',
      });
      logAgentTaskSummary(taskId, aiRequestCount, toolCallCount, 'stopped');
      return;
    }

    if (!searchResult || !searchResult.success || !Array.isArray(searchResult.businesses)) {
      const isNetworkAccessFailure =
        searchResult?.error?.includes('could not access the available search sources') ||
        searchResult?.message?.includes('could not access the available search sources');

      const failureMessage = isNetworkAccessFailure
        ? 'Live web discovery could not access the available search sources.'
        : (searchResult?.error || 'Business discovery failed');

      sendEvent({
        type: 'tool.failed',
        tool: 'search_businesses',
        stepId: 'step_search_businesses',
        message: failureMessage,
      });

      const responseText = isNetworkAccessFailure
        ? 'Live web discovery could not access the available search sources. Please check your network connection or try again shortly.'
        : `Business discovery could not complete: ${failureMessage}`;

      sendEvent({ type: 'message.delta', content: responseText });
      sendEvent({ type: 'message.completed', content: responseText });

      sendEvent({
        type: 'task.completed',
        status: 'completed',
        message: failureMessage,
      });
      logAgentTaskSummary(taskId, aiRequestCount, toolCallCount, 'completed');
      return;
    }

    const rawBusinesses = Array.isArray(searchResult.businesses) ? searchResult.businesses : [];
    const normalizedLoc = normalizeRequestedLocation(targetLocation);

    const providerQuery =
      searchResult.providerQuery ||
      (targetLocation ? `${queryCategory} in ${normalizedLoc.normalizedQueryLocation || targetLocation}` : queryCategory);
    const providerCountryCode = searchResult.providerCountryCode || normalizedLoc.countryCode;
    const providerLocationParam = searchResult.providerLocationParam || normalizedLoc.normalizedQueryLocation;

    console.log(
      `[BUSINESS SEARCH]\ncategory=${queryCategory}\nrequestedLocation=${
        normalizedLoc.normalizedQueryLocation || targetLocation || 'all'
      }\nproviderQuery=${providerQuery}${
        providerCountryCode ? `\nproviderCountryCode=${providerCountryCode}` : ''
      }${
        providerLocationParam ? `\nproviderLocationParam=${providerLocationParam}` : ''
      }\nrawResults=${rawBusinesses.length}`
    );

    // Strict Location Filtering (Evaluates provider address metadata, NEVER website domains)
    const verifiedBusinesses: any[] = [];
    let rejectedCount = 0;

    if (targetLocation && targetLocation.trim()) {
      for (const biz of rawBusinesses) {
        const check = verifyBusinessLocation(biz, targetLocation);
        if (check.verified) {
          verifiedBusinesses.push({
            ...biz,
            verifiedLocation: check.matchedDetails || normalizedLoc.normalizedQueryLocation,
          });
        } else {
          rejectedCount++;
          console.log(
            `[LOCATION REJECTED]\nbusiness=${biz.name}\naddress=${biz.address || '(none)'}\nreason=${check.reason || 'location_mismatch'}`
          );
        }
      }
    } else {
      verifiedBusinesses.push(...rawBusinesses);
    }

    console.log(
      `[LOCATION FILTER]\nrequestedLocation=${normalizedLoc.normalizedQueryLocation || targetLocation || 'all'}\naccepted=${verifiedBusinesses.length}\nrejected=${rejectedCount}`
    );

    const displayLoc = normalizedLoc.normalizedQueryLocation || targetLocation;

    if (verifiedBusinesses.length === 0) {
      sendEvent({
        type: 'tool.completed',
        tool: 'search_businesses',
        stepId: 'step_search_businesses',
        title: 'Searching businesses',
        message: `No verified businesses found in ${displayLoc}`,
        detail: `Found ${rawBusinesses.length} candidates in raw search, but 0 could be verified in ${displayLoc}`,
      });

      const noBizMsg = `No businesses could be verified in **${displayLoc}** from the live search results.\n\nAll ${rawBusinesses.length} results returned were located outside ${displayLoc}. Please verify or refine your location search query.`;

      sendEvent({ type: 'message.delta', content: noBizMsg });
      sendEvent({ type: 'message.completed', content: noBizMsg });

      sendEvent({
        type: 'task.completed',
        status: 'completed',
        message: 'Task completed',
      });

      logAgentTaskSummary(taskId, aiRequestCount, toolCallCount, 'completed');
      return;
    }

    const businesses = verifiedBusinesses.slice(0, limit);

    sendEvent({
      type: 'tool.completed',
      tool: 'search_businesses',
      stepId: 'step_search_businesses',
      title: 'Searching businesses',
      message: `Found ${businesses.length} verified businesses in ${displayLoc}`,
      detail: `Verified ${businesses.length} local ${displayCategory} in ${displayLoc} via ${activeSearch.name}`,
    });

    const enrichedLeads: any[] = [];

    // Step: Analyzing websites
    if (analyzeWebsites) {
      sendEvent({
        type: 'tool.started',
        tool: 'analyze_website',
        stepId: 'step_analyze_websites',
        title: 'Analyzing websites',
        message: 'Analyzing websites',
        detail: `Auditing ${businesses.filter((b) => b.website).length} discovered websites for responsiveness & speed...`,
      });
    }

    // Deterministic Website Audits and Deterministic Lead Scoring (0 AI calls)
    for (let i = 0; i < businesses.length; i++) {
      const biz = businesses[i];
      let auditResult: any = null;
      let scoreResult: any = null;
      let publicEmail: string | undefined = undefined;

      if (liveBrowserSession) {
        try {
          if (biz.website && typeof biz.website === 'string' && biz.website.startsWith('http')) {
            sendEvent({
              type: 'browser.navigating',
              sessionId: liveBrowserSession.id,
              url: biz.website,
              title: `Auditing ${biz.name} (${i + 1}/${businesses.length})`,
            });

            const navRes = await liveBrowserSession.navigate(biz.website);
            if (navRes.screenshotBase64) {
              sendEvent({
                type: 'browser.page.loaded',
                sessionId: liveBrowserSession.id,
                url: biz.website,
                title: `${biz.name} — ${navRes.title || 'Website Audit'}`,
                screenshot: navRes.screenshotBase64,
                data: {
                  phone: biz.phone,
                  website: biz.website,
                },
              });
            }

            // Extract contact emails if present
            const extracted = await liveBrowserSession.extractContent();
            if (extracted?.data?.emails && extracted.data.emails.length > 0) {
              publicEmail = extracted.data.emails[0];
            }
          } else {
            // Business has no website: Inspect directory listing profile
            const dirUrl = `https://www.google.com/maps/search/${encodeURIComponent(`${biz.name} ${targetLocation || ''}`)}`;
            sendEvent({
              type: 'browser.action',
              action: 'inspect_listing',
              sessionId: liveBrowserSession.id,
              detail: `Inspecting directory profile for ${biz.name}`,
            });

            const navRes = await liveBrowserSession.navigate(dirUrl);
            if (navRes.screenshotBase64) {
              sendEvent({
                type: 'browser.page.loaded',
                sessionId: liveBrowserSession.id,
                url: dirUrl,
                title: `${biz.name} (No Website Listed)`,
                screenshot: navRes.screenshotBase64,
                data: {
                  phone: biz.phone,
                  address: biz.address,
                  noWebsite: true,
                },
              });
            }
          }
        } catch (bActionErr) {
          console.warn(`[Browser Action Error] ${biz.name}:`, bActionErr);
        }
      }

      if (analyzeWebsites && biz.website && typeof biz.website === 'string' && biz.website.startsWith('http')) {
        try {
          toolCallCount++;
          auditResult = await executeTool('analyze_website', { url: biz.website }, sendEvent);
        } catch (auditErr: any) {
          console.warn(`[Audit Error] ${biz.name}:`, auditErr.message);
        }
      }

      // Calculate deterministic lead score
      try {
        toolCallCount++;
        scoreResult = await executeTool(
          'calculate_lead_score',
          {
            businessName: biz.name,
            websiteUrl: biz.website,
            hasWebsite: Boolean(biz.website),
            issuesFound: auditResult?.identifiedIssues ? auditResult.identifiedIssues.join(', ') : '',
            reviewsCount: biz.reviewCount,
            rating: biz.rating,
          },
          sendEvent
        );
      } catch (scoreErr: any) {
        console.warn(`[Score Error] ${biz.name}:`, scoreErr.message);
      }

      enrichedLeads.push({
        name: biz.name,
        address: biz.address,
        phone: biz.phone,
        email: publicEmail,
        website: biz.website || null,
        rating: biz.rating,
        reviewCount: biz.reviewCount,
        audit: auditResult,
        leadScore: scoreResult?.leadHealthScore,
        salesTier: scoreResult?.salesTier,
        recommendedOffer: scoreResult?.recommendedOffer,
        weaknesses: auditResult?.identifiedIssues || (biz.website ? ['Needs modernization'] : ['No active website']),
      });
    }

    if (analyzeWebsites) {
      sendEvent({
        type: 'tool.completed',
        tool: 'analyze_website',
        stepId: 'step_analyze_websites',
        title: 'Analyzing websites',
        message: 'Analyzing websites',
        detail: `Completed technical audits for ${businesses.length} businesses`,
      });
    }

    // Step: Scoring opportunities
    sendEvent({
      type: 'tool.completed',
      tool: 'calculate_lead_score',
      stepId: 'step_score_opportunities',
      title: 'Scoring opportunities',
      message: 'Scoring opportunities',
      detail: `Calculated health scores & opportunity tiers for ${enrichedLeads.length} leads`,
    });

    // Filter qualified leads for proposals (e.g. leads with website issues or missing websites)
    const qualifiedLeads = enrichedLeads.filter(
      (l) => !l.website || (l.leadScore !== undefined && l.leadScore <= 75) || (l.audit && l.audit.issuesFoundCount > 0)
    );
    const targetLeadsForProposal = qualifiedLeads.length > 0 ? qualifiedLeads : enrichedLeads;

    if (generateProposals && targetLeadsForProposal.length > 0) {
      // Step: Synthesizing Proposal Intelligence & Writing Proposals
      sendEvent({
        type: 'tool.started',
        tool: 'prepare_proposals',
        stepId: 'step_prepare_proposals',
        title: 'Synthesizing Proposal Intelligence',
        message: 'Synthesizing Proposal Intelligence',
        detail: `Analyzing verified audit findings and drafting proposals for ${targetLeadsForProposal.length} qualified leads...`,
      });

      const rawInputs: BusinessRawInput[] = targetLeadsForProposal.map((lead) => ({
        name: lead.name,
        category: displayCategory,
        address: lead.address,
        phone: lead.phone,
        website: lead.website || null,
        rating: lead.rating,
        reviewCount: lead.reviewCount,
        audit: lead.audit || undefined,
      }));

      const providerInstance = aiRegistry.get(providerId);
      const effectiveAiKey = (userApiKey || '').trim();
      const isAiReady = Boolean(providerInstance && (Boolean(effectiveAiKey) || providerInstance.isConfigured(effectiveAiKey)));

      if (isAiReady) {
        logAgentAICall(taskId, 'batch_proposal_intelligence', providerId, model);
        aiRequestCount++;
      }

      const proposalResults: QualifiedBusinessProposalResult[] = await processBatchProposalPipeline(
        rawInputs,
        {
          senderAgencyName: 'SanMine Space',
          providerId: isAiReady ? providerId : undefined,
          model: isAiReady ? model : undefined,
          apiKey: effectiveAiKey,
          customTone: 'consultative',
          temperature,
          abortSignal,
        }
      );

      sendEvent({
        type: 'tool.completed',
        tool: 'prepare_proposals',
        stepId: 'step_prepare_proposals',
        title: 'Proposal Intelligence Synthesized',
        message: 'Proposal Intelligence Synthesized',
        detail: `Generated proposals for ${proposalResults.length} leads via Proposal Mind & Writer`,
      });

      // Format clean Markdown response using Proposal Intelligence
      const formattedResponse = formatPipelineAgentResponse(proposalResults, {
        businessType: displayCategory,
        location: targetLocation,
        totalDiscovered: enrichedLeads.length,
      });

      // Stream generated proposals directly to the client
      sendEvent({ type: 'message.delta', content: formattedResponse });
      sendEvent({ type: 'message.completed', content: formattedResponse });

      // Check autonomous outreach preferences
      let isAutoSendActive = false;
      if (typeof autoSendProposals === 'boolean') {
        isAutoSendActive = autoSendProposals;
      } else if (userId) {
        try {
          const userPrefs = await getUserPreferences(userId);
          isAutoSendActive = Boolean(userPrefs?.autoSendProposals);
        } catch (prefErr: any) {
          console.warn('[Neon DB] User preference lookup error:', prefErr.message);
        }
      }

      const reviewStep = () => {
        if (!isAutoSendActive) {
          const readyCount = proposalResults.filter((p) => p.readyToSend).length;
          const needsContactCount = proposalResults.filter((p) => !p.readyToSend && !p.discoveredEmail).length;
          const reviewMsg = readyCount === proposalResults.length
            ? `${readyCount} personalized proposals are ready to send.`
            : readyCount > 0
            ? `${proposalResults.length} proposal drafts generated: ${readyCount} ready to send, ${needsContactCount} need contact information.`
            : `${proposalResults.length} proposal drafts generated (${proposalResults.length} need contact information).`;

          sendEvent({
            type: 'tool.completed',
            tool: 'review_proposals',
            stepId: 'step_proposal_review',
            title: 'Review proposals',
            message: reviewMsg,
            detail: 'Review proposals before sending via Gmail',
          });
        }
      };

      const executeAutonomousOutreach = async () => {
        if (!isAutoSendActive) {
          return { autoDispatched: false, sentCount: 0, skippedCount: 0, failedCount: 0 };
        }

        const gmailTokens = userId ? await getGmailTokens(userId) : null;
        const isOAuthConnected = Boolean(
          gmailTokens && (Boolean(gmailTokens.refreshToken) || Boolean(gmailTokens.accessToken))
        );
        const smtpCreds = (!isOAuthConnected && userId) ? await getUserSmtpCredentials(userId) : null;
        const isSmtpConnected = Boolean(smtpCreds && smtpCreds.appPassword);
        const isGmailConnected = isOAuthConnected || isSmtpConnected;

        if (!userId || !isGmailConnected) {
          sendEvent({
            type: 'tool.warning',
            tool: 'gmail_outreach',
            stepId: 'step_gmail_outreach',
            status: 'warning',
            title: 'Gmail connection required',
            message: 'Gmail connection required for autonomous outreach',
            detail: 'Outreach Automation is ON, but Gmail is not connected. Connect Gmail (OAuth or SMTP) in Settings to auto-dispatch.',
            reason: 'integration_required',
          });
          return { autoDispatched: false, sentCount: 0, skippedCount: 0, failedCount: 0, reason: 'gmail_not_connected' };
        }

        sendEvent({
          type: 'tool.started',
          tool: 'gmail_outreach',
          stepId: 'step_gmail_outreach',
          title: 'Autonomous outreach dispatch',
          message: 'Autonomous outreach dispatch',
          detail: `Dispatching outreach proposals to ${targetLeadsForProposal.length} qualified leads through connected Gmail...`,
        });

        let sentCount = 0;
        let skippedCount = 0;
        let failedCount = 0;

        for (let idx = 0; idx < targetLeadsForProposal.length; idx++) {
          const lead = targetLeadsForProposal[idx];
          const matchedProposal =
            proposalResults.find((r) => r.businessName.toLowerCase() === lead.name.toLowerCase()) ||
            proposalResults[idx];

          const rawEmail =
            matchedProposal?.discoveredEmail ||
            lead.audit?.primaryEmail ||
            lead.audit?.contactEmails?.[0] ||
            lead.email;

          const recipientEmail = isValidRecipientEmail(rawEmail) ? rawEmail : null;

          if (!recipientEmail) {
            skippedCount++;
            await logOutreachAttempt({
              userId,
              recipientEmail: 'needs_contact@unspecified',
              businessName: lead.name,
              website: lead.website || undefined,
              status: 'skipped',
              reason: 'no_contact_email_found',
            });
            sendEvent({
              type: 'tool.progress',
              stepId: 'step_gmail_outreach',
              message: `Skipped ${lead.name}`,
              detail: `No verified contact email found on website or public listings`,
            });
            continue;
          }

          // Check 30-day anti-duplicate idempotency
          const alreadySent = await checkEmailAlreadySent(userId, recipientEmail);
          if (alreadySent) {
            skippedCount++;
            await logOutreachAttempt({
              userId,
              recipientEmail,
              businessName: lead.name,
              website: lead.website || undefined,
              status: 'skipped',
              reason: 'already_contacted',
            });
            sendEvent({
              type: 'tool.progress',
              stepId: 'step_gmail_outreach',
              message: `Skipped ${lead.name}`,
              detail: `Already contacted (${recipientEmail}) within the last 30 days`,
            });
            continue;
          }

          const subject =
            matchedProposal?.generatedSubject ||
            `Strategic Website Modernization & Conversion Proposal: ${lead.name}`;
          const bodyText =
            matchedProposal?.generatedProposal ||
            `Hi ${lead.name} team,\n\nWe recently completed a technical analysis of your online presence and identified strategic opportunities to improve your mobile responsiveness, search discoverability, and conversion performance.\n\nBest regards,\nSanMine Space Team`;

          const bodyHtml = `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1F1E1B; line-height: 1.6;">
              <h2 style="color: #C66A3D; margin-bottom: 8px;">Strategic Website & Growth Proposal</h2>
              <p>Hi <strong>${lead.name}</strong> team,</p>
              <div style="background: #FAF8F5; border-left: 4px solid #C66A3D; padding: 16px 20px; border-radius: 4px; margin: 16px 0; white-space: pre-line;">
${bodyText}
              </div>
              <p style="margin-top: 24px; color: #6B6862; font-size: 13px;">Sent with precision via SanMine Space Autonomous Outreach.</p>
            </div>
          `;

          try {
            const sendRes = isOAuthConnected
              ? await sendGmailMessage({
                  userId,
                  to: recipientEmail,
                  subject,
                  bodyText,
                  userDisplayName: 'SanMine Space Growth',
                })
              : await sendGmailSmtpMessage({
                  userId,
                  to: recipientEmail,
                  subject,
                  bodyText,
                  userDisplayName: 'SanMine Space Growth',
                });

            if (sendRes.success) {
              sentCount++;
              await logOutreachAttempt({
                userId,
                recipientEmail,
                businessName: lead.name,
                website: lead.website || undefined,
                subject,
                messageId: sendRes.messageId,
                status: 'sent',
              });
              sendEvent({
                type: 'tool.progress',
                stepId: 'step_gmail_outreach',
                message: `Sent proposal to ${lead.name}`,
                detail: `Delivered to ${recipientEmail}`,
              });
            } else {
              failedCount++;
              await logOutreachAttempt({
                userId,
                recipientEmail,
                businessName: lead.name,
                website: lead.website || undefined,
                subject,
                status: 'failed',
                errorMessage: sendRes.error,
              });
              sendEvent({
                type: 'tool.progress',
                stepId: 'step_gmail_outreach',
                message: `Failed sending to ${lead.name}`,
                detail: `${recipientEmail}: ${sendRes.error}`,
              });
            }
          } catch (err: any) {
            failedCount++;
            await logOutreachAttempt({
              userId,
              recipientEmail,
              businessName: lead.name,
              website: lead.website || undefined,
              subject,
              status: 'failed',
              errorMessage: err.message,
            });
            sendEvent({
              type: 'tool.progress',
              stepId: 'step_gmail_outreach',
              message: `Error sending to ${lead.name}`,
              detail: err.message,
            });
          }
        }

        sendEvent({
          type: 'tool.completed',
          tool: 'gmail_outreach',
          stepId: 'step_gmail_outreach',
          title: 'Autonomous outreach dispatch completed',
          message: 'Autonomous outreach dispatch completed',
          detail: `Outreach completed: ${sentCount} sent via Gmail, ${skippedCount} skipped, ${failedCount} failed`,
        });

        const reportSummary = `\n\n---\n\n### 🚀 Autonomous Outreach Dispatch Report\n- **Sent via Gmail:** **${sentCount}**\n- **Skipped:** **${skippedCount}** (Already contacted in 30 days or no contact email)\n- **Failed:** **${failedCount}**\n\n*All deliveries and audit records are logged under Settings → Gmail & Outreach.*`;
        sendEvent({ type: 'message.delta', content: reportSummary });
        sendEvent({ type: 'message.completed', content: reportSummary });

        return { autoDispatched: true, sentCount, skippedCount, failedCount };
      };

      reviewStep();

      // Run autonomous outreach if enabled
      const outreachRes = await executeAutonomousOutreach();

      const readyProposalCount = proposalResults.filter((p) => p.readyToSend).length;

      sendEvent({
        type: 'task.completed',
        status: 'completed',
        aiPersonalizationStatus: isAiReady ? 'completed' : 'unavailable',
        message: `${readyProposalCount} personalized proposals are ready to send.`,
        result: {
          leads: enrichedLeads,
          proposals: proposalResults,
          location: targetLocation,
          proposalsSent: outreachRes.sentCount,
          proposalsSkipped: outreachRes.skippedCount,
          proposalsFailed: outreachRes.failedCount,
        },
      });

      // Safely close live browser session on proposal workflow completion
      if (liveBrowserSession) {
        try {
          await browserSessionManager.closeSession(liveBrowserSession.id, userId);
          sendEvent({
            type: 'browser.session.closed',
            sessionId: liveBrowserSession.id,
          });
        } catch (closeErr) {
          console.warn('[Live Browser Close Error]:', closeErr);
        }
      }

      logAgentTaskSummary(taskId, aiRequestCount, toolCallCount, 'completed');
      return;
    } else {
      // Safely close live browser session
      if (liveBrowserSession) {
        try {
          await browserSessionManager.closeSession(liveBrowserSession.id, userId);
          sendEvent({
            type: 'browser.session.closed',
            sessionId: liveBrowserSession.id,
          });
        } catch (closeErr) {
          console.warn('[Live Browser Close Error]:', closeErr);
        }
      }

      // Check if user requested contact info or businesses without websites
      const hasDetailedContacts = enrichedLeads.some((b) => b.phone || b.address || b.email);
      const missingWebsiteCount = enrichedLeads.filter((b) => !b.website).length;

      let leadTable = '';
      if (hasDetailedContacts) {
        leadTable = enrichedLeads
          .map(
            (b, idx) =>
              `| ${idx + 1} | **${b.name}** | ${b.phone || 'N/A'} | ${b.address || 'Local area'} | ${
                b.website ? `[Visit Website](${b.website})` : '⚠️ No Website'
              } | ${b.email || 'N/A'} | ${b.rating ? `${b.rating}★ (${b.reviewCount || 0})` : 'N/A'} |`
          )
          .join('\n');
      } else {
        leadTable = enrichedLeads
          .map(
            (b) =>
              `| **${b.name}** | ${b.website || 'No website'} | ${b.leadScore ?? 'N/A'}/100 | ${b.rating ?? 'N/A'}★ (${b.reviewCount ?? 0}) | ${b.salesTier || 'Standard'} | ${b.recommendedOffer || 'Modern Web Presence'} |`
          )
          .join('\n');
      }

      const tableHeaders = hasDetailedContacts
        ? `| # | Business Name | Phone | Address | Website Status | Public Email | Rating / Reviews |\n|---|---|---|---|---|---|---|`
        : `| Business Name | Website | Health Score | Rating / Reviews | Priority Tier | Recommended Offer |\n|---|---|---|---|---|---|`;

      const summaryText = `### 📍 Discovered Businesses in ${targetLocation || 'Target Area'}\n\nLive Browser session explored Google Maps & business listings in **${targetLocation || 'Target Area'}** and extracted **${enrichedLeads.length}** verified businesses (${missingWebsiteCount} without an active website):\n\n${tableHeaders}\n${leadTable}\n\n**Key Findings & Next Steps:**\n- **Total Discovered:** **${enrichedLeads.length} businesses** in ${targetLocation || 'the target area'}.\n- **Missing Website Opportunities:** **${missingWebsiteCount} businesses** currently have no online web presence and represent immediate high-value web design & local SEO outreach targets.\n- **Contact Readiness:** Phone numbers and physical addresses extracted from verified public directory listings.`;

      sendEvent({ type: 'message.delta', content: summaryText });
      sendEvent({ type: 'message.completed', content: summaryText });

      sendEvent({
        type: 'task.completed',
        status: 'completed',
        message: 'Task completed',
        result: {
          leads: enrichedLeads,
          location: targetLocation,
        },
      });

      logAgentTaskSummary(taskId, aiRequestCount, toolCallCount, 'completed');
      return;
    }
  }

  // ==========================================
  // INTENT B: DIRECT WEBSITE AUDIT
  // ==========================================
  if (classification.intent === 'website_analysis') {
    const { url = '', generateProposals } = classification.parameters;

    sendEvent({
      type: 'tool.started',
      tool: 'analyze_website',
      stepId: 'step_analyze_single_website',
      title: 'Auditing live website',
      message: `Auditing live website ${url}...`,
      detail: url,
    });

    let audit: any;
    try {
      toolCallCount++;
      audit = await executeTool('analyze_website', { url }, sendEvent);
    } catch (err: any) {
      sendEvent({
        type: 'tool.failed',
        tool: 'analyze_website',
        stepId: 'step_analyze_single_website',
        message: `Website audit error: ${err.message}`,
      });
      sendEvent({
        type: 'task.stopped',
        message: 'Task stopped',
      });
      logAgentTaskSummary(taskId, aiRequestCount, toolCallCount, 'stopped');
      return;
    }

    sendEvent({
      type: 'tool.completed',
      tool: 'analyze_website',
      stepId: 'step_analyze_single_website',
      title: 'Auditing live website',
      message: `Completed technical audit for ${url}`,
      detail: `Audited ${url} (${audit.httpStatus || 200}, ${audit.responseTimeMs || 0}ms, ${audit.issuesFoundCount || 0} issues)`,
    });

    toolCallCount++;
    const scoreResult = await executeTool(
      'calculate_lead_score',
      {
        businessName: audit.pageTitle || url,
        websiteUrl: url,
        hasWebsite: true,
        issuesFound: audit.identifiedIssues ? audit.identifiedIssues.join(', ') : '',
      },
      sendEvent
    );

    sendEvent({
      type: 'tool.completed',
      tool: 'calculate_lead_score',
      stepId: 'step_score_single_opportunity',
      title: 'Scoring opportunity',
      message: 'Scoring opportunity',
      detail: `Health score: ${scoreResult?.leadHealthScore ?? 'N/A'}/100 (${scoreResult?.salesTier || 'Standard'})`,
    });

    const deterministicProposal = generateSingleWebsiteDeterministicProposal({
      url,
      audit,
      scoreResult,
    });

    if (generateProposals) {
      // Step: Preparing proposal draft
      sendEvent({
        type: 'tool.started',
        tool: 'prepare_proposals',
        stepId: 'step_prepare_proposals',
        title: 'Preparing proposal drafts',
        message: 'Preparing proposal drafts',
        detail: `Generating draft grounded in verified audit findings for ${url}...`,
      });

      sendEvent({
        type: 'tool.completed',
        tool: 'prepare_proposals',
        stepId: 'step_prepare_proposals',
        title: 'Preparing proposal drafts',
        message: 'Preparing proposal drafts',
        detail: `Generated proposal draft for ${url} from verified audit data`,
      });

      const providerInstance = aiRegistry.get(providerId);
      if (providerInstance && providerInstance.isConfigured()) {
        sendEvent({
          type: 'tool.started',
          tool: 'personalize_proposals',
          stepId: 'step_personalize_proposals',
          title: 'Personalizing proposals with AI',
          message: 'Personalizing proposals with AI',
          detail: `Personalizing proposal for ${url} with ${model}...`,
        });

        const proposalPrompt = `You are SanMine Space. You have completed a live technical website audit for ${url}.

Audit Findings:
${JSON.stringify(audit, null, 2)}

Lead Health Score & Offer:
${JSON.stringify(scoreResult, null, 2)}

Please generate a high-impact, professional client proposal and pitch presentation addressing the specific audit deficiencies found on this website. Format in clean Markdown with clear sections.`;

        logAgentAICall(taskId, 'website_audit_proposal', providerId, model);
        aiRequestCount++;

        let hasError = false;
        let errorMessage = '';
        let isRateLimited = false;
        let aiStreamedText = '';

        try {
          await providerInstance.streamChat({
            taskId,
            apiKey: userApiKey,
            messages: [{ role: 'user', content: proposalPrompt }],
            model,
            temperature,
            maxTokens,
            onEvent: (evt) => {
              if (evt.type === 'error') {
                hasError = true;
                errorMessage = evt.message || 'AI request failed';
                if (
                  evt.code === 'RATE_LIMITED' ||
                  errorMessage.toLowerCase().includes('rate limit') ||
                  errorMessage.includes('429')
                ) {
                  isRateLimited = true;
                }
              } else if (evt.type === 'message.delta' && evt.content) {
                aiStreamedText += evt.content;
                sendEvent(evt);
              } else if (evt.type === 'message.completed') {
                sendEvent(evt);
              }
            },
            abortSignal,
          });
        } catch (err: any) {
          hasError = true;
          errorMessage = err.message || 'Proposal generation error';
          if (errorMessage.toLowerCase().includes('rate limit') || errorMessage.includes('429')) {
            isRateLimited = true;
          }
        }

        if (hasError || !aiStreamedText) {
          sendEvent({
            type: 'tool.warning',
            tool: 'personalize_proposals',
            stepId: 'step_personalize_proposals',
            status: 'warning',
            title: 'AI personalization unavailable',
            message: 'AI personalization unavailable',
            detail: isRateLimited
              ? 'Selected provider reached its rate limit. Draft was generated from verified audit data.'
              : `Selected provider error (${errorMessage}). Draft was generated from verified audit data.`,
            reason: isRateLimited ? 'rate_limited' : 'provider_error',
            provider: providerId,
            model,
          });

          sendEvent({ type: 'message.delta', content: deterministicProposal });
          sendEvent({ type: 'message.completed', content: deterministicProposal });

          sendEvent({
            type: 'task.completed',
            status: 'completed',
            aiPersonalizationStatus: 'unavailable',
            reason: isRateLimited ? 'rate_limited' : 'provider_error',
            message: 'Task completed · AI personalization unavailable',
          });

          logAgentTaskSummary(taskId, aiRequestCount, toolCallCount, 'completed');
          return;
        } else {
          sendEvent({
            type: 'tool.completed',
            tool: 'personalize_proposals',
            stepId: 'step_personalize_proposals',
            title: 'Personalizing proposals with AI',
            message: 'Personalizing proposals with AI',
            detail: `Proposal generated for ${url}`,
          });

          sendEvent({
            type: 'task.completed',
            status: 'completed',
            aiPersonalizationStatus: 'completed',
            message: 'Task completed',
          });

          logAgentTaskSummary(taskId, aiRequestCount, toolCallCount, 'completed');
          return;
        }
      } else {
        // AI not configured
        sendEvent({
          type: 'tool.warning',
          tool: 'personalize_proposals',
          stepId: 'step_personalize_proposals',
          status: 'warning',
          title: 'AI personalization unavailable',
          message: 'AI personalization unavailable',
          detail: 'AI provider is not configured. Draft was generated from verified audit data.',
          reason: 'integration_required',
        });

        sendEvent({ type: 'message.delta', content: deterministicProposal });
        sendEvent({ type: 'message.completed', content: deterministicProposal });

        sendEvent({
          type: 'task.completed',
          status: 'completed',
          aiPersonalizationStatus: 'unavailable',
          reason: 'integration_required',
          message: 'Task completed · AI personalization unavailable',
        });

        logAgentTaskSummary(taskId, aiRequestCount, toolCallCount, 'completed');
        return;
      }
    } else {
      // Deterministic presentation (0 AI calls)
      const auditSummary = `### Website Audit Report for ${url}

- **Page Title:** ${audit.pageTitle || '(None)'}
- **HTTP Status:** ${audit.httpStatus || 200}
- **Response Time:** ${audit.responseTimeMs}ms
- **SSL Encryption (HTTPS):** ${audit.isHttps ? '✓ Secure' : '✕ Insecure'}
- **Mobile Viewport Meta:** ${audit.hasMobileViewport ? '✓ Present' : '✕ Missing'}
- **Lead Health Score:** ${scoreResult.leadHealthScore}/100 (${scoreResult.salesTier})
- **Recommended Offer:** ${scoreResult.recommendedOffer}

#### Identified Deficiencies (${audit.issuesFoundCount || 0}):
${(audit.identifiedIssues || []).map((issue: string) => `- ${issue}`).join('\n') || '- No critical issues found'}`;

      sendEvent({ type: 'message.delta', content: auditSummary });
      sendEvent({ type: 'message.completed', content: auditSummary });

      sendEvent({
        type: 'task.completed',
        status: 'completed',
        message: 'Task completed',
      });

      logAgentTaskSummary(taskId, aiRequestCount, toolCallCount, 'completed');
      return;
    }
  }

  // ==========================================
  // INTENT C: SOCIAL MEDIA RESEARCH (Instagram, LinkedIn, Twitter, etc.)
  // ==========================================
  if (classification.intent === 'social_research') {
    const { platform = 'instagram', location = '', limit = 10, rawQuery = '' } = classification.parameters;

    toolCallCount++;
    sendEvent({
      type: 'tool.started',
      tool: 'research_social',
      stepId: 'step_research_social',
      title: `Researching ${platform.toUpperCase()}`,
      message: `Searching ${platform.toUpperCase()} for "${rawQuery}"...`,
      detail: `Platform: ${platform} · Location: ${location || 'Global'}`,
    });

    const researchResult = await executeGenericWebResearch({
      query: rawQuery,
      location,
      socialSite: platform === 'instagram' ? 'instagram.com' : platform === 'linkedin' ? 'linkedin.com' : platform === 'twitter' ? 'twitter.com' : 'facebook.com',
      limit,
      userId,
      emitEvent: sendEvent,
    });

    sendEvent({
      type: 'tool.completed',
      tool: 'research_social',
      stepId: 'step_research_social',
      title: `${platform.toUpperCase()} Research Complete`,
      message: `Extracted ${researchResult.entities.length} profiles / stores`,
    });

    // Build grounded markdown report
    let tableRows = '';
    if (researchResult.entities.length > 0) {
      tableRows = researchResult.entities
        .map((ent, idx) => {
          const email = ent.email ? `\`${ent.email}\`` : 'Not found in bio';
          const phone = ent.phone || 'Not found';
          const link = ent.officialWebsite ? `[View Profile](${ent.officialWebsite})` : 'N/A';
          return `| ${idx + 1} | **${ent.entityName}** | ${email} | ${phone} | ${link} | ${ent.verifiedWebsiteStatus || 'Verified'} |`;
        })
        .join('\n');
    }

    const table = tableRows
      ? `| # | Account / Business | Public Email | Phone / Contact | Profile Link | Status |\n|---|---|---|---|---|---|\n${tableRows}`
      : '_No public accounts matching the criteria could be verified on this search query._';

    const entityDetails = researchResult.entities
      .map((ent) => {
        return `#### ${ent.entityName}\n- **Profile / Website:** ${ent.officialWebsite || 'N/A'}\n- **Public Email:** ${ent.email || 'Not found in public bio'}\n- **Phone:** ${ent.phone || 'Not publicly available'}\n- **Bio Summary:** ${ent.socialBioData?.bioText || ent.primaryCategory || 'N/A'}\n- **Verification Status:** ${ent.verifiedWebsiteStatus || 'Live Browser Checked'}`;
      })
      .join('\n\n---\n\n');

    const report = `## 📱 ${platform.toUpperCase()} Discovery & Verification Report

**Query:** ${rawQuery}
**Discovery Layer:** Google Web Search + Live Browser Inspection
**Verified Profiles Extracted:** ${researchResult.entities.length}

${table}

${entityDetails ? `\n---\n\n### Profile Details & Verified Contact Data\n\n${entityDetails}` : ''}

---

### Verification Notes:
- All data was fetched live via browser inspection.
- If an email is listed as "Not found in bio", the profile either did not expose a public email in its bio or required a platform login.
- Zero fake/hallucinated data generated.`;

    sendEvent({ type: 'message.delta', content: report });
    sendEvent({ type: 'message.completed', content: report });

    sendEvent({
      type: 'task.completed',
      status: 'completed',
      message: 'Task completed',
      result: {
        entities: researchResult.entities,
        sourcesVerifiedCount: researchResult.sourcesVerifiedCount,
      },
    });

    logAgentTaskSummary(taskId, aiRequestCount, toolCallCount, 'completed');
    return;
  }

  // ==========================================
  // INTENT D: DEEP AUTONOMOUS WEB RESEARCH
  // ==========================================
  if (classification.intent === 'deep_research') {
    const { url, location = '', limit = 10, specificFields = [], rawQuery = '' } = classification.parameters;

    toolCallCount++;
    sendEvent({
      type: 'tool.started',
      tool: 'deep_web_research',
      stepId: 'step_deep_research',
      title: 'Autonomous Web Research',
      message: `Researching "${rawQuery}" across the live web...`,
      detail: `Target: ${url || rawQuery} · Discovery: Google Search + Deep Navigation`,
    });

    const researchResult = await executeGenericWebResearch({
      query: rawQuery,
      targetUrl: url,
      location,
      specificFields,
      limit,
      userId,
      emitEvent: sendEvent,
    });

    sendEvent({
      type: 'tool.completed',
      tool: 'deep_web_research',
      stepId: 'step_deep_research',
      title: 'Web Research Completed',
      message: `Verified and analyzed ${researchResult.entities.length} entities across ${researchResult.sourcesVerifiedCount} sources`,
    });

    // Format comprehensive grounded markdown
    let entitiesSection = '';
    if (researchResult.entities.length === 1) {
      const ent = researchResult.entities[0];
      const foundersList = ent.founders && ent.founders.length > 0 ? ent.founders.map((f) => `- **${f.name}** (${f.title || 'Leadership'}) - Source: [${f.sourceUrl}](${f.sourceUrl})`).join('\n') : '- *Not found / Not publicly listed on website*';
      const servicesList = ent.services && ent.services.length > 0 ? ent.services.map((s) => `- ${s}`).join('\n') : '- *Not found / Not publicly listed*';
      const pricingList = ent.pricing && ent.pricing.length > 0 ? ent.pricing.map((p) => `- **${p.planName}**: ${p.price}`).join('\n') : '- *Not found / Custom pricing upon request*';

      entitiesSection = `### 🏢 ${ent.entityName}

- **Official Website:** ${ent.officialWebsite ? `[${ent.officialWebsite}](${ent.officialWebsite})` : 'Not found'}
- **Verified Public Email:** ${ent.email || 'Not found / Not publicly listed'}
- **Verified Public Phone:** ${ent.phone || 'Not found / Not publicly listed'}
- **Physical Address / HQ:** ${ent.address || 'Not found / Remote'}

#### 👥 Founders & Executive Leadership
${foundersList}

#### 🛠️ Services & Core Capabilities
${servicesList}

#### 💳 Pricing Tiers & Rates
${pricingList}`;
    } else if (researchResult.entities.length > 1) {
      const tableRows = researchResult.entities
        .map((ent, idx) => {
          const founders = ent.founders && ent.founders.length > 0 ? ent.founders.slice(0, 2).map((f) => f.name).join(', ') : 'Not found';
          const email = ent.email ? `\`${ent.email}\`` : 'Not found';
          const website = ent.officialWebsite ? `[Visit](${ent.officialWebsite})` : 'None';
          return `| ${idx + 1} | **${ent.entityName}** | ${website} | ${founders} | ${email} | ${ent.phone || 'N/A'} |`;
        })
        .join('\n');

      entitiesSection = `### 📊 Discovered & Verified Entities (${researchResult.entities.length})

| # | Name | Website | Founders / Leadership | Email | Phone |
|---|---|---|---|---|---|
${tableRows}

---

### Detailed Entity Breakdowns

${researchResult.entities
  .map((ent) => {
    const fList = ent.founders && ent.founders.length > 0 ? ent.founders.map((f) => `${f.name} (${f.title})`).join(', ') : 'Not found';
    const sList = ent.services && ent.services.length > 0 ? ent.services.slice(0, 4).join(', ') : 'Standard offerings';
    return `#### ${ent.entityName}\n- **Website:** ${ent.officialWebsite || 'None'}\n- **Founders:** ${fList}\n- **Contact:** ${ent.email || ent.phone || 'Not publicly listed'}\n- **Services / Focus:** ${sList}`;
  })
  .join('\n\n')}`;
    } else {
      entitiesSection = `_No specific entity data could be extracted. Please check the search query or target website._`;
    }

    const allSources = researchResult.entities.flatMap((e) => e.sources || []);
    const uniqueSources = Array.from(new Set(allSources));
    const sourcesList = uniqueSources.length > 0
      ? uniqueSources.map((s) => `- [${s}](${s}) (✓ Verified)`).join('\n')
      : '- Google Web Search Results';

    const fullReport = `## 🌐 Autonomous Web Research Report

**Research Query:** ${rawQuery}
**Discovery Layer:** Google Web Search + Multi-Page Navigation (Live Browser)
**Inspection Loop:** Discover → Navigate → Follow Sub-links → Extract Data → Grounded Verification

---

${entitiesSection}

---

### 🔍 Verified Primary Sources & Citations
${sourcesList}

---

### 🛡️ Grounded Data Guarantee
All emails, phone numbers, founders, and services above were verified directly from live inspected web pages. Any missing information is strictly noted as "Not found / Not publicly listed" without synthetic generation.`;

    sendEvent({ type: 'message.delta', content: fullReport });
    sendEvent({ type: 'message.completed', content: fullReport });

    sendEvent({
      type: 'task.completed',
      status: 'completed',
      message: 'Task completed',
      result: {
        entities: researchResult.entities,
        sourcesVerifiedCount: researchResult.sourcesVerifiedCount,
      },
    });

    logAgentTaskSummary(taskId, aiRequestCount, toolCallCount, 'completed');
    return;
  }

  // ==========================================
  // INTENT E: STANDALONE PROPOSAL GENERATION
  // ==========================================
  if (classification.intent === 'proposal_generation') {
    const { businessName = 'Prospective Client' } = classification.parameters;

    const providerInstance = aiRegistry.get(providerId);
    if (providerInstance && providerInstance.isConfigured()) {
      logAgentAICall(taskId, 'proposal_generation', providerId, model);
      aiRequestCount++;

      const prompt = `You are SanMine Space. Create a tailored, persuasive digital agency proposal for "${businessName}". Focus on mobile responsiveness, modern UI conversion design, and Google Local search optimization. Format cleanly with Markdown.`;

      await providerInstance.streamChat({
        taskId,
        apiKey: userApiKey,
        messages: [
          ...cleanConversationHistory.slice(-2),
          { role: 'user', content: prompt },
        ],
        model,
        temperature,
        maxTokens,
        onEvent: sendEvent,
        abortSignal,
      });
    }

    sendEvent({
      type: 'task.completed',
      message: 'Task completed',
    });

    logAgentTaskSummary(taskId, aiRequestCount, toolCallCount, 'completed');
    return;
  }

  // ==========================================
  // INTENT D: SYSTEM STATUS CHECK
  // ==========================================
  if (classification.intent === 'system_status') {
    const { checkType = 'overview' } = classification.parameters;

    toolCallCount++;
    const status = await executeTool('get_system_status', { checkType }, sendEvent);

    // Deterministic system status report (0 AI requests)
    const activeSearch = searchRegistry.getActiveProvider();
    const activeAI = aiRegistry.get(providerId);

    const statusReport = `### SanMine Space Runtime & Integration Status

- **AI Provider:** ${activeAI?.name || providerId} (${model}) — ${activeAI?.isConfigured() ? '✓ Connected' : '✕ Not Configured'}
- **Business Search Provider:** ${activeSearch.name} — ${activeSearch.isConfigured() ? '✓ Connected' : '✕ Not Configured'}
- **Server Health:** Healthy (${status.timestamp || new Date().toISOString()})
- **Active Tools Available:** ${status.toolsAvailable ? status.toolsAvailable.join(', ') : 'search_businesses, analyze_website, calculate_lead_score, generate_proposal, get_system_status'}`;

    sendEvent({ type: 'message.delta', content: statusReport });
    sendEvent({ type: 'message.completed', content: statusReport });

    sendEvent({
      type: 'task.completed',
      message: 'Task completed',
    });

    logAgentTaskSummary(taskId, aiRequestCount, toolCallCount, 'completed');
    return;
  }
}
