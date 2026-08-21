/**
 * Proposal Writer Layer
 * 
 * Consumes structured ProposalMindIntelligence to craft high-conversion,
 * strictly grounded business proposals.
 * 
 * Guarantees:
 * - Uses existing AI provider abstraction (OpenAI, Gemini, OpenRouter)
 * - Zero hallucination of unverified metrics, awards, revenue, or team size
 * - Adapts naturally to distinct business intelligence profiles
 * - Enforces Proposal Quality Gate checks on all outputs
 * - Provides graceful fallback to deterministic synthesis when needed
 */

import { aiRegistry } from '../ai/registry.js';
import { AIProviderId } from '../ai/types.js';
import { resolveUserAiCredential } from '../ai/credentialResolver.js';
import { evaluateProposalQuality } from './qualityGate.js';
import {
  InferredOpportunity,
  PersonalizationPoint,
  ProposalMindIntelligence,
  ProposalWriterOptions,
  ProposalWriterResult,
  RecommendedSolution,
} from './types.js';

/**
 * Circuit breaker state to prevent retry storms when AI provider quotas are exhausted (HTTP 429).
 */
interface CircuitBreakerState {
  isTripped: boolean;
  providerId: string;
  model: string;
  reason: string;
  trippedAt: number;
}

const circuitBreakers = new Map<string, CircuitBreakerState>();

export function getProviderCircuitBreaker(providerId: string, model: string): CircuitBreakerState | undefined {
  const key = `${providerId}:${model}`;
  const cb = circuitBreakers.get(key);
  if (!cb) return undefined;
  // 60-second cooldown before allowing an AI retry attempt
  if (Date.now() - cb.trippedAt > 60_000) {
    circuitBreakers.delete(key);
    return undefined;
  }
  return cb;
}

export function tripProviderCircuitBreaker(providerId: string, model: string, reason: string): void {
  const key = `${providerId}:${model}`;
  circuitBreakers.set(key, {
    isTripped: true,
    providerId,
    model,
    reason,
    trippedAt: Date.now(),
  });
  console.log(`[AI CIRCUIT BREAKER TRIPPED]\nprovider=${providerId}\nmodel=${model}\nreason="${reason}"`);
}

export function resetCircuitBreakers(): void {
  circuitBreakers.clear();
}

/**
 * Builds a clean, contextual subject line tailored specifically to the opportunity.
 */
function buildSubjectLine(intel: ProposalMindIntelligence, primaryOpp?: InferredOpportunity): string {
  const bizName = intel.businessProfile.name;
  const city = intel.businessProfile.location.city;

  if (!intel.businessProfile.hasActiveWebsite) {
    return `Quick question regarding ${bizName}'s online presence${city ? ` in ${city}` : ''}`;
  }

  if (primaryOpp) {
    switch (primaryOpp.category) {
      case 'mobile_optimization':
        return `Quick note on ${bizName}'s mobile experience`;
      case 'ssl_security':
        return `Security observation for ${bizName}'s website`;
      case 'speed_optimization':
        return `Speed & loading note for ${bizName}`;
      case 'seo_onpage':
        return `Local search observation for ${bizName}`;
      case 'conversion_cta':
        return `Idea for ${bizName}'s contact flow`;
      default:
        break;
    }
  }

  if (intel.suggestedSubjectLines && intel.suggestedSubjectLines.length > 0) {
    return intel.suggestedSubjectLines[0];
  }

  return `Modernization opportunity for ${bizName}`;
}

/**
 * Safely repairs raw control characters (unescaped newlines, tabs, carriage returns)
 * within JSON string literals so JSON.parse does not throw "Unterminated string in JSON".
 */
export function repairJsonControlCharacters(jsonStr: string): string {
  let inString = false;
  let isEscaped = false;
  let result = '';

  for (let i = 0; i < jsonStr.length; i++) {
    const char = jsonStr[i];

    if (inString) {
      if (isEscaped) {
        result += char;
        isEscaped = false;
      } else if (char === '\\') {
        result += char;
        isEscaped = true;
      } else if (char === '"') {
        result += char;
        inString = false;
      } else if (char === '\n') {
        result += '\\n';
      } else if (char === '\r') {
        result += '\\r';
      } else if (char === '\t') {
        result += '\\t';
      } else if (char.charCodeAt(0) < 32) {
        result += ' ';
      } else {
        result += char;
      }
    } else {
      if (char === '"') {
        inString = true;
      }
      result += char;
    }
  }

  return result;
}

