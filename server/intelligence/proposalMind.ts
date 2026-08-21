/**
 * Proposal Mind - Structured Business Intelligence Core
 * 
 * Systematic 9-Step Thinking Order (A-I):
 * Step A: What is this business? (Identity, category, location, web status)
 * Step B: What does this business appear to sell or offer? (Verified services & offerings)
 * Step C: Who are its likely customers based on observed evidence? (Grounded target audience)
 * Step D: What is already working well? (Observed strengths & positive signals)
 * Step E: What specific problems or missed opportunities are observable? (Measured issues)
 * Step F: Which problems are actually worth mentioning to the business? (High-impact prioritization)
 * Step G: What service/solution would logically address those problems? (Tailored solutions)
 * Step H: What should the proposal's main pitch be? (Primary pitch angle & subject lines)
 * Step I: Which specific observations can naturally personalize the opening? (Personalization points)
 */

import {
  BusinessProfile,
  BusinessRawInput,
  InferredOpportunity,
  ObservedIssue,
  PersonalizationPoint,
  ProposalMindIntelligence,
  RawAuditData,
  RecommendedSolution,
  VerifiedFact,
  WebsiteInsights,
} from './types';

/**
 * Normalizes and extracts city, state, and geographic components from raw addresses.
 */
export function extractLocationComponents(rawAddress?: string): {
  city?: string;
  state?: string;
  hasPhysicalLocation: boolean;
} {
  if (!rawAddress || rawAddress.trim().length === 0) {
    return { hasPhysicalLocation: false };
  }

  const clean = rawAddress.trim();
  const parts = clean.split(',').map((p) => p.trim());

  let city: string | undefined;
  let state: string | undefined;

  if (parts.length >= 3) {
    city = parts[parts.length - 2];
    const stateZip = parts[parts.length - 1];
    const stateMatch = stateZip.match(/([A-Za-z\s]+)(?:\s+\d{5})?/);
    state = stateMatch ? stateMatch[1].trim() : undefined;
  } else if (parts.length === 2) {
    city = parts[0];
    state = parts[1];
  } else if (parts.length === 1) {
    city = parts[0];
  }

  return {
    city: city || undefined,
    state: state || undefined,
    hasPhysicalLocation: true,
  };
}

/**
 * Step A & B: Infers business profile, category, and core services from verified data.
 */
