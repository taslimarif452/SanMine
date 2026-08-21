/**
 * Proposal Mind Automated Test Suite
 * 
 * Verifies that Proposal Mind correctly translates raw search & audit signals
 * into strictly evidence-grounded business intelligence without hallucinations.
 */

import { buildBusinessIntelligence, buildBatchBusinessIntelligence, formatIntelligenceForProposalWriter } from './proposalMind.js';
import { BusinessRawInput } from './types.js';

export function runProposalMindTests() {
  const results: { test: string; passed: boolean; details?: string }[] = [];

  // Test 1: Business with strong website data
  const strongBiz: BusinessRawInput = {
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
      pageTitle: 'Apex Dental Care | Family & Cosmetic Dentistry in Austin TX',
      metaDescription: 'Top-rated Austin dental clinic providing gentle cleanings, teeth whitening, and dental implants.',
      hasMobileViewport: true,
      hasOpenGraph: true,
      h1Count: 1,
      contactEmails: ['contact@apexdentalcare.com'],
      primaryEmail: 'contact@apexdentalcare.com',
      issuesFoundCount: 0,
      identifiedIssues: [],
      healthRating: 'Excellent',
    },
  };

  const intel1 = buildBusinessIntelligence(strongBiz);
  const pass1 =
    intel1.businessProfile.name === 'Apex Dental Care' &&
    intel1.businessProfile.category.includes('Dental') &&
    intel1.websiteInsights.sslSecure === true &&
    intel1.websiteInsights.mobileResponsive === true &&
    intel1.overallConfidenceScore >= 80 &&
    intel1.verifiedFacts.length >= 4;

  results.push({ test: '1. Business with strong website data', passed: pass1 });

  // Test 2: Business with weak website (SSL missing, mobile viewport missing, slow)
  const weakBiz: BusinessRawInput = {
    name: 'Hill Country Plumbing',
    category: 'Plumber',
    address: '456 Oak Lane, Austin, TX 78704',
    phone: '(512) 555-0233',
    website: 'http://hillcountryplumbing.com',
    rating: 4.4,
    reviewCount: 38,
    audit: {
      success: true,
      url: 'http://hillcountryplumbing.com',
      httpStatus: 200,
      responseTimeMs: 2400,
      isHttps: false,
      pageTitle: 'Home',
      hasMobileViewport: false,
      h1Count: 0,
      issuesFoundCount: 3,
      identifiedIssues: [
        'Website lacks HTTPS SSL security encryption.',
        'Missing mobile viewport meta tag (poor mobile device responsiveness).',
        'Slow initial server response time (2400ms > 2000ms threshold).',
      ],
      healthRating: 'Poor',
    },
  };

  const intel2 = buildBusinessIntelligence(weakBiz);
  const hasMobileIssue = intel2.observedIssues.some((i) => i.category === 'mobile_optimization');
  const hasSslIssue = intel2.observedIssues.some((i) => i.category === 'ssl_security');
  const pass2 =
    hasMobileIssue &&
    hasSslIssue &&
    intel2.websiteInsights.sslSecure === false &&
    intel2.websiteInsights.mobileResponsive === false &&
    intel2.inferredOpportunities.length >= 2;

  results.push({ test: '2. Business with weak website deficiencies', passed: pass2 });

  // Test 3: Business with NO website
  const noWebBiz: BusinessRawInput = {
    name: 'Austin Classic Auto Body',
    category: 'Auto repair shop',
    address: '789 South Congress, Austin, TX 78704',
    phone: '(512) 555-9876',
    website: null,
    rating: 4.8,
    reviewCount: 52,
  };

  const intel3 = buildBusinessIntelligence(noWebBiz);
  const hasNewWebOpp = intel3.inferredOpportunities.some((o) => o.category === 'new_website_creation');
  const pass3 =
    intel3.businessProfile.hasActiveWebsite === false &&
    hasNewWebOpp &&
    intel3.missingDataNotes.includes('Business does not have a registered website URL.');

  results.push({ test: '3. Business with NO website', passed: pass3 });

  // Test 4: Business with incomplete information (No phone, no rating)
  const incompleteBiz: BusinessRawInput = {
    name: 'Sunset Law Office',
    address: '100 5th St, Austin, TX',
  };

  const intel4 = buildBusinessIntelligence(incompleteBiz);
  const pass4 =
    intel4.businessProfile.reputation.rating === null &&
    intel4.businessProfile.contact.phone === undefined &&
    intel4.missingDataNotes.length >= 2 &&
    intel4.overallConfidenceScore < 60;

  results.push({ test: '4. Incomplete information handling', passed: pass4 });

  // Test 5: Business with no public email discovered
  const noEmailBiz: BusinessRawInput = {
    name: 'Barton Springs Bakery',
    category: 'Bakery',
    address: '1200 Barton Springs Rd, Austin, TX',
    website: 'https://bartonspringsbakery.com',
    rating: 4.7,
    reviewCount: 89,
    audit: {
      success: true,
      url: 'https://bartonspringsbakery.com',
      httpStatus: 200,
      isHttps: true,
      hasMobileViewport: true,
      contactEmails: [],
    },
  };

  const intel5 = buildBusinessIntelligence(noEmailBiz);
  const pass5 =
    intel5.businessProfile.contact.hasPublicEmail === false &&
    intel5.businessProfile.contact.verifiedEmail === undefined &&
    intel5.missingDataNotes.some((n) => n.includes('No direct contact email'));

  results.push({ test: '5. No public email discovered', passed: pass5 });

  // Test 6: Two businesses in same category have distinctly different intelligence
  const plumerA: BusinessRawInput = {
    name: 'Speedy Plumbers',
    category: 'Plumber',
    address: 'Austin, TX',
    website: 'https://speedyplumbers.com',
    rating: 4.9,
    reviewCount: 300,
    audit: {
      success: true,
      url: 'https://speedyplumbers.com',
      isHttps: true,
      hasMobileViewport: true,
      responseTimeMs: 400,
    },
  };

  const plumerB: BusinessRawInput = {
    name: 'Old Town Pipe Masters',
    category: 'Plumber',
    address: 'Austin, TX',
    website: 'http://oldtownpipes.com',
    rating: 3.8,
    reviewCount: 12,
    audit: {
      success: true,
      url: 'http://oldtownpipes.com',
      isHttps: false,
      hasMobileViewport: false,
      responseTimeMs: 3100,
    },
  };

  const intelA = buildBusinessIntelligence(plumerA);
  const intelB = buildBusinessIntelligence(plumerB);

  const pass6 =
    intelA.primaryPitchAngle !== intelB.primaryPitchAngle &&
    intelA.observedIssues.length !== intelB.observedIssues.length &&
    intelA.websiteInsights.sslSecure !== intelB.websiteInsights.sslSecure;

  results.push({ test: '6. Distinct intelligence for same category businesses', passed: pass6 });

  // Test 7: Strict segregation between Verified Facts, Observed Issues, and Inferred Opportunities
  const pass7 =
    intel2.verifiedFacts.every((f) => f.confidence === 'HIGH') &&
    intel2.observedIssues.every((i) => Boolean(i.measuredDataPoint)) &&
    intel2.inferredOpportunities.every((o) => Boolean(o.strategicRationale));

  results.push({ test: '7. Strict segregation of Facts vs. Issues vs. Inferences', passed: pass7 });

  // Test 8: Formatting Context for Proposal Writer output
  const formattedPrompt = formatIntelligenceForProposalWriter(intel2);
  const pass8 =
    formattedPrompt.includes('PROPOSAL MIND STRUCTURED BUSINESS INTELLIGENCE') &&
    formattedPrompt.includes('VERIFIED FACTS') &&
    formattedPrompt.includes('OBSERVED ISSUES') &&
    formattedPrompt.includes('RECOMMENDED SOLUTIONS');

  results.push({ test: '8. Context formatting for LLM Proposal Writer', passed: pass8 });

  // Test 9: Batch processing helper
  const batch = buildBatchBusinessIntelligence([strongBiz, weakBiz, noWebBiz]);
  const pass9 = Array.isArray(batch) && batch.length === 3;

  results.push({ test: '9. Batch business intelligence construction', passed: pass9 });

  // Test 10: Zero hallucination check (Missing properties remain undefined or null)
  const emptyBiz: BusinessRawInput = { name: 'Mystery Store' };
  const intel10 = buildBusinessIntelligence(emptyBiz);
  const pass10 =
    intel10.businessProfile.contact.phone === undefined &&
    intel10.businessProfile.contact.verifiedEmail === undefined &&
    intel10.businessProfile.reputation.rating === null &&
    intel10.businessProfile.hasActiveWebsite === false;

  results.push({ test: '10. Zero hallucination verification on sparse inputs', passed: pass10 });

  return results;
}
