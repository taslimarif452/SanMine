import assert from 'node:assert';
import {
  extractHtmlData,
  extractReadableText,
  extractEmails,
  extractLinks,
} from './htmlExtractor.js';
import { extractFactsFromPage, extractServicesFromPages } from './researchEngine.js';
import { FetchedPage } from './types.js';
import { normalizeRequestedLocation, verifyBusinessLocation } from '../search/location.js';
import { isIrrelevantSearchResult, calculateCandidateQuality, classifyBusinessEntity } from './discovery.js';

export function runResearchFoundationTests() {
  console.log('[TEST] Starting API-Free Web Research Foundation Test Suite...');

  // 1. HTML text extraction
  const sampleHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Apex Dental Care - Modern Family Dentistry</title>
        <style>body { color: red; } .nav { display: flex; }</style>
        <script>console.log("analytics tracking code");</script>
      </head>
      <body>
        <!-- Top Navigation bar -->
        <header>
          <nav><a href="/about">About Us</a> <a href="/contact">Contact</a></nav>
        </header>
        <main>
          <h1>Welcome to Apex Dental Care</h1>
          <p>We provide compassionate, advanced cosmetic and preventive dental treatments in Austin, Texas.</p>
          <div>Schedule your consultation today.</div>
        </main>
        <footer>
          <p>&copy; 2026 Apex Dental Care. All rights reserved.</p>
        </footer>
      </body>
    </html>
  `;

  const text = extractReadableText(sampleHtml);
  assert.ok(text.includes('Welcome to Apex Dental Care'), 'Must contain main heading');
  assert.ok(text.includes('We provide compassionate'), 'Must contain body text');
  assert.ok(!text.includes('color: red'), 'Must not contain CSS styles');
  assert.ok(!text.includes('analytics tracking code'), 'Must not contain script content');
  assert.ok(!text.includes('<!--'), 'Must not contain comments');
  console.log('✓ Test 1: Clean readable text extraction passed');

  // 2. Metadata extraction
  const htmlWithMeta = `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Zenith Legal Partners | Commercial Litigation</title>
        <meta name="description" content="Premier corporate firm." />
        <link rel="canonical" href="https://zenithlegal.com/overview" />
        <meta property="og:title" content="Zenith Legal Partners" />
        <meta property="og:type" content="website" />
      </head>
      <body>
        <h1>High Stakes Dispute Attorneys</h1>
      </body>
    </html>
  `;

  const extracted = extractHtmlData(htmlWithMeta, 'https://zenithlegal.com');
  assert.strictEqual(extracted.title, 'Zenith Legal Partners | Commercial Litigation');
  assert.strictEqual(extracted.description, 'Premier corporate firm.');
  assert.strictEqual(extracted.hasViewport, true);
  assert.strictEqual(extracted.viewportTag, 'width=device-width, initial-scale=1.0');
  assert.strictEqual(extracted.canonicalUrl, 'https://zenithlegal.com/overview');
  assert.strictEqual(extracted.ogTags['title'], 'Zenith Legal Partners');
  console.log('✓ Test 2: Metadata extraction passed');

  // 3. Email extraction & False-positive filtering
  const htmlWithEmails = `
    <div>
      <p>For inquiries, email our team at <a href="mailto:info@summitroofing.com">info@summitroofing.com</a> or partners@summitroofing.com.</p>
      <img src="/assets/logo@2x.png" alt="logo" />
      <p>Do not include user@example.com, test@test.com, or icon@3x.svg</p>
    </div>
  `;

  const readable = extractReadableText(htmlWithEmails);
  const emails = extractEmails(htmlWithEmails, readable);
  assert.ok(emails.includes('info@summitroofing.com'), 'Must extract mailto email');
  assert.ok(emails.includes('partners@summitroofing.com'), 'Must extract plain text email');
  assert.ok(!emails.includes('logo@2x.png'), 'Must filter image asset filename');
  assert.ok(!emails.includes('user@example.com'), 'Must filter example.com placeholder');
  console.log('✓ Test 3: Email extraction and filtering passed');

  // 4. Source attribution and fact grounding
  const mockPage: FetchedPage = {
    url: 'https://vanguardplumbing.com',
    finalUrl: 'https://vanguardplumbing.com',
    status: 200,
    statusText: 'OK',
    contentType: 'text/html',
    isHttps: true,
    responseTimeMs: 120,
    readableText: 'Vanguard Plumbing provides 24/7 emergency water heater repair and pipe inspection.',
    title: 'Vanguard Plumbing & Heating',
    description: 'Emergency plumbing specialists in Chicago.',
    ogTags: {},
    hasMobileViewport: true,
    links: [],
    emails: ['service@vanguardplumbing.com'],
    phoneNumbers: ['(312) 555-0199'],
    headings: {
      h1: ['Chicago Emergency Plumbing & Heating'],
      h2: ['Water Heater Replacement', 'Drain Cleaning Services'],
      h3: [],
    },
    fetchedAt: new Date().toISOString(),
  };

  const facts = extractFactsFromPage(mockPage);
  assert.ok(facts.length >= 5, 'Must extract at least 5 structured facts');
  for (const fact of facts) {
    assert.strictEqual(fact.sourceUrl, 'https://vanguardplumbing.com');
    assert.ok(fact.evidence.length > 0, 'Evidence must not be empty');
  }
  console.log('✓ Test 4: Fact grounding & source attribution passed');

  // 5. Link normalization & Subpage categorization
  const htmlWithLinks = `
    <div>
      <a href="/about-us">About Our Clinic</a>
      <a href="/contact">Get in Touch</a>
      <a href="/services/dental-implants">Dental Implants</a>
      <a href="https://externalpartners.com">Partner Network</a>
    </div>
  `;

  const links = extractLinks(htmlWithLinks, 'https://myclinic.com');
  const aboutLink = links.find((l) => l.href === '/about-us');
  assert.ok(aboutLink?.isSubpage, 'About link must be classified as subpage');
  assert.strictEqual(aboutLink?.subpageType, 'about');
  assert.strictEqual(aboutLink?.fullUrl, 'https://myclinic.com/about-us');
  console.log('✓ Test 5: Subpage categorization passed');

  // 6. Service extraction & Anti-hallucination
  const mockPage2: FetchedPage = {
    url: 'https://hvacpro.com',
    finalUrl: 'https://hvacpro.com',
    status: 200,
    statusText: 'OK',
    contentType: 'text/html',
    isHttps: true,
    responseTimeMs: 80,
    readableText: '',
    title: '',
    description: '',
    ogTags: {},
    hasMobileViewport: true,
    links: [],
    emails: [],
    phoneNumbers: [],
    headings: {
      h1: ['HVAC Services'],
      h2: ['AC Installation & Repair', 'Furnace Maintenance', 'Privacy Policy'],
      h3: [],
    },
    fetchedAt: new Date().toISOString(),
  };

  const services = extractServicesFromPages([mockPage2]);
  assert.ok(services.includes('AC Installation & Repair'), 'Must include real service');
  assert.ok(services.includes('Furnace Maintenance'), 'Must include second service');
  assert.ok(!services.includes('Privacy Policy'), 'Must exclude boilerplate UI text');
  console.log('✓ Test 6: Grounded service extraction passed');

  // 7. Missing-data handling
  const emptyHtml = `<html><body></body></html>`;
  const emptyExtracted = extractHtmlData(emptyHtml, 'https://empty-test.com');
  assert.strictEqual(emptyExtracted.title, '', 'Title must be empty string when absent');
  assert.strictEqual(emptyExtracted.description, '', 'Description must be empty string when absent');
  assert.strictEqual(emptyExtracted.hasViewport, false, 'hasViewport must be false when tag is missing');
  assert.deepStrictEqual(emptyExtracted.emails, [], 'Emails must be empty array when absent');
  assert.deepStrictEqual(emptyExtracted.phones, [], 'Phones must be empty array when absent');
  assert.deepStrictEqual(emptyExtracted.links, [], 'Links must be empty array when absent');
  console.log('✓ Test 7: Missing-data handling passed');

  // 8. Malformed HTML parsing resilience
  const malformedHtml = `
    <title>Broken Title <div
    <h1 unclosed quote=">Specialist Clinic</h1>
    <p>Contact us at broken-email@@invalid but real at <a href="mailto:real@clinic.org">real@clinic.org</a>
    <meta name="description" content='Unclosed attribute
    <a href='/services'>Our Services
  `;
  const malformedExtracted = extractHtmlData(malformedHtml, 'https://broken.com');
  assert.ok(malformedExtracted.emails.includes('real@clinic.org'), 'Must extract valid email from malformed HTML');
  assert.ok(!malformedExtracted.emails.includes('broken-email@@invalid'), 'Must ignore invalid email format');
  console.log('✓ Test 8: Malformed HTML resilience passed');

  // 9. Unreachable pages handling
  const unreachablePage: FetchedPage = {
    url: 'https://nonexistent-domain-404.com',
    finalUrl: 'https://nonexistent-domain-404.com',
    status: 404,
    statusText: 'Not Found',
    contentType: 'text/html',
    isHttps: true,
    responseTimeMs: 250,
    readableText: '404 Page Not Found',
    title: '404 Not Found',
    description: '',
    ogTags: {},
    hasMobileViewport: false,
    links: [],
    emails: [],
    phoneNumbers: [],
    headings: { h1: ['404 Not Found'], h2: [], h3: [] },
    error: 'HTTP 404 Not Found',
    fetchedAt: new Date().toISOString(),
  };
  const unreachableFacts = extractFactsFromPage(unreachablePage);
  assert.strictEqual(unreachableFacts.length, 0, 'Unreachable or 4xx/5xx page must return 0 facts');
  console.log('✓ Test 9: Unreachable pages handling passed');

  // 10. Anti-hallucination verification
  const barePage: FetchedPage = {
    url: 'https://barebones-portfolio.org',
    finalUrl: 'https://barebones-portfolio.org',
    status: 200,
    statusText: 'OK',
    contentType: 'text/html',
    isHttps: true,
    responseTimeMs: 60,
    readableText: 'A simple minimalist design portfolio.',
    title: 'Design Minimal',
    description: '',
    ogTags: {},
    hasMobileViewport: true,
    links: [],
    emails: [],
    phoneNumbers: [],
    headings: { h1: [], h2: [], h3: [] },
    fetchedAt: new Date().toISOString(),
  };
  const bareFacts = extractFactsFromPage(barePage);
  const contactFacts = bareFacts.filter((f) => f.category === 'contact');
  assert.strictEqual(contactFacts.length, 0, 'No contact facts should be synthesized if none present');
  const serviceFacts = bareFacts.filter((f) => f.category === 'services');
  assert.strictEqual(serviceFacts.length, 0, 'No service facts should be synthesized if none present');
  console.log('✓ Test 10: Anti-hallucination strict enforcement passed');

  // 11. Location normalization and validation tests
  const locAustin = normalizeRequestedLocation('Austin, TX');
  assert.strictEqual(locAustin.city, 'Austin');
  assert.strictEqual(locAustin.state, 'TX');
  assert.strictEqual(locAustin.country, 'United States');

  const locUndefined = normalizeRequestedLocation(undefined);
  assert.strictEqual(locUndefined.city, '');
  assert.strictEqual(locUndefined.state, undefined);
  console.log('✓ Test 11: Location normalization and no-silent-Ranchi check passed');

  // 12. Business location verification
  const validAustinBiz = {
    name: 'Austin Family Dental',
    address: '123 Congress Ave, Austin, TX 78701',
  };
  const verificationResult = verifyBusinessLocation(validAustinBiz, 'Austin, TX');
  assert.strictEqual(verificationResult.verified, true);
  assert.ok(verificationResult.matchedDetails.includes('Austin'));

  const wrongLocationBiz = {
    name: 'Seattle Coffee Roasters',
    address: '456 Pike St, Seattle, WA 98101',
  };
  const wrongVerification = verifyBusinessLocation(wrongLocationBiz, 'Austin, TX');
  assert.strictEqual(wrongVerification.verified, false);
  console.log('✓ Test 12: Business location verification and filtering passed');

  // 13. Search Result Relevance Gate tests (Hardening against non-business URLs)
  // Irrelevant domain: microsoft support / hotmail
  const hotmailRes = isIrrelevantSearchResult(
    'https://support.microsoft.com/en-us/office/hotmail-support-8854',
    'How to sign in to Hotmail or Outlook.com - Microsoft Support',
    'Get help signing in to your Outlook.com or Hotmail account.'
  );
  assert.strictEqual(hotmailRes.isIrrelevant, true, 'Must reject Microsoft support domain');

  // Irrelevant domain: windows blog
  const blogRes = isIrrelevantSearchResult(
    'https://blogs.windows.com/windowsexperience/2024/05/21/announcing-windows-11-updates/',
    'Announcing new Windows 11 features | Windows Experience Blog',
    'Learn about new Copilot+ PC features in Windows 11.'
  );
  assert.strictEqual(blogRes.isIrrelevant, true, 'Must reject Windows blog domain');

  // Irrelevant domain: GeForce NOW gaming
  const geforceRes = isIrrelevantSearchResult(
    'https://www.nvidia.com/en-us/geforce-now/',
    'GeForce NOW - Cloud Gaming | NVIDIA',
    'Play your favorite PC games on any device with cloud streaming.'
  );
  assert.strictEqual(geforceRes.isIrrelevant, true, 'Must reject NVIDIA GeForce NOW');

  // Legitimate local business website
  const legitBizRes = isIrrelevantSearchResult(
    'https://www.austindentalarts.com/about-our-practice',
    'Austin Dental Arts | Comprehensive Dental Care in Austin TX',
    'Family and cosmetic dentistry located on Congress Ave in Austin.'
  );
  assert.strictEqual(legitBizRes.isIrrelevant, false, 'Must accept genuine local business website');
  console.log('✓ Test 13: Search Result Relevance Gate passed (filtering support/blogs/gaming)');

  // 14. Candidate Quality Scoring & Generic Name Penalty
  const genericShopsCand = {
    id: 'osm-12345',
    displayName: 'Shops',
    rawName: 'Shops',
    normalizedName: 'shops',
    domain: '',
    normalizedPhone: '',
    address: 'Austin, TX',
    sources: ['openstreetmap'],
    evidence: [],
    isDirect: false,
  };
  const genericQuality = calculateCandidateQuality(genericShopsCand, 'Austin, TX');
  assert.strictEqual(genericQuality.isGenericName, true, 'Must identify "Shops" as generic single-word name');
  assert.ok(genericQuality.score < 45, 'Generic single-word candidate without phone/website must score below 45 threshold');

  const qualityCandidate = {
    id: 'cand-98765',
    displayName: 'Austin Artisan Bakery & Cafe',
    rawName: 'Austin Artisan Bakery & Cafe',
    normalizedName: 'austin artisan bakery cafe',
    domain: 'austinartisanbakery.com',
    normalizedPhone: '5125550144',
    website: 'https://austinartisanbakery.com',
    phone: '(512) 555-0144',
    address: '1204 S Congress Ave, Austin, TX 78704',
    sources: ['openstreetmap', 'bing'],
    evidence: [],
    isDirect: true,
  };
  const highQuality = calculateCandidateQuality(qualityCandidate, 'Austin, TX');
  assert.strictEqual(highQuality.isGenericName, false);
  assert.ok(highQuality.score >= 70, 'Quality candidate with website, phone, address and multi-source must score >= 70');
  console.log('✓ Test 14: Candidate quality scoring & generic name penalty passed');

  // 15. Business Entity Gate: Strict Rejection of Editorial / Listicle / Business-Idea Pages
  const editorialTestCases = [
    {
      title: '20 Top Companies in Ranchi · August 2026 | F6S',
      url: 'https://www.f6s.com/companies/india/ranchi/co',
      snippet: 'Directory of top companies and startups in Ranchi.',
      expectedRejection: true,
      label: 'F6S company directory/listicle',
    },
    {
      title: '11 Business Ideas In Ranchi for 2024 » GrowthRomeo',
      url: 'https://growthromeo.com/business-ideas-in-ranchi-jharkhand/',
      snippet: 'Looking for top business ideas in Ranchi with low investment?',
      expectedRejection: true,
      label: 'GrowthRomeo business ideas article',
    },
    {
      title: 'Small Business Ideas in Jharkhand - 99BusinessIdeas',
      url: 'https://www.99businessideas.com/business-ideas-jharkhand/',
      snippet: 'List of most profitable small business ideas in Jharkhand state.',
      expectedRejection: true,
      label: '99BusinessIdeas small business ideas',
    },
    {
      title: 'Business Opportunities in Ranchi - Franchise India',
      url: 'https://www.franchiseindia.com/business-opportunities/ranchi.html',
      snippet: 'Explore franchise business opportunities in Ranchi.',
      expectedRejection: true,
      label: 'Franchise India opportunities portal',
    },
    {
      title: 'Top 15+ Business ideas in Ranchi for 2025',
      url: 'https://viestories.com/business-ideas-in-ranchi/',
      snippet: 'Curated list of profitable business ideas to start in Ranchi.',
      expectedRejection: true,
      label: 'VieStories top 15 listicle',
    },
    {
      title: '12 Best Places of Shopping in Ranchi - Wanderlog',
      url: 'https://wanderlog.com/list/geoCategory/171569/shopping-in-ranchi',
      snippet: 'Top department stores and shopping centers in Ranchi.',
      expectedRejection: true,
      label: 'Wanderlog curated shopping list',
    },
    {
      title: 'Top Retail Shops in Ranchi - Best Shops Ranchi - Justdial',
      url: 'https://www.justdial.com/Ranchi/Retail-Shops/nct-10408985',
      snippet: 'Find phone numbers, address, reviews, photos, maps for top retail shops in Ranchi.',
      expectedRejection: true,
      label: 'Justdial directory search page',
    },
  ];

  for (const tc of editorialTestCases) {
    const res = classifyBusinessEntity(tc.title, tc.url, tc.snippet);
    assert.strictEqual(
      res.isIndividualBusiness,
      false,
      `Must classify "${tc.title}" as non-business entity (${tc.label})`
    );
    assert.notStrictEqual(res.type, 'INDIVIDUAL_LOCAL_BUSINESS');
    assert.ok(res.rejectionReason, `Must provide a rejection reason for ${tc.label}`);

    const irrelevantRes = isIrrelevantSearchResult(tc.url, tc.title, tc.snippet);
    assert.strictEqual(irrelevantRes.isIrrelevant, true, `isIrrelevantSearchResult must reject ${tc.label}`);
  }
  console.log('✓ Test 15: Strict rejection of editorial / listicle / ideas pages passed (all 7 production test cases)');

  // 16. Business Entity Gate: Acceptance of Genuine Local Businesses
  const genuineBusinessCases = [
    {
      title: 'Capitol Hill Hotel Ranchi',
      url: 'https://www.capitolhillranchi.com/',
      snippet: 'Luxury boutique hotel located on Main Road, Ranchi, Jharkhand.',
      label: 'Hotel in Ranchi',
    },
    {
      title: 'Kaveri Restaurant Ranchi',
      url: 'https://kaverirestaurant.in/',
      snippet: 'Pure vegetarian multi-cuisine restaurant in GEL Church Complex, Ranchi.',
      label: 'Restaurant in Ranchi',
    },
    {
      title: 'Ranchi Dental Care Clinic',
      url: 'https://ranchidentalcare.com/',
      snippet: 'Advanced dental clinic providing root canal and orthodontic treatments in Ranchi.',
      label: 'Dental clinic in Ranchi',
    },
  ];

  for (const gc of genuineBusinessCases) {
    const res = classifyBusinessEntity(gc.title, gc.url, gc.snippet);
    assert.strictEqual(
      res.isIndividualBusiness,
      true,
      `Must accept "${gc.title}" as genuine individual local business (${gc.label})`
    );
    assert.strictEqual(res.type, 'INDIVIDUAL_LOCAL_BUSINESS');

    const irrelevantRes = isIrrelevantSearchResult(gc.url, gc.title, gc.snippet);
    assert.strictEqual(irrelevantRes.isIrrelevant, false, `isIrrelevantSearchResult must accept ${gc.label}`);
  }
  console.log('✓ Test 16: Acceptance of genuine individual local businesses passed');

  // 17. Disqualification of Editorial Pages in calculateCandidateQuality
  const listicleCand = {
    id: 'cand-listicle-1',
    displayName: '20 Top Companies in Ranchi · August 2026 | F6S',
    rawName: '20 Top Companies in Ranchi · August 2026 | F6S',
    normalizedName: '20 top companies in ranchi',
    domain: 'f6s.com',
    normalizedPhone: '',
    website: 'https://www.f6s.com/companies/india/ranchi/co',
    address: 'Ranchi, Jharkhand',
    sources: ['bing'],
    evidence: [],
    isDirect: true,
  };
  const listicleQuality = calculateCandidateQuality(listicleCand, 'Ranchi, Jharkhand');
  assert.strictEqual(listicleQuality.score, 0, 'Editorial/listicle candidate must receive score = 0 in calculateCandidateQuality');
  assert.ok(listicleQuality.reasons.includes('editorial_or_directory_disqualified'));
  console.log('✓ Test 17: Candidate quality calculation automatic disqualification of editorial pages passed');

  console.log('ALL API-FREE WEB RESEARCH & DISCOVERY TESTS PASSED SUCCESSFULLY (17/17).');
}

export async function runAsyncDiscoveryTests() {
  console.log('\n[TEST] Running Live/Async Web Discovery Integration Tests...');
  const { discoverBusinessesViaWebResearch } = await import('./discovery.js');

  // Test: Real discovery for businesses in Austin
  const res = await discoverBusinessesViaWebResearch({
    query: 'dentists',
    location: 'Austin, TX',
    limit: 2,
  });
  assert.strictEqual(res.success, true);
  assert.ok(res.businesses.length >= 1, 'Should find at least 1 dentist in Austin');
  assert.ok(res.sourcesFound.length >= 1, 'Should track searched web sources');
  console.log(`✓ Async Test 1: Discovered ${res.businesses.length} real businesses in Austin with live web research`);

  // Test: Zero-result handling without hallucination
  const emptyRes = await discoverBusinessesViaWebResearch({
    query: 'zzznoxexistentcategory888',
    location: 'NonExistentCity9999',
    limit: 3,
  });
  assert.strictEqual(emptyRes.success, true);
  assert.strictEqual(emptyRes.businesses.length, 0, 'Must return 0 businesses for nonexistent query without fabricating data');
  console.log('✓ Async Test 2: Anti-fabrication check passed (0 results returned for invalid query)');

  console.log('ALL ASYNC DISCOVERY INTEGRATION TESTS PASSED (2/2).');
}

if (process.argv[1] && process.argv[1].includes('research.test')) {
  runResearchFoundationTests();
  runAsyncDiscoveryTests().catch((err) => {
    console.error('Async tests failed:', err);
    process.exit(1);
  });
}
