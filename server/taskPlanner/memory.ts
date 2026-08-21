/**
 * Universal Task Planner — Task Memory & Anti-Loop Engine
 *
 * Maintains continuous, audit-backed execution memory across iterations:
 * visited URLs, queries, candidate entities, extracted facts, observations,
 * and robust anti-loop protections.
 */

import {
  CandidateUrl,
  ExtractedFact,
  FailedAction,
  InternalLinkCandidate,
  PageSummary,
  PlannerObservation,
  SuccessfulAction,
  TaskEntity,
  TaskEvidenceItem,
} from './types.js';

export class TaskMemoryManager {
  public visitedUrls: Set<string> = new Set();
  public visitedDomains: Set<string> = new Set();
  public visitedPages: Map<string, PageSummary> = new Map();
  public searchQueries: Set<string> = new Set();
  public candidateUrls: CandidateUrl[] = [];
  public internalLinkQueue: InternalLinkCandidate[] = [];
  public openedLinks: Array<{ fromUrl: string; toUrl: string; text: string; timestamp: string }> = [];
  public candidateEntities: TaskEntity[] = [];
  public duplicateEntities: Set<string> = new Set();
  public verifiedEntities: TaskEntity[] = [];
  public extractedFacts: ExtractedFact[] = [];
  public missingFacts: Map<string, string[]> = new Map(); // entityKey -> missingFieldNames
  public failedActions: FailedAction[] = [];
  public successfulActions: SuccessfulAction[] = [];
  public observations: PlannerObservation[] = [];
  public evidence: TaskEvidenceItem[] = [];
  public actionHistory: Array<{ action: string; tool: string; args: any; timestamp: string }> = [];

  constructor(public taskId: string) {}

  /**
   * Registers a search query into memory. Returns false if query was already run.
   */
  public registerSearchQuery(query: string): boolean {
    const clean = query.trim().toLowerCase();
    if (!clean) return false;
    if (this.searchQueries.has(clean)) {
      return false;
    }
    this.searchQueries.add(clean);
    return true;
  }

  /**
   * Adds candidate URLs with deduplication against visited URLs and existing candidates.
   * Computes position, domain, and relevance scores.
   */
  public addCandidateUrls(
    candidates: Array<{
      url: string;
      title: string;
      snippet?: string;
      source?: string;
      domain?: string;
      position?: number;
      isOfficialWebsite?: boolean;
      isSocialProfile?: boolean;
      isDirectory?: boolean;
    }>
  ): number {
    let addedCount = 0;
    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i];
      if (!c.url) continue;
      const cleanUrl = this.normalizeUrl(c.url);
      if (!cleanUrl) continue;

      if (this.visitedUrls.has(cleanUrl)) continue;
      if (this.candidateUrls.some((existing) => this.normalizeUrl(existing.url) === cleanUrl)) continue;

      const domain = c.domain || this.normalizeDomain(cleanUrl);
      const position = c.position !== undefined ? c.position : i + 1;

      // Base relevance calculation (prefer official websites over aggregators, factor position)
      let relevanceScore = Math.max(0.5, 1.0 - position * 0.05);
      if (c.isOfficialWebsite) relevanceScore += 0.2;
      if (c.isDirectory) relevanceScore -= 0.1;

      const candidateObj: CandidateUrl = {
        url: cleanUrl,
        title: c.title || cleanUrl,
        snippet: c.snippet || '',
        domain,
        position,
        relevanceScore: Math.min(1.0, relevanceScore),
        relevance: Math.min(1.0, relevanceScore),
        source: c.source || 'search',
        isOfficialWebsite: c.isOfficialWebsite,
        isSocialProfile: c.isSocialProfile,
        isDirectory: c.isDirectory,
        discoveredAt: new Date().toISOString(),
      };