function validateProposalSchema(obj: any): boolean {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
  if (typeof obj.subject !== 'string' || obj.subject.trim().length === 0) return false;
  if (typeof obj.body !== 'string' || obj.body.trim().length === 0) return false;
  return true;
}

/**
 * Robust JSON extraction and validation for LLM structured output.
 * Handles markdown formatting, unescaped newlines in JSON strings,
 * and validates against the required proposal schema without fragile regex-only extraction.
 */
export function parseStructuredProposalJson(rawText: string): {
  subject?: string;
  body?: string;
  opportunityUsed?: string;
  personalizationUsed?: string[];
} | null {
  if (!rawText || typeof rawText !== 'string') return null;

  let cleaned = rawText.trim();

  // Strip markdown code fences if wrapped
  const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (codeBlockMatch) {
    cleaned = codeBlockMatch[1].trim();
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```[a-z]*\s*/i, '').replace(/```\s*$/i, '').trim();
  }

  // Find outermost JSON object
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return null;
  }

  const jsonCandidate = cleaned.slice(firstBrace, lastBrace + 1);

  // Strategy 1: Native JSON parse
  try {
    const direct = JSON.parse(jsonCandidate);
    if (validateProposalSchema(direct)) {
      return direct;
    }
  } catch {
    // Strategy 1 failed, try Strategy 2
  }

  // Strategy 2: Repair unescaped control characters in JSON strings
  try {
    const repaired = repairJsonControlCharacters(jsonCandidate);
    const repairedParsed = JSON.parse(repaired);
    if (validateProposalSchema(repairedParsed)) {
      return repairedParsed;
    }
  } catch {
    // Strategy 2 failed
  }

  return null;
}

/**
 * Deterministic proposal generator that synthesizes genuine, human-sounding
 * proposals grounded strictly in the verified facts and observations.
 */
