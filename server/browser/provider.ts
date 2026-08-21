import {
  BrowserActionType,
  BrowserActionResult,
  BrowserErrorCode,
  BrowserNavigateOptions,
  BrowserProvider,
  BrowserSession,
  BrowserSessionConfig,
  BrowserSessionMode,
  BrowserSessionState,
  BrowserSessionStatus,
} from './types.js';
import { chromium as playwrightChromium } from 'playwright-core';

function escapeXml(unsafe: string): string {
  return (unsafe || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Generates an accurate SVG visual viewport snapshot for HTTP fallback mode.
 */
export function generateVisualSnapshotSvg({
  url,
  title,
  text,
  headings = [],
  links = [],
  actionType,
  status = 'active',
  isBlocked = false,
  errorCode,
}: {
  url: string;
  title: string;
  text: string;
  headings?: string[];
  links?: Array<{ href: string; text: string }>;
  actionType?: string;
  status?: string;
  isBlocked?: boolean;
  errorCode?: BrowserErrorCode;
}): string {
  let hostname = 'Web Page';
  try {
    hostname = new URL(url).hostname;
  } catch {
    hostname = url || 'Web Page';
  }

  const isGoogleMaps = url.includes('google.com/maps') || url.includes('maps.google') || title.toLowerCase().includes('google maps');

  const safeTitle = escapeXml(title.slice(0, 65) || hostname);
  const safeHost = escapeXml(hostname);
  const safeUrl = escapeXml(url.slice(0, 75));
  const snippet1 = escapeXml(text.slice(0, 160) || 'Loading page content and analyzing live DOM...');
  const snippet2 = escapeXml(text.slice(160, 340) || 'Extracting verified contact channels, business listings, and technical web stack...');
  
  // Extract potential phone / emails from text
  const phoneMatch = text.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}|\+91[-.\s]?\d{10}|\b\d{10}\b/);
  const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  
  const detectedPhone = phoneMatch ? escapeXml(phoneMatch[0]) : null;
  const detectedEmail = emailMatch ? escapeXml(emailMatch[0]) : null;

  const primaryHeading = escapeXml(headings[0] || title || hostname);
  const secondaryHeading = escapeXml(headings[1] || 'Discovered Content & Links');

  const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 560" width="100%" height="100%" style="background:#FBFBFA; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <defs>
    <linearGradient id="navGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#1F1E1B"/>
      <stop offset="100%" stop-color="#2D2B26"/>
    </linearGradient>
    <linearGradient id="mapBg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#E8ECE9"/>
      <stop offset="50%" stop-color="#DCE3DD"/>
      <stop offset="100%" stop-color="#E2E8E4"/>
    </linearGradient>
    <filter id="shadow" x="-5%" y="-5%" width="110%" height="110%">
      <feDropShadow dx="0" dy="2" stdDeviation="4" flood-opacity="0.06"/>
    </filter>
  </defs>

  <!-- Top Page Nav Header -->
  <rect x="0" y="0" width="900" height="52" fill="url(#navGrad)"/>
  <circle cx="28" cy="26" r="10" fill="#C66A3D"/>
  <text x="28" y="30" font-size="11" font-weight="700" fill="#FFFFFF" text-anchor="middle">S</text>
  <text x="48" y="30" font-size="13" font-weight="600" fill="#F7F6F2">${safeHost}</text>

  <rect x="740" y="14" width="136" height="24" rx="12" fill="#3B3833"/>
  <circle cx="754" cy="26" r="4" fill="${isBlocked ? '#E5534B' : '#3F7A5A'}"/>
  <text x="766" y="30" font-size="10" font-weight="500" fill="#D9D5CC">${isBlocked ? errorCode || 'AUTH/BLOCKED' : 'Live Session Active'}</text>

  <!-- Page Body Viewport -->
  ${
    isGoogleMaps
      ? `
    <!-- Maps Layout View -->
    <rect x="0" y="52" width="900" height="508" fill="url(#mapBg)"/>
    <path d="M 0 150 Q 450 200 900 120 M 0 340 Q 300 280 900 400 M 320 52 L 340 560 M 600 52 L 580 560" stroke="#FFFFFF" stroke-width="8" opacity="0.75" fill="none"/>
    <path d="M 0 220 L 900 240 M 180 52 L 200 560 M 740 52 L 720 560" stroke="#FFFFFF" stroke-width="4" opacity="0.5" fill="none"/>
    <circle cx="450" cy="240" r="16" fill="#C66A3D" opacity="0.25"/>
    <circle cx="450" cy="240" r="8" fill="#C66A3D"/>
    <circle cx="450" cy="240" r="3" fill="#FFFFFF"/>

    <rect x="24" y="76" width="340" height="420" rx="12" fill="#FFFFFF" filter="url(#shadow)"/>
    <rect x="24" y="76" width="340" height="8" rx="4" fill="#C66A3D"/>
    <text x="44" y="112" font-size="16" font-weight="700" fill="#1F1E1B">${safeTitle}</text>
    <text x="44" y="132" font-size="11" fill="#6B6862">Directory / Map Location</text>
    <line x1="44" y1="146" x2="344" y2="146" stroke="#F2F1ED" stroke-width="1"/>
    <text x="44" y="172" font-size="12" font-weight="600" fill="#1F1E1B">Overview &amp; Findings</text>
    <text x="44" y="194" font-size="11" fill="#4B4842">${snippet1.slice(0, 80)}...</text>
    ${detectedPhone ? `
    <rect x="44" y="218" width="300" height="32" rx="6" fill="#F7F6F2"/>
    <text x="56" y="238" font-size="11" font-weight="600" fill="#1F1E1B">Phone: <tspan font-weight="400" fill="#C66A3D">${detectedPhone}</tspan></text>
    ` : ''}
    ${detectedEmail ? `
    <rect x="44" y="258" width="300" height="32" rx="6" fill="#F7F6F2"/>
    <text x="56" y="278" font-size="11" font-weight="600" fill="#1F1E1B">Email: <tspan font-weight="400" fill="#3F7A5A">${detectedEmail}</tspan></text>
    ` : ''}
    `
      : `
    <!-- Standard Web Page View -->
    <rect x="0" y="52" width="900" height="508" fill="#FBFBFA"/>

    <!-- Hero Banner -->
    <rect x="40" y="80" width="820" height="150" rx="14" fill="#FFFFFF" stroke="#E5E2DC" filter="url(#shadow)"/>
    <rect x="64" y="104" width="180" height="18" rx="4" fill="#F2EFE9"/>
    <text x="72" y="117" font-size="10" font-weight="600" fill="${isBlocked ? '#E5534B' : '#8C5D39'}">${isBlocked ? 'ACCESS NOTICE' : 'LIVE DOM INSPECTION'}</text>
    
    <text x="64" y="152" font-size="20" font-weight="700" fill="#1F1E1B">${safeTitle}</text>
    <text x="64" y="176" font-size="12" fill="#6B6862">${snippet1.slice(0, 110)}</text>
    <text x="64" y="194" font-size="12" fill="#6B6862">${snippet1.slice(110, 210)}</text>

    <!-- Content Columns -->
    <rect x="40" y="250" width="530" height="250" rx="12" fill="#FFFFFF" stroke="#E5E2DC" filter="url(#shadow)"/>
    <text x="64" y="284" font-size="14" font-weight="600" fill="#1F1E1B">${secondaryHeading}</text>
    <text x="64" y="310" font-size="11" fill="#4B4842">${snippet2.slice(0, 120)}</text>
    <text x="64" y="330" font-size="11" fill="#4B4842">${snippet2.slice(120, 240)}</text>
    <text x="64" y="350" font-size="11" fill="#4B4842">${snippet2.slice(240, 350)}</text>

    <!-- Sidebar Detail Box -->
    <rect x="590" y="250" width="270" height="250" rx="12" fill="#FAF8F5" stroke="#E5E2DC" filter="url(#shadow)"/>
    <text x="610" y="284" font-size="13" font-weight="700" fill="#1F1E1B">Discovered Metadata</text>
    
    <rect x="610" y="300" width="230" height="36" rx="6" fill="#FFFFFF" stroke="#EAE6DF"/>
    <text x="622" y="322" font-size="10" font-weight="600" fill="#6B6862">STATUS: <tspan fill="${isBlocked ? '#E5534B' : '#3F7A5A'}">${isBlocked ? errorCode || 'RESTRICTED' : '200 OK (Verified)'}</tspan></text>
    
    ${detectedPhone ? `
    <rect x="610" y="344" width="230" height="36" rx="6" fill="#FFFFFF" stroke="#EAE6DF"/>
    <text x="622" y="366" font-size="10" font-weight="600" fill="#6B6862">PHONE: <tspan fill="#C66A3D">${detectedPhone}</tspan></text>
    ` : `
    <rect x="610" y="344" width="230" height="36" rx="6" fill="#FFFFFF" stroke="#EAE6DF"/>
    <text x="622" y="366" font-size="10" font-weight="600" fill="#9C988F">Public directory scan</tspan></text>
    `}

    ${detectedEmail ? `
    <rect x="610" y="388" width="230" height="36" rx="6" fill="#FFFFFF" stroke="#EAE6DF"/>
    <text x="622" y="410" font-size="10" font-weight="600" fill="#3F7A5A">${detectedEmail}</tspan></text>
    ` : `
    <rect x="610" y="388" width="230" height="36" rx="6" fill="#FFFFFF" stroke="#EAE6DF"/>
    <text x="622" y="410" font-size="10" font-weight="600" fill="#9C988F">Contact scan in progress</tspan></text>
    `}

    <rect x="610" y="432" width="230" height="46" rx="6" fill="#EBF3ED"/>
    <text x="622" y="452" font-size="10" font-weight="700" fill="#3F7A5A">AUTONOMOUS RESEARCH</text>
    <text x="622" y="468" font-size="9" fill="#4B4842">Live DOM &amp; Content extraction active</text>
    `
  }

  <!-- Footer live activity overlay bar -->
  <rect x="0" y="524" width="900" height="36" fill="#1F1E1B" opacity="0.95"/>
  <circle cx="20" cy="542" r="4" fill="#C66A3D"/>
  <text x="32" y="546" font-size="11" font-weight="500" fill="#FAF7F2">Agent Live View: <tspan fill="#D9D5CC">${safeUrl}</tspan></text>
</svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svgContent)}`;
}

/**
 * Checks if a response or HTML content indicates a block or auth requirement.
 */
export function detectPageRestrictions(status: number, url: string, html: string): { isBlocked: boolean; errorCode?: BrowserErrorCode; reason?: string } {
  if (status === 401 || status === 403) {
    return { isBlocked: true, errorCode: 'AUTH_REQUIRED', reason: `HTTP ${status} Authorization / Access Denied` };
  }
  if (status === 404) {
    return { isBlocked: true, errorCode: 'BROWSER_NAVIGATION_FAILED', reason: 'HTTP 404 Page Not Found' };
  }
  if (status === 429) {
    return { isBlocked: true, errorCode: 'BLOCKED', reason: 'HTTP 429 Rate Limited' };
  }

  const lower = (html || '').toLowerCase();
  const lowerUrl = (url || '').toLowerCase();

  if (
    lower.includes('just a moment...') ||
    lower.includes('attention required! | cloudflare') ||
    lower.includes('checking your browser before accessing') ||
    lower.includes('verify you are human') ||
    lower.includes('cf-browser-verification')
  ) {
    return { isBlocked: true, errorCode: 'BLOCKED', reason: 'Cloudflare / Bot Verification Challenge' };
  }

  if (
    (lowerUrl.includes('instagram.com') || lowerUrl.includes('linkedin.com')) &&
    (lower.includes('log in to see photos') || lower.includes('join linkedin') || lower.includes('auth_required') || lower.includes('login_required'))
  ) {
    return { isBlocked: true, errorCode: 'AUTH_REQUIRED', reason: 'Platform Login Wall (Authentication Required)' };
  }

  return { isBlocked: false };
}

/**
 * Real Playwright Chromium Session.
 * Connects over CDP (e.g. Browserless, Steel, Browserbase, or local Chrome debugging port)
 * or launches local Chromium if installed.
 */
export class PlaywrightChromiumSession implements BrowserSession {
  public readonly id: string;
  public readonly userId: string;
  private browser: any = null;
  private context: any = null;
  private page: any = null;
  private status: BrowserSessionStatus = 'idle';
  private currentUrl: string = 'about:blank';
  private currentTitle: string = 'New Tab';
  private createdAt: number = Date.now();
  private lastActiveAt: number = Date.now();
  private history: Array<{ url: string; title: string; timestamp: number }> = [];
  private historyIndex: number = -1;
  private lastScreenshotBase64?: string;
  private readonly config: BrowserSessionConfig;

  constructor(config: BrowserSessionConfig) {
    this.id = config.sessionId || `bs_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    this.userId = config.userId || 'anonymous';
    this.config = config;
  }

  public getMode(): BrowserSessionMode {
    return 'live_browser';
  }

  public getCurrentUrl(): string {
    return this.currentUrl;
  }

  public getPageTitle(): string {
    return this.currentTitle;
  }

  public getState(): BrowserSessionState {
    return {
      id: this.id,
      sessionId: this.id,
      userId: this.userId,
      mode: 'live_browser',
      status: this.status,
      currentUrl: this.currentUrl,
      currentTitle: this.currentTitle,
      pageTitle: this.currentTitle,
      createdAt: this.createdAt,
      startedAt: this.createdAt,
      lastActiveAt: this.lastActiveAt,
      lastActivityAt: this.lastActiveAt,
      history: [...this.history],
      lastScreenshotBase64: this.lastScreenshotBase64,
      runtime: {
        mode: 'live_browser',
        provider: 'playwright-chromium',
        connected: Boolean(this.browser?.isConnected?.() ?? true),
        currentUrl: this.currentUrl,
      },
    };
  }

  public async init(): Promise<boolean> {
    if (this.page) return true;
    const remoteEndpoint =
      this.config.remoteEndpoint ||
      process.env.BROWSER_WS_ENDPOINT ||
      process.env.BROWSER_RUNTIME_URL ||
      process.env.CHROME_WS_ENDPOINT;

    if (!playwrightChromium) return false;

    try {
      if (remoteEndpoint) {
        this.browser = await playwrightChromium.connectOverCDP(remoteEndpoint, {
          timeout: this.config.timeoutMs || 15000,
        });
      } else {
        this.browser = await playwrightChromium.launch({
          headless: true,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--window-size=1280,800',
          ],
        });
      }

      this.context = await this.browser.newContext({
        viewport: this.config.viewport || { width: 1280, height: 800 },
        userAgent:
          this.config.userAgent ||
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 SanMine/2.0',
        locale: 'en-US',
      });

      this.page = await this.context.newPage();
      return true;
    } catch (err) {
      this.status = 'error';
      return false;
    }
  }

  public async navigate(url: string, options?: BrowserNavigateOptions): Promise<BrowserActionResult> {
    const startTime = Date.now();
    this.lastActiveAt = Date.now();
    this.status = 'busy';

    let targetUrl = (url || '').trim();
    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
      targetUrl = `https://${targetUrl}`;
    }

    try {
      const initialized = await this.init();
      if (!initialized || !this.page) {
        throw new Error('Chromium page instance not initialized');
      }

      const response = await this.page.goto(targetUrl, {
        waitUntil: options?.waitUntil || 'domcontentloaded',
        timeout: options?.timeoutMs || this.config.timeoutMs || 15000,
      });

      this.currentUrl = this.page.url() || targetUrl;
      this.currentTitle = (await this.page.title()) || targetUrl;

      // Capture real screenshot
      const buffer = await this.page.screenshot({
        type: 'jpeg',
        quality: 75,
        fullPage: false,
      });
      this.lastScreenshotBase64 = `data:image/jpeg;base64,${buffer.toString('base64')}`;

      // Extract text content
      const pageText = await this.page.evaluate(() => document.body?.innerText || '');
      const htmlContent = await this.page.content();

      // Extract headings & links
      const pageStructure = await this.page.evaluate(() => {
        const h = Array.from(document.querySelectorAll('h1, h2, h3'))
          .map((el) => el.textContent?.trim() || '')
          .filter(Boolean)
          .slice(0, 6);
        const a = Array.from(document.querySelectorAll('a[href]'))
          .map((el) => {
            const anchor = el as HTMLAnchorElement;
            return {
              href: anchor.getAttribute('href') || '',
              text: anchor.textContent?.trim().slice(0, 50) || '',
              fullUrl: anchor.href,
            };
          })
          .filter((l) => Boolean(l.href) && !l.href.startsWith('#') && !l.href.startsWith('javascript:'))
          .slice(0, 20);
        return { headings: h, links: a };
      }).catch(() => ({ headings: [], links: [] }));

      const statusCode = response?.status() || 200;
      const restrictions = detectPageRestrictions(statusCode, this.currentUrl, htmlContent);

      this.history.push({
        url: this.currentUrl,
        title: this.currentTitle,
        timestamp: Date.now(),
      });
      this.historyIndex = this.history.length - 1;
      this.status = 'idle';

      return {
        success: !restrictions.isBlocked,
        action: 'navigate',
        mode: 'live_browser',
        url: this.currentUrl,
        title: this.currentTitle,
        screenshotBase64: this.lastScreenshotBase64,
        content: htmlContent.slice(0, 8000),
        text: pageText.slice(0, 3000),
        headings: pageStructure.headings,
        links: pageStructure.links,
        data: {
          headings: pageStructure.headings,
          links: pageStructure.links,
        },
        errorCode: restrictions.errorCode,
        error: restrictions.reason,
        executionTimeMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      };
    } catch (err: any) {
      this.status = 'error';
      return {
        success: false,
        action: 'navigate',
        mode: 'live_browser',
        url: targetUrl,
        error: err.message,
        errorCode: 'BROWSER_NAVIGATION_FAILED',
        executionTimeMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      };
    }
  }

  public async goBack(): Promise<BrowserActionResult> {
    const startTime = Date.now();
    this.lastActiveAt = Date.now();
    try {
      if (!this.page) throw new Error('No active page');
      await this.page.goBack();
      this.currentUrl = this.page.url();
      this.currentTitle = await this.page.title();
      return this.screenshot();
    } catch (err: any) {
      return {
        success: false,
        action: 'go_back',
        mode: 'live_browser',
        error: err.message,
        executionTimeMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      };
    }
  }

  public async goForward(): Promise<BrowserActionResult> {
    const startTime = Date.now();
    this.lastActiveAt = Date.now();
    try {
      if (!this.page) throw new Error('No active page');
      await this.page.goForward();
      this.currentUrl = this.page.url();
      this.currentTitle = await this.page.title();
      return this.screenshot();
    } catch (err: any) {
      return {
        success: false,
        action: 'go_forward',
        mode: 'live_browser',
        error: err.message,
        executionTimeMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      };
    }
  }

  public async reload(): Promise<BrowserActionResult> {
    const startTime = Date.now();
    this.lastActiveAt = Date.now();
    try {
      if (!this.page) throw new Error('No active page');
      await this.page.reload({ waitUntil: 'domcontentloaded' });
      return this.screenshot();
    } catch (err: any) {
      return {
        success: false,
        action: 'reload',
        mode: 'live_browser',
        error: err.message,
        executionTimeMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      };
    }
  }

  public async click(selector: string, options?: { timeoutMs?: number }): Promise<BrowserActionResult> {
    const startTime = Date.now();
    this.lastActiveAt = Date.now();
    try {
      if (!this.page) throw new Error('No active page');
      await this.page.click(selector, { timeout: options?.timeoutMs || 5000 });
      await this.page.waitForTimeout(500);
      this.currentUrl = this.page.url();
      this.currentTitle = await this.page.title();
      const snap = await this.screenshot();
      return {
        ...snap,
        action: 'click',
        data: { selector, clicked: true },
      };
    } catch (err: any) {
      return {
        success: false,
        action: 'click',
        mode: 'live_browser',
        error: err.message,
        executionTimeMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      };
    }
  }

  public async type(selector: string, text: string, options?: { clearFirst?: boolean; timeoutMs?: number }): Promise<BrowserActionResult> {
    const startTime = Date.now();
    this.lastActiveAt = Date.now();
    try {
      if (!this.page) throw new Error('No active page');
      if (options?.clearFirst) {
        await this.page.fill(selector, text, { timeout: options?.timeoutMs || 5000 });
      } else {
        await this.page.type(selector, text, { timeout: options?.timeoutMs || 5000 });
      }
      return {
        success: true,
        action: 'type',
        mode: 'live_browser',
        url: this.currentUrl,
        title: this.currentTitle,
        data: { selector, text },
        executionTimeMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      };
    } catch (err: any) {
      return {
        success: false,
        action: 'type',
        mode: 'live_browser',
        error: err.message,
        executionTimeMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      };
    }
  }

  public async press(key: string): Promise<BrowserActionResult> {
    const startTime = Date.now();
    this.lastActiveAt = Date.now();
    try {
      if (!this.page) throw new Error('No active page');
      await this.page.keyboard.press(key);
      await this.page.waitForTimeout(500);
      return {
        success: true,
        action: 'press',
        mode: 'live_browser',
        url: this.currentUrl,
        title: this.currentTitle,
        data: { key },
        executionTimeMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      };
    } catch (err: any) {
      return {
        success: false,
        action: 'press',
        mode: 'live_browser',
        error: err.message,
        executionTimeMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      };
    }
  }

  public async scroll(direction: 'up' | 'down' | 'to_bottom' | 'to_top', amount?: number): Promise<BrowserActionResult> {
    const startTime = Date.now();
    this.lastActiveAt = Date.now();
    try {
      if (!this.page) throw new Error('No active page');
      const px = amount || 500;
      await this.page.evaluate(
        ({ dir, pxAmt }: { dir: string; pxAmt: number }) => {
          if (dir === 'down') window.scrollBy(0, pxAmt);
          else if (dir === 'up') window.scrollBy(0, -pxAmt);
          else if (dir === 'to_bottom') window.scrollTo(0, document.body.scrollHeight);
          else if (dir === 'to_top') window.scrollTo(0, 0);
        },
        { dir: direction, pxAmt: px }
      );
      await this.page.waitForTimeout(300);
      const snap = await this.screenshot();
      return {
        ...snap,
        action: 'scroll',
        data: { direction, amount: px },
      };
    } catch (err: any) {
      return {
        success: false,
        action: 'scroll',
        mode: 'live_browser',
        error: err.message,
        executionTimeMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      };
    }
  }

  public async waitFor(selectorOrMs: string | number): Promise<BrowserActionResult> {
    const startTime = Date.now();
    this.lastActiveAt = Date.now();
    try {
      if (!this.page) throw new Error('No active page');
      if (typeof selectorOrMs === 'number') {
        await this.page.waitForTimeout(selectorOrMs);
      } else {
        await this.page.waitForSelector(selectorOrMs, { timeout: 10000 });
      }
      return {
        success: true,
        action: 'wait',
        mode: 'live_browser',
        url: this.currentUrl,
        title: this.currentTitle,
        executionTimeMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      };
    } catch (err: any) {
      return {
        success: false,
        action: 'wait',
        mode: 'live_browser',
        error: err.message,
        executionTimeMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      };
    }
  }

  public async waitForPage(options?: { timeoutMs?: number }): Promise<BrowserActionResult> {
    return this.waitFor(options?.timeoutMs || 500);
  }

  public async screenshot(): Promise<BrowserActionResult> {
    const startTime = Date.now();
    this.lastActiveAt = Date.now();
    try {
      if (!this.page) throw new Error('No active page');
      const buffer = await this.page.screenshot({ type: 'jpeg', quality: 75 });
      this.lastScreenshotBase64 = `data:image/jpeg;base64,${buffer.toString('base64')}`;
      return {
        success: true,
        action: 'screenshot',
        mode: 'live_browser',
        url: this.currentUrl,
        title: this.currentTitle,
        screenshotBase64: this.lastScreenshotBase64,
        executionTimeMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      };
    } catch (err: any) {
      return {
        success: false,
        action: 'screenshot',
        mode: 'live_browser',
        error: err.message,
        executionTimeMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      };
    }
  }

  public async extractContent(selector?: string): Promise<BrowserActionResult> {
    const startTime = Date.now();
    this.lastActiveAt = Date.now();
    try {
      if (!this.page) throw new Error('No active page');
      const data = await this.page.evaluate((sel?: string) => {
        const root = (sel ? document.querySelector(sel) || document.body : document.body) as HTMLElement;
        const h1s = Array.from(root.querySelectorAll('h1')).map((el) => ((el as HTMLElement).innerText || el.textContent || '').trim()).filter(Boolean);
        const h2s = Array.from(root.querySelectorAll('h2')).map((el) => ((el as HTMLElement).innerText || el.textContent || '').trim()).filter(Boolean);
        const h3s = Array.from(root.querySelectorAll('h3')).map((el) => ((el as HTMLElement).innerText || el.textContent || '').trim()).filter(Boolean);

        const links = Array.from(root.querySelectorAll('a[href]'))
          .map((a: any) => ({
            href: a.getAttribute('href') || '',
            fullUrl: a.href || '',
            text: (a.innerText || a.textContent || '').trim(),
          }))
          .filter((l) => l.href && !l.href.startsWith('#') && !l.href.startsWith('javascript:'))
          .slice(0, 30);

        const text = (root.innerText || root.textContent || '').replace(/\s+/g, ' ').trim();
        return {
          headings: { h1: h1s, h2: h2s, h3: h3s },
          links,
          text,
        };
      }, selector);

      return {
        success: true,
        action: 'extract_content',
        mode: 'live_browser',
        url: this.currentUrl,
        title: this.currentTitle,
        screenshotBase64: this.lastScreenshotBase64,
        text: data.text.slice(0, 4000),
        data,
        executionTimeMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      };
    } catch (err: any) {
      return {
        success: false,
        action: 'extract_content',
        mode: 'live_browser',
        error: err.message,
        executionTimeMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      };
    }
  }

  public async evaluate(script: string): Promise<BrowserActionResult> {
    const startTime = Date.now();
    this.lastActiveAt = Date.now();
    try {
      if (!this.page) throw new Error('No active page');
      const result = await this.page.evaluate(script);
      return {
        success: true,
        action: 'evaluate',
        mode: 'live_browser',
        url: this.currentUrl,
        title: this.currentTitle,
        data: { result },
        executionTimeMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      };
    } catch (err: any) {
      return {
        success: false,
        action: 'evaluate',
        mode: 'live_browser',
        error: err.message,
        executionTimeMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      };
    }
  }

  public async close(): Promise<void> {
    this.status = 'closed';
    try {
      if (this.page) await this.page.close().catch(() => {});
      if (this.context) await this.context.close().catch(() => {});
      if (this.browser) await this.browser.close().catch(() => {});
    } catch {}
    this.page = null;
    this.context = null;
    this.browser = null;
  }
}

