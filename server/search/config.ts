/**
 * SANMine Web Research & Business Discovery Configuration
 *
 * API-Free foundation: Operates without third-party search API keys.
 * No Google Places API, no Serper API, and zero external search key dependencies.
 */

export function isBusinessSearchConfigured(): boolean {
  return true;
}

export function getBusinessSearchDiagnostics(): {
  isAvailable: boolean;
  primaryProvider: 'web_research';
  apiKeysRequired: boolean;
} {
  return {
    isAvailable: true,
    primaryProvider: 'web_research',
    apiKeysRequired: false,
  };
}

export function logBusinessSearchDiagnostics(): void {
  const diag = getBusinessSearchDiagnostics();
  console.log(
    `[WEB RESEARCH CONFIG]\nprovider=API-Free Web Research Engine\nisAvailable=${diag.isAvailable}\napiKeysRequired=${diag.apiKeysRequired}`
  );
}
