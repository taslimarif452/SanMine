/**
 * Proposal Quality Gate
 * 
 * Verifies that generated proposals meet strict quality, grounding, and anti-hallucination standards
 * before they are approved or queued for outreach.
 */

import {
  ProposalMindIntelligence,
  ProposalQualityEvaluation,
  ProposalWriterResult,
} from './types';

// Banned generic spam greetings and clichés
const BANNED_CLICHES = [
  /i hope this email finds you well/i,
  /hope this email finds you well/i,
  /hope you'?re doing well/i,
  /hope all is well/i,
  /are you looking to 10x/i,
  /we are a leading (agency|company|firm|provider)/i,
  /dear sir(\/|\s+)madam/i,
  /to whom it may concern/i,
  /i came across your website and was blown away/i,
];

// Patterns for unsupported / synthetic claims (hallucinations)
const FORBIDDEN_UNSUPPORTED_CLAIMS = [
  /\$\d+[\d,]*\s*(k|m|million|thousand|revenue|sales)/i,
  /\b\d{1,3}x\s*(revenue|sales|traffic|growth|conversions?)\b/i,
  /\b(10,000|50,000|100,000|\d{2,3}k)\s*(visitors|impressions|users|views)\b/i,
  /\b(forbes|inc\s*5000|fortune\s*500|award-winning)\b/i,
  /\b(guaranteed\s*#?1\s*(on\s*google|ranking)|rank\s*#?1\s*guarantee)\b/i,
  /\bteam of \d{2,}\s*(engineers|experts|developers)\b/i,
];

// Acceptable low-friction CTA patterns
const ACCEPTABLE_CTA_PATTERNS = [
  /quick (5-minute|conversation|chat|call)/i,
  /brief (visual )?mockup/i,
  /no pressure/i,
  /would you be open/i,
  /open to (seeing|a quick|discussing)/i,
  /let me know if/i,
  /happy to share/i,
  /worth a quick/i,
];

/**
 * Evaluates the quality, grounding, and safety of a generated proposal.
 */
export function evaluateProposalQuality(
  result: ProposalWriterResult,
  intelligence: ProposalMindIntelligence
): ProposalQualityEvaluation {
  const reasons: string[] = [];
  const body = (result.body || '').trim();
  const subject = (result.subject || '').trim();
  const combined = `${subject}\n${body}`;

  if (!body) {
    return {
      passed: false,
      score: 0,
      checks: {
        hasBusinessSpecificObservation: false,
        referencesVerifiedDetail: false,
        solutionRelatesToOpportunity: false,
        avoidsUnsupportedClaims: false,
        avoidsGenericCliches: false,
        hasNaturalCta: false,
        conciseColdOutreach: false,
      },
      reasons: ['Proposal body is empty'],
    };
  }

  // 1. Check: Has business-specific observation
  const bizName = intelligence.businessProfile.name;
  const city = intelligence.businessProfile.location.city;
  const hasName = bizName ? combined.toLowerCase().includes(bizName.toLowerCase()) : false;
  const hasCity = city ? combined.toLowerCase().includes(city.toLowerCase()) : false;
  
  // Check if any personalization anchor or observed issue is referenced in the proposal
  const referencesObservation = intelligence.personalizationPoints.some((p) => {
    const anchor = p.contextAnchor.toLowerCase();
    return combined.toLowerCase().includes(anchor) || 
      (p.evidenceSource && combined.toLowerCase().includes(p.evidenceSource.toLowerCase().slice(0, 15)));
  }) || intelligence.observedIssues.some((issue) => {
    return issue.category === 'mobile_optimization' && (combined.toLowerCase().includes('mobile') || combined.toLowerCase().includes('viewport'))
      || issue.category === 'ssl_security' && (combined.toLowerCase().includes('ssl') || combined.toLowerCase().includes('http') || combined.toLowerCase().includes('secure'))
      || issue.category === 'speed_optimization' && (combined.toLowerCase().includes('speed') || combined.toLowerCase().includes('response time') || combined.toLowerCase().includes('load'))
      || issue.category === 'new_website_creation' && (combined.toLowerCase().includes('website') || combined.toLowerCase().includes('online presence'));
  }) || (!intelligence.businessProfile.hasActiveWebsite && combined.toLowerCase().includes('website'));

  const hasBusinessSpecificObservation = hasName && (hasCity || referencesObservation);
  if (!hasBusinessSpecificObservation) {
    reasons.push('Proposal lacks verified business-specific observations or business name.');
  }

  // 2. Check: References verified detail
  const verifiedServices = intelligence.coreServices || [];
  const mentionsService = verifiedServices.some((s) => s.length > 3 && combined.toLowerCase().includes(s.toLowerCase()));
  const mentionsRating = intelligence.businessProfile.reputation.rating
    ? combined.includes(String(intelligence.businessProfile.reputation.rating)) || combined.toLowerCase().includes('rating') || combined.toLowerCase().includes('reviews')
    : false;
  const mentionsLocation = Boolean(city && combined.toLowerCase().includes(city.toLowerCase()));
  const referencesVerifiedDetail = hasName && (mentionsService || mentionsRating || mentionsLocation || referencesObservation);
  if (!referencesVerifiedDetail) {
    reasons.push('Proposal does not reference verified details (services, location, or reputation).');
  }

  // 3. Check: Solution relates to opportunity
  const primaryOpp = intelligence.inferredOpportunities[0];
  let solutionRelatesToOpportunity = true;
  if (primaryOpp) {
    const oppCategory = primaryOpp.category;
    if (oppCategory === 'new_website_creation') {
      solutionRelatesToOpportunity = combined.toLowerCase().includes('website') || combined.toLowerCase().includes('digital presence');
    } else if (oppCategory === 'mobile_optimization') {
      solutionRelatesToOpportunity = combined.toLowerCase().includes('mobile') || combined.toLowerCase().includes('responsive') || combined.toLowerCase().includes('viewport');
    } else if (oppCategory === 'ssl_security') {
      solutionRelatesToOpportunity = combined.toLowerCase().includes('ssl') || combined.toLowerCase().includes('https') || combined.toLowerCase().includes('security') || combined.toLowerCase().includes('secure');
    } else if (oppCategory === 'speed_optimization') {
      solutionRelatesToOpportunity = combined.toLowerCase().includes('speed') || combined.toLowerCase().includes('performance') || combined.toLowerCase().includes('load');
    } else if (oppCategory === 'website_redesign' || oppCategory === 'conversion_cta') {
      solutionRelatesToOpportunity =
        combined.toLowerCase().includes('presence') ||
        combined.toLowerCase().includes('digital') ||
        combined.toLowerCase().includes('website') ||
        combined.toLowerCase().includes('site') ||
        combined.toLowerCase().includes('booking') ||
        combined.toLowerCase().includes('conversion') ||
        combined.toLowerCase().includes('redesign') ||
        combined.toLowerCase().includes('online');
    }
  }
  if (!solutionRelatesToOpportunity) {
    reasons.push('Proposed solution does not align with the identified high-impact opportunity.');
  }

  // 4. Check: Avoids unsupported claims (Zero Hallucinations)
  let avoidsUnsupportedClaims = true;
  for (const pattern of FORBIDDEN_UNSUPPORTED_CLAIMS) {
    if (pattern.test(combined)) {
      avoidsUnsupportedClaims = false;
      reasons.push(`Proposal contains potentially unsupported or exaggerated claim matching pattern: ${pattern}`);
      break;
    }
  }

  // Check: Avoid claims of reputation if no rating/review exists
  if (
    /(local\s+)?reputation\s+is\s+(solid|strong|great|established|flawless)/i.test(combined) ||
    /\b(solid|strong|great|established)\s+reputation\b/i.test(combined)
  ) {
    const hasReputationEvidence = Boolean(
      (intelligence.businessProfile.reputation.rating && intelligence.businessProfile.reputation.rating >= 4.0) ||
      (intelligence.businessProfile.reputation.reviewCount && intelligence.businessProfile.reputation.reviewCount > 0)
    );
    if (!hasReputationEvidence) {
      avoidsUnsupportedClaims = false;
      reasons.push('Proposal makes unsupported claim regarding business reputation when no rating or review evidence exists.');
    }
  }

  // Check: Avoid unsubstantiated competitor booking claims
  if (
    /competitors\s+(often\s+)?(get|take|are\s+getting)\s+(bookings|customers|clients)/i.test(combined) ||
    /end\s+up\s+booking\s+with\s+competitors/i.test(combined)
  ) {
    avoidsUnsupportedClaims = false;
    reasons.push('Proposal makes unsupported claim regarding competitor bookings without verified competitive audit data.');
  }

  // 5. Check: Avoids generic clichés
  let avoidsGenericCliches = true;
  for (const pattern of BANNED_CLICHES) {
    if (pattern.test(combined)) {
      avoidsGenericCliches = false;
      reasons.push(`Proposal contains generic spam cliché: ${pattern}`);
      break;
    }
  }

  // 6. Check: Has natural CTA
  const hasNaturalCta = ACCEPTABLE_CTA_PATTERNS.some((p) => p.test(combined));
  if (!hasNaturalCta) {
    reasons.push('Proposal is missing a clear, low-friction call to action.');
  }

  // 7. Check: Concise cold outreach (between 35 and 350 words)
  const wordCount = body.split(/\s+/).filter(Boolean).length;
  const conciseColdOutreach = wordCount >= 30 && wordCount <= 350;
  if (!conciseColdOutreach) {
    reasons.push(`Proposal length (${wordCount} words) is outside recommended range (30-350 words).`);
  }

  // Calculate total quality score (0 to 100)
  let score = 0;
  if (hasBusinessSpecificObservation) score += 20;
  if (referencesVerifiedDetail) score += 15;
  if (solutionRelatesToOpportunity) score += 20;
  if (avoidsUnsupportedClaims) score += 15;
  if (avoidsGenericCliches) score += 10;
  if (hasNaturalCta) score += 10;
  if (conciseColdOutreach) score += 10;

  const passed =
    hasBusinessSpecificObservation &&
    referencesVerifiedDetail &&
    solutionRelatesToOpportunity &&
    avoidsUnsupportedClaims &&
    avoidsGenericCliches &&
    hasNaturalCta &&
    conciseColdOutreach;

  return {
    passed,
    score,
    checks: {
      hasBusinessSpecificObservation,
      referencesVerifiedDetail,
      solutionRelatesToOpportunity,
      avoidsUnsupportedClaims,
      avoidsGenericCliches,
      hasNaturalCta,
      conciseColdOutreach,
    },
    reasons,
  };
}