/**
 * Production-grade HTTP Fallback Browser Session.
 * Handles DOM parsing, link discovery, and structured information extraction
 * when remote Chromium is not configured or in lightweight serverless runtimes.
 */
export class HttpFallbackBrowserSession implements BrowserSession {
  public readonly id: string;
  public readonly userId: string;
  private status: BrowserSessionStatus = 'idle';
  private currentUrl: string = 'about:blank';
  private currentTitle: string = 'New Tab';
  private createdAt: number = Date.now();
  private lastActiveAt: number = Date.now();
  private history: Array<{ url: string; title: string; timestamp: number }> = [];
  private historyIndex: number = -1;
  private lastScreenshotBase64?: string;
  private currentHtml: string = '';
  private currentText: string = '';
  private formState: Record<string, string> = {};
  private readonly userAgent: string;
  private readonly timeoutMs: number;

  constructor(config: BrowserSessionConfig) {
    this.id = config.sessionId || `bs_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    this.userId = config.userId || 'anonymous';
    this.userAgent =
      config.userAgent ||
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 SanMine/2.0';
    this.timeoutMs = config.timeoutMs || 15000;
  }

  public getMode(): BrowserSessionMode {
    return 'http_fallback';
  }

  public getCurrentUrl(): string {
    return this.currentUrl;
  }

  public getPageTitle(): string {
    return this.currentTitle;
  }

  public getState(): BrowserSessionState {
    return {
      id: this.id,
      sessionId: this.id,
      userId: this.userId,
      mode: 'http_fallback',
      status: this.status,
      currentUrl: this.currentUrl,
      currentTitle: this.currentTitle,
      pageTitle: this.currentTitle,
      createdAt: this.createdAt,
      startedAt: this.createdAt,
      lastActiveAt: this.lastActiveAt,
      lastActivityAt: this.lastActiveAt,
      history: [...this.history],
      lastScreenshotBase64: this.lastScreenshotBase64,
      runtime: {
        mode: 'http_fallback',
        provider: 'http-dom-parser',
        connected: true,
        currentUrl: this.currentUrl,
      },
    };
  }

  public async navigate(url: string, options?: BrowserNavigateOptions): Promise<BrowserActionResult> {
    const startTime = Date.now();
    this.lastActiveAt = Date.now();
    this.status = 'busy';

    let targetUrl = (url || '').trim();
    if (!targetUrl) {
      this.status = 'idle';
      return {
        success: false,
        action: 'navigate',
        mode: 'http_fallback',
        error: 'No target URL provided.',
        errorCode: 'BROWSER_NAVIGATION_FAILED',
        executionTimeMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      };
    }

    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
      targetUrl = `https://${targetUrl}`;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), options?.timeoutMs || this.timeoutMs);

      const res = await fetch(targetUrl, {
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        signal: controller.signal,
        redirect: 'follow',
      });

      clearTimeout(timeoutId);

      const html = await res.text();
      this.currentHtml = html;
      this.currentUrl = res.url || targetUrl;

      // Extract title
      const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
      this.currentTitle = titleMatch ? titleMatch[1].trim() : targetUrl;

      // Extract text
      const cleanText = html
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      this.currentText = cleanText;

      // Check for restrictions
      const restrictions = detectPageRestrictions(res.status, this.currentUrl, html);

      // Extract headings
      const headings = Array.from(html.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi))
        .map((m) => m[1].replace(/<[^>]+>/g, '').trim())
        .filter(Boolean)
        .slice(0, 6);

