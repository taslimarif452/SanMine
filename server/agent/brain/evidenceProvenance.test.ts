/**
 * P0-2 Evidence, Source Provenance & Grounded Reporting Test Suite
 *
 * 10 Mandatory Regression Tests:
 * 1. Provenance Test: Extract fact → source and evidence preserved.
 * 2. Evidence Mismatch Test: Quote does not contain fact → verification fails.
 * 3. No-Source Fact Test: Fact without source → rejected.
 * 4. Website Absence Test: Business with no website → verified vs unverified handled correctly (VERIFIED_NO_WEBSITE, WEBSITE_FOUND, UNKNOWN).
 * 5. Fabricated Email Test: Pattern-guessed email without evidence → rejected.
 * 6. Action Provenance Test: Tool sends email → execution record verifies real send (or failure recorded as EMAIL_FAILED).
 * 7. Source Classification Test: Map, directory, search result, primary classified correctly.
 * 8. URL Normalization Test: Tracking params removed, redirects unwrapped.
 * 9. Final Report Structure Test: Report contains Result, Summary, Evidence, Sources, Limitations.
 * 10. Partial Completion Reporting Test: Requested 5, verified 3 → report explicitly shows 3 verified, 2 unverified.
 */

import { evidenceProvenanceEngine } from './evidenceProvenance.js';
import { BrainTaskState, TrackedEntityState } from './types.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✓ ${testName}`);
    passed++;
  } else {
    console.error(`  ✗ ${testName}${detail ? ` - ${detail}` : ''}`);
    failed++;
  }
}

