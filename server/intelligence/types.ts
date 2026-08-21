/**
 * Proposal Mind - Type Definitions & Schemas
 * 
 * Provides strong typing for the Proposal Intelligence layer that transforms
 * raw search and website audit data into structured, evidence-backed business intelligence.
 */

export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW';

export type OpportunityCategory = 
  | 'website_redesign'
  | 'mobile_optimization'
  | 'ssl_security'
  | 'speed_optimization'
  | 'seo_onpage'
  | 'conversion_cta'
  | 'new_website_creation'
  | 'online_reputation';

export interface RawAuditData {
  success?: boolean;
  url?: string;
  httpStatus?: number;
  responseTimeMs?: number;
  isHttps?: boolean;
  pageTitle?: string;
  metaDescription?: string;
  hasMobileViewport?: boolean;
  hasOpenGraph?: boolean;
  ogTags?: Record<string, string>;
  h1Count?: number;
  headings?: { h1: string[]; h2: string[]; h3: string[] };
  pageSizeKb?: number;
  contactEmails?: string[];
  primaryEmail?: string;
  phoneNumbers?: string[];
  socialLinks?: { platform: string; url: string }[];
  servicesFound?: string[];
  callsToAction?: string[];
  bookingMechanisms?: string[];
  trustSignals?: string[];
  readableTextSnippets?: string[];
  issuesFoundCount?: number;
  identifiedIssues?: string[];
  healthRating?: 'Excellent' | 'Fair' | 'Poor';
}

export interface BusinessRawInput {
  name: string;
  category?: string;
  address?: string;
  phone?: string;
  website?: string | null;
  rating?: number | null;
  reviewCount?: number | null;
  latitude?: number;
  longitude?: number;
  placeId?: string;
  priceLevel?: string | number;
  audit?: RawAuditData | null;
  rawHtmlSnippet?: string;
}

export interface BusinessProfile {
  name: string;
  category: string;
  industry: string;
  location: {
    address?: string;
    city?: string;
    state?: string;
    hasPhysicalLocation: boolean;
  };
  contact: {
    phone?: string;
    verifiedEmail?: string;
    hasPublicEmail: boolean;
    contactEmails: string[];
    websiteUrl?: string;
    socialLinks?: { platform: string; url: string }[];
  };
  reputation: {
    rating: number | null;
    reviewCount: number | null;
    ratingTier: 'Exceptional' | 'Strong' | 'Average' | 'Low' | 'Unrated';
  };
  hasActiveWebsite: boolean;
}

export interface VerifiedFact {
  id: string;
  claim: string;
  source: 'web_research' | 'business_discovery' | 'website_http' | 'html_metadata' | 'contact_extraction';
  confidence: ConfidenceLevel;
  rawEvidence: string;
}

export interface ObservedIssue {
  id: string;
  category: OpportunityCategory;
  severity: 'CRITICAL' | 'WARNING' | 'OPPORTUNITY';
  technicalObservation: string;
  impactOnBusiness: string;
  measuredDataPoint: string;
}

export interface InferredOpportunity {
  id: string;
  category: OpportunityCategory;
  title: string;
  strategicRationale: string;
  evidenceBacked: boolean;
  supportingIssueIds: string[];
  expectedBusinessValue: string;
}

export interface RecommendedSolution {
  serviceName: string;
  tier: 'Core Essential' | 'High Impact' | 'Value Add';
  scopePoints: string[];
  targetedOpportunityId: string;
  estimatedDeliveryTimeline: string;
}

export interface PersonalizationPoint {
  contextAnchor: string;
  naturalObservation: string;
  confidence: ConfidenceLevel;
  evidenceSource: string;
  whyRelevant?: string;
  safeForOutreach: boolean;
  doNotExaggerateNote?: string;
}

export interface WebsiteInsights {
  title?: string;
  metaDescription?: string;
  sslSecure: boolean;
  mobileResponsive: boolean;
  responseTimeMs?: number;
  speedCategory: 'Fast' | 'Acceptable' | 'Slow' | 'Unreachable';
  onPageSeoQuality: 'Strong' | 'Adequate' | 'Deficient';
  h1HeadingPresent: boolean;
  openGraphConfigured: boolean;
  headingsFound?: { h1: string[]; h2: string[]; h3: string[] };
  servicesDetected?: string[];
  callsToAction?: string[];
  bookingMechanisms?: string[];
  trustSignals?: string[];
  summary: string;
}