export function generateDeterministicProposal(options: ProposalWriterOptions): ProposalWriterResult {
  const { intelligence: intel, senderName = 'The Team', senderAgencyName = 'SanMine Space' } = options;

  // 1. Fallback Gate: Check if intelligence is sufficient
  if (!intel.readyForProposal || intel.overallConfidenceScore < 40) {
    return {
      success: false,
      subject: '',
      body: '',
      recipientName: intel.businessProfile.name,
      recipientEmail: intel.businessProfile.contact.verifiedEmail,
      personalizationUsed: [],
      opportunityUsed: '',
      confidence: intel.overallConfidenceScore,
      isAiGenerated: false,
      generationMethod: 'deterministic_fallback',
      reason: 'Insufficient reliable business data to generate a personalized proposal without hallucinations.',
      missingDataNotes: intel.missingDataNotes,
    };
  }

  const bizName = intel.businessProfile.name;
  const city = intel.businessProfile.location.city;
  const primaryOpp = intel.inferredOpportunities[0];
  const primarySolution: RecommendedSolution | undefined = intel.recommendedSolutions[0];
  const topPersonalization = intel.personalizationPoints.filter((p) => p.safeForOutreach).slice(0, 2);

  const personalizationUsed: string[] = topPersonalization.map((p) => p.contextAnchor);
  const opportunityUsed = primaryOpp ? primaryOpp.title : 'Digital Modernization';

  const subject = buildSubjectLine(intel, primaryOpp);

  // 2. Select contextual opening based on reputation or local presence (No generic clichés!)
  let openingParagraph = `Hi ${bizName} team,`;
  const repAnchor = intel.personalizationPoints.find((p) => p.contextAnchor === 'Customer Reputation');
  if (repAnchor && intel.businessProfile.reputation.rating) {
    openingParagraph += `\n\nWhile researching well-regarded ${intel.businessProfile.category.toLowerCase()} services in ${city || 'your area'}, ${bizName}'s ${intel.businessProfile.reputation.rating}-star track record across ${intel.businessProfile.reputation.reviewCount || 0} reviews stood out.`;
  } else if (city) {
    openingParagraph += `\n\nWhile reviewing local ${intel.businessProfile.category.toLowerCase()} services in ${city}, I was taking a look at ${bizName}'s digital setup.`;
  } else {
    openingParagraph += `\n\nWhile reviewing local ${intel.businessProfile.category.toLowerCase()} services, I was taking a look at ${bizName}'s digital setup.`;
  }

  // 3. Select observation paragraph based strictly on measured issues (strictly grounded, no unverified claims)
  let observationParagraph = '';
  if (!intel.businessProfile.hasActiveWebsite) {
    const hasReputation = Boolean(
      (intel.businessProfile.reputation.rating && intel.businessProfile.reputation.rating >= 4.0) ||
      (intel.businessProfile.reputation.reviewCount && intel.businessProfile.reputation.reviewCount > 0)
    );
    if (hasReputation && intel.businessProfile.reputation.rating) {
      observationParagraph = `While ${bizName} has a ${intel.businessProfile.reputation.rating}-star track record locally, I noticed that ${bizName} does not appear to have an active dedicated website in the web sources checked. For businesses in ${city || 'your area'}, having a dedicated web presence makes it straightforward for prospective clients to verify service details, hours, and contact information directly.`;
    } else {
      observationParagraph = `While reviewing local ${intel.businessProfile.category.toLowerCase()} services in ${city || 'your area'}, I noticed that ${bizName} does not appear to have an active dedicated website in the web sources checked. Having a dedicated web presence makes it straightforward for prospective clients to verify service details and reach out directly.`;
    }
  } else {
    const criticalIssue = intel.observedIssues[0];
    if (criticalIssue) {
      if (criticalIssue.category === 'mobile_optimization') {
        observationParagraph = `When testing your website on a mobile device, I noticed the homepage is currently missing a responsive viewport configuration. On smartphones, visitors have to manually pinch and zoom to read service details, which creates friction for mobile inquiries.`;
      } else if (criticalIssue.category === 'ssl_security') {
        observationParagraph = `When inspecting your site, I noticed it is currently served over unencrypted HTTP without an active SSL certificate. This triggers a "Not Secure" warning in modern browsers like Chrome and Safari, which can cause prospective clients to hesitate before reaching out.`;
      } else if (criticalIssue.category === 'speed_optimization') {
        observationParagraph = `When checking your site's performance, the initial server response time measured at ${intel.websiteInsights.responseTimeMs}ms, which can cause noticeable loading delays on cellular mobile connections.`;
      } else {
        observationParagraph = `When reviewing your current online presence, there is an opportunity to streamline your service pages and make next-step contact actions more prominent for visitors.`;
      }
    } else {
      observationParagraph = `Your website has a solid foundation, but there is an opportunity to refresh the design and conversion flow to make reaching out even easier for new clients.`;
    }
  }

  // 4. Solution & Scope
  let solutionParagraph = '';
  if (primarySolution) {
    solutionParagraph = `We specialize in helping local businesses upgrade their digital presence. For ${bizName}, we can implement a ${primarySolution.serviceName.toLowerCase()} focused on:\n- ${primarySolution.scopePoints.slice(0, 3).join('\n- ')}`;
  } else {
    solutionParagraph = `We can help streamline your digital presence and make it seamless for prospective clients to contact you directly from their phones.`;
  }

  // 5. Natural, low-friction CTA
  const ctaParagraph = `Would you be open to a quick 5-minute conversation or seeing a brief visual mockup of what this could look like for ${bizName}? No pressure either way.`;

  const closing = `Best regards,\n${senderName}\n${senderAgencyName}`;

  const body = `${openingParagraph}\n\n${observationParagraph}\n\n${solutionParagraph}\n\n${ctaParagraph}\n\n${closing}`;

  const result: ProposalWriterResult = {
    success: true,
    subject,
    body,
    recipientName: bizName,
    recipientEmail: intel.businessProfile.contact.verifiedEmail,
    personalizationUsed,
    opportunityUsed,
    confidence: intel.overallConfidenceScore,
    isAiGenerated: false,
    generationMethod: 'deterministic_fallback',
    missingDataNotes: intel.missingDataNotes,
  };

  // Evaluate through Quality Gate
  result.qualityEvaluation = evaluateProposalQuality(result, intel);

  return result;
}

/**
 * Builds the strict, anti-hallucination system prompt for AI-powered proposal writing.
 */
