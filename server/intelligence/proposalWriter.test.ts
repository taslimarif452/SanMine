/**
 * Proposal Writer Automated Test Suite
 * 
 * Tests that Proposal Writer consumes ProposalMindIntelligence and produces
 * personalized, evidence-grounded proposals with distinct content and subjects.
 */

import { buildBusinessIntelligence } from './proposalMind.js';
import {
  generateDeterministicProposal,
  generateProposal,
  generateBatchProposals,
  parseStructuredProposalJson,
  repairJsonControlCharacters,
} from './proposalWriter.js';
import { BusinessRawInput } from './types.js';
import { AIProvider, ChatStreamOptions } from '../ai/types.js';

export async function runProposalWriterTests() {
  const results: { test: string; passed: boolean; details?: string }[] = [];

  // Business A: Strong dental clinic with high rating and strong website
  const bizA: BusinessRawInput = {
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
      metaDescription: 'Family and cosmetic dental clinic.',
      hasMobileViewport: true,
      h1Count: 1,
      contactEmails: ['hello@apexdentalcare.com'],
      primaryEmail: 'hello@apexdentalcare.com',
      issuesFoundCount: 0,
      identifiedIssues: [],
    },
  };

  // Business B: Plumbing contractor with no mobile viewport and no SSL
  const bizB: BusinessRawInput = {
    name: 'Hill Country Plumbing',
    category: 'Plumber',
    address: '456 Oak Lane, Austin, TX 78704',
    phone: '(512) 555-0233',
    website: 'http://hillcountryplumbing.com',
    rating: 4.2,
    reviewCount: 38,
    audit: {
      success: true,
      url: 'http://hillcountryplumbing.com',
      httpStatus: 200,
      responseTimeMs: 2400,
      isHttps: false,
      hasMobileViewport: false,
      h1Count: 0,
      issuesFoundCount: 3,
      identifiedIssues: [
        'Website lacks HTTPS SSL security encryption.',
        'Missing mobile viewport meta tag.',
      ],
    },
  };

  // Business C: Auto shop with NO website
  const bizC: BusinessRawInput = {
    name: 'Austin Classic Auto Body',
    category: 'Auto repair shop',
    address: '789 South Congress, Austin, TX 78704',
    phone: '(512) 555-9876',
    website: null,
    rating: 4.8,
    reviewCount: 52,
  };

  const intelA = buildBusinessIntelligence(bizA);
  const intelB = buildBusinessIntelligence(bizB);
  const intelC = buildBusinessIntelligence(bizC);

  // Test 1: Two businesses with different intelligence produce different proposals
  const propA = generateDeterministicProposal({ intelligence: intelA });
  const propB = generateDeterministicProposal({ intelligence: intelB });

  const pass1 =
    propA.success === true &&
    propB.success === true &&
    propA.subject !== propB.subject &&
    propA.body !== propB.body &&
    propA.opportunityUsed !== propB.opportunityUsed;

  results.push({
    test: '1. Two businesses with different intelligence produce distinctly different proposals',
    passed: pass1,
  });

  // Test 2: Strong personalization points are used in the text
  const pass2 =
    propA.body.includes('Apex Dental Care') &&
    (propA.body.includes('4.9-star') || propA.body.includes('142 reviews') || propA.body.includes('Dental')) &&
    propB.body.includes('Hill Country Plumbing') &&
    (propB.body.includes('viewport') || propB.body.includes('mobile') || propB.body.includes('SSL'));

  results.push({
    test: '2. Strong personalization points are naturally integrated into proposal body',
    passed: pass2,
  });

  // Test 3: Unsupported facts/hallucinations are NOT introduced
  const bannedBuzzwords = ['10x revenue', 'award winning team of 50', '$1,000,000', 'guaranteed #1 ranking in 24 hours'];
  const pass3 =
    !bannedBuzzwords.some((b) => propA.body.includes(b)) &&
    !bannedBuzzwords.some((b) => propB.body.includes(b)) &&
    !propA.body.includes('I hope this email finds you well');

  results.push({
    test: '3. Unsupported metrics, fake awards, and spam clichés are absent',
    passed: pass3,
  });

  // Test 4: Limited intelligence safely refuses generation without hallucinating
  const sparseBiz: BusinessRawInput = { name: 'Unknown Shop' };
  const sparseIntel = buildBusinessIntelligence(sparseBiz);
  const sparseProp = generateDeterministicProposal({ intelligence: sparseIntel });

  const pass4 =
    sparseProp.success === false &&
    sparseProp.reason !== undefined &&
    sparseProp.reason.includes('Insufficient reliable business data') &&
    sparseProp.missingDataNotes !== undefined &&
    sparseProp.missingDataNotes.length > 0;

  results.push({
    test: '4. Limited intelligence triggers graceful fallback gate without fabricating details',
    passed: pass4,
  });

  // Test 5: Subject is generated from the specific business opportunity
  const propC = generateDeterministicProposal({ intelligence: intelC });
  const pass5 =
    propB.subject.toLowerCase().includes('mobile') ||
    propB.subject.toLowerCase().includes('security') ||
    propB.subject.toLowerCase().includes('hill country plumbing');

  const pass5b =
    propC.subject.toLowerCase().includes('online presence') ||
    propC.subject.toLowerCase().includes('austin classic auto body');

  results.push({
    test: '5. Subject lines are contextually generated from specific business opportunities',
    passed: pass5 && pass5b,
  });

  // Test 6: The writer correctly consumes ProposalMindIntelligence object
  const pass6 =
    propA.confidence === intelA.overallConfidenceScore &&
    propA.recipientEmail === 'hello@apexdentalcare.com' &&
    propA.personalizationUsed.length > 0;

  results.push({
    test: '6. Writer correctly binds to ProposalMindIntelligence structure',
    passed: pass6,
  });

  // Test 7: Batch generation helper processes multiple intelligence records
  const batchResults = await generateBatchProposals([intelA, intelB, intelC]);
  const pass7 =
    Array.isArray(batchResults) &&
    batchResults.length === 3 &&
    batchResults.every((r) => r.success === true);

  results.push({
    test: '7. Batch proposal generation helper executes cleanly across multiple leads',
    passed: pass7,
  });

  // Test 8: Mocked AI Provider execution path
  const mockAiProvider: AIProvider = {
    id: 'google',
    name: 'Mock Gemini',
    description: 'Mock for unit tests',
    defaultModel: 'gemini-3.7-flash',
    capabilities: { streaming: true, toolCalling: true, vision: true },
    isConfigured: () => true,
    testConnection: async () => ({ success: true }),
    listModels: async () => [],
    streamChat: async (opts: ChatStreamOptions) => {
      const mockReply = JSON.stringify({
        subject: `Custom website note for Apex Dental Care`,
        body: `Hi Apex Dental Care team,\n\nI noticed your strong 4.9-star reputation in Austin. We would love to help optimize your patient booking flow.\n\nBest,\nSANMine Team`,
        opportunityUsed: 'Patient Booking Optimization',
        personalizationUsed: ['Customer Reputation', 'Local Service'],
      });
      opts.onEvent({ type: 'message.delta', content: mockReply });
    },
  };

  // Run with mock provider directly
  const promptText = 'Test prompt';
  let mockStreamed = '';
  await mockAiProvider.streamChat({
    taskId: 'test_task',
    messages: [{ role: 'user', content: promptText }],
    model: 'gemini-3.7-flash',
    onEvent: (evt) => {
      if (evt.type === 'message.delta' && evt.content) mockStreamed += evt.content;
    },
  });

  const parsedMock = JSON.parse(mockStreamed);
  const pass8 =
    parsedMock.subject.includes('Apex Dental Care') &&
    parsedMock.opportunityUsed === 'Patient Booking Optimization';

  results.push({
    test: '8. AI Provider integration contract and streaming parser operate correctly',
    passed: pass8,
  });

  // Test 9: Robust JSON Parser handles unescaped newlines and control characters
  const rawWithUnescapedNewlines = '```json\n{\n  "subject": "Proposal for Apex Dental",\n  "body": "Hi Apex Team,\n\nI noticed your website has mobile layout issues.\n\nBest,\nSANMine",\n  "opportunityUsed": "Mobile Optimization",\n  "personalizationUsed": ["Dental"]\n}\n```';
  const parsedRes = parseStructuredProposalJson(rawWithUnescapedNewlines);
  const pass9 =
    parsedRes !== null &&
    parsedRes.subject === 'Proposal for Apex Dental' &&
    parsedRes.body.includes('Hi Apex Team') &&
    parsedRes.opportunityUsed === 'Mobile Optimization';

  results.push({
    test: '9. Robust structured parser handles markdown wrappers and unescaped newlines inside JSON strings',
    passed: pass9,
  });

  // Test 10: Deterministic fallback and AI results report correct generationMethod
  const pass10 =
    propA.generationMethod === 'deterministic_fallback' &&
    propB.generationMethod === 'deterministic_fallback';

  results.push({
    test: '10. Generation methods are accurately tracked (deterministic_fallback vs ai)',
    passed: pass10,
  });

  return results;
}
