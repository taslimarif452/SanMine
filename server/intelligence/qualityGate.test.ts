/**
 * Quality Gate Automated Test Suite
 * 
 * Verifies that Proposal Quality Gate accurately detects hallucinations,
 * spam clichés, missing observations, and enforces high standards.
 */

import { buildBusinessIntelligence } from './proposalMind.js';
import { evaluateProposalQuality } from './qualityGate.js';
import { BusinessRawInput, ProposalWriterResult } from './types.js';

export function runQualityGateTests() {
  const results: { test: string; passed: boolean; details?: string }[] = [];

  const sampleBiz: BusinessRawInput = {
    name: 'Apex Dental Care',
    category: 'Dentist',
    address: '123 Main St, Austin, TX 78701',
    phone: '(512) 555-0199',
    website: 'https://apexdentalcare.com',
    rating: 4.9,
    reviewCount: 142,
    audit: {
      success: true,
      url: 'https://apexdentalcare.com',
      httpStatus: 200,
      responseTimeMs: 320,
      isHttps: true,
      pageTitle: 'Apex Dental Care | Family Dentistry in Austin TX',
      metaDescription: 'Top-rated Austin dental clinic providing gentle cleanings and teeth whitening.',
      hasMobileViewport: true,
      hasOpenGraph: true,
      h1Count: 1,
      contactEmails: ['contact@apexdentalcare.com'],
      primaryEmail: 'contact@apexdentalcare.com',
      healthRating: 'Excellent',
    },
  };

  const intel = buildBusinessIntelligence(sampleBiz);

  // Test 1: Good, grounded proposal passes with high score
  const goodProposal: ProposalWriterResult = {
    success: true,
    subject: "Quick observation on Apex Dental Care's online setup",
    body: `Hi Apex Dental Care team,

While researching well-regarded dental practice services in Austin, Apex Dental Care's 4.9-star track record across 142 reviews stood out.

Your website has a solid foundation and fast performance. We specialize in helping local healthcare practices upgrade their digital presence and online patient booking flows.

Would you be open to a quick 5-minute conversation or seeing a brief visual mockup for Apex Dental Care? No pressure either way.

Best regards,
The Team
SANMine`,
    recipientName: 'Apex Dental Care',
    recipientEmail: 'contact@apexdentalcare.com',
    personalizationUsed: ['Customer Reputation'],
    opportunityUsed: 'Strategic Conversion & Modern Digital Refresh',
    confidence: 90,
    isAiGenerated: false,
  };

  const eval1 = evaluateProposalQuality(goodProposal, intel);
  const pass1 = eval1.passed === true && eval1.score >= 85;
  results.push({ test: '1. Grounded, high-quality proposal passes Quality Gate', passed: pass1, details: `Score: ${eval1.score}` });

  // Test 2: Proposal containing forbidden synthetic claims (e.g. $500k revenue claim) fails
  const syntheticProposal: ProposalWriterResult = {
    ...goodProposal,
    body: `Hi Apex Dental Care team,
We guarantee to add $500k in revenue and 10x your sales within 30 days!
Would you be open to a quick 5-minute conversation?`,
  };
  const eval2 = evaluateProposalQuality(syntheticProposal, intel);
  const pass2 = eval2.passed === false && eval2.checks.avoidsUnsupportedClaims === false;
  results.push({ test: '2. Proposal with unsupported revenue claim fails Quality Gate', passed: pass2, details: eval2.reasons.join('; ') });

  // Test 3: Proposal with spam cliché fails
  const clicheProposal: ProposalWriterResult = {
    ...goodProposal,
    body: `I hope this email finds you well. We are a leading company.
Would you be open to a quick 5-minute conversation for Apex Dental Care in Austin?`,
  };
  const eval3 = evaluateProposalQuality(clicheProposal, intel);
  const pass3 = eval3.passed === false && eval3.checks.avoidsGenericCliches === false;
  results.push({ test: '3. Proposal with generic spam clichés fails Quality Gate', passed: pass3, details: eval3.reasons.join('; ') });

  // Test 4: Proposal with missing CTA fails
  const noCtaProposal: ProposalWriterResult = {
    ...goodProposal,
    body: `Hi Apex Dental Care team in Austin,
We reviewed your website and 4.9-star rating. We provide web development services.
Best regards,
SANMine`,
  };
  const eval4 = evaluateProposalQuality(noCtaProposal, intel);
  const pass4 = eval4.passed === false && eval4.checks.hasNaturalCta === false;
  results.push({ test: '4. Proposal with missing natural CTA fails Quality Gate', passed: pass4, details: eval4.reasons.join('; ') });

  // Test 5: Proposal with no business name / observations fails
  const genericProposal: ProposalWriterResult = {
    ...goodProposal,
    body: `Hi there,
We noticed your website and want to build you a new one.
Would you be open to a quick 5-minute conversation?
Best regards,
SANMine`,
  };
  const eval5 = evaluateProposalQuality(genericProposal, intel);
  const pass5 = eval5.passed === false && eval5.checks.hasBusinessSpecificObservation === false;
  results.push({ test: '5. Generic proposal without business name fails Quality Gate', passed: pass5, details: eval5.reasons.join('; ') });

  // Test 6: Proposal claiming "solid reputation" when business has NO rating or reviews fails
  const unratedBiz: BusinessRawInput = {
    name: 'Glitchy Tech Co',
    category: 'Software',
    address: 'Austin, TX',
  };
  const unratedIntel = buildBusinessIntelligence(unratedBiz);
  const unverifiedRepProposal: ProposalWriterResult = {
    ...goodProposal,
    recipientName: 'Glitchy Tech Co',
    body: `Hi Glitchy Tech Co team,\n\nWhile your local reputation is solid, I noticed Glitchy Tech Co doesn't have an active website in Austin.\n\nWould you be open to a quick 5-minute conversation?\n\nBest regards,\nSANMine`,
  };
  const eval6 = evaluateProposalQuality(unverifiedRepProposal, unratedIntel);
  const pass6 = eval6.passed === false && eval6.checks.avoidsUnsupportedClaims === false;
  results.push({ test: '6. Proposal with unsubstantiated reputation claim fails Quality Gate', passed: pass6, details: eval6.reasons.join('; ') });

  // Test 7: Proposal claiming competitor bookings without evidence fails
  const competitorClaimProposal: ProposalWriterResult = {
    ...goodProposal,
    body: `Hi Apex Dental Care team,\n\nWhen prospective clients search online in Austin, they end up booking with competitors who have better sites.\n\nWould you be open to a quick 5-minute conversation?\n\nBest regards,\nSANMine`,
  };
  const eval7 = evaluateProposalQuality(competitorClaimProposal, intel);
  const pass7 = eval7.passed === false && eval7.checks.avoidsUnsupportedClaims === false;
  results.push({ test: '7. Proposal with unsubstantiated competitor booking claims fails Quality Gate', passed: pass7, details: eval7.reasons.join('; ') });

  return results;
}