export function inferBusinessProfile(input: BusinessRawInput): {
  category: string;
  industry: string;
  businessSummary: string;
  coreServices: string[];
  targetAudience: string;
} {
  const rawCat = (input.category || '').toLowerCase();
  const rawName = input.name.toLowerCase();
  const audit = input.audit;

  let category = input.category || 'Local Business';
  let industry = 'Local Services';
  let targetAudience = 'Local residents and prospective clients seeking quality services';
  let coreServices: string[] = [];

  // 1. Gather explicitly discovered services from website audit if present
  if (audit?.servicesFound && audit.servicesFound.length > 0) {
    coreServices.push(...audit.servicesFound.slice(0, 6));
  }

  // 2. Gather services from headings if present
  if (audit?.headings) {
    const candidateHeadings = [...(audit.headings.h2 || []), ...(audit.headings.h3 || [])];
    for (const h of candidateHeadings) {
      const cleanH = h.trim();
      if (
        cleanH.length >= 4 &&
        cleanH.length <= 50 &&
        !cleanH.includes('\n') &&
        !cleanH.toLowerCase().includes('about') &&
        !cleanH.toLowerCase().includes('contact') &&
        !cleanH.toLowerCase().includes('copyright') &&
        !cleanH.toLowerCase().includes('privacy')
      ) {
        if (!coreServices.includes(cleanH)) {
          coreServices.push(cleanH);
        }
      }
    }
  }

  // 3. Domain-specific taxonomy classification
  if (rawCat.includes('dent') || rawName.includes('dental') || rawName.includes('dentist')) {
    category = 'Dental Practice';
    industry = 'Healthcare & Dentistry';
    targetAudience = 'Local patients and families needing general, preventative, and cosmetic dental care';
    if (coreServices.length === 0) {
      coreServices = ['General Dentistry', 'Preventative Cleanings', 'Cosmetic Dental Procedures', 'Patient Consultations'];
    }
  } else if (rawCat.includes('plumb') || rawName.includes('plumb')) {
    category = 'Plumbing Contractor';
    industry = 'Home & Commercial Services';
    targetAudience = 'Homeowners, property managers, and businesses with plumbing and pipe repair needs';
    if (coreServices.length === 0) {
      coreServices = ['Residential Plumbing', 'Emergency Pipe Repairs', 'Water Heater Installations', 'Drain Cleaning'];
    }
  } else if (rawCat.includes('electric') || rawName.includes('electric')) {
    category = 'Electrical Contractor';
    industry = 'Trades & Home Services';
    targetAudience = 'Residential and commercial property owners needing electrical repairs and installations';
    if (coreServices.length === 0) {
      coreServices = ['Electrical Repairs', 'Panel Upgrades', 'Lighting Installation', 'Commercial Wiring'];
    }
  } else if (rawCat.includes('law') || rawCat.includes('attorney') || rawCat.includes('legal') || rawName.includes('law') || rawName.includes('attorney')) {
    category = 'Legal Practice';
    industry = 'Professional Legal Services';
    targetAudience = 'Individuals, families, and businesses seeking specialized legal representation and counsel';
    if (coreServices.length === 0) {
      coreServices = ['Legal Advisory', 'Client Consultations', 'Case Representation', 'Document Preparation'];
    }
  } else if (rawCat.includes('auto') || rawCat.includes('car') || rawCat.includes('mechanic') || rawName.includes('auto') || rawName.includes('garage')) {
    category = 'Automotive Service';
    industry = 'Automotive Care & Repair';
    targetAudience = 'Vehicle owners looking for reliable local automotive maintenance and repairs';
    if (coreServices.length === 0) {
      coreServices = ['Vehicle Diagnostics', 'Routine Maintenance', 'Brake & Engine Repairs', 'Safety Inspections'];
    }
  } else if (rawCat.includes('restaurant') || rawCat.includes('cafe') || rawCat.includes('bakery') || rawCat.includes('food')) {
    category = 'Dining & Hospitality';
    industry = 'Food & Beverage';
    targetAudience = 'Local food lovers, diners, and catering clients looking for quality dining and takeout';
    if (coreServices.length === 0) {
      coreServices = ['Dine-In Hospitality', 'Takeout & Delivery', 'Catering Orders', 'Specialty Menu Items'];
    }
  } else if (rawCat.includes('gym') || rawCat.includes('fitness') || rawName.includes('fitness') || rawName.includes('crossfit')) {
    category = 'Fitness & Training Center';
    industry = 'Health & Wellness';
    targetAudience = 'Fitness enthusiasts and local members looking for training programs and gym access';
    if (coreServices.length === 0) {
      coreServices = ['Membership Plans', 'Personal Training', 'Group Fitness Classes', 'Wellness Coaching'];
    }
  } else {
    // Default clean category
    if (coreServices.length === 0) {
      coreServices = ['Local Service Delivery', 'Client Consultations', 'Custom Inquiries'];
    }
  }

  coreServices = coreServices.slice(0, 5);

  const businessSummary = `${input.name} is a ${category.toLowerCase()} operating in the ${industry} sector, serving ${targetAudience.toLowerCase()}.`;

  return {
    category,
    industry,
    businessSummary,
    coreServices,
    targetAudience,
  };
}

/**
 * Analyzes website health metrics and generates structured WebsiteInsights.
 */
export function analyzeWebsiteHealth(audit?: RawAuditData | null, websiteUrl?: string | null): WebsiteInsights {
  if (!websiteUrl || !audit || !audit.success) {
    return {
      sslSecure: false,
      mobileResponsive: false,
      speedCategory: 'Unreachable',
      onPageSeoQuality: 'Deficient',
      h1HeadingPresent: false,
      openGraphConfigured: false,
      summary: websiteUrl ? 'Website was unreachable or returned errors during live HTTP inspection.' : 'No website URL is registered for this business.',
    };
  }

  const sslSecure = Boolean(audit.isHttps);
  const mobileResponsive = Boolean(audit.hasMobileViewport);
  const h1HeadingPresent = (audit.h1Count ?? 0) > 0;
  const openGraphConfigured = Boolean(audit.hasOpenGraph);

  let speedCategory: 'Fast' | 'Acceptable' | 'Slow' | 'Unreachable' = 'Acceptable';
  if (audit.responseTimeMs) {
    if (audit.responseTimeMs < 800) speedCategory = 'Fast';
    else if (audit.responseTimeMs <= 2000) speedCategory = 'Acceptable';
    else speedCategory = 'Slow';
  }

  let onPageSeoQuality: 'Strong' | 'Adequate' | 'Deficient' = 'Adequate';
  if (audit.pageTitle && audit.metaDescription && h1HeadingPresent && sslSecure) {
    onPageSeoQuality = 'Strong';
  } else if (!audit.metaDescription && !h1HeadingPresent) {
    onPageSeoQuality = 'Deficient';
  }

  const findings: string[] = [];
  if (!sslSecure) findings.push('Missing HTTPS SSL certificate');
  if (!mobileResponsive) findings.push('Missing responsive mobile viewport tag');
  if (speedCategory === 'Slow') findings.push(`Slow response time (${audit.responseTimeMs}ms)`);
  if (!audit.metaDescription) findings.push('Missing meta description tag');
  if (!h1HeadingPresent) findings.push('Missing primary H1 tag');

  const summary = findings.length > 0
    ? `Identified ${findings.length} technical opportunities: ${findings.join(', ')}.`
    : 'Website meets technical baseline standards for responsiveness and SSL security.';

  return {
    title: audit.pageTitle,
    metaDescription: audit.metaDescription,
    sslSecure,
    mobileResponsive,
    responseTimeMs: audit.responseTimeMs,
    speedCategory,
    onPageSeoQuality,
    h1HeadingPresent,
    openGraphConfigured,
    headingsFound: audit.headings,
    servicesDetected: audit.servicesFound,
    callsToAction: audit.callsToAction,
    bookingMechanisms: audit.bookingMechanisms,
    trustSignals: audit.trustSignals,
    summary,
  };
}