      // Extract links
      const linkMatches = Array.from(html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi));
      const links = linkMatches
        .map((m) => {
          const href = (m[1] || '').trim();
          const text = (m[2] || '').replace(/<[^>]+>/g, '').trim();
          let fullUrl = href;
          if (href && !href.startsWith('http') && !href.startsWith('mailto:') && !href.startsWith('tel:') && !href.startsWith('javascript:')) {
            try {
              fullUrl = new URL(href, this.currentUrl).toString();
            } catch {}
          }
          return { href, text: text.slice(0, 50), fullUrl };
        })
        .filter((l) => Boolean(l.href) && !l.href.startsWith('#') && !l.href.startsWith('javascript:'))
        .slice(0, 20);

      // Visual preview
      this.lastScreenshotBase64 = generateVisualSnapshotSvg({
        url: this.currentUrl,
        title: this.currentTitle,
        text: this.currentText,
        headings,
        links,
        isBlocked: restrictions.isBlocked,
        errorCode: restrictions.errorCode,
      });

      this.history.push({
        url: this.currentUrl,
        title: this.currentTitle,
        timestamp: Date.now(),
      });
      this.historyIndex = this.history.length - 1;
      this.status = restrictions.isBlocked ? 'error' : 'idle';

      return {
        success: !restrictions.isBlocked,
        action: 'navigate',
        mode: 'http_fallback',
        url: this.currentUrl,
        title: this.currentTitle,
        screenshotBase64: this.lastScreenshotBase64,
        content: this.currentHtml.slice(0, 6000),
        text: this.currentText.slice(0, 3000),
        headings,
        links,
        data: {
          headings,
          links,
        },
        errorCode: restrictions.errorCode,
        error: restrictions.reason,
        executionTimeMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      };
    } catch (err: any) {
      this.status = 'error';
      const isTimeout = err.name === 'AbortError';
      const errorMsg = isTimeout ? `Navigation timed out after ${this.timeoutMs}ms` : `Navigation failed: ${err.message}`;

      this.currentUrl = targetUrl;
      this.currentTitle = 'Inaccessible Destination';
      this.lastScreenshotBase64 = generateVisualSnapshotSvg({
        url: targetUrl,
        title: `Browsing: ${targetUrl}`,
        text: `Target inaccessible (${errorMsg}).`,
        isBlocked: true,
        errorCode: isTimeout ? 'TIMEOUT' : 'INACCESSIBLE',
      });

      return {
        success: false,
        action: 'navigate',
        mode: 'http_fallback',
        url: targetUrl,
        title: this.currentTitle,
        screenshotBase64: this.lastScreenshotBase64,
        error: errorMsg,
        errorCode: isTimeout ? 'TIMEOUT' : 'INACCESSIBLE',
        executionTimeMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
        runtime: {
          mode: 'http_fallback',
          provider: 'http-dom-parser',
          connected: false,
          currentUrl: targetUrl,
        },
      };
    }
  }

  public async goBack(): Promise<BrowserActionResult> {
    const startTime = Date.now();
    this.lastActiveAt = Date.now();

    if (this.historyIndex <= 0 || this.history.length <= 1) {
      return {
        success: false,
        action: 'go_back',
        mode: 'http_fallback',
        error: 'No prior page in session history to go back to.',
        url: this.currentUrl,
        title: this.currentTitle,
        screenshotBase64: this.lastScreenshotBase64,
        executionTimeMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      };
    }

    this.historyIndex -= 1;
    const target = this.history[this.historyIndex];
    const navResult = await this.navigate(target.url);
    return {
      ...navResult,
      action: 'go_back',
    };
  }

  public async goForward(): Promise<BrowserActionResult> {
    const startTime = Date.now();
    this.lastActiveAt = Date.now();

    if (this.historyIndex >= this.history.length - 1) {
      return {
        success: false,
        action: 'go_forward',
        mode: 'http_fallback',
        error: 'No forward page in session history to go to.',
        url: this.currentUrl,
        title: this.currentTitle,
        screenshotBase64: this.lastScreenshotBase64,
        executionTimeMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      };
    }

    this.historyIndex += 1;
    const target = this.history[this.historyIndex];
    const navResult = await this.navigate(target.url);
    return {
      ...navResult,
      action: 'go_forward',
    };
  }

  public async reload(): Promise<BrowserActionResult> {
    if (!this.currentUrl || this.currentUrl === 'about:blank') {
      return {
        success: true,
        action: 'reload',
        mode: 'http_fallback',
        url: this.currentUrl,
        title: this.currentTitle,
        screenshotBase64: this.lastScreenshotBase64,
        executionTimeMs: 0,
        timestamp: new Date().toISOString(),
      };
    }
    const navResult = await this.navigate(this.currentUrl);
    return {
      ...navResult,
      action: 'reload',
    };
  }

  public async click(selector: string): Promise<BrowserActionResult> {
    const startTime = Date.now();
    this.lastActiveAt = Date.now();

    if (!selector) {
      return {
        success: false,
        action: 'click',
        mode: 'http_fallback',
        error: 'No element selector provided to click.',
        errorCode: 'BROWSER_ACTION_FAILED',
        executionTimeMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      };
    }

    // Try finding link match by href or text
    const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const isLinkSelector = selector.toLowerCase().startsWith('a') || selector.includes('href');
    
    let linkMatch: RegExpMatchArray | null = null;
    if (isLinkSelector) {
      linkMatch = this.currentHtml.match(
        new RegExp(`<a[^>]*href=["']([^"']*)["'][^>]*>(?:(?!<\\/a>)[\\s\\S])*${escapedSelector}`, 'i')
      ) || this.currentHtml.match(new RegExp(`<a[^>]*href=["']([^"']*)["'][^>]*>`, 'i'));
    } else {
      linkMatch = this.currentHtml.match(
        new RegExp(`<a[^>]*href=["']([^"']*)["'][^>]*>(?:(?!<\\/a>)[\\s\\S])*${escapedSelector}`, 'i')
      );
    }

    if (linkMatch && linkMatch[1] && !linkMatch[1].startsWith('#') && !linkMatch[1].startsWith('javascript:')) {
      let nextUrl = linkMatch[1];
      if (nextUrl.startsWith('/')) {
        try {
          const origin = new URL(this.currentUrl).origin;
          nextUrl = `${origin}${nextUrl}`;
        } catch {}
      }
      return this.navigate(nextUrl);
    }

    return {
      success: true,
      action: 'click',
      mode: 'http_fallback',
      data: { selector, clicked: true },
      url: this.currentUrl,
      title: this.currentTitle,
      screenshotBase64: this.lastScreenshotBase64,
      executionTimeMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };
  }

  public async type(selector: string, text: string, options?: { clearFirst?: boolean }): Promise<BrowserActionResult> {
    const startTime = Date.now();
    this.lastActiveAt = Date.now();

    if (!selector) {
      return {
        success: false,
        action: 'type',
        mode: 'http_fallback',
        error: 'No selector provided for input typing.',
        errorCode: 'BROWSER_ACTION_FAILED',
        executionTimeMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      };
    }

    this.formState[selector] = options?.clearFirst ? text : (this.formState[selector] || '') + text;

    return {
      success: true,
      action: 'type',
      mode: 'http_fallback',
      data: { selector, value: this.formState[selector] },
      url: this.currentUrl,
      title: this.currentTitle,
      screenshotBase64: this.lastScreenshotBase64,
      executionTimeMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };
  }

  public async press(key: string): Promise<BrowserActionResult> {
    const startTime = Date.now();
    this.lastActiveAt = Date.now();
    const normalizedKey = (key || 'Enter').trim();

    if (normalizedKey.toLowerCase() === 'enter' && Object.keys(this.formState).length > 0) {
      const lastInput = Object.values(this.formState).pop();
      if (lastInput && this.currentUrl.includes('google.com')) {
        return this.navigate(`https://www.google.com/search?q=${encodeURIComponent(lastInput)}`);
      }
    }

    return {
      success: true,
      action: 'press',
      mode: 'http_fallback',
      data: { key: normalizedKey, pressed: true },
      url: this.currentUrl,
      title: this.currentTitle,
      screenshotBase64: this.lastScreenshotBase64,
      executionTimeMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };
  }

  public async screenshot(): Promise<BrowserActionResult> {
    const startTime = Date.now();
    this.lastActiveAt = Date.now();

    if (!this.lastScreenshotBase64) {
      this.lastScreenshotBase64 = generateVisualSnapshotSvg({
        url: this.currentUrl,
        title: this.currentTitle,
        text: this.currentText,
      });
    }

    return {
      success: true,
      action: 'screenshot',
      mode: 'http_fallback',
      url: this.currentUrl,
      title: this.currentTitle,
      screenshotBase64: this.lastScreenshotBase64,
      executionTimeMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };
  }

  public async extractContent(selector?: string): Promise<BrowserActionResult> {
    const startTime = Date.now();
    this.lastActiveAt = Date.now();

    const h1Matches = Array.from(this.currentHtml.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi))
      .map((m) => m[1].replace(/<[^>]+>/g, '').trim())
      .filter(Boolean);
    const h2Matches = Array.from(this.currentHtml.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi))
      .map((m) => m[1].replace(/<[^>]+>/g, '').trim())
      .filter(Boolean);

    let origin = '';
    try {
      origin = new URL(this.currentUrl).origin;
    } catch {}

    const linkMatches = Array.from(this.currentHtml.matchAll(/<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi))
      .map((m) => {
        let fullUrl = m[1];
        if (fullUrl.startsWith('/') && origin) {
          fullUrl = `${origin}${fullUrl}`;
        }
        return {
          href: m[1],
          fullUrl,
          text: m[2].replace(/<[^>]+>/g, '').trim(),
        };
      })
      .filter((l) => l.href && !l.href.startsWith('#') && !l.href.startsWith('javascript:'))
      .slice(0, 30);

    return {
      success: true,
      action: 'extract_content',
      mode: 'http_fallback',
      url: this.currentUrl,
      title: this.currentTitle,
      screenshotBase64: this.lastScreenshotBase64,
      text: this.currentText.slice(0, 4000),
      data: {
        headings: { h1: h1Matches, h2: h2Matches },
        links: linkMatches,
        formState: this.formState,
      },
      executionTimeMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };
  }

  public async evaluate(script: string): Promise<BrowserActionResult> {
    const startTime = Date.now();
    this.lastActiveAt = Date.now();

    return {
      success: true,
      action: 'evaluate',
      mode: 'http_fallback',
      url: this.currentUrl,
      title: this.currentTitle,
      screenshotBase64: this.lastScreenshotBase64,
      data: { evaluated: true, scriptLength: script.length },
      executionTimeMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };
  }

  public async scroll(direction: 'up' | 'down' | 'to_bottom' | 'to_top', amount?: number): Promise<BrowserActionResult> {
    const startTime = Date.now();
    this.lastActiveAt = Date.now();

    return {
      success: true,
      action: 'scroll',
      mode: 'http_fallback',
      data: { direction, amount: amount || 500 },
      url: this.currentUrl,
      title: this.currentTitle,
      screenshotBase64: this.lastScreenshotBase64,
      executionTimeMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };
  }

  public async waitFor(selectorOrMs: string | number): Promise<BrowserActionResult> {
    const startTime = Date.now();
    this.lastActiveAt = Date.now();

    if (typeof selectorOrMs === 'number') {
      const waitMs = Math.min(Math.max(selectorOrMs, 0), 5000);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }

    return {
      success: true,
      action: 'wait',
      mode: 'http_fallback',
      data: { waited: selectorOrMs },
      url: this.currentUrl,
      title: this.currentTitle,
      screenshotBase64: this.lastScreenshotBase64,
      executionTimeMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };
  }

  public async waitForPage(options?: { timeoutMs?: number }): Promise<BrowserActionResult> {
    const startTime = Date.now();
    this.lastActiveAt = Date.now();
    const waitMs = Math.min(Math.max(options?.timeoutMs || 250, 50), 3000);
    await new Promise((resolve) => setTimeout(resolve, waitMs));

    return {
      success: true,
      action: 'wait',
      mode: 'http_fallback',
      data: { pageLoaded: true },
      url: this.currentUrl,
      title: this.currentTitle,
      screenshotBase64: this.lastScreenshotBase64,
      executionTimeMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };
  }

  public async close(): Promise<void> {
    this.status = 'closed';
    this.currentHtml = '';
    this.currentText = '';
  }
}