/**
 * The Master Structured Output of the Proposal Mind
 */
export interface ProposalMindIntelligence {
  // Step A: What is this business?
  businessProfile: BusinessProfile;
  businessSummary: string;

  // Step B: What does this business appear to sell or offer?
  coreServices: string[];

  // Step C: Who are its likely customers based on observed evidence?
  targetAudience: string;

  // Step D: What is already working well?
  observedStrengths: string[];

  // Step E: What specific problems or missed opportunities are observable?
  observedIssues: ObservedIssue[];

  // Step F: Which problems are actually worth mentioning to the business? (High-impact prioritization)
  inferredOpportunities: InferredOpportunity[];

  // Step G: What service/solution would logically address those problems?
  recommendedSolutions: RecommendedSolution[];

  // Step H: What should the proposal's main pitch be?
  primaryPitchAngle: string;
  suggestedSubjectLines: string[];

  // Step I: Which specific observations can naturally personalize the opening?
  personalizationPoints: PersonalizationPoint[];

  // Technical & Online Presence Insights
  websiteInsights: WebsiteInsights;

  // Evidence Ledger (Facts vs. Inferences)
  verifiedFacts: VerifiedFact[];

  // Quality & Completeness
  overallConfidenceScore: number; // 0 - 100
  intelligenceCompleteness: 'High' | 'Moderate' | 'Limited';
  readyForProposal: boolean;
  missingDataNotes: string[];
}

import { AIProviderId } from '../ai/types.js';

/**
 * Options for invoking the Proposal Writer
 */
export interface ProposalWriterOptions {
  intelligence: ProposalMindIntelligence;
  senderName?: string;
  senderAgencyName?: string;
  senderRole?: string;
  providerId?: AIProviderId;
  model?: string;
  apiKey?: string;
  userId?: string;
  customTone?: 'concise' | 'consultative' | 'direct';
  temperature?: number;
  abortSignal?: AbortSignal;
}

/**
 * Proposal Quality Gate Evaluation Result
 */
export interface ProposalQualityEvaluation {
  passed: boolean;
  score: number; // 0 to 100
  checks: {
    hasBusinessSpecificObservation: boolean;
    referencesVerifiedDetail: boolean;
    solutionRelatesToOpportunity: boolean;
    avoidsUnsupportedClaims: boolean;
    avoidsGenericCliches: boolean;
    hasNaturalCta: boolean;
    conciseColdOutreach: boolean;
  };
  reasons: string[];
}

/**
 * Validates whether an email string is a real, well-formed recipient email address.
 * Strictly prevents placeholder, synthetic, or malformed email strings from being marked sendable.
 */
export function isValidRecipientEmail(email?: string | null): boolean {
  if (!email || typeof email !== 'string') return false;
  const trimmed = email.trim().toLowerCase();
  if (trimmed.length < 5 || trimmed.length > 254) return false;

  // Basic RFC 5322 regex validation
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!emailRegex.test(trimmed)) return false;

  // Filter out placeholder domains, non-contact examples, and dummy emails
  const forbiddenPatterns = [
    'example.com',
    'example.org',
    'example.net',
    'test.com',
    'domain.com',
    'email.com',
    'sample.com',
    'unknown@',
    'none@',
    'placeholder',
    '@local',
    '@localhost',
    'user@',
    'yourname@',
    'admin@domain',
  ];

  if (forbiddenPatterns.some((pattern) => trimmed.includes(pattern))) {
    return false;
  }

  // Filter out asset extensions mistakenly captured as emails (e.g. icon@2x.png)
  if (/\.(png|jpg|jpeg|gif|svg|webp|css|js|woff|woff2)$/i.test(trimmed)) {
    return false;
  }

  return true;
}

/**
 * Structured Output Result from the Proposal Writer
 */
export interface ProposalWriterResult {
  success: boolean;
  subject: string;
  body: string;
  recipientName?: string;
  recipientEmail?: string;
  personalizationUsed: string[];
  opportunityUsed: string;
  confidence: number;
  providerUsed?: string;
  modelUsed?: string;
  isAiGenerated: boolean;
  generationMethod?: 'ai' | 'deterministic_fallback';
  reason?: string;
  missingDataNotes?: string[];
  qualityEvaluation?: ProposalQualityEvaluation;
}