      this.candidateUrls.push(candidateObj);
      addedCount++;
    }

    // Sort candidates by relevance score descending
    this.candidateUrls.sort((a, b) => b.relevanceScore - a.relevanceScore);
    return addedCount;
  }

  /**
   * Pops the next unvisited candidate URL with highest relevance score.
   */
  public popNextCandidateUrl(): CandidateUrl | undefined {
    while (this.candidateUrls.length > 0) {
      const cand = this.candidateUrls.shift();
      if (cand && !this.visitedUrls.has(this.normalizeUrl(cand.url))) {
        return cand;
      }
    }
    return undefined;
  }

  /**
   * Adds internal links discovered from page inspection with semantic scoring.
   */
  public queueInternalLinks(
    fromUrl: string,
    links: Array<{ text: string; href: string; fullUrl?: string }>,
    requiredFields: string[] = []
  ): number {
    let queued = 0;
    const baseOrigin = this.extractOrigin(fromUrl);

    for (const link of links) {
      const href = link.fullUrl || link.href;
      if (!href) continue;
      const cleanUrl = this.normalizeUrl(href);
      if (!cleanUrl || this.visitedUrls.has(cleanUrl)) continue;

      // Ensure internal link belongs to same origin/domain or closely related subdomain
      const linkOrigin = this.extractOrigin(cleanUrl);
      if (baseOrigin && linkOrigin && baseOrigin !== linkOrigin && !cleanUrl.includes(this.normalizeDomain(fromUrl))) {
        continue;
      }

      if (this.internalLinkQueue.some((existing) => this.normalizeUrl(existing.fullUrl) === cleanUrl)) {
        continue;
      }

      const textLower = (link.text || '').toLowerCase();
      const hrefLower = cleanUrl.toLowerCase();
      const combined = `${textLower} ${hrefLower}`;

      let priorityScore = 0.5;
      let semanticTarget = 'general';

      // 1. Founder / Leadership / Team
      if (
        /\b(about|team|leadership|founder|founders|who-we-are|our-story|people|management)\b/i.test(combined)
      ) {
        priorityScore = requiredFields.includes('founder') || requiredFields.includes('team') ? 0.95 : 0.8;
        semanticTarget = 'founder';
      }
      // 2. Pricing / Plans
      else if (
        /\b(pricing|plans|rates|pricing-plans|cost|packages|subscription|buy)\b/i.test(combined)
      ) {
        priorityScore = requiredFields.includes('pricing') ? 0.95 : 0.75;
        semanticTarget = 'pricing';
      }
      // 3. Services / Products
      else if (
        /\b(services|products|solutions|offerings|what-we-do|features)\b/i.test(combined)
      ) {
        priorityScore = requiredFields.includes('services') ? 0.95 : 0.75;
        semanticTarget = 'services';
      }
      // 4. Contact / Support
      else if (
        /\b(contact|contact-us|get-in-touch|reach-us|support|help|location)\b/i.test(combined)
      ) {
        priorityScore = requiredFields.includes('email') || requiredFields.includes('phone') || requiredFields.includes('contact') ? 0.95 : 0.7;
        semanticTarget = 'contact';
      }

      // Only queue relevant internal links if they have meaningful score
      if (priorityScore >= 0.7) {
        this.internalLinkQueue.push({
          text: link.text || cleanUrl,
          href: link.href,
          fullUrl: cleanUrl,
          semanticTarget,
          priorityScore,
        });
        queued++;
      }
    }

    // Sort internal link queue by priority
    this.internalLinkQueue.sort((a, b) => b.priorityScore - a.priorityScore);
    return queued;
  }

  /**
   * Pops the next high-priority internal link to follow.
   */
  public popNextInternalLink(): InternalLinkCandidate | undefined {
    while (this.internalLinkQueue.length > 0) {
      const next = this.internalLinkQueue.shift();
      if (next && !this.visitedUrls.has(this.normalizeUrl(next.fullUrl))) {
        return next;
      }
    }
    return undefined;
  }

  /**
   * Records an opened link transition.
   */
  public recordLinkTransition(fromUrl: string, toUrl: string, text: string): void {
    this.openedLinks.push({
      fromUrl: this.normalizeUrl(fromUrl),
      toUrl: this.normalizeUrl(toUrl),
      text: text || '',
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Marks a URL and its domain as visited.
   */
  public markUrlVisited(url: string): void {
    const clean = this.normalizeUrl(url);
    if (clean) {
      this.visitedUrls.add(clean);
      const domain = this.normalizeDomain(clean);
      if (domain) {
        this.visitedDomains.add(domain);
      }
    }
  }

  /**
   * Records a page summary into memory.
   */
  public recordPageSummary(summary: PageSummary): void {
    const clean = this.normalizeUrl(summary.url);
    this.visitedPages.set(clean, summary);
    this.markUrlVisited(clean);
  }

  /**
   * Records an extracted fact with provenance tracking.
   */
  public recordFact(fact: ExtractedFact): void {
    if (!fact.value || !fact.field) return;

    // Check against duplicate identical facts
    const isDuplicate = this.extractedFacts.some(
      (f) =>
        f.field === fact.field &&
        f.value.toLowerCase() === fact.value.toLowerCase() &&
        f.sourceUrl === fact.sourceUrl
    );

    if (!isDuplicate) {
      this.extractedFacts.push({
        ...fact,
        timestamp: fact.timestamp || new Date().toISOString(),
      });
    }
  }

  /**
   * Records a piece of evidence with ground citation.
   */
  public recordEvidence(item: Omit<TaskEvidenceItem, 'id'>): void {
    const id = `ev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    this.evidence.push({
      ...item,
      id,
    });
  }

  /**
   * Records an entity and updates verified / candidate lists.
   */
  public recordEntity(entity: Omit<TaskEntity, 'id'>): TaskEntity {
    const cleanName = (entity.name || '').trim().toLowerCase();
    const entityId = `ent_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

    // Check duplicate by name or domain
    const existing = this.candidateEntities.find(
      (e) => e.name.toLowerCase() === cleanName || (entity.url && e.url && this.normalizeDomain(e.url) === this.normalizeDomain(entity.url))
    );

    if (existing) {
      // Merge extracted fields
      existing.extractedFields = {
        ...existing.extractedFields,
        ...entity.extractedFields,
      };
      if (entity.verified) existing.verified = true;
      for (const cit of entity.sourceCitations) {
        if (!existing.sourceCitations.includes(cit)) {
          existing.sourceCitations.push(cit);
        }
      }
      return existing;
    }

    const newEntity: TaskEntity = {
      ...entity,
      id: entityId,
    };

    this.candidateEntities.push(newEntity);
    if (newEntity.verified) {
      this.verifiedEntities.push(newEntity);
    }
    return newEntity;
  }

  /**
   * Records an observation from tool execution.
   */
  public recordObservation(observation: PlannerObservation): void {
    this.observations.push(observation);
    this.actionHistory.push({
      action: observation.action,
      tool: observation.tool,
      args: observation.rawResult,
      timestamp: observation.timestamp,
    });

    if (observation.success) {
      this.successfulActions.push({
        action: observation.action,
        tool: observation.tool,
        args: observation.rawResult,
        summary: `Success (${observation.executionTimeMs}ms)`,
        timestamp: observation.timestamp,
      });
    } else {
      this.failedActions.push({
        action: observation.action,
        tool: observation.tool,
        args: observation.rawResult,
        error: observation.errors || 'Unknown error',
        timestamp: observation.timestamp,
      });
    }

    for (const fact of observation.extractedFacts) {
      this.recordFact(fact);
    }
    for (const ev of observation.evidence) {
      this.recordEvidence(ev);
    }
    if (observation.discoveredUrls.length > 0) {
      this.addCandidateUrls(
        observation.discoveredUrls.map((u) => ({ url: u, title: u, source: observation.tool }))
      );
    }
  }

  /**
   * Anti-Loop Protection: Detects if an action or search is cycling or repeating.
   */
  public detectLoop(actionName: string, args: any): { isLoop: boolean; loopReason?: string } {
    const history = this.actionHistory;
    const count = history.length;

    // 1. Check if same action with same args occurred 2+ times consecutively
    if (count >= 2) {
      const last = history[count - 1];
      const secondLast = history[count - 2];
      if (
        last.action === actionName &&
        secondLast.action === actionName &&
        JSON.stringify(last.args) === JSON.stringify(args)
      ) {
        return {
          isLoop: true,
          loopReason: `Action "${actionName}" repeated with identical parameters consecutive times.`,
        };
      }
    }

    // 2. Check if search query was already executed
    if (actionName === 'google_search' || actionName === 'search_businesses') {
      const query = (args?.query || '').trim().toLowerCase();
      if (query && this.searchQueries.has(query)) {
        return {
          isLoop: true,
          loopReason: `Search query "${query}" has already been executed.`,
        };
      }
    }

    // 3. Check if URL was already visited
    if (actionName === 'browser_navigate' || actionName === 'analyze_website') {
      const url = this.normalizeUrl(args?.url || '');
      if (url && this.visitedUrls.has(url)) {
        return {
          isLoop: true,
          loopReason: `Destination URL "${url}" has already been inspected.`,
        };
      }
    }

    // 4. Check cyclical 2-step loop (A -> B -> A -> B)
    if (count >= 4) {
      const [a1, b1, a2, b2] = history.slice(-4);
      if (
        a1.action === a2.action &&
        b1.action === b2.action &&
        a1.action !== b1.action &&
        actionName === a1.action
      ) {
        return {
          isLoop: true,
          loopReason: `Detected 2-action cyclical oscillation between "${a1.action}" and "${b1.action}".`,
        };
      }
    }

    return { isLoop: false };
  }

  /**
   * Helper: Normalizes a URL for deduplication.
   */
  public normalizeUrl(rawUrl: string): string {
    if (!rawUrl) return '';
    let u = rawUrl.trim();
    if (!u.startsWith('http://') && !u.startsWith('https://')) {
      u = `https://${u}`;
    }
    try {
      const parsed = new URL(u);
      // Remove standard tracking params
      parsed.searchParams.delete('utm_source');
      parsed.searchParams.delete('utm_medium');
      parsed.searchParams.delete('utm_campaign');
      parsed.searchParams.delete('fbclid');
      parsed.searchParams.delete('gclid');
      return parsed.toString().replace(/\/+$/, '');
    } catch {
      return u.replace(/\/+$/, '');
    }
  }

  /**
   * Helper: Extracts origin (protocol + host) from URL.
   */
  public extractOrigin(rawUrl: string): string {
    try {
      const parsed = new URL(this.normalizeUrl(rawUrl));
      return parsed.origin.toLowerCase();
    } catch {
      return '';
    }
  }

  /**
   * Helper: Extracts hostname for domain-level deduplication.
   */
  public normalizeDomain(rawUrl: string): string {
    try {
      const parsed = new URL(this.normalizeUrl(rawUrl));
      return parsed.hostname.replace(/^www\./, '').toLowerCase();
    } catch {
      return rawUrl.toLowerCase();
    }
  }
}