function buildAiProposalPrompt(options: ProposalWriterOptions): string {
  const { intelligence: intel, senderName = 'The Team', senderAgencyName = 'SanMine Space', customTone = 'consultative' } = options;

  const factsList = intel.verifiedFacts.map((f) => `- [Verified] ${f.claim}`).join('\n');
  const issuesList = intel.observedIssues.map((i) => `- [Observed] ${i.technicalObservation} (Measured: ${i.measuredDataPoint})`).join('\n');
  const opportunitiesList = intel.inferredOpportunities.map((o) => `- [Opportunity] ${o.title}: ${o.strategicRationale}`).join('\n');
  const personalizationList = intel.personalizationPoints.filter((p) => p.safeForOutreach).map((p) => `- [Anchor: ${p.contextAnchor}] ${p.naturalObservation}`).join('\n');
  const solutionsList = intel.recommendedSolutions.map((s) => `- ${s.serviceName}: ${s.scopePoints.join(', ')}`).join('\n');

  return `You are an expert B2B proposal copywriter for ${senderAgencyName}.
Your objective is to write a highly targeted, personalized, and respectful email proposal to the business below based ONLY on the verified intelligence provided.

STRICT INTEGRITY & ANTI-HALLUCINATION RULES:
1. NEVER invent statistics, customer numbers, revenue figures, awards, technologies, or testimonials that are not in the provided intelligence.
2. Distinguish strictly between verified facts, observed technical measurements, and proposed solutions. Never state an assumption as a hard fact.
3. Select ONLY the 1-2 most relevant observations. Do NOT recite every single technical item or audit checkbox.
4. Writing style must be ${customTone}, concise (under 180 words), natural, professional, and human-sounding.
5. BANNED CLICHÉS (DO NOT USE): "I hope this email finds you well", "Hope you're doing well", "We are a leading company", "Are you looking to 10x your sales?", "Dear Sir/Madam".
6. Include a low-friction, respectful call to action (e.g. "Would you be open to a quick 5-minute conversation or seeing a brief visual mockup? No pressure either way.").
7. Sign off as:
   ${senderName}
   ${senderAgencyName}

=== STRUCTURED BUSINESS INTELLIGENCE ===
Business Name: ${intel.businessProfile.name}
Category: ${intel.businessProfile.category} (${intel.businessProfile.industry})
Location: ${intel.businessProfile.location.address || intel.businessProfile.location.city || 'Local area'}
Website: ${intel.businessProfile.contact.websiteUrl || 'No website found'}
Reputation: ${intel.businessProfile.reputation.rating ? `${intel.businessProfile.reputation.rating} stars (${intel.businessProfile.reputation.reviewCount} reviews)` : 'Unrated'}
Primary Pitch Angle: ${intel.primaryPitchAngle}

Verified Facts:
${factsList || '(None)'}

Observed Technical Issues:
${issuesList || '(None observed)'}

Inferred Opportunities:
${opportunitiesList}

Personalization Anchors:
${personalizationList || '(None)'}

Recommended Solutions:
${solutionsList}

OUTPUT FORMAT:
Return ONLY a valid JSON object matching this exact schema:
{
  "subject": "A compelling, non-spammy subject line specific to this business and opportunity",
  "body": "The complete personalized email body text including greeting, observations, solution, CTA, and closing",
  "opportunityUsed": "The primary opportunity title addressed",
  "personalizationUsed": ["List of 1-3 context anchors actually used in the text"]
}`;
}

/**
 * Main Entry Point: Generates a personalized proposal for a business using ProposalMindIntelligence.
 * Seamlessly leverages the user's selected AI provider or falls back safely to deterministic synthesis.
 */