/**
 * Extracts strictly verified facts backed by raw evidence.
 */
export function extractVerifiedFacts(input: BusinessRawInput, audit?: RawAuditData | null): VerifiedFact[] {
  const facts: VerifiedFact[] = [];
  let factId = 1;

  // Fact 1: Business name and discovery
  facts.push({
    id: `fact_${factId++}`,
    claim: `Business registered as "${input.name}".`,
    source: 'business_discovery',
    confidence: 'HIGH',
    rawEvidence: `Name: ${input.name}`,
  });

  // Fact 2: Physical Location
  if (input.address) {
    facts.push({
      id: `fact_${factId++}`,
      claim: `Operates in local territory with address: "${input.address}".`,
      source: 'business_discovery',
      confidence: 'HIGH',
      rawEvidence: input.address,
    });
  }

  // Fact 3: Contact Phone
  if (input.phone) {
    facts.push({
      id: `fact_${factId++}`,
      claim: `Lists direct contact telephone number: "${input.phone}".`,
      source: 'business_discovery',
      confidence: 'HIGH',
      rawEvidence: input.phone,
    });
  }

  // Fact 4: Public Reputation
  if (input.rating !== null && input.rating !== undefined) {
    facts.push({
      id: `fact_${factId++}`,
      claim: `Holds a public rating of ${input.rating} stars across ${input.reviewCount || 0} customer reviews.`,
      source: 'business_discovery',
      confidence: 'HIGH',
      rawEvidence: `Rating: ${input.rating}, Reviews: ${input.reviewCount}`,
    });
  }

  // Fact 5: Website and Live HTTP Audit facts
  if (input.website && audit && audit.success) {
    facts.push({
      id: `fact_${factId++}`,
      claim: `Active website located at "${input.website}" returning HTTP ${audit.httpStatus || 200}.`,
      source: 'website_http',
      confidence: 'HIGH',
      rawEvidence: `URL: ${input.website}, Status: ${audit.httpStatus || 200}`,
    });

    if (audit.pageTitle) {
      facts.push({
        id: `fact_${factId++}`,
        claim: `Homepage title tag is published as: "${audit.pageTitle}".`,
        source: 'html_metadata',
        confidence: 'HIGH',
        rawEvidence: audit.pageTitle,
      });
    }

    if (audit.primaryEmail) {
      facts.push({
        id: `fact_${factId++}`,
        claim: `Public business contact email discovered: "${audit.primaryEmail}".`,
        source: 'contact_extraction',
        confidence: 'HIGH',
        rawEvidence: audit.primaryEmail,
      });
    }

    if (audit.servicesFound && audit.servicesFound.length > 0) {
      facts.push({
        id: `fact_${factId++}`,
        claim: `Verified on-page services: ${audit.servicesFound.slice(0, 3).join(', ')}.`,
        source: 'web_research',
        confidence: 'HIGH',
        rawEvidence: audit.servicesFound.join(', '),
      });
    }
  } else if (!input.website) {
    facts.push({
      id: `fact_${factId++}`,
      claim: 'No registered website URL listed in public search directories.',
      source: 'business_discovery',
      confidence: 'HIGH',
      rawEvidence: 'Website field is null / absent',
    });
  }

  return facts;
}

/**
 * Step D: Determines strengths from verified positive signals.
 */
export function identifyStrengths(input: BusinessRawInput, audit?: RawAuditData | null): string[] {
  const strengths: string[] = [];

  if (input.rating && input.rating >= 4.0) {
    strengths.push(`Strong customer reputation: ${input.rating} ★ rating across ${input.reviewCount || 0} reviews`);
  }

  if (audit?.isHttps) {
    strengths.push('Active SSL security encryption in place');
  }

  if (audit?.hasMobileViewport) {
    strengths.push('Mobile viewport meta configured for responsive layouts');
  }

  if (audit?.responseTimeMs && audit.responseTimeMs < 800) {
    strengths.push(`Fast server response time (${audit.responseTimeMs}ms TTFB)`);
  }

  if (audit?.pageTitle && !audit.pageTitle.includes('No title')) {
    strengths.push(`Established page title identity: "${audit.pageTitle}"`);
  }

  if (input.phone) {
    strengths.push('Direct telephone line readily available for customer inquiries');
  }

  if (audit?.primaryEmail) {
    strengths.push('Public contact email clearly accessible for customer inquiries');
  }

  return strengths;
}

