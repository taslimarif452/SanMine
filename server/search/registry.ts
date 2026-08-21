import {
  BusinessSearchProvider,
  BusinessSearchProviderId,
  BusinessSearchProviderInfo,
  BusinessSearchParams,
  BusinessSearchResult,
} from './types.js';
import { WebResearchSearchProvider } from './providers.js';
import { logBusinessSearchDiagnostics } from './config.js';

export const SEARCH_PROVIDER_METADATA: Record<
  BusinessSearchProviderId,
  {
    name: string;
    badge: string;
    description: string;
    helpUrl: string;
    helpText: string;
    keyPlaceholder: string;
  }
> = {
  web_research: {
    name: 'API-Free Web Research Engine',
    badge: 'Built-in Engine',
    description: 'Autonomous public web discovery and direct HTTPS research engine.',
    helpUrl: '',
    helpText: '',
    keyPlaceholder: '',
  },
  none: {
    name: 'None (Disabled)',
    badge: 'Disabled',
    description: 'Web research engine disabled.',
    helpUrl: '',
    helpText: '',
    keyPlaceholder: '',
  },
};

export class SearchProviderRegistry {
  private providers: Map<BusinessSearchProviderId, BusinessSearchProvider> = new Map();

  constructor() {
    this.register(new WebResearchSearchProvider());
    logBusinessSearchDiagnostics();
  }

  register(provider: BusinessSearchProvider): void {
    this.providers.set(provider.id, provider);
  }

  get(id: BusinessSearchProviderId): BusinessSearchProvider | undefined {
    return this.providers.get(id);
  }

  isConfigured(): boolean {
    return true;
  }

  getActiveProviderId(): BusinessSearchProviderId {
    return 'web_research';
  }

  getActiveProvider(): BusinessSearchProvider {
    return this.providers.get('web_research') || new WebResearchSearchProvider();
  }

  /**
   * Safe public provider info list.
   */
  getInfoList(): BusinessSearchProviderInfo[] {
    return [
      {
        id: 'web_research',
        name: 'API-Free Web Research Engine',
        badge: 'Built-in Engine',
        description: 'Autonomous public web discovery and direct HTTPS research engine.',
        requiresKey: false,
        isConfigured: true,
        helpUrl: '',
        helpText: '',
        keyPlaceholder: '',
      },
    ];
  }

  async search(params: BusinessSearchParams): Promise<BusinessSearchResult> {
    const provider = this.getActiveProvider();
    return provider.search(params);
  }
}

export const searchRegistry = new SearchProviderRegistry();