export async function generateProposal(options: ProposalWriterOptions): Promise<ProposalWriterResult> {
  const { intelligence: intel, providerId, model, apiKey } = options;

  // 1. Safety check
  if (!intel || !intel.readyForProposal || intel.overallConfidenceScore < 40) {
    return {
      success: false,
      subject: '',
      body: '',
      recipientName: intel?.businessProfile?.name || 'Unknown',
      recipientEmail: intel?.businessProfile?.contact?.verifiedEmail,
      personalizationUsed: [],
      opportunityUsed: '',
      confidence: intel?.overallConfidenceScore ?? 0,
      isAiGenerated: false,
      reason: 'Insufficient reliable business data to generate a personalized proposal without hallucinations.',
      missingDataNotes: intel?.missingDataNotes || ['Incomplete business data'],
    };
  }

  // 2. Check if AI Provider is available and configured
  let providerInstance = providerId ? aiRegistry.get(providerId as AIProviderId) : undefined;
  let effectiveProviderId = providerId as AIProviderId | undefined;
  if (!providerInstance) {
    const active = aiRegistry.getActiveSelection();
    if (active) {
      providerInstance = aiRegistry.get(active.provider);
      effectiveProviderId = active.provider;
    }
  }

  const effectiveKey = effectiveProviderId
    ? await resolveUserAiCredential({
        userId: options.userId,
        providerId: effectiveProviderId,
        explicitApiKey: apiKey,
      })
    : apiKey;
  const hasValidAi = providerInstance && (Boolean(effectiveKey) || providerInstance.isConfigured(effectiveKey));

  // If no AI provider is configured, return the high-craft deterministic proposal
  if (!hasValidAi || !providerInstance) {
    const deterministic = generateDeterministicProposal(options);
    console.log(
      `[PROPOSAL GENERATED]\nbusiness="${intel.businessProfile.name}"\nmethod=deterministic_fallback\nreason="No AI provider configured"`
    );
    return deterministic;
  }

  // 3. Check Circuit Breaker for AI Provider
  const effectiveModel = model || providerInstance.defaultModel;
  const activeBreaker = getProviderCircuitBreaker(providerInstance.id, effectiveModel);
  if (activeBreaker && activeBreaker.isTripped) {
    console.log(
      `[AI CIRCUIT BREAKER ACTIVE]\nprovider=${providerInstance.id}\nmodel=${effectiveModel}\nreason="${activeBreaker.reason}"`
    );
    console.log(
      `[AI FALLBACK]\nreason="Circuit breaker active for ${providerInstance.id}/${effectiveModel}: ${activeBreaker.reason}. Deterministic synthesis used."`
    );
    const deterministic = generateDeterministicProposal(options);
    deterministic.reason = `AI provider quota exhausted (${activeBreaker.reason}). Deterministic fallback used.`;
    console.log(
      `[PROPOSAL GENERATED]\nbusiness="${intel.businessProfile.name}"\nmethod=deterministic_fallback\nreason="Circuit breaker active"`
    );
    return deterministic;
  }

  // 4. AI-Powered Generation via User's Configured Model
  const prompt = buildAiProposalPrompt(options);

  try {
    let accumulatedText = '';
    const taskId = `prop_${Date.now().toString(36)}`;

    console.log(
      `[AI REQUEST]\nprovider=${providerInstance.id}\nmodel=${effectiveModel}\nbusiness="${intel.businessProfile.name}"`
    );

    await providerInstance.streamChat({
      taskId,
      apiKey: effectiveKey,
      messages: [{ role: 'user', content: prompt }],
      model: effectiveModel,
      temperature: options.temperature ?? 0.6,
      maxTokens: 1024,
      onEvent: (evt) => {
        if (evt.type === 'message.delta' && evt.content) {
          accumulatedText += evt.content;
        } else if (evt.type === 'error') {
          const errMsg = evt.message || 'Stream error';
          if (errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('quota') || errMsg.includes('429')) {
            tripProviderCircuitBreaker(providerInstance.id, effectiveModel, errMsg);
          }
        }
      },
      abortSignal: options.abortSignal,
    });

    if (!accumulatedText || accumulatedText.trim().length === 0) {
      // Fall back to deterministic proposal if stream was empty
      console.log(`[AI FALLBACK]\nreason="AI response stream was empty. Deterministic synthesis used."`);
      const deterministic = generateDeterministicProposal(options);
      deterministic.reason = 'AI response stream was empty. Deterministic synthesis used.';
      console.log(
        `[PROPOSAL GENERATED]\nbusiness="${intel.businessProfile.name}"\nmethod=deterministic_fallback\nreason="Empty AI stream"`
      );
      return deterministic;
    }

    const parsed = parseStructuredProposalJson(accumulatedText);

    if (parsed && parsed.subject && parsed.body) {
      const candidateResult: ProposalWriterResult = {
        success: true,
        subject: parsed.subject.trim(),
        body: parsed.body.trim(),
        recipientName: intel.businessProfile.name,
        recipientEmail: intel.businessProfile.contact.verifiedEmail,
        personalizationUsed: Array.isArray(parsed.personalizationUsed) && parsed.personalizationUsed.length > 0
          ? parsed.personalizationUsed
          : intel.personalizationPoints.slice(0, 2).map((p) => p.contextAnchor),
        opportunityUsed: parsed.opportunityUsed || intel.inferredOpportunities[0]?.title || 'Website Modernization',
        confidence: intel.overallConfidenceScore,
        providerUsed: providerInstance.id,
        modelUsed: effectiveModel,
        isAiGenerated: true,
        generationMethod: 'ai',
        missingDataNotes: intel.missingDataNotes,
      };

      // Quality Gate verification
      const quality = evaluateProposalQuality(candidateResult, intel);
      candidateResult.qualityEvaluation = quality;

      // If quality check fails (e.g. model added hallucinated metrics or spam clichés),
      // seamlessly fall back to the safe deterministic proposal
      if (!quality.passed) {
        console.warn('[ProposalWriter] AI proposal failed quality gate, falling back to deterministic:', quality.reasons);
        console.log(`[AI FALLBACK]\nreason="AI output failed quality gate (${quality.reasons.join(', ')}). Deterministic synthesis used."`);
        const deterministic = generateDeterministicProposal(options);
        deterministic.reason = `AI output did not pass quality gate (${quality.reasons.join(', ')}). Deterministic synthesis applied.`;
        console.log(
          `[PROPOSAL GENERATED]\nbusiness="${intel.businessProfile.name}"\nmethod=deterministic_fallback\nreason="Quality gate check failed"`
        );
        return deterministic;
      }

      console.log(
        `[PROPOSAL GENERATED]\nbusiness="${intel.businessProfile.name}"\nmethod=ai\nmodel=${effectiveModel}\nscore=${quality.score}`
      );
      return candidateResult;
    }

    console.warn('[ProposalWriter] Unable to parse structured JSON from AI output. Falling back to deterministic proposal.');
    console.log(`[AI FALLBACK]\nreason="AI output format could not be parsed as valid structured proposal JSON."`);
    const deterministic = generateDeterministicProposal(options);
    deterministic.reason = 'AI output format could not be parsed as valid structured proposal JSON. Deterministic fallback used.';
    console.log(
      `[PROPOSAL GENERATED]\nbusiness="${intel.businessProfile.name}"\nmethod=deterministic_fallback\nreason="Unparseable JSON"`
    );
    return deterministic;
  } catch (err: any) {
    const errMessage = String(err?.message || err || '');
    const isQuotaExhausted =
      errMessage.includes('RESOURCE_EXHAUSTED') ||
      errMessage.includes('quota') ||
      errMessage.includes('429') ||
      err?.status === 429;

    if (isQuotaExhausted) {
      console.log(
        `[AI QUOTA EXHAUSTED]\nprovider=${providerInstance.id}\nmodel=${effectiveModel}\ncode=RESOURCE_EXHAUSTED`
      );
      tripProviderCircuitBreaker(providerInstance.id, effectiveModel, 'Quota exceeded (HTTP 429 RESOURCE_EXHAUSTED)');
    }

    console.warn('[ProposalWriter AI Error] Falling back to deterministic proposal:', errMessage);
    console.log(`[AI FALLBACK]\nreason="${isQuotaExhausted ? 'AI provider quota exhausted' : errMessage}"`);
    const deterministic = generateDeterministicProposal(options);
    deterministic.reason = isQuotaExhausted
      ? 'AI provider quota was exhausted (HTTP 429 RESOURCE_EXHAUSTED). Deterministic fallback used.'
      : `AI generation error: ${errMessage} (Deterministic fallback used)`;
    console.log(
      `[PROPOSAL GENERATED]\nbusiness="${intel.businessProfile.name}"\nmethod=deterministic_fallback\nreason="${isQuotaExhausted ? 'Quota exhausted' : 'AI error'}"`
    );
    return deterministic;
  }
}

/**
 * Batch proposal generator helper for processing multiple business intelligence records.
 * Guarantees isolation between each business record.
 */
export async function generateBatchProposals(
  intelligences: ProposalMindIntelligence[],
  options?: Partial<ProposalWriterOptions>
): Promise<ProposalWriterResult[]> {
  const results: ProposalWriterResult[] = [];
  for (const intel of intelligences) {
    const res = await generateProposal({
      ...options,
      intelligence: intel,
    });
    results.push(res);
  }
  return results;
}