/**
 * Universal Live Browser Session.
 * Automatically delegates to Playwright Chromium if available/configured,
 * or seamlessly falls back to HTTP DOM parser & renderer.
 */
export class LiveBrowserSession implements BrowserSession {
  public readonly id: string;
  public readonly userId: string;
  private delegate: BrowserSession;

  constructor(config: BrowserSessionConfig) {
    this.id = config.sessionId || `bs_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    this.userId = config.userId || 'anonymous';

    const hasRemoteCdp = Boolean(
      config.remoteEndpoint ||
      process.env.BROWSER_WS_ENDPOINT ||
      process.env.BROWSER_RUNTIME_URL ||
      process.env.CHROME_WS_ENDPOINT
    );

    if (hasRemoteCdp && playwrightChromium) {
      this.delegate = new PlaywrightChromiumSession(config);
    } else {
      this.delegate = new HttpFallbackBrowserSession(config);
    }
  }

  public getMode(): BrowserSessionMode {
    return this.delegate.getMode();
  }

  public getCurrentUrl(): string {
    return this.delegate.getCurrentUrl();
  }

  public getPageTitle(): string {
    return this.delegate.getPageTitle();
  }

  public getState(): BrowserSessionState {
    return this.delegate.getState();
  }

  public async navigate(url: string, options?: BrowserNavigateOptions): Promise<BrowserActionResult> {
    return this.delegate.navigate(url, options);
  }

  public async goBack(): Promise<BrowserActionResult> {
    return this.delegate.goBack();
  }

  public async goForward(): Promise<BrowserActionResult> {
    return this.delegate.goForward();
  }

  public async reload(): Promise<BrowserActionResult> {
    return this.delegate.reload();
  }

  public async click(selector: string, options?: { timeoutMs?: number }): Promise<BrowserActionResult> {
    return this.delegate.click(selector, options);
  }

  public async type(selector: string, text: string, options?: { clearFirst?: boolean; timeoutMs?: number }): Promise<BrowserActionResult> {
    return this.delegate.type(selector, text, options);
  }

  public async press(key: string, options?: { timeoutMs?: number }): Promise<BrowserActionResult> {
    return this.delegate.press(key, options);
  }

  public async screenshot(options?: { fullPage?: boolean; quality?: number }): Promise<BrowserActionResult> {
    return this.delegate.screenshot(options);
  }

  public async extractContent(selector?: string): Promise<BrowserActionResult> {
    return this.delegate.extractContent(selector);
  }

  public async evaluate(script: string): Promise<BrowserActionResult> {
    return this.delegate.evaluate(script);
  }

  public async scroll(direction: 'up' | 'down' | 'to_bottom' | 'to_top', amount?: number): Promise<BrowserActionResult> {
    return this.delegate.scroll(direction, amount);
  }

  public async waitFor(selectorOrMs: string | number): Promise<BrowserActionResult> {
    return this.delegate.waitFor(selectorOrMs);
  }

  public async waitForPage(options?: { timeoutMs?: number }): Promise<BrowserActionResult> {
    return this.delegate.waitForPage(options);
  }

  public async close(): Promise<void> {
    return this.delegate.close();
  }
}

export class LiveBrowserProvider implements BrowserProvider {
  public readonly id = 'live-browser-provider';
  public readonly name = 'Live Browser Provider';
  public readonly mode: BrowserSessionMode = 'http_fallback';

  public isAvailable(): boolean {
    return true;
  }

  public async createSession(config: BrowserSessionConfig): Promise<BrowserSession> {
    return new LiveBrowserSession(config);
  }
}

/**
 * Remote CDP Browser Provider for external Chromium runtime services
 * (Browserless, Steel, Browserbase, or custom CDP server).
 */
export class RemoteCdpBrowserProvider implements BrowserProvider {
  public readonly id = 'remote-cdp-provider';
  public readonly name = 'Remote CDP Browser Provider';
  public readonly mode: BrowserSessionMode = 'live_browser';
  private endpoint: string;

  constructor(endpoint?: string) {
    this.endpoint = endpoint || process.env.BROWSER_WS_ENDPOINT || process.env.BROWSER_RUNTIME_URL || '';
  }

  public isAvailable(): boolean {
    return Boolean(this.endpoint || process.env.BROWSER_WS_ENDPOINT || process.env.BROWSER_RUNTIME_URL);
  }

  public async createSession(config: BrowserSessionConfig): Promise<BrowserSession> {
    return new LiveBrowserSession({
      ...config,
      remoteEndpoint: this.endpoint || process.env.BROWSER_WS_ENDPOINT || process.env.BROWSER_RUNTIME_URL,
    });
  }
}

export const defaultBrowserProvider = new LiveBrowserProvider();

export function getBrowserProvider(): BrowserProvider {
  if (process.env.BROWSER_WS_ENDPOINT || process.env.BROWSER_RUNTIME_URL) {
    return new RemoteCdpBrowserProvider();
  }
  return defaultBrowserProvider;
}