/**
 * Step E: Identifies measured, observed issues.
 */
export function detectObservedIssues(audit?: RawAuditData | null, hasWebsite?: boolean): ObservedIssue[] {
  const issues: ObservedIssue[] = [];
  let issueCounter = 1;

  // Case 1: No Website
  if (!hasWebsite || !audit) {
    issues.push({
      id: `issue_${issueCounter++}`,
      category: 'new_website_creation',
      severity: 'CRITICAL',
      technicalObservation: 'Business lacks a dedicated online website.',
      impactOnBusiness: 'Customers searching online cannot view services, hours, or request bookings, leading them to choose competitors.',
      measuredDataPoint: 'No website URL registered in business directories',
    });
    return issues;
  }

  // 1. SSL / HTTPS
  if (!audit.isHttps) {
    issues.push({
      id: `issue_${issueCounter++}`,
      category: 'ssl_security',
      severity: 'CRITICAL',
      technicalObservation: 'Website does not enforce HTTPS SSL transport layer encryption.',
      impactOnBusiness: 'Browsers display "Not Secure" warnings to visitors, destroying trust and harming Google ranking.',
      measuredDataPoint: 'Protocol: HTTP without SSL encryption certificate',
    });
  }

  // 2. Mobile Viewport
  if (!audit.hasMobileViewport) {
    issues.push({
      id: `issue_${issueCounter++}`,
      category: 'mobile_optimization',
      severity: 'CRITICAL',
      technicalObservation: 'Missing <meta name="viewport"> tag for responsive viewport scaling.',
      impactOnBusiness: 'Mobile visitors experience unscaled horizontal scrolling and tiny unreadable text.',
      measuredDataPoint: 'HTML lacks responsive viewport tag',
    });
  }

  // 3. Response Time Speed
  if (audit.responseTimeMs && audit.responseTimeMs > 2000) {
    issues.push({
      id: `issue_${issueCounter++}`,
      category: 'speed_optimization',
      severity: 'WARNING',
      technicalObservation: `Initial server Time-To-First-Byte (TTFB) response time is ${audit.responseTimeMs}ms.`,
      impactOnBusiness: 'Slow page loads cause high bounce rates on mobile and lower search conversion.',
      measuredDataPoint: `TTFB response: ${audit.responseTimeMs}ms (threshold: 2000ms)`,
    });
  }

  // 4. Meta Description / SEO
  if (!audit.metaDescription || audit.metaDescription.includes('Missing')) {
    issues.push({
      id: `issue_${issueCounter++}`,
      category: 'seo_onpage',
      severity: 'OPPORTUNITY',
      technicalObservation: 'Missing dedicated <meta name="description"> tag in page header.',
      impactOnBusiness: 'Google generates random snippet text on search results, reducing click-through rates (CTR).',
      measuredDataPoint: 'Meta description tag is absent',
    });
  }

  // 5. H1 Tag
  if (audit.h1Count !== undefined && audit.h1Count === 0) {
    issues.push({
      id: `issue_${issueCounter++}`,
      category: 'seo_onpage',
      severity: 'OPPORTUNITY',
      technicalObservation: 'Homepage lacks a primary <h1> semantic heading tag.',
      impactOnBusiness: 'Search engines struggle to index primary keyword focus and service taxonomy.',
      measuredDataPoint: 'H1 tags detected: 0',
    });
  }

  // 6. Direct Booking / Inquiry CTA
  if (!audit.callsToAction || audit.callsToAction.length === 0) {
    issues.push({
      id: `issue_${issueCounter++}`,
      category: 'conversion_cta',
      severity: 'OPPORTUNITY',
      technicalObservation: 'No direct booking or clear consultation call-to-action button detected.',
      impactOnBusiness: 'Prospective clients who want immediate booking or inquiries have no clear next step.',
      measuredDataPoint: 'Zero prominent call-to-action triggers detected in page audit',
    });
  }

  return issues;
}

/**
 * Step F: Synthesizes measured issues into strategic, high-value opportunities.
 * CRITICAL RULE: High-impact issues are prioritized in descending order of true commercial impact.
 * Minor technical notes (e.g. OpenGraph tags) are NEVER made the primary pitch!
 */
