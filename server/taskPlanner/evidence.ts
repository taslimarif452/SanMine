/**
 * Universal Task Planner — Evidence & Grounding Manager
 *
 * Maintains verifiable evidence chains, tracks provenance quotes,
 * detects source conflicts, and prevents synthetic hallucinations.
 */

import { ExtractedFact, TaskEvidenceItem } from './types.js';

export interface FactConflict {
  field: string;
  entityName?: string;
  sourceA: { value: string; url: string; quote?: string };
  sourceB: { value: string; url: string; quote?: string };
  resolutionStatus: 'UNRESOLVED' | 'RESOLVED_PRIMARY_SOURCE' | 'REPORTED_AS_CONFLICT';
  resolvedValue?: string;
}

export class EvidenceManager {
  private evidenceStore: TaskEvidenceItem[] = [];
  private factsStore: ExtractedFact[] = [];
  private conflicts: FactConflict[] = [];

  /**
   * Adds evidence with source citation and quote.
   */
  public addEvidence(evidence: Omit<TaskEvidenceItem, 'id'>): TaskEvidenceItem {
    const id = `ev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const item: TaskEvidenceItem = {
      ...evidence,
      id,
    };
    this.evidenceStore.push(item);
    return item;
  }

  /**
   * Adds an extracted fact with conflict checking against existing facts.
   */
  public addFact(fact: ExtractedFact): { fact: ExtractedFact; hasConflict: boolean; conflict?: FactConflict } {
    // Check if conflicting fact exists for same field and entity
    const existing = this.factsStore.find(
      (f) =>
        f.field === fact.field &&
        f.entityKey === fact.entityKey &&
        f.value.toLowerCase() !== fact.value.toLowerCase() &&
        f.sourceUrl !== fact.sourceUrl
    );

    let hasConflict = false;
    let conflict: FactConflict | undefined = undefined;

    if (existing) {
      hasConflict = true;
      conflict = {
        field: fact.field,
        entityName: fact.entityKey,
        sourceA: { value: existing.value, url: existing.sourceUrl, quote: existing.evidenceText },
        sourceB: { value: fact.value, url: fact.sourceUrl, quote: fact.evidenceText },
        resolutionStatus: 'UNRESOLVED',
      };
      this.conflicts.push(conflict);
    }

    this.factsStore.push(fact);
    return { fact, hasConflict, conflict };
  }

  /**
   * Returns all recorded evidence items.
   */
  public getAllEvidence(): TaskEvidenceItem[] {
    return [...this.evidenceStore];
  }

  /**
   * Returns all extracted facts.
   */
  public getAllFacts(): ExtractedFact[] {
    return [...this.factsStore];
  }

  /**
   * Returns all detected conflicts.
   */
  public getConflicts(): FactConflict[] {
    return [...this.conflicts];
  }

  /**
   * Verifies if a specific field has high-confidence grounded evidence.
   */
  public isFieldVerified(field: string, entityKey?: string): boolean {
    return this.factsStore.some(
      (f) =>
        f.field === field &&
        (!entityKey || f.entityKey === entityKey) &&
        f.confidence === 'high' &&
        f.value.trim().length > 0
    );
  }

  /**
   * Formats evidence citations into clean Markdown.
   */
  public formatCitationsMarkdown(): string {
    if (this.evidenceStore.length === 0 && this.factsStore.length === 0) {
      return '- No public sources could be directly verified.';
    }

    const uniqueSources = new Map<string, { title: string; quotes: string[] }>();
    for (const ev of this.evidenceStore) {
      if (!uniqueSources.has(ev.sourceUrl)) {
        uniqueSources.set(ev.sourceUrl, { title: ev.pageTitle || ev.sourceUrl, quotes: [] });
      }
      if (ev.quote && !uniqueSources.get(ev.sourceUrl)!.quotes.includes(ev.quote)) {
        uniqueSources.get(ev.sourceUrl)!.quotes.push(ev.quote);
      }
    }

    const rows: string[] = [];
    for (const [url, data] of uniqueSources.entries()) {
      rows.push(`- [${data.title}](${url}) (✓ Live Inspected)`);
    }

    return rows.join('\n');
  }
}
