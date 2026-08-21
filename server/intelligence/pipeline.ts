/**
 * Proposal Intelligence Pipeline
 * 
 * End-to-End Orchestrator:
 * Business Search / Raw Lead → Website Audit / Contact Extraction → Proposal Mind → Proposal Writer → Quality Gate → Final Proposal
 */

import { AIProviderId } from '../ai/types.js';
import { evaluateProposalQuality } from './qualityGate.js';
import { buildBusinessIntelligence } from './proposalMind.js';
import { generateProposal, generateDeterministicProposal } from './proposalWriter.js';
import {
  BusinessRawInput,
  ProposalMindIntelligence,
  ProposalQualityEvaluation,
  ProposalWriterOptions,
  ProposalWriterResult,
  isValidRecipientEmail,
} from './types.js';

export interface QualifiedBusinessProposalResult {
  businessName: string;
  discoveredEmail: string | null;
  website: string | null;
  keyVerifiedFacts: string[];
  importantObservedIssues: string[];
  opportunity: string;
  recommendedSolution: string;
  generatedSubject: string;
  generatedProposal: string;
  confidence: number;
  readyToSend: boolean;
  intelligence: ProposalMindIntelligence;
  writerResult: ProposalWriterResult;
  qualityEvaluation?: ProposalQualityEvaluation;
  missingDataNotes: string[];
}

export interface PipelineExecutionOptions {
  senderName?: string;
  senderAgencyName?: string;
  providerId?: AIProviderId;
  model?: string;
  apiKey?: string;
  customTone?: 'concise' | 'consultative' | 'direct';
  temperature?: number;
  abortSignal?: AbortSignal;
}

/**
 * Executes the complete Proposal Intelligence pipeline for a single business lead.
 * 
 * Step 1: Ingest raw business data + deeper audit research
 * Step 2: Proposal Mind synthesizes structured ProposalMindIntelligence (9-step A-I reasoning)
 * Step 3: Proposal Writer generates personalized proposal strictly from the intelligence
 * Step 4: Quality Gate validates no hallucinations, good tone, and relevant observations
 */
export async function processBusinessProposalPipeline(
  rawBiz: BusinessRawInput,
  options?: PipelineExecutionOptions
): Promise<QualifiedBusinessProposalResult> {
  // 1. Proposal Mind: Ingest raw business + audit data into structured intelligence
  const intelligence: ProposalMindIntelligence = buildBusinessIntelligence(rawBiz);

  // 2. Proposal Writer: Consume ProposalMindIntelligence (strictly grounded)
  const writerOptions: ProposalWriterOptions = {
    intelligence,
    senderName: options?.senderName || 'The Team',
    senderAgencyName: options?.senderAgencyName || 'SanMine Space',
    providerId: options?.providerId,
    model: options?.model,
    apiKey: options?.apiKey,
    customTone: options?.customTone || 'consultative',
    temperature: options?.temperature ?? 0.6,
    abortSignal: options?.abortSignal,
  };

  let writerResult: ProposalWriterResult;
  try {
    writerResult = await generateProposal(writerOptions);
  } catch (err: any) {
    console.warn(`[Pipeline] AI Writer fallback for ${rawBiz.name}:`, err.message);
    writerResult = generateDeterministicProposal(writerOptions);
  }

  // 3. Evaluate through Proposal Quality Gate
  const qualityEvaluation = writerResult.qualityEvaluation || evaluateProposalQuality(writerResult, intelligence);
  writerResult.qualityEvaluation = qualityEvaluation;

  // 4. Extract key verified facts and observed issues for downstream inspection and display
  const keyVerifiedFacts = intelligence.verifiedFacts.map((f) => f.claim);
  const importantObservedIssues = intelligence.observedIssues.map(
    (i) => `${i.technicalObservation} (${i.measuredDataPoint})`
  );
  const primaryOpp = intelligence.inferredOpportunities[0]?.title || 'Online Presence Modernization';
  const primarySol = intelligence.recommendedSolutions[0]?.serviceName || 'Modern Web Presence & Conversion Redesign';

  const rawEmail = intelligence.businessProfile.contact.verifiedEmail || null;
  const hasValidEmail = isValidRecipientEmail(rawEmail);
  const discoveredEmail = hasValidEmail ? rawEmail : null;
  const website = intelligence.businessProfile.contact.websiteUrl || null;
  
  const readyToSend = Boolean(
    hasValidEmail &&
    writerResult.success &&
    intelligence.readyForProposal &&
    writerResult.body &&
    writerResult.body.trim().length > 0 &&
    qualityEvaluation.passed
  );

  return {
    businessName: intelligence.businessProfile.name,
    discoveredEmail,
    website,
    keyVerifiedFacts,
    importantObservedIssues,
    opportunity: primaryOpp,
    recommendedSolution: primarySol,
    generatedSubject: writerResult.subject,
    generatedProposal: writerResult.body,
    confidence: intelligence.overallConfidenceScore,
    readyToSend,
    intelligence,
    writerResult,
    qualityEvaluation,
    missingDataNotes: intelligence.missingDataNotes,
  };
}

