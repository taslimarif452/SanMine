export interface BusinessSearchParams {
  query: string;
  location?: string;
  category?: string;
  limit?: number;
  apiKey?: string;
}

export interface BusinessItem {
  id: string;
  name: string;
  address?: string;
  phone?: string;
  website?: string;
  rating?: number;
  reviewsCount?: number;
  category?: string;
  city?: string;
}

export interface BusinessSearchResult {
  success: boolean;
  providerId: string;
  providerName: string;
  businesses: BusinessItem[];
  totalFound: number;
  error?: string;
  message?: string;
  providerQuery?: string;
  providerCountryCode?: string;
  providerLocationParam?: string;
}

export type BusinessSearchProviderId = 'web_research' | 'none';

export interface BusinessSearchProviderInfo {
  id: BusinessSearchProviderId;
  name: string;
  badge: string;
  description: string;
  requiresKey: boolean;
  isConfigured: boolean;
  maskedApiKey?: string;
  helpUrl: string;
  helpText: string;
  keyPlaceholder: string;
}

export interface BusinessSearchProvider {
  readonly id: BusinessSearchProviderId;
  readonly name: string;
  readonly description: string;
  readonly requiresKey: boolean;
  isConfigured(): boolean;
  search(params: BusinessSearchParams): Promise<BusinessSearchResult>;
  testConnection(): Promise<{ success: boolean; message: string; error?: string }>;
}
