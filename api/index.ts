import type { IncomingMessage, ServerResponse } from 'http';

// Public Model Catalog for zero-dependency fast response on Vercel cold starts
const PUBLIC_MODELS: Record<string, any[]> = {
  google: [
    {
      id: 'gemini-2.5-flash',
      provider: 'google',
      name: 'Gemini 2.5 Flash',
      description: 'Fast, high-performance model for multimodal and text tasks',
      capabilities: { streaming: true, toolCalling: true, vision: true },
    },
    {
      id: 'gemini-2.5-pro',
      provider: 'google',
      name: 'Gemini 2.5 Pro',
      description: 'Advanced reasoning and complex workflow reasoning model',
      capabilities: { streaming: true, toolCalling: true, vision: true },
    },
    {
      id: 'gemini-3.7-flash',
      provider: 'google',
      name: 'Gemini 3.7 Flash',
      description: 'Next-generation frontier multimodal model with hybrid reasoning',
      capabilities: { streaming: true, toolCalling: true, vision: true },
    },
    {
      id: 'gemini-3.1-pro-preview',
      provider: 'google',
      name: 'Gemini 3.1 Pro Preview',
      description: 'Frontier reasoning model for advanced coding and math',
      capabilities: { streaming: true, toolCalling: true, vision: true },
    },
    {
      id: 'gemini-flash-latest',
      provider: 'google',
      name: 'Gemini Flash Latest',
      description: 'Always points to the latest Gemini Flash release',
      capabilities: { streaming: true, toolCalling: true, vision: true },
    },
  ],
  openai: [
    {
      id: 'gpt-4o',
      provider: 'openai',
      name: 'GPT-4o',
      description: 'High-intelligence flagship model for complex tasks',
      capabilities: { streaming: true, toolCalling: true, vision: true },
    },
    {
      id: 'gpt-4o-mini',
      provider: 'openai',
      name: 'GPT-4o mini',
      description: 'Fast, lightweight, cost-efficient model',
      capabilities: { streaming: true, toolCalling: true, vision: true },
    },
    {
      id: 'o3-mini',
      provider: 'openai',
      name: 'o3-mini',
      description: 'Advanced reasoning and STEM problem solver',
      capabilities: { streaming: true, toolCalling: true, vision: false },
    },
    {
      id: 'o1',
      provider: 'openai',
      name: 'o1',
      description: 'Full reasoning model for deep analytical tasks',
      capabilities: { streaming: true, toolCalling: true, vision: true },
    },
    {
      id: 'gpt-4-turbo',
      provider: 'openai',
      name: 'GPT-4 Turbo',
      description: 'High-capability GPT-4 Turbo model',
      capabilities: { streaming: true, toolCalling: true, vision: true },
    },
  ],
  openrouter: [
    {
      id: 'openrouter/free',
      provider: 'openrouter',
      name: 'OpenRouter Free Models (Auto)',
      isFree: true,
    },
    {
      id: 'openai/gpt-oss-20b:free',
      provider: 'openrouter',
      name: 'GPT-OSS 20B (Free)',
      isFree: true,
    },
    {
      id: 'meta-llama/llama-3.3-70b-instruct:free',
      provider: 'openrouter',
      name: 'Llama 3.3 70B Instruct (Free)',
      isFree: true,
    },
    {
      id: 'google/gemini-2.0-flash-exp:free',
      provider: 'openrouter',
      name: 'Gemini 2.0 Flash Exp (Free)',
      isFree: true,
    },
    {
      id: 'deepseek/deepseek-r1:free',
      provider: 'openrouter',
      name: 'DeepSeek R1 (Free)',
      isFree: true,
    },
    {
      id: 'qwen/qwen-2.5-72b-instruct:free',
      provider: 'openrouter',
      name: 'Qwen 2.5 72B Instruct (Free)',
      isFree: true,
    },
    {
      id: 'anthropic/claude-3.7-sonnet',
      provider: 'openrouter',
      name: 'Claude 3.7 Sonnet',
      isFree: false,
    },
    {
      id: 'openai/gpt-4o',
      provider: 'openrouter',
      name: 'GPT-4o',
      isFree: false,
    },
  ],
};

