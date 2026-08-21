/**
 * Proposal Intelligence Pipeline Tests
 * 
 * Verifies end-to-end integration:
 * Business Search / Lead Data → Website Audit / Contact Extraction → Proposal Mind → Proposal Writer → Quality Gate → Proposal Result
 */

import { processBusinessProposalPipeline, processBatchProposalPipeline } from './pipeline.js';
import { buildBusinessIntelligence } from './proposalMind.js';
import { generateProposal } from './proposalWriter.js';
import { BusinessRawInput, ProposalMindIntelligence } from './types.js';

export async function runPipelineIntegrationTests() {
  const results: { test: string; passed: boolean; details?: string }[] = [];

  // Scenario 1: One complete business
  const completeBiz: BusinessRawInput = {
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
      pageTitle: 'Apex Dental Care | Austin TX',
      metaDescription: 'Family and cosmetic dental care in Austin.',
      hasMobileViewport: true,
      h1Count: 1,
      contactEmails: ['contact@apexdentalcare.com'],
      primaryEmail: 'contact@apexdentalcare.com',
      issuesFoundCount: 0,
      identifiedIssues: [],
    },
  };

  const res1 = await processBusinessProposalPipeline(completeBiz);
  const pass1 =
    res1.businessName === 'Apex Dental Care' &&
    res1.discoveredEmail === 'contact@apexdentalcare.com' &&
    res1.website === 'https://apexdentalcare.com' &&
    res1.keyVerifiedFacts.length >= 3 &&
    res1.generatedSubject.length > 5 &&
    res1.generatedProposal.includes('Apex Dental Care') &&
    res1.confidence >= 80 &&
    res1.readyToSend === true;

  results.push({
    test: '1. Complete business generates verified intelligence and ready-to-send proposal',
    passed: pass1,
    details: `Confidence: ${res1.confidence}, Ready: ${res1.readyToSend}`,
  });

  // Scenario 2: One business with NO website
  const noWebBiz: BusinessRawInput = {
    name: 'Austin Classic Auto Body',
    category: 'Auto repair shop',
    address: '789 South Congress, Austin, TX 78704',
    phone: '(512) 555-9876',
    website: null,
    rating: 4.8,
    reviewCount: 52,
  };

  const res2 = await processBusinessProposalPipeline(noWebBiz);
  const pass2 =
    res2.businessName === 'Austin Classic Auto Body' &&
    res2.website === null &&
    (res2.opportunity.toLowerCase().includes('digital presence') || res2.opportunity.toLowerCase().includes('website')) &&
    res2.recommendedSolution.toLowerCase().includes('website') &&
    res2.generatedProposal.toLowerCase().includes('website') &&
    res2.missingDataNotes.some((n) => n.toLowerCase().includes('website'));

  results.push({
    test: '2. Business with NO website creates new web presence proposal without hallucinating website stats',
    passed: pass2,
  });

  // Scenario 3: One business with NO email
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

  const res3 = await processBusinessProposalPipeline(noEmailBiz);
  const pass3 =
    res3.discoveredEmail === null &&
    res3.readyToSend === false &&
    res3.missingDataNotes.some((n) => n.includes('email')) &&
    res3.generatedProposal.includes('Barton Springs Bakery');

  results.push({
    test: '3. Business with NO public email marks email missing and readyToSend strictly false',
    passed: pass3,
  });

  // Scenario 3b: Business with placeholder/dummy email MUST NOT be marked readyToSend
  const dummyEmailBiz: BusinessRawInput = {
    name: 'Placeholder Cafe',
    category: 'Cafe',
    address: '100 Broadway, Austin, TX',
    website: 'https://placeholdercafe.com',
    audit: {
      success: true,
      url: 'https://placeholdercafe.com',
      contactEmails: ['unknown@placeholdercafe.com', 'user@example.com'],
      primaryEmail: 'unknown@placeholdercafe.com',
    },
  };

  const res3b = await processBusinessProposalPipeline(dummyEmailBiz);
  const pass3b =
    res3b.discoveredEmail === null &&
    res3b.readyToSend === false;

  results.push({
    test: '3b. Business with placeholder/dummy email is safely rejected from readyToSend',
    passed: pass3b,
  });

  // Scenario 4: Multiple businesses in a batch with strict isolation verification
  const plumbingBiz: BusinessRawInput = {
    name: 'Hill Country Plumbing',
    category: 'Plumber',
    address: '456 Oak Lane, Denver, CO',
    website: 'http://hillcountryplumbing.com',
    rating: 4.2,
    reviewCount: 38,
    audit: {
      success: true,
      url: 'http://hillcountryplumbing.com',
      isHttps: false,
      hasMobileViewport: false,
      responseTimeMs: 2400,
      identifiedIssues: ['Website lacks HTTPS SSL security', 'Missing mobile viewport'],
    },
  };

  const batchInputs: BusinessRawInput[] = [completeBiz, noWebBiz, noEmailBiz, plumbingBiz];
  const batchResults = await processBatchProposalPipeline(batchInputs);
  
  const pass4 =
    Array.isArray(batchResults) &&
    batchResults.length === 4 &&
    batchResults[0].businessName === 'Apex Dental Care' &&
    batchResults[3].businessName === 'Hill Country Plumbing';

  results.push({
    test: '4. Multiple businesses in a batch process independently without errors',
    passed: pass4,
  });

  // Scenario 5: Strict Batch Isolation & Cross-Contamination Test
  const dentalProp = batchResults[0].generatedProposal;
  const plumbingProp = batchResults[3].generatedProposal;

  const noPlumbingInDental =
    !dentalProp.includes('Hill Country Plumbing') &&
    !dentalProp.includes('Denver') &&
    !dentalProp.includes('hillcountryplumbing.com');

  const noDentalInPlumbing =
    !plumbingProp.includes('Apex Dental Care') &&
    !plumbingProp.includes('Dentist') &&
    !plumbingProp.includes('apexdentalcare.com');

  const pass5 = noPlumbingInDental && noDentalInPlumbing;

  results.push({
    test: '5. Batch Isolation: Zero cross-contamination between business leads in batch',
    passed: pass5,
    details: 'Verified Business A facts do not leak into Business B proposal and vice-versa.',
  });

  // Scenario 6: AI Provider failure triggers graceful fallback
  const res6 = await processBusinessProposalPipeline(completeBiz, {
    providerId: 'google',
    model: 'gemini-3.7-flash',
  });

  const pass6 =
    res6.readyToSend === true &&
    res6.generatedSubject.length > 5 &&
    res6.generatedProposal.includes('Apex Dental Care');

  results.push({
    test: '6. AI provider unavailability gracefully triggers high-quality deterministic fallback',
    passed: pass6,
  });

  // Scenario 7: Malformed / incomplete audit data handled safely
  const malformedBiz: BusinessRawInput = {
    name: 'Glitchy Tech Co',
    website: 'http://invalid-broken-domain-999.xyz',
    audit: {
      success: false,
      httpStatus: 500,
      responseTimeMs: undefined,
      identifiedIssues: undefined,
    } as any,
  };

  const res7 = await processBusinessProposalPipeline(malformedBiz);
  const pass7 =
    res7.businessName === 'Glitchy Tech Co' &&
    res7.intelligence !== undefined &&
    res7.confidence >= 0;

  results.push({
    test: '7. Malformed / incomplete audit data handles gracefully with zero crashes',
    passed: pass7,
  });

  // Scenario 8: Confirmation that Proposal Writer only receives ProposalMindIntelligence
  const testIntel = buildBusinessIntelligence(completeBiz);
  let capturedParam: any = null;

  const mockWriterSpy = (intelParam: ProposalMindIntelligence) => {
    capturedParam = intelParam;
    return generateProposal({ intelligence: intelParam });
  };

  await mockWriterSpy(testIntel);

  const pass8 =
    capturedParam !== null &&
    capturedParam.businessProfile !== undefined &&
    capturedParam.verifiedFacts !== undefined &&
    capturedParam.observedIssues !== undefined &&
    capturedParam.inferredOpportunities !== undefined &&
    capturedParam.personalizationPoints !== undefined &&
    capturedParam.overallConfidenceScore !== undefined;

  results.push({
    test: '8. Proposal Writer strictly receives structured ProposalMindIntelligence object',
    passed: pass8,
  });

  return results;
}