export function mapInferredOpportunities(issues: ObservedIssue[], hasWebsite: boolean): InferredOpportunity[] {
  const opportunities: InferredOpportunity[] = [];
  let oppCounter = 1;

  if (!hasWebsite) {
    opportunities.push({
      id: `opp_${oppCounter++}`,
      category: 'new_website_creation',
      title: 'Modern High-Converting Digital Presence & Local Search Hub',
      strategicRationale: 'Creating a tailored, mobile-first website enables direct customer bookings and search discoverability.',
      evidenceBacked: true,
      supportingIssueIds: issues.map((i) => i.id),
      expectedBusinessValue: 'Captures local search traffic that currently goes to competitors with active websites.',
    });
    return opportunities;
  }

  const categoriesPresent = new Set(issues.map((i) => i.category));

  // Priority 1: Mobile Optimization
  if (categoriesPresent.has('mobile_optimization')) {
    opportunities.push({
      id: `opp_${oppCounter++}`,
      category: 'mobile_optimization',
      title: 'Mobile Experience & Touch Navigation Modernization',
      strategicRationale: 'Upgrading to a modern responsive layout ensures smartphone users can easily view services and contact the business.',
      evidenceBacked: true,
      supportingIssueIds: issues.filter((i) => i.category === 'mobile_optimization').map((i) => i.id),
      expectedBusinessValue: 'Reduces mobile drop-off and increases smartphone call/lead conversion.',
    });
  }

  // Priority 2: SSL Security
  if (categoriesPresent.has('ssl_security')) {
    opportunities.push({
      id: `opp_${oppCounter++}`,
      category: 'ssl_security',
      title: 'Enterprise SSL Security & Browser Trust Certification',
      strategicRationale: 'Provisioning end-to-end HTTPS encryption eliminates browser warning flags and protects visitor form submissions.',
      evidenceBacked: true,
      supportingIssueIds: issues.filter((i) => i.category === 'ssl_security').map((i) => i.id),
      expectedBusinessValue: 'Instills immediate visitor confidence and preserves Google search index compliance.',
    });
  }

  // Priority 3: Page Speed
  if (categoriesPresent.has('speed_optimization')) {
    opportunities.push({
      id: `opp_${oppCounter++}`,
      category: 'speed_optimization',
      title: 'High-Performance Page Speed & Asset Optimization',
      strategicRationale: 'Minimizing asset payloads and optimizing server response ensures instant loading on cellular connections.',
      evidenceBacked: true,
      supportingIssueIds: issues.filter((i) => i.category === 'speed_optimization').map((i) => i.id),
      expectedBusinessValue: 'Improves user retention and satisfies Google Core Web Vitals.',
    });
  }

  // Priority 4: Conversion & Contact Flow
  if (categoriesPresent.has('conversion_cta')) {
    opportunities.push({
      id: `opp_${oppCounter++}`,
      category: 'conversion_cta',
      title: 'Conversion Architecture & Direct Contact Flow',
      strategicRationale: 'Positioning prominent action buttons and direct inquiry forms transforms passive visitors into active leads.',
      evidenceBacked: true,
      supportingIssueIds: issues.filter((i) => i.category === 'conversion_cta').map((i) => i.id),
      expectedBusinessValue: 'Increases conversion rate from existing website traffic without additional ad spend.',
    });
  }

  // Priority 5: On-Page SEO
  if (categoriesPresent.has('seo_onpage')) {
    opportunities.push({
      id: `opp_${oppCounter++}`,
      category: 'seo_onpage',
      title: 'On-Page SEO Taxonomy & Search Snippet Enhancement',
      strategicRationale: 'Structuring H1 tags and custom meta descriptions ensures Google presents high-converting search snippets.',
      evidenceBacked: true,
      supportingIssueIds: issues.filter((i) => i.category === 'seo_onpage').map((i) => i.id),
      expectedBusinessValue: 'Boosts organic click-through rates from local Google searchers.',
    });
  }

  // Standard modernization fallback if no critical defect found
  if (opportunities.length === 0) {
    opportunities.push({
      id: `opp_${oppCounter++}`,
      category: 'website_redesign',
      title: 'Strategic Conversion & Modern Digital Refresh',
      strategicRationale: 'Refreshing visual styling and user engagement flows to amplify an already solid business foundation.',
      evidenceBacked: true,
      supportingIssueIds: [],
      expectedBusinessValue: 'Enhances brand perception and client engagement.',
    });
  }

  return opportunities;
}

/**
 * Step G: Builds tailored solutions mapped directly to verified opportunities.
 */
