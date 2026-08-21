import {
  BusinessSearchProvider,
  BusinessSearchProviderId,
  BusinessSearchParams,
  BusinessSearchResult,
} from './types.js';
import { discoverBusinessesViaWebResearch } from '../research/index.js';

/**
 * Built-in API-Free Web Research & Discovery Provider.
 * Discovers and parses public web domains without requiring third-party search API keys.
 */
export class WebResearchSearchProvider implements BusinessSearchProvider {
  readonly id: BusinessSearchProviderId = 'web_research';
  readonly name: string = 'API-Free Web Research Engine';
  readonly description: string = 'Autonomous public web discovery and direct HTTPS research engine.';
  readonly requiresKey: boolean = false;

  isConfigured(): boolean {
    return true;
  }

  async testConnection(): Promise<{ success: boolean; message: string; error?: string }> {
    return {
      success: true,
      message: 'API-Free Web Research Engine is operational and always available.',
    };
  }

  async search(params: BusinessSearchParams): Promise<BusinessSearchResult> {
    const discovery = await discoverBusinessesViaWebResearch({
      query: params.query,
      location: params.location,
      limit: params.limit,
    });

    return {
      success: discovery.success,
      providerId: this.id,
      providerName: this.name,
      businesses: discovery.businesses.map((b) => ({
        id: b.id,
        name: b.name,
        address: b.address,
        phone: b.phone,
        website: b.website,
        rating: b.rating,
        reviewsCount: b.reviewsCount,
        category: b.category,
        city: b.city,
        verifiedLocation: b.verifiedLocation,
        audit: b.audit,
      })),
      totalFound: discovery.totalFound,
      message: discovery.message,
      error: discovery.error,
      providerQuery: discovery.providerQuery,
    };
  }
}

