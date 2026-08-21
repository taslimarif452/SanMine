export type BrowserActionType =
  | 'navigate'
  | 'click'
  | 'type'
  | 'press'
  | 'screenshot'
  | 'extract_content'
  | 'evaluate'
  | 'scroll'
  | 'wait'
  | 'go_back'
  | 'go_forward'
  | 'reload'
  | 'close';

export type BrowserSessionStatus = 'idle' | 'busy' | 'closed' | 'error';
export type BrowserSessionMode = 'live_browser' | 'http_fallback';

export type BrowserErrorCode =
  | 'BROWSER_RUNTIME_UNAVAILABLE'
  | 'BROWSER_CONNECTION_FAILED'
  | 'BROWSER_NAVIGATION_FAILED'
  | 'BROWSER_TIMEOUT'
  | 'BROWSER_ACTION_FAILED'
  | 'BROWSER_EXTRACTION_FAILED'
  | 'AGENT_STEP_LIMIT'
  | 'AI_PROVIDER_ERROR'
  | 'AUTH_REQUIRED'
  | 'BLOCKED'
  | 'TIMEOUT'
  | 'INACCESSIBLE'
  | 'NOT_FOUND'
  | 'DATABASE_ERROR';

export interface BrowserViewport {
  width: number;
  height: number;
}

export interface BrowserNavigateOptions {
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle';
  timeoutMs?: number;
}

export interface BrowserRuntimeDiagnostic {
  mode: BrowserSessionMode;
  provider: string;
  connected: boolean;
  currentUrl: string;
}

export interface BrowserActionResult {
  success: boolean;
  action: BrowserActionType;
  mode?: BrowserSessionMode;
  url?: string;
  title?: string;
  screenshotBase64?: string;
  content?: string;
  text?: string;
  headings?: string[];
  links?: any[];
  data?: any;
  error?: string;
  errorCode?: BrowserErrorCode;
  executionTimeMs: number;
  timestamp: string;
  runtime?: BrowserRuntimeDiagnostic;
}

export interface BrowserSessionConfig {
  sessionId?: string;
  userId?: string;
  mode?: BrowserSessionMode;
  viewport?: BrowserViewport;
  timeoutMs?: number;
  userAgent?: string;
  headless?: boolean;
  remoteEndpoint?: string;
  apiKey?: string;
}

export interface BrowserSessionState {
  id: string;
  sessionId: string;
  userId: string;
  mode: BrowserSessionMode;
  status: BrowserSessionStatus;
  currentUrl: string;
  currentTitle: string;
  pageTitle: string;
  currentAction?: string;
  createdAt: number;
  startedAt: number;
  lastActiveAt: number;
  lastActivityAt: number;
  history: Array<{ url: string; title: string; timestamp: number }>;
  lastScreenshotBase64?: string;
  error?: string;
  runtime?: BrowserRuntimeDiagnostic;
}

export interface BrowserSession {
  readonly id: string;
  readonly userId: string;
  getMode(): BrowserSessionMode;
  navigate(url: string, options?: BrowserNavigateOptions): Promise<BrowserActionResult>;
  goBack(): Promise<BrowserActionResult>;
  goForward(): Promise<BrowserActionResult>;
  reload(): Promise<BrowserActionResult>;
  click(selector: string, options?: { timeoutMs?: number }): Promise<BrowserActionResult>;
  type(selector: string, text: string, options?: { clearFirst?: boolean; timeoutMs?: number }): Promise<BrowserActionResult>;
  press(key: string, options?: { timeoutMs?: number }): Promise<BrowserActionResult>;
  screenshot(options?: { fullPage?: boolean; quality?: number }): Promise<BrowserActionResult>;
  extractContent(selector?: string): Promise<BrowserActionResult>;
  evaluate(script: string): Promise<BrowserActionResult>;
  scroll(direction: 'up' | 'down' | 'to_bottom' | 'to_top', amount?: number): Promise<BrowserActionResult>;
  waitFor(selectorOrMs: string | number): Promise<BrowserActionResult>;
  waitForPage(options?: { timeoutMs?: number }): Promise<BrowserActionResult>;
  getCurrentUrl(): string;
  getPageTitle(): string;
  getState(): BrowserSessionState;
  close(): Promise<void>;
}

export interface BrowserProvider {
  readonly id: string;
  readonly name: string;
  readonly mode: BrowserSessionMode;
  isAvailable(): boolean;
  createSession(config: BrowserSessionConfig): Promise<BrowserSession>;
}