/**
 * Processes a batch of businesses independently.
 * Guarantees complete isolation between businesses so no facts or observations cross-contaminate.
 */
export async function processBatchProposalPipeline(
  businesses: BusinessRawInput[],
  options?: PipelineExecutionOptions
): Promise<QualifiedBusinessProposalResult[]> {
  const results: QualifiedBusinessProposalResult[] = [];

  for (const rawBiz of businesses) {
    try {
      const res = await processBusinessProposalPipeline(rawBiz, options);
      results.push(res);
    } catch (err: any) {
      console.warn(`[Pipeline Error] Failed processing lead ${rawBiz?.name || 'unknown'}:`, err.message);
      // Fallback safe result for the failed item
      const fallbackIntel = buildBusinessIntelligence(rawBiz || { name: 'Unknown' });
      const fallbackWriter = generateDeterministicProposal({ intelligence: fallbackIntel });
      results.push({
        businessName: rawBiz?.name || 'Unknown',
        discoveredEmail: null,
        website: rawBiz?.website || null,
        keyVerifiedFacts: [],
        importantObservedIssues: [],
        opportunity: 'Digital Modernization',
        recommendedSolution: 'Web Presence Optimization',
        generatedSubject: fallbackWriter.subject || `Note for ${rawBiz?.name || 'Business'}`,
        generatedProposal: fallbackWriter.body || '',
        confidence: fallbackIntel.overallConfidenceScore,
        readyToSend: false,
        intelligence: fallbackIntel,
        writerResult: fallbackWriter,
        qualityEvaluation: fallbackWriter.qualityEvaluation,
        missingDataNotes: [`Pipeline error: ${err.message}`],
      });
    }
  }

  return results;
}

/**
 * Formats a comprehensive Markdown report of market discovery and individualized proposals.
 */