export function buildRecommendedSolutions(opportunities: InferredOpportunity[]): RecommendedSolution[] {
  return opportunities.map((opp) => {
    switch (opp.category) {
      case 'new_website_creation':
        return {
          serviceName: 'Full-Stack Modern Website Development & Local Launch',
          tier: 'Core Essential',
          scopePoints: [
            'Responsive multi-device layout architecture',
            'Integrated click-to-call and consultation booking forms',
            'Local Google SEO metadata and schema markup',
            'SSL security configuration and high-speed hosting setup',
          ],
          targetedOpportunityId: opp.id,
          estimatedDeliveryTimeline: '5-7 business days',
        };

      case 'mobile_optimization':
        return {
          serviceName: 'Responsive Mobile UI/UX Overhaul',
          tier: 'Core Essential',
          scopePoints: [
            'Viewport meta tag implementation & fluid responsive containers',
            'Touch-friendly navigation menu and enlarged action buttons',
            'Mobile layout reflow testing across iOS and Android screen widths',
          ],
          targetedOpportunityId: opp.id,
          estimatedDeliveryTimeline: '2-3 business days',
        };

      case 'ssl_security':
        return {
          serviceName: 'HTTPS SSL Security Hardening & Trust Provisioning',
          tier: 'Core Essential',
          scopePoints: [
            'SSL/TLS certificate installation and automated renewal',
            'HTTP to HTTPS 301 permanent redirect rules',
            'Mixed-content asset resolution to eliminate browser warning icons',
          ],
          targetedOpportunityId: opp.id,
          estimatedDeliveryTimeline: '24 hours',
        };

      case 'speed_optimization':
        return {
          serviceName: 'Core Web Vitals & Speed Performance Tuning',
          tier: 'High Impact',
          scopePoints: [
            'Image compression, WebP conversion, and lazy loading',
            'Server cache header optimization and script deferral',
            'Targeting sub-1000ms Time-To-First-Byte load times',
          ],
          targetedOpportunityId: opp.id,
          estimatedDeliveryTimeline: '2-3 business days',
        };

      case 'seo_onpage':
        return {
          serviceName: 'Local SEO Tag Structure & CTR Optimization',
          tier: 'High Impact',
          scopePoints: [
            'Crafting compelling meta titles and high-CTR description tags',
            'Structuring semantic H1/H2 hierarchy matching core services',
            'OpenGraph social preview metadata configuration',
          ],
          targetedOpportunityId: opp.id,
          estimatedDeliveryTimeline: '2 business days',
        };

      case 'conversion_cta':
      default:
        return {
          serviceName: 'Lead Generation & Conversion Flow Optimization',
          tier: 'Value Add',
          scopePoints: [
            'Sticky click-to-call contact bar for immediate mobile inquiries',
            'Prominent service inquiry forms and instant booking widgets',
            'Customer testimonial trust badges integration',
          ],
          targetedOpportunityId: opp.id,
          estimatedDeliveryTimeline: '2-3 business days',
        };
    }
  });
}

/**
 * Step I: Builds specific, high-precision personalization points with strict confidence scoring.
 */
export function buildPersonalizationPoints(
  input: BusinessRawInput,
  profile: BusinessProfile,
  websiteInsights: WebsiteInsights,
  issues: ObservedIssue[],
  strengths: string[]
): PersonalizationPoint[] {
  const points: PersonalizationPoint[] = [];

  // Anchor 1: Reputation & Local Standing
  if (profile.reputation.rating && profile.reputation.reviewCount && profile.reputation.reviewCount >= 5) {
    points.push({
      contextAnchor: 'Customer Reputation',
      naturalObservation: `Your business has established a solid track record with a ${profile.reputation.rating}-star rating across ${profile.reputation.reviewCount} local reviews.`,
      confidence: 'HIGH',
      evidenceSource: 'Public Review Aggregation',
      whyRelevant: 'Recognizes public goodwill before introducing technical suggestions.',
      safeForOutreach: true,
      doNotExaggerateNote: 'Do not claim personal customer experience; highlight public reputation.',
    });
  }

  // Anchor 2: Specific Verified Services
  if (profile.category && profile.location.city) {
    points.push({
      contextAnchor: 'Local Service Focus',
      naturalObservation: `Serving the ${profile.location.city} area with ${profile.category.toLowerCase()} services.`,
      confidence: 'HIGH',
      evidenceSource: 'Directory & Location Verification',
      whyRelevant: 'Establishes precise local context without generic filler.',
      safeForOutreach: true,
    });
  }

  // Anchor 3: Specific Technical Finding (Mobile, SSL, or Speed)
  const mobileIssue = issues.find((i) => i.category === 'mobile_optimization');
  if (mobileIssue) {
    points.push({
      contextAnchor: 'Mobile Experience Gap',
      naturalObservation: `When testing your homepage on a mobile device, the page lacks a responsive viewport configuration, requiring visitors to zoom and pan to read details.`,
      confidence: 'HIGH',
      evidenceSource: 'Live HTTP DOM HTML Audit: Missing Viewport Meta Tag',
      whyRelevant: 'Mobile users form over 60% of local service searchers.',
      safeForOutreach: true,
    });
  }

  const sslIssue = issues.find((i) => i.category === 'ssl_security');
  if (sslIssue) {
    points.push({
      contextAnchor: 'Security & Browser Warning',
      naturalObservation: `Your website is currently served over unencrypted HTTP, which causes modern browsers to flag the site with a "Not Secure" label to prospective clients.`,
      confidence: 'HIGH',
      evidenceSource: 'Live HTTP Connection: No SSL Protocol Detected',
      whyRelevant: 'Directly impacts visitor trust and conversion rates.',
      safeForOutreach: true,
    });
  }

  const speedIssue = issues.find((i) => i.category === 'speed_optimization');
  if (speedIssue && websiteInsights.responseTimeMs) {
    points.push({
      contextAnchor: 'Page Loading Speed',
      naturalObservation: `The initial server response time measured at ${websiteInsights.responseTimeMs}ms, which can cause noticeable delays on cellular connections.`,
      confidence: 'HIGH',
      evidenceSource: `Live HTTP Benchmark: ${websiteInsights.responseTimeMs}ms TTFB`,
      whyRelevant: 'Directly impacts mobile bounce rate and Google Core Web Vitals.',
      safeForOutreach: true,
    });
  }

  // Anchor 4: No Website Case
  if (!profile.hasActiveWebsite) {
    points.push({
      contextAnchor: 'Digital Presence Gap',
      naturalObservation: `While your business is established locally in ${profile.location.city || 'the area'}, there is currently no dedicated website for customers searching online to view your services and book directly.`,
      confidence: 'HIGH',
      evidenceSource: 'Public Directory Audit: Website URL Absent',
      whyRelevant: 'Essential discovery gap where competitor websites capture traffic.',
      safeForOutreach: true,
    });
  }

  return points;
}