function sendJson(res: ServerResponse, statusCode: number, data: any) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.end(JSON.stringify(data));
}

/**
 * Extracts and normalizes the original URL and pathname from request and Vercel proxy headers.
 */
export function getOriginalRequestInfo(req: IncomingMessage): {
  pathname: string;
  fullUrl: string;
  searchParams: URLSearchParams;
} {
  const host = req.headers.host || 'localhost';
  const proto = (req.headers['x-forwarded-proto'] as string) || 'http';

  // 1. Check x-forwarded-uri header
  const forwardedUri = req.headers['x-forwarded-uri'] as string;
  if (forwardedUri && forwardedUri.startsWith('/') && !forwardedUri.startsWith('/api/index')) {
    try {
      const parsed = new URL(forwardedUri, `${proto}://${host}`);
      return { pathname: parsed.pathname, fullUrl: forwardedUri, searchParams: parsed.searchParams };
    } catch {
      // ignore parse error and proceed
    }
  }

  // 2. Check x-vercel-matched-path or x-matched-path
  const matchedPath = (req.headers['x-vercel-matched-path'] || req.headers['x-matched-path']) as string;
  if (matchedPath && matchedPath.startsWith('/') && !matchedPath.startsWith('/api/index')) {
    try {
      const parsed = new URL(matchedPath, `${proto}://${host}`);
      return { pathname: parsed.pathname, fullUrl: matchedPath, searchParams: parsed.searchParams };
    } catch {
      // ignore parse error and proceed
    }
  }

  // 3. Fallback to req.url
  const rawUrl = req.url || '/';
  try {
    const parsed = new URL(rawUrl, `${proto}://${host}`);
    return { pathname: parsed.pathname, fullUrl: rawUrl, searchParams: parsed.searchParams };
  } catch {
    return { pathname: rawUrl, fullUrl: rawUrl, searchParams: new URLSearchParams() };
  }
}

// Lazy Express App Instance Cache (only instantiated on-demand for heavy routes)
let cachedExpressApp: any = null;
let expressInitPromise: Promise<any> | null = null;

async function getLazyExpressApp() {
  if (cachedExpressApp) return cachedExpressApp;
  if (!expressInitPromise) {
    expressInitPromise = (async () => {
      const { createExpressApp } = await import('../server/app.js');
      const app = createExpressApp();
      cachedExpressApp = app;
      return app;
    })();
  }
  return expressInitPromise;
}