export async function runEvidenceProvenanceTests() {
  console.log('\n🔍 [TEST SUITE] P0-2 Evidence, Source Provenance & Grounded Reporting');
  console.log('======================================================================');

  // Test 1: Provenance Test — Extract fact → source and evidence preserved
  {
    const rawUrl = 'https://www.examplebakery.com/contact?utm_source=google';
    const quote = 'For catering inquiries call our main line at +1-555-0199 or visit our shop.';
    const validation = evidenceProvenanceEngine.validateFactEvidence(
      {
        field: 'phone',
        extractedValue: '+1-555-0199',
        sourceTitle: 'Example Bakery Contact',
      },
      quote,
      rawUrl
    );

    assert(
      validation.verified === true &&
      validation.groundedFact.sourceUrl === 'https://www.examplebakery.com/contact' &&
      validation.groundedFact.sourceDomain === 'examplebakery.com' &&
      validation.groundedFact.sourceType === 'PRIMARY' &&
      validation.groundedFact.evidenceQuote.includes('+1-555-0199'),
      'Test 1: Provenance Test — Preserves sourceUrl, sourceDomain, sourceType, and evidenceQuote'
    );
  }

  // Test 2: Evidence Mismatch Test — Quote does not contain fact → verification fails
  {
    const quote = 'Welcome to our downtown store open Monday to Friday.';
    const validation = evidenceProvenanceEngine.validateFactEvidence(
      {
        field: 'phone',
        extractedValue: '+1-800-555-9999',
        sourceUrl: 'https://example.com',
      },
      quote
    );

    assert(
      validation.verified === false &&
      (validation.reason || '').includes('does not support claimed value') &&
      validation.groundedFact.verified === false,
      'Test 2: Evidence Mismatch Test — Rejects fact if quote does not support the value'
    );
  }

  // Test 3: No-Source Fact Test — Fact without source → rejected
  {
    const validationEmpty = evidenceProvenanceEngine.validateFactEvidence({
      field: 'email',
      extractedValue: 'info@test.com',
      sourceUrl: '',
    });
    const validationUnknown = evidenceProvenanceEngine.validateFactEvidence({
      field: 'pricing',
      extractedValue: '$99/mo',
      sourceUrl: 'unknown',
    });

    assert(
      validationEmpty.verified === false &&
      validationEmpty.reason?.includes('lacks a valid source URL') &&
      validationUnknown.verified === false,
      'Test 3: No-Source Fact Test — Rejects facts without a valid source URL'
    );
  }

  // Test 4: Website Absence Test — Business with no website → VERIFIED_NO_WEBSITE vs WEBSITE_FOUND vs UNKNOWN
  {
    const entityWithWeb: TrackedEntityState = {
      name: 'Modern Dental Care',
      url: 'https://moderndental.com',
      hasWebsite: true,
    };
    const resWithWeb = evidenceProvenanceEngine.verifyWebsiteAbsence(entityWithWeb);

    const entityNoWeb: TrackedEntityState = {
      name: 'Sharma Local Auto Repair',
      url: null,
      hasNoWebsiteVerified: true,
      hasWebsite: false,
    };
    const resNoWeb = evidenceProvenanceEngine.verifyWebsiteAbsence(entityNoWeb);

    const entityUnknown: TrackedEntityState = {
      name: 'Unchecked Corner Store',
    };
    const resUnknown = evidenceProvenanceEngine.verifyWebsiteAbsence(entityUnknown);

    assert(
      resWithWeb.websiteStatus === 'WEBSITE_FOUND' &&
      resWithWeb.hasWebsite === true &&
      resNoWeb.websiteStatus === 'VERIFIED_NO_WEBSITE' &&
      resNoWeb.hasWebsite === false &&
      resNoWeb.hasNoWebsiteVerified === true &&
      resUnknown.websiteStatus === 'UNKNOWN',
      'Test 4: Website Absence Test — Distinguishes VERIFIED_NO_WEBSITE, WEBSITE_FOUND, and UNKNOWN'
    );
  }

  // Test 5: Fabricated Email Test — Pattern-guessed email without evidence → rejected
  {
    const fakeDomain = evidenceProvenanceEngine.verifyEmailEvidence('info@example.com', 'Our email is info@example.com');
    const unevidenced = evidenceProvenanceEngine.verifyEmailEvidence(
      'ceo@techstartup.io',
      'Contact our team via phone or contact form on our website.',
      'https://techstartup.io'
    );
    const genuine = evidenceProvenanceEngine.verifyEmailEvidence(
      'contact@realbusiness.org',
      'Please send inquiries to contact@realbusiness.org for fast response.',
      'https://realbusiness.org/contact'
    );

    assert(
      fakeDomain.emailStatus === 'UNVERIFIED' &&
      unevidenced.emailStatus === 'UNVERIFIED' &&
      genuine.emailStatus === 'VERIFIED' &&
      genuine.email === 'contact@realbusiness.org',
      'Test 5: Fabricated Email Test — Rejects fake/guessed emails and accepts evidenced email'
    );
  }

  // Test 6: Action Provenance Test — External actions tracked accurately (EMAIL_SENT vs EMAIL_FAILED)
  {
    const mockState: BrainTaskState = {
      taskId: 'test_action_prov',
      userPrompt: 'Email proposals to 2 bakeries',
      conversationHistory: [],
      plan: {
        goal: 'Email proposals to bakeries',
        userIntent: 'DISCOVERY_AND_EXTRACTION',
        entities: [],
        requestedFields: ['email'],
        quantity: 2,
        constraints: [],
        sourcePreference: 'auto',
        discoveryStrategy: 'search_first',
        browserRequired: true,
        toolsRequired: ['send_email'],
        expectedOutput: 'Report',
        completionCriteria: 'Emails dispatched',
        emailActionsRequired: true,
        proposalRequired: true,
        nextAction: { type: 'complete', toolName: '', toolArgs: {}, rationale: '', expectedObservation: '' },
      },
      currentIteration: 2,
      maxIterations: 5,
      verifiedEntities: [
        {
          name: 'Sweet Crust Bakery',
          email: 'order@sweetcrust.com',
          emailStatus: 'VERIFIED',
          proposalMarkdown: '# Proposal for Sweet Crust',
          emailSent: true,
          status: 'EMAIL_SENT',
        },
        {
          name: 'Golden Loaf Bakery',
          email: 'info@goldenloaf.com',
          emailStatus: 'VERIFIED',
          proposalMarkdown: '# Proposal for Golden Loaf',
          emailSent: false,
          emailSendError: 'SMTP 550 Recipient mailbox unavailable',
          status: 'QUALIFIED',
        },
      ],
      visitedUrls: new Set(['https://sweetcrust.com', 'https://goldenloaf.com']),
      visitedDomains: new Set(['sweetcrust.com', 'goldenloaf.com']),
      discoveredCandidates: [],
      observations: [],
      extractedFacts: [],
      evidence: [],
      failedActions: [],
      executedActionIds: new Set(['action_1']),
      replanCount: 0,
      remainingWork: '',
      status: 'COMPLETED',
    };

    const report = evidenceProvenanceEngine.formatStructuredEvidenceReport(mockState);

    assert(
      report.includes('EMAIL_SENT (Message Delivered)') &&
      report.includes('EMAIL_FAILED (SMTP 550 Recipient mailbox unavailable)'),
      'Test 6: Action Provenance Test — Accurately displays EMAIL_SENT vs EMAIL_FAILED'
    );
  }

  // Test 7: Source Classification Test — Map, directory, search result, primary classified correctly
  {
    const mapClass = evidenceProvenanceEngine.classifySourceQuality('https://maps.google.com/place/xyz');
    const dirClass = evidenceProvenanceEngine.classifySourceQuality('https://www.justdial.com/Mumbai/Plumbers');
    const searchClass = evidenceProvenanceEngine.classifySourceQuality('https://www.google.com/search?q=dentists');
    const secClass = evidenceProvenanceEngine.classifySourceQuality('https://www.instagram.com/localcafe');
    const priClass = evidenceProvenanceEngine.classifySourceQuality('https://acmepartyrentals.com/about');

    assert(
      mapClass === 'MAP' &&
      dirClass === 'DIRECTORY' &&
      searchClass === 'SEARCH_RESULT' &&
      secClass === 'SECONDARY' &&
      priClass === 'PRIMARY',
      'Test 7: Source Classification Test — Correctly identifies MAP, DIRECTORY, SEARCH_RESULT, SECONDARY, PRIMARY'
    );
  }

  // Test 8: URL Normalization Test — Strips tracking params & unwraps redirects
  {
    const dirtyUrl = 'https://www.example.com/services?utm_source=facebook&utm_medium=cpc&fbclid=IwAR123&category=plumbing';
    const cleanUrl = evidenceProvenanceEngine.normalizeSourceUrl(dirtyUrl);

    const redirectUrl = 'https://www.google.com/url?q=https://www.myshop.com/contact&sa=U&ved=2ahUKEwj';
    const unwrapped = evidenceProvenanceEngine.normalizeSourceUrl(redirectUrl);

    const rootSlash = evidenceProvenanceEngine.normalizeSourceUrl('https://example.org/');

    assert(
      cleanUrl === 'https://www.example.com/services?category=plumbing' &&
      !cleanUrl.includes('utm_source') &&
      !cleanUrl.includes('fbclid') &&
      unwrapped === 'https://www.myshop.com/contact' &&
      rootSlash === 'https://example.org',
      'Test 8: URL Normalization Test — Strips tracking params and unwraps search redirects'
    );
  }

  // Test 9: Final Report Structure Test — Contains Result, Summary, Evidence, Sources, Limitations
  {
    const mockState: BrainTaskState = {
      taskId: 'test_report_structure',
      userPrompt: 'Find 1 plumbing service in Chicago',
      conversationHistory: [],
      plan: {
        goal: 'Find 1 plumbing service in Chicago',
        userIntent: 'DISCOVERY_AND_EXTRACTION',
        entities: [],
        requestedFields: ['phone', 'services'],
        quantity: 1,
        constraints: [],
        sourcePreference: 'auto',
        discoveryStrategy: 'search_first',
        browserRequired: true,
        toolsRequired: ['search_businesses'],
        expectedOutput: 'Plumber details',
        completionCriteria: 'Found 1 verified plumber',
        nextAction: { type: 'complete', toolName: '', toolArgs: {}, rationale: '', expectedObservation: '' },
      },
      currentIteration: 1,
      maxIterations: 5,
      verifiedEntities: [
        {
          name: 'Windy City Emergency Plumbing',
          phone: '+1-312-555-0144',
          address: '450 N Michigan Ave, Chicago, IL',
          services: '24/7 Leak repair, pipe unclogging',
          url: 'https://windycityplumbing.com',
          hasWebsite: true,
          status: 'VERIFIED',
          facts: [
            {
              field: 'phone',
              extractedValue: '+1-312-555-0144',
              sourceUrl: 'https://windycityplumbing.com/contact',
              evidenceQuote: 'Emergency dispatch: +1-312-555-0144',
              confidence: 0.95,
              timestamp: new Date().toISOString(),
            },
          ],
        },
      ],
      visitedUrls: new Set(['https://windycityplumbing.com/contact']),
      visitedDomains: new Set(['windycityplumbing.com']),
      discoveredCandidates: [],
      observations: [],
      extractedFacts: [],
      evidence: [],
      failedActions: [],
      executedActionIds: new Set(),
      replanCount: 0,
      remainingWork: '',
      status: 'COMPLETED',
    };

    const report = evidenceProvenanceEngine.formatStructuredEvidenceReport(mockState);

    assert(
      report.includes('### Result') &&
      report.includes('### Summary') &&
      report.includes('### Evidence') &&
      report.includes('### Sources') &&
      report.includes('### Limitations') &&
      report.includes('Windy City Emergency Plumbing') &&
      report.includes('+1-312-555-0144'),
      'Test 9: Final Report Structure Test — Produces Result, Summary, Evidence, Sources, and Limitations'
    );
  }

  // Test 10: Partial Completion Reporting Test — Requested 5, verified 3 → report shows 3 verified, 2 unverified
  {
    const mockState: BrainTaskState = {
      taskId: 'test_partial_reporting',
      userPrompt: 'Find 5 local clinics in Austin without a website',
      conversationHistory: [],
      plan: {
        goal: 'Find 5 local clinics in Austin without a website',
        userIntent: 'DISCOVERY_AND_EXTRACTION',
        entities: [],
        requestedFields: ['phone', 'address'],
        quantity: 5,
        noWebsiteRequired: true,
        constraints: ['Must not have website'],
        sourcePreference: 'auto',
        discoveryStrategy: 'search_first',
        browserRequired: true,
        toolsRequired: ['search_businesses'],
        expectedOutput: 'Clinics',
        completionCriteria: '5 verified clinics',
        nextAction: { type: 'complete', toolName: '', toolArgs: {}, rationale: '', expectedObservation: '' },
      },
      currentIteration: 3,
      maxIterations: 6,
      verifiedEntities: [
        {
          name: 'Austin Community Health Post 1',
          hasWebsite: false,
          hasNoWebsiteVerified: true,
          websiteStatus: 'VERIFIED_NO_WEBSITE',
          phone: '+1-512-555-0101',
          status: 'QUALIFIED',
        },
        {
          name: 'Austin Community Health Post 2',
          hasWebsite: false,
          hasNoWebsiteVerified: true,
          websiteStatus: 'VERIFIED_NO_WEBSITE',
          phone: '+1-512-555-0102',
          status: 'QUALIFIED',
        },
        {
          name: 'Austin Community Health Post 3',
          hasWebsite: false,
          hasNoWebsiteVerified: true,
          websiteStatus: 'VERIFIED_NO_WEBSITE',
          phone: '+1-512-555-0103',
          status: 'QUALIFIED',
        },
        {
          name: 'Austin Big Care Hospital',
          url: 'https://austinbigcare.com',
          hasWebsite: true,
          websiteStatus: 'WEBSITE_FOUND',
          status: 'REJECTED',
          rejectionReason: 'Has active website',
        },
      ],
      visitedUrls: new Set(['https://austinbigcare.com']),
      visitedDomains: new Set(['austinbigcare.com']),
      discoveredCandidates: [],
      observations: [],
      extractedFacts: [],
      evidence: [],
      failedActions: [],
      executedActionIds: new Set(),
      replanCount: 0,
      remainingWork: '',
      status: 'COMPLETED',
    };

    const report = evidenceProvenanceEngine.formatStructuredEvidenceReport(mockState);

    assert(
      report.includes('**Requested**: 5') &&
      report.includes('**Verified**: 3') &&
      report.includes('**Remaining**: 2') &&
      report.includes('Austin Big Care Hospital') &&
      report.includes('Candidate Pool Limitation'),
      'Test 10: Partial Completion Reporting Test — Accurately accounts for 3 verified and 2 unavailable'
    );
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed.`);
  if (failed > 0) {
    process.exit(1);
  }
}

// Run directly when executed
runEvidenceProvenanceTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});