/**
 * Primary Entry Point: Constructs structured Business Intelligence from raw business inputs.
 * Executes the complete 9-step (A-I) thinking order.
 */
export function buildBusinessIntelligence(input: BusinessRawInput): ProposalMindIntelligence {
  const audit = input.audit || null;
  const hasWebsite = Boolean(input.website && input.website.trim().startsWith('http'));

  // Step A: What is this business? (Identity, location, contact)
  const loc = extractLocationComponents(input.address);
  const inferred = inferBusinessProfile(input);

  let ratingTier: 'Exceptional' | 'Strong' | 'Average' | 'Low' | 'Unrated' = 'Unrated';
  if (input.rating !== null && input.rating !== undefined) {
    if (input.rating >= 4.8) ratingTier = 'Exceptional';
    else if (input.rating >= 4.2) ratingTier = 'Strong';
    else if (input.rating >= 3.5) ratingTier = 'Average';
    else ratingTier = 'Low';
  }

  const contactEmails = audit?.contactEmails || [];
  const primaryEmail = audit?.primaryEmail || contactEmails[0] || undefined;

  const businessProfile: BusinessProfile = {
    name: input.name.trim(),
    category: inferred.category,
    industry: inferred.industry,
    location: {
      address: input.address,
      city: loc.city,
      state: loc.state,
      hasPhysicalLocation: loc.hasPhysicalLocation,
    },
    contact: {
      phone: input.phone,
      verifiedEmail: primaryEmail,
      hasPublicEmail: Boolean(primaryEmail),
      contactEmails,
      websiteUrl: input.website || undefined,
      socialLinks: audit?.socialLinks,
    },
    reputation: {
      rating: input.rating ?? null,
      reviewCount: input.reviewCount ?? null,
      ratingTier,
    },
    hasActiveWebsite: hasWebsite,
  };

  // Step B & C: Core Services and Target Audience
  const coreServices = inferred.coreServices;
  const targetAudience = inferred.targetAudience;

  // Website Technical Insights
  const websiteInsights = analyzeWebsiteHealth(audit, input.website);

  // Evidence Ledger & Step D: Strengths
  const verifiedFacts = extractVerifiedFacts(input, audit);
  const observedStrengths = identifyStrengths(input, audit);

  // Step E: Measured Issues
  const observedIssues = detectObservedIssues(audit, hasWebsite);

  // Step F: High-Impact Prioritized Opportunities
  const inferredOpportunities = mapInferredOpportunities(observedIssues, hasWebsite);

  // Step G: Tailored Solutions & Scope
  const recommendedSolutions = buildRecommendedSolutions(inferredOpportunities);

  // Step H: Primary Pitch Angle & Subject Lines
  const primaryOpp = inferredOpportunities[0];
  const primaryPitchAngle = primaryOpp
    ? `${primaryOpp.title} — ${primaryOpp.expectedBusinessValue}`
    : 'Modern Website Modernization & Conversion Redesign';

  const suggestedSubjectLines = [
    `Quick note regarding ${businessProfile.name}'s online presence`,
    `Technical observation for ${businessProfile.name}`,
    `Modernization opportunity for ${businessProfile.name} in ${loc.city || 'your area'}`,
  ];

  // Step I: Personalization Points with Confidence & Grounding
  const personalizationPoints = buildPersonalizationPoints(
    input,
    businessProfile,
    websiteInsights,
    observedIssues,
    observedStrengths
  );

  // Scoring & Quality Gate pre-check
  let score = 20; // baseline
  if (input.name) score += 15;
  if (input.address) score += 10;
  if (input.phone) score += 10;
  if (input.rating !== null && input.rating !== undefined) score += 15;
  if (hasWebsite) score += 15;
  if (audit && audit.success) score += 15;

  const overallConfidenceScore = Math.min(100, score);
  const intelligenceCompleteness: 'High' | 'Moderate' | 'Limited' =
    overallConfidenceScore >= 75 ? 'High' : overallConfidenceScore >= 45 ? 'Moderate' : 'Limited';

  const missingDataNotes: string[] = [];
  if (!hasWebsite) missingDataNotes.push('Business does not have a registered website URL.');
  if (!primaryEmail) missingDataNotes.push('No direct contact email discovered in public listings or HTML.');
  if (!input.phone) missingDataNotes.push('No telephone number listed in search metadata.');
  if (input.rating === null || input.rating === undefined) missingDataNotes.push('No rating or review count available.');

  return {
    businessProfile,
    businessSummary: inferred.businessSummary,
    coreServices,
    targetAudience,
    websiteInsights,
    verifiedFacts,
    observedStrengths,
    observedIssues,
    inferredOpportunities,
    recommendedSolutions,
    primaryPitchAngle,
    suggestedSubjectLines,
    personalizationPoints,
    overallConfidenceScore,
    intelligenceCompleteness,
    readyForProposal: overallConfidenceScore >= 40,
    missingDataNotes,
  };
}