/**
 * Lightweight Serverless Dispatcher for Vercel Hobby Plan (Entrypoint: api/index.ts).
 * 
 * - Serves lightweight public endpoints (/api/health, /api/diagnostic, /api/ai/models, /api/search/providers)
 *   instantly with ZERO heavy imports or database overhead during cold starts.
 * - Lazily loads the full Express application ONLY when complex routes (/api/chats, /api/settings, /api/ai/chat) are requested.
 */
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const { pathname, fullUrl, searchParams } = getOriginalRequestInfo(req);
    const method = (req.method || 'GET').toUpperCase();

    // 1. Lightweight Health Check
    if (method === 'GET' && (pathname === '/api/health' || pathname === '/health')) {
      return sendJson(res, 200, {
        ok: true,
        service: 'SanMine Space',
        status: 'healthy',
        runtime: 'vercel',
        timestamp: new Date().toISOString(),
      });
    }

    // 2. Lightweight Server Diagnostics (No DB/Firebase/AI initializations)
    if (method === 'GET' && (pathname === '/api/diagnostic' || pathname === '/diagnostic')) {
      return sendJson(res, 200, {
        ok: true,
        runtime: 'vercel',
        nodeVersion: process.version,
        timestamp: new Date().toISOString(),
        env: {
          hasDatabaseUrl: !!(process.env.DATABASE_URL || process.env.NEON_DATABASE_URL),
          hasGoogleClientId: !!process.env.GOOGLE_CLIENT_ID,
          hasGoogleClientSecret: !!process.env.GOOGLE_CLIENT_SECRET,
          hasGoogleRedirectUri: !!process.env.GOOGLE_REDIRECT_URI,
          hasGeminiKey: !!process.env.GEMINI_API_KEY,
          hasOpenAiKey: !!process.env.OPENAI_API_KEY,
          hasOpenRouterKey: !!process.env.OPENROUTER_API_KEY,
          hasEncryptionKey: !!process.env.CREDENTIAL_ENCRYPTION_KEY,
          hasFirebaseAdminKey: !!process.env.FIREBASE_SERVICE_ACCOUNT_KEY,
          // Web search provider availability — booleans ONLY. Key values are
          // never logged, returned, or sent to the frontend.
          hasTavilyKey: !!(process.env.TAVILY_API_KEY || process.env.TAVILY_KEY),
          hasSerperKey: !!(process.env.SERPER_API_KEY || process.env.SERPER_KEY),
          appUrl: process.env.APP_URL || 'https://sanmine.space',
        },
        diagnostics: {
          databaseConfigured: !!(process.env.DATABASE_URL || process.env.NEON_DATABASE_URL),
          firebaseConfigured: !!(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || process.env.FIREBASE_CONFIG),
          gmailConfigured: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
          geminiConfigured: !!process.env.GEMINI_API_KEY,
          webSearchConfigured: !!(process.env.TAVILY_API_KEY || process.env.TAVILY_KEY || process.env.SERPER_API_KEY || process.env.SERPER_KEY),
        },
      });
    }

    // 3. Lightweight AI Models Catalog (Public Metadata, Zero Leaks, Zero Cold-Start Failures)
    if (method === 'GET' && (pathname === '/api/ai/models' || pathname === '/ai/models')) {
      const rawProvider = searchParams.get('provider')?.toLowerCase().trim();
      const providerParam = rawProvider === 'gemini' ? 'google' : rawProvider;

      if (providerParam) {
        const models = PUBLIC_MODELS[providerParam];
        if (!models) {
          return sendJson(res, 404, {
            models: [],
            error: `Provider "${providerParam}" not found.`,
          });
        }
        return sendJson(res, 200, { models, success: true });
      }

      const allModels = [
        ...PUBLIC_MODELS.google,
        ...PUBLIC_MODELS.openai,
        ...PUBLIC_MODELS.openrouter,
      ];
      return sendJson(res, 200, { models: allModels, errors: {} });
    }

    // 4. Lightweight Search Providers Status (Public Metadata)
    //    The built-in "API-Free Web Research Engine" is an internal fallback
    //    and is intentionally hidden from the end-user UI.
    if (method === 'GET' && (pathname === '/api/search/providers' || pathname === '/search/providers')) {
      return sendJson(res, 200, {
        managedBySanmine: true,
        isConfigured: true,
        providers: [],
        activeProviderId: 'none',
      });
    }

    // 5. Lightweight Search Status Endpoint
    if (method === 'GET' && (pathname === '/api/search/status' || pathname === '/search/status')) {
      return sendJson(res, 200, {
        managedBySanmine: true,
        isConfigured: true,
        activeProviderId: 'web_research',
      });
    }

    // 6. For all other routes: Lazily import Express app and delegate request
    if (req.url !== fullUrl) {
      req.url = fullUrl;
    }

    const expressApp = await getLazyExpressApp();
    return expressApp(req, res);
  } catch (fatalError: any) {
    console.error('[API Serverless Dispatcher Fatal Error]:', fatalError);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          ok: false,
          code: 'SERVERLESS_DISPATCHER_ERROR',
          error: fatalError?.message || 'Internal server error while dispatching request',
        })
      );
    }
  }
}