export function formatPipelineAgentResponse(
  results: QualifiedBusinessProposalResult[],
  context: {
    businessType: string;
    location: string;
    totalDiscovered: number;
  }
): string {
  const { businessType, location, totalDiscovered } = context;
  const targetArea = location || 'the target region';

  const readyCount = results.filter((r) => r.readyToSend).length;
  const needsContactCount = results.filter((r) => !r.readyToSend && !r.discoveredEmail).length;
  const reviewNeededCount = results.length - readyCount - needsContactCount;

  const tableRows = results
    .map((r) => {
      const emailCol = r.discoveredEmail ? `\`${r.discoveredEmail}\`` : '*None found*';
      const webCol = r.website
        ? `[${r.website}](${r.website.startsWith('http') ? r.website : 'https://' + r.website})`
        : '*No website*';
      let readyBadge = '⚠ Needs Contact';
      if (r.readyToSend) {
        readyBadge = '✓ Ready to Send';
      } else if (r.discoveredEmail) {
        readyBadge = '⚠ Review Needed';
      }
      return `| **${r.businessName}** | ${webCol} | ${emailCol} | ${r.confidence}% | ${readyBadge} | ${r.opportunity} |`;
    })
    .join('\n');

  const detailedProposals = results
    .map((r, idx) => {
      const factsText =
        r.keyVerifiedFacts.length > 0
          ? r.keyVerifiedFacts.map((f) => `- ${f}`).join('\n')
          : '- *Standard local business directory listing*';

      const issuesText =
        r.importantObservedIssues.length > 0
          ? r.importantObservedIssues.map((i) => `- ${i}`).join('\n')
          : '- *No critical audit defects detected*';

      const missingText =
        r.missingDataNotes.length > 0
          ? `\n\n> ℹ️ **Data Notes:** ${r.missingDataNotes.join('; ')}`
          : '';

      const proposalBlock = r.generatedProposal
        ? `#### Personalized Outreach Draft\n> **Subject:** ${r.generatedSubject}\n>\n> ${r.generatedProposal.split('\n').join('\n> ')}`
        : `*Proposal generation skipped due to insufficient verified data.*`;

      let statusLabel = 'Needs Contact Information';
      if (r.readyToSend) {
        statusLabel = 'Ready to Send';
      } else if (r.discoveredEmail) {
        statusLabel = 'Manual Review Recommended';
      }

      const methodLabel = r.writerResult?.generationMethod === 'ai' ? 'AI Synthesis' : 'Deterministic Synthesis';
      const methodNote = r.writerResult?.reason ? ` · *${r.writerResult.reason}*` : '';

      return `### ${idx + 1}. ${r.businessName}

- **Website:** ${r.website || 'None found'}
- **Contact Email:** ${r.discoveredEmail ? `**${r.discoveredEmail}**` : 'No public email found'}
- **Confidence Score:** ${r.confidence}/100 · **Status:** ${statusLabel}
- **Method:** ${methodLabel}${methodNote}
- **Identified Opportunity:** ${r.opportunity}
- **Recommended Solution:** ${r.recommendedSolution}

#### Verified Business Facts
${factsText}

#### Observed Deficiencies & Findings
${issuesText}${missingText}

${proposalBlock}`;
    })
    .join('\n\n---\n\n');

  const aiGeneratedCount = results.filter((r) => r.writerResult?.generationMethod === 'ai').length;
  const deterministicCount = results.length - aiGeneratedCount;

  let summaryHeader = '';
  if (readyCount === results.length) {
    summaryHeader = `**${readyCount} personalized proposals are ready to send.**`;
  } else if (readyCount > 0) {
    summaryHeader = `**${results.length} proposal drafts generated: ${readyCount} ready to send, ${needsContactCount} need contact information.**`;
  } else {
    summaryHeader = `**${results.length} proposal drafts generated (all ${results.length} need contact information before sending).**`;
  }

  let synthesisNote = '';
  if (deterministicCount === results.length) {
    synthesisNote = `The proposals above were synthesized through our deterministic intelligence engine grounded strictly in verified live audits and measured website observations.`;
  } else if (aiGeneratedCount === results.length) {
    synthesisNote = `The proposals above were synthesized using AI based on verified live audits and measured website observations.`;
  } else {
    synthesisNote = `The proposals above were synthesized using AI (${aiGeneratedCount}) and deterministic intelligence fallback (${deterministicCount}) grounded strictly in verified audit observations.`;
  }

  return `## Business Discovery & Proposal Intelligence: ${businessType} in ${targetArea}

### Market Discovery Overview
Discovered **${totalDiscovered}** local businesses, conducted technical audits, and extracted intelligence for **${results.length}** priority opportunities.

| Business Name | Website | Email | Confidence | Status | Primary Opportunity |
|---|---|---|---|---|---|
${tableRows}

---

## Detailed Intelligence & Proposals (${results.length} Leads Analyzed)

${detailedProposals}

---

### Proposal Outreach & Confirmation
${summaryHeader}

${synthesisNote} To dispatch outreach emails through your authorized Gmail account:

- **[Review Proposals]**: Inspect, edit, or customize individual recipient emails and subjects.
- **[Send All]**: Dispatch all prepared proposals via Gmail OAuth (requires explicit confirmation).`;
}