/**
 * Batch processing helper for arrays of businesses.
 * Guarantees strict isolation between businesses.
 */
export function buildBatchBusinessIntelligence(inputs: BusinessRawInput[]): ProposalMindIntelligence[] {
  return inputs.map((input) => buildBusinessIntelligence(input));
}

/**
 * Formats a structured ProposalMindIntelligence object into a rich markdown context
 * suitable for feeding directly to any LLM Proposal Writer without hallucination risk.
 */
export function formatIntelligenceForProposalWriter(intel: ProposalMindIntelligence): string {
  const { businessProfile, verifiedFacts, observedIssues, inferredOpportunities, recommendedSolutions, personalizationPoints } = intel;

  const factsText = verifiedFacts.map((f) => `• [${f.confidence}] ${f.claim} (Source: ${f.source})`).join('\n');
  const issuesText = observedIssues.length > 0
    ? observedIssues.map((i) => `• [${i.severity}] ${i.technicalObservation} → Impact: ${i.impactOnBusiness} (Data: ${i.measuredDataPoint})`).join('\n')
    : '• No critical technical defects observed.';

  const opportunitiesText = inferredOpportunities.map((o) => `• ${o.title}: ${o.strategicRationale} (Value: ${o.expectedBusinessValue})`).join('\n');
  const solutionsText = recommendedSolutions.map((s) => `• ${s.serviceName} (${s.tier}):\n  - ${s.scopePoints.join('\n  - ')}`).join('\n');
  const personalizationText = personalizationPoints.map((p) => `• [${p.confidence}] ${p.contextAnchor}: "${p.naturalObservation}" (Source: ${p.evidenceSource})`).join('\n');

  return `=== PROPOSAL MIND STRUCTURED BUSINESS INTELLIGENCE ===
Business Name: ${businessProfile.name}
Category: ${businessProfile.category} (${businessProfile.industry})
Location: ${businessProfile.location.address || 'Local area'} (${businessProfile.location.city || 'City unknown'})
Website: ${businessProfile.contact.websiteUrl || 'No website'}
Contact Phone: ${businessProfile.contact.phone || 'None listed'}
Contact Email: ${businessProfile.contact.verifiedEmail || 'None discovered'}
Public Reputation: ${businessProfile.reputation.rating ? `${businessProfile.reputation.rating} ★ (${businessProfile.reputation.reviewCount} reviews)` : 'Unrated'}
Data Confidence: ${intel.overallConfidenceScore}/100 (${intel.intelligenceCompleteness} completeness)

--- VERIFIED FACTS (STRICT EVIDENCE - DO NOT INVENT) ---
${factsText}

--- OBSERVED ISSUES (MEASURED DEFICIENCIES) ---
${issuesText}

--- INFERRED OPPORTUNITIES ---
${opportunitiesText}

--- RECOMMENDED SOLUTIONS & SCOPE ---
${solutionsText}

--- PERSONALIZATION ANCHORS (USE IN PROPOSAL OPENING/BODY) ---
${personalizationText}

Primary Pitch Angle: ${intel.primaryPitchAngle}
Suggested Subject Angles: ${intel.suggestedSubjectLines.join(' | ')}
======================================================`;
}
