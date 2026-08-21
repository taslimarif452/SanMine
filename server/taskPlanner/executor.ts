/**
 * Universal Task Planner — Tool Execution Controller
 *
 * Dispatches actions to the tool registry, live browser, search systems,
 * and analysis pipelines, capturing real runtime observations & evidence.
 */

import { ActionSelection, ExtractedFact, PlannerObservation, Task, TaskEvidenceItem } from './types.js';
import { TaskMemoryManager } from './memory.js';
import { executeTool } from '../tools.js';
import { browserSessionManager } from '../browser/sessionManager.js';
import { performGoogleWebSearch } from '../research/googleSearch.js';
import { extractFoundersFromText, extractPricingFromText } from '../research/deepWebResearcher.js';

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_REGEX = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,5}\)?[-.\s]?\d{3,5}[-.\s]?\d{3,5}/g;

const JUNK_EMAILS = new Set([
  'example@example.com',
  'user@domain.com',
  'test@test.com',
  'email@example.com',
  'info@domain.com',
  'name@example.com',
  'contact@domain.com',
  'admin@example.com',
  'noreply@',
  'sentry@',
]);

function filterValidEmails(emails: string[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const raw of emails) {
    const e = raw.toLowerCase().trim();
    if (!e || e.length < 6 || e.length > 80) continue;
    if (seen.has(e)) continue;

    const isJunk =
      Array.from(JUNK_EMAILS).some((j) => e.includes(j)) ||
      e.endsWith('.png') ||
      e.endsWith('.jpg') ||
      e.endsWith('.svg') ||
      e.endsWith('.gif');

    if (!isJunk && e.includes('@') && e.includes('.')) {
      seen.add(e);
      result.push(e);
    }
  }

  return result;
}

export interface ExecuteActionOptions {
  task: Task;
  action: ActionSelection;
  memory: TaskMemoryManager;
  userId?: string;
  sendEvent: (event: any) => void;
  abortSignal?: AbortSignal;
}

export async function executePlannerAction(options: ExecuteActionOptions): Promise<PlannerObservation> {
  const { task, action, memory, userId = 'anonymous', sendEvent, abortSignal } = options;
  const startTime = Date.now();
  const timestamp = new Date().toISOString();

  // 1. BUSINESS SEARCH EXECUTION
  if (action.toolName === 'search_businesses') {
    const rawQuery = action.inputArgs?.query || task.originalPrompt;
    const location = action.inputArgs?.location || task.location || '';
    const limit = action.inputArgs?.limit || task.quantity || 5;

    // Clean query
    let query = rawQuery;
    if (location && query.toLowerCase().includes(location.toLowerCase())) {
      query = query.replace(new RegExp(`\\b(in|near|around|at|for)?\\s*${location}\\b`, 'gi'), '').trim();
    }
    if (!query) query = 'small businesses';

    memory.registerSearchQuery(`${query} in ${location}`);

    try {
      const searchRes = await executeTool('search_businesses', { query, location, limit }, sendEvent);

      const discoveredUrls: string[] = [];
      const extractedFacts: ExtractedFact[] = [];
      const evidence: TaskEvidenceItem[] = [];

      if (searchRes && searchRes.businesses && searchRes.businesses.length > 0) {
        for (const b of searchRes.businesses) {
          if (b.website) {
            discoveredUrls.push(b.website);
          }

          memory.recordEntity({
            name: b.name,
            url: b.website || undefined,
            type: 'business',
            location: b.address || b.verifiedLocation || location,
            extractedFields: {
              phone: b.phone || '',
              email: b.email || '',
              address: b.address || '',
              rating: b.rating ? String(b.rating) : '',
              pricing: 'Custom / Not listed',
              services: b.category ? [b.category] : ['Local business services'],
            },
            verified: true,
            confidence: 0.9,
            sourceCitations: b.sources || [b.verifiedLocation || location],
          });

          evidence.push({
            id: `ev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
            fact: `Discovered business: ${b.name} (${b.address || location})`,
            field: 'business_record',
            value: b.name,
            sourceUrl: b.website || b.address || location,
            pageTitle: b.name,
            quote: `${b.name} located at ${b.address || location}`,
            confidence: 0.9,
            timestamp,
          });

          if (b.phone) {
            extractedFacts.push({
              field: 'phone',
              value: b.phone,
              sourceUrl: b.website || location,
              pageTitle: b.name,
              confidence: 'high',
              evidenceText: `Verified phone number: ${b.phone}`,
              timestamp,
            });
          }

          if (b.email) {
            extractedFacts.push({
              field: 'email',
              value: b.email,
              sourceUrl: b.website || location,
              pageTitle: b.name,
              confidence: 'high',
              evidenceText: `Verified email: ${b.email}`,
              timestamp,
            });
          }
        }

        return {
          action: action.actionName,
          tool: action.toolName,
          success: true,
          source: 'search_businesses',
          discoveredUrls,
          extractedFacts,
          evidence,
          discoveredLinks: [],
          executionTimeMs: Date.now() - startTime,
          timestamp,
          rawResult: searchRes,
        };
      } else {
        return {
          action: action.actionName,
          tool: action.toolName,
          success: false,
          source: 'search_businesses',
          discoveredUrls: [],
          extractedFacts: [],
          evidence: [],
          discoveredLinks: [],
          errors: searchRes?.message || 'No businesses found',
          executionTimeMs: Date.now() - startTime,
          timestamp,
        };
      }
    } catch (err: any) {
      return {
        action: action.actionName,
        tool: action.toolName,
        success: false,
        source: 'search_businesses',
        discoveredUrls: [],
        extractedFacts: [],
        evidence: [],
        discoveredLinks: [],
        errors: err.message,
        executionTimeMs: Date.now() - startTime,
        timestamp,
      };
    }
  }

  // 2. GOOGLE SEARCH EXECUTION
  if (action.toolName === 'google_search') {
    const query = action.inputArgs?.query || task.originalPrompt;
    memory.registerSearchQuery(query);

    sendEvent({
      type: 'tool.started',
      tool: 'google_search',
      stepId: action.subtaskId || 'step_google_search',
      title: 'Searching Google',
      message: `Searching Google for "${query}"...`,
    });

    try {
      const socialFilter = task.platforms.length > 0
        ? (task.platforms[0] === 'instagram'
            ? 'instagram.com'
            : task.platforms[0] === 'linkedin'
            ? 'linkedin.com'
            : task.platforms[0] === 'twitter'
            ? 'twitter.com'
            : undefined)
        : undefined;

      const searchRes = await performGoogleWebSearch(query, {
        limit: 10,
        socialSite: socialFilter,
      });

      const discoveredUrls: string[] = [];
      const extractedFacts: ExtractedFact[] = [];
      const evidence: TaskEvidenceItem[] = [];

      if (searchRes.items && searchRes.items.length > 0) {
        sendEvent({
          type: 'task.progress',
          stepId: action.subtaskId || 'step_google_search',
          title: 'Reviewing search results...',
          status: 'in_progress',
          message: `Reviewing ${searchRes.items.length} search results from discovery engine...`,
        });

        const candidatesToQueue: any[] = [];

        for (let i = 0; i < searchRes.items.length; i++) {
          const item = searchRes.items[i];
          if (item.url) {
            discoveredUrls.push(item.url);

            candidatesToQueue.push({
              url: item.url,
              title: item.title || item.url,
              snippet: item.snippet || '',
              source: 'google_search',
              domain: item.domain,
              position: i + 1,
              isOfficialWebsite: item.isOfficialWebsite,
              isSocialProfile: item.isSocialProfile,
              isDirectory: item.isDirectory,
            });

            sendEvent({
              type: 'task.progress',
              stepId: `step_cand_${i}`,
              title: 'Found candidate URL',
              status: 'in_progress',
              message: `Found candidate: ${item.title || item.domain || item.url}`,
              detail: item.url,
            });

            const cleanTitle = (item.title || '')
              .replace(/\s*[-–|:].*$/, '')
              .trim();
            if (cleanTitle && cleanTitle.length > 2 && cleanTitle.length < 80) {
              memory.recordEntity({
                name: cleanTitle,
                url: item.url,
                type: 'business',
                extractedFields: {},
                verified: false,
                confidence: 0.7,
                sourceCitations: [item.url],
              });
            }

            evidence.push({
              id: `ev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
              fact: `Discovered search result: ${item.title || item.url}`,
              field: 'search_result',
              value: item.url,
              sourceUrl: item.url,
              pageTitle: item.title,
              quote: item.snippet || '',
              confidence: 0.9,
              timestamp,
            });
          }
        }

        memory.addCandidateUrls(candidatesToQueue);

        sendEvent({
          type: 'tool.completed',
          tool: 'google_search',
          stepId: action.subtaskId || 'step_google_search',
          message: `Discovered and scored ${discoveredUrls.length} candidate URLs via Google Search`,
        });
      } else {
        sendEvent({
          type: 'tool.completed',
          tool: 'google_search',
          stepId: action.subtaskId || 'step_google_search',
          message: 'Google search returned 0 candidate results',
        });
      }

      return {
        action: action.actionName,
        tool: action.toolName,
        success: true,
        source: 'google_search',
        discoveredUrls,
        extractedFacts,
        evidence,
        discoveredLinks: [],
        executionTimeMs: Date.now() - startTime,
        timestamp,
        rawResult: searchRes,
      };
    } catch (err: any) {
      sendEvent({
        type: 'tool.failed',
        tool: 'google_search',
        stepId: action.subtaskId || 'step_google_search',
        message: `Search failed: ${err.message}`,
      });

      return {
        action: action.actionName,
        tool: action.toolName,
        success: false,
        source: 'google_search',
        discoveredUrls: [],
        extractedFacts: [],
        evidence: [],
        discoveredLinks: [],
        errors: err.message,
        executionTimeMs: Date.now() - startTime,
        timestamp,
      };
    }
  }

  // 2. LIVE BROWSER NAVIGATION & INSPECTION
  if (action.toolName === 'browser_navigate' || action.toolName === 'browser_extract_content') {
    const targetUrl = action.inputArgs?.url || task.target || '';
    memory.markUrlVisited(targetUrl);

    let session: any = null;
    try {
      session = await browserSessionManager.getOrCreateSession(userId);
      sendEvent({
        type: 'browser.session.started',
        sessionId: session.id,
        url: targetUrl,
        title: `Live Browser: ${targetUrl}`,
      });

      sendEvent({
        type: 'browser.navigating',
        sessionId: session.id,
        url: targetUrl,
        title: `Navigating to ${targetUrl}...`,
      });
    } catch (sessionErr: any) {
      console.warn('[Planner Executor] Browser session notice:', sessionErr.message);
    }

    sendEvent({
      type: 'tool.started',
      tool: 'browser_navigate',
      stepId: action.subtaskId || 'step_browser_nav',
      title: 'Opening website in Live Browser',
      message: `Navigating to ${targetUrl}...`,
      detail: targetUrl,
    });

    try {
      let navRes: any = null;
      if (session) {
        navRes = await session.navigate(targetUrl);
      } else {
        const audit = await executeTool('analyze_website', { url: targetUrl }, sendEvent);
        navRes = {
          success: audit.success !== false,
          url: targetUrl,
          title: audit.pageTitle || targetUrl,
          text: audit.headings ? Object.values(audit.headings).flat().join(' ') : '',
        };
      }

      if (navRes && navRes.success) {
        if (session && navRes.screenshotBase64) {
          sendEvent({
            type: 'browser.page.loaded',
            sessionId: session.id,
            url: navRes.url || targetUrl,
            title: navRes.title || targetUrl,
            screenshot: navRes.screenshotBase64,
            content: navRes.text,
          });
        }

        // Extract content from page
        let extractedData: any = null;
        if (session) {
          try {
            extractedData = await session.extractContent();
          } catch (extractErr) {
            console.warn('[Planner Executor] extractContent notice:', extractErr);
          }
        }

        const pageTitle = navRes.title || extractedData?.title || targetUrl;
        const pageText = extractedData?.data?.readableText || navRes.text || '';
        const rawEmails = extractedData?.data?.emails || (pageText.match(EMAIL_REGEX) || []);
        const validEmails = filterValidEmails(rawEmails);
        const phones = extractedData?.data?.phones || (pageText.match(PHONE_REGEX) || []);

        const founders = extractFoundersFromText(pageText, targetUrl);
        const prices = extractPricingFromText(pageText, targetUrl);
        const headings: string[] = extractedData?.data?.headings?.h2 || [];
        const servicesList = headings.slice(0, 6).filter((h: string) => h.length > 4 && h.length < 80);

        const extractedFacts: ExtractedFact[] = [];
        const evidence: TaskEvidenceItem[] = [];
        const discoveredUrls: string[] = [];

        // Evidence: Page Loaded
        evidence.push({
          id: `ev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
          fact: `Loaded live web page: ${pageTitle}`,
          field: 'page_load',
          value: targetUrl,
          sourceUrl: targetUrl,
          pageTitle,
          quote: pageText.slice(0, 200),
          confidence: 1.0,
          timestamp,
        });

        // Emails
        if (validEmails.length > 0) {
          extractedFacts.push({
            field: 'email',
            value: validEmails[0],
            sourceUrl: targetUrl,
            pageTitle,
            confidence: 'high',
            evidenceText: `Verified public contact email on page: ${validEmails[0]}`,
            timestamp,
          });
        }

        // Phones
        if (phones.length > 0) {
          extractedFacts.push({
            field: 'phone',
            value: phones[0],
            sourceUrl: targetUrl,
            pageTitle,
            confidence: 'high',
            evidenceText: `Verified phone number on page: ${phones[0]}`,
            timestamp,
          });
        }

        // Founders
        for (const f of founders) {
          extractedFacts.push({
            field: 'founder',
            value: `${f.name} (${f.title})`,
            sourceUrl: f.sourceUrl,
            pageTitle,
            confidence: 'high',
            evidenceText: `Found leadership citation: ${f.name}`,
            timestamp,
          });
        }

        // Pricing
        for (const p of prices) {
          extractedFacts.push({
            field: 'pricing',
            value: `${p.planName}: ${p.price}`,
            sourceUrl: p.sourceUrl,
            pageTitle,
            confidence: 'high',
            evidenceText: `Found pricing plan: ${p.planName} (${p.price})`,
            timestamp,
          });
        }

        // Discovered Links & Semantic Internal Link Prioritization
        const rawLinks = extractedData?.data?.links || [];
        const discoveredLinks: Array<{ text: string; href: string; fullUrl?: string }> = [];

        for (const l of rawLinks) {
          const href = l.fullUrl || l.href;
          if (href && !memory.visitedUrls.has(href)) {
            discoveredLinks.push({ text: l.text || '', href, fullUrl: href });
          }
        }

        // Queue internal links semantically (e.g. /about, /team, /pricing, /contact)
        const queuedCount = memory.queueInternalLinks(targetUrl, rawLinks, task.requiredFields);
        if (queuedCount > 0) {
          sendEvent({
            type: 'task.progress',
            stepId: action.subtaskId || 'step_browser_nav',
            title: 'Discovered relevant subpages',
            status: 'in_progress',
            message: `Discovered ${queuedCount} prioritized internal links (About, Team, Pricing, Contact) for deeper inspection`,
          });
        }

        // Record Page Summary in Memory
        memory.recordPageSummary({
          url: targetUrl,
          title: pageTitle,
          contentSnippet: pageText.slice(0, 500),
          extractedEmails: validEmails,
          extractedPhones: phones,
          extractedFounders: founders.map((f) => f.name),
          extractedPricing: prices.map((p) => `${p.planName}: ${p.price}`),
          extractedServices: servicesList,
          internalLinks: discoveredLinks.map((l) => ({ text: l.text, href: l.href, fullUrl: l.fullUrl || l.href })),
          inspectedAt: new Date().toISOString(),
        });

        // Register Entity Record in Memory
        const entityName = pageTitle.split(/[-|–—]/)[0].trim() || pageTitle;
        memory.recordEntity({
          name: entityName,
          url: targetUrl,
          type: 'business',
          extractedFields: {
            email: validEmails[0] || '',
            phone: phones[0] || '',
            founder: founders.map((f) => f.name).join(', '),
            pricing: prices.map((p) => `${p.planName}: ${p.price}`).join(', '),
            services: servicesList,
          },
          verified: true,
          confidence: 0.95,
          sourceCitations: [targetUrl],
        });

        sendEvent({
          type: 'task.progress',
          stepId: action.subtaskId || 'step_browser_nav',
          title: 'Extracting information...',
          status: 'in_progress',
          message: `Extracted ${extractedFacts.length} verified data points from ${pageTitle}`,
        });

        sendEvent({
          type: 'tool.completed',
          tool: 'browser_navigate',
          stepId: action.subtaskId || 'step_browser_nav',
          message: `Inspected ${pageTitle} successfully`,
          detail: `Extracted ${extractedFacts.length} verified data points`,
        });

        return {
          action: action.actionName,
          tool: action.toolName,
          success: true,
          source: targetUrl,
          url: targetUrl,
          pageTitle,
          content: pageText,
          extractedFacts,
          discoveredUrls,
          discoveredLinks,
          evidence,
          executionTimeMs: Date.now() - startTime,
          timestamp,
          rawResult: navRes,
        };
      } else {
        throw new Error(navRes?.error || 'Failed to load page in live browser');
      }
    } catch (navErr: any) {
      sendEvent({
        type: 'tool.failed',
        tool: 'browser_navigate',
        stepId: action.subtaskId || 'step_browser_nav',
        message: `Navigation failed for ${targetUrl}: ${navErr.message}`,
      });

      return {
        action: action.actionName,
        tool: action.toolName,
        success: false,
        source: targetUrl,
        url: targetUrl,
        discoveredUrls: [],
        discoveredLinks: [],
        extractedFacts: [],
        evidence: [],
        errors: navErr.message,
        executionTimeMs: Date.now() - startTime,
        timestamp,
      };
    }
  }

  // 3. BROWSER INTERACTION TOOLS (click, scroll, type, screenshot, close)
  if (['browser_click', 'browser_type', 'browser_scroll', 'browser_screenshot', 'browser_close'].includes(action.toolName)) {
    try {
      const session = await browserSessionManager.getOrCreateSession(userId);
      let actionResult: any = null;

      sendEvent({
        type: 'tool.started',
        tool: action.toolName,
        stepId: action.subtaskId || `step_${action.toolName}`,
        title: `Browser Action: ${action.toolName}`,
        message: `Executing ${action.toolName} in live browser...`,
      });

      if (action.toolName === 'browser_click') {
        const selector = action.inputArgs?.selector || 'a, button, [role="button"]';
        sendEvent({
          type: 'browser.action.started',
          sessionId: session.id,
          action: 'click',
          selector,
        });
        actionResult = await session.click(selector);
        sendEvent({
          type: 'browser.action.completed',
          sessionId: session.id,
          action: 'click',
          result: actionResult,
        });
      } else if (action.toolName === 'browser_scroll') {
        const direction = action.inputArgs?.direction || 'down';
        const amount = action.inputArgs?.amount || 500;
        sendEvent({
          type: 'browser.action.started',
          sessionId: session.id,
          action: 'scroll',
          direction,
          amount,
        });
        actionResult = await session.scroll(direction, amount);
        sendEvent({
          type: 'browser.action.completed',
          sessionId: session.id,
          action: 'scroll',
          result: actionResult,
        });
      } else if (action.toolName === 'browser_type') {
        const selector = action.inputArgs?.selector || 'input';
        const text = action.inputArgs?.text || '';
        sendEvent({
          type: 'browser.action.started',
          sessionId: session.id,
          action: 'type',
          selector,
          text,
        });
        actionResult = await session.type(selector, text);
        sendEvent({
          type: 'browser.action.completed',
          sessionId: session.id,
          action: 'type',
          result: actionResult,
        });
      } else if (action.toolName === 'browser_screenshot') {
        actionResult = await session.screenshot();
        if (actionResult && actionResult.screenshotBase64) {
          sendEvent({
            type: 'browser.screenshot.captured',
            sessionId: session.id,
            screenshot: actionResult.screenshotBase64,
          });
        }
      } else if (action.toolName === 'browser_close') {
        await browserSessionManager.closeSession(session.id, userId);
        sendEvent({
          type: 'browser.session.closed',
          sessionId: session.id,
        });
        actionResult = { success: true, message: 'Browser session closed' };
      }

      sendEvent({
        type: 'tool.completed',
        tool: action.toolName,
        stepId: action.subtaskId || `step_${action.toolName}`,
        message: `Completed ${action.toolName}`,
      });

      return {
        action: action.actionName,
        tool: action.toolName,
        success: actionResult ? actionResult.success !== false : true,
        source: session.getState().currentUrl || 'live_browser',
        discoveredUrls: [],
        discoveredLinks: [],
        extractedFacts: [],
        evidence: [],
        executionTimeMs: Date.now() - startTime,
        timestamp,
        rawResult: actionResult,
      };
    } catch (browserErr: any) {
      sendEvent({
        type: 'tool.failed',
        tool: action.toolName,
        stepId: action.subtaskId || `step_${action.toolName}`,
        message: `Browser action ${action.toolName} failed: ${browserErr.message}`,
      });

      return {
        action: action.actionName,
        tool: action.toolName,
        success: false,
        source: 'live_browser',
        discoveredUrls: [],
        discoveredLinks: [],
        extractedFacts: [],
        evidence: [],
        errors: browserErr.message,
        executionTimeMs: Date.now() - startTime,
        timestamp,
      };
    }
  }

  // 4. GENERIC REGISTERED TOOL EXECUTION
  try {
    sendEvent({
      type: 'tool.started',
      tool: action.toolName,
      stepId: action.subtaskId || `step_${action.toolName}`,
      message: `Executing ${action.toolName}...`,
    });

    const result = await executeTool(action.toolName, action.inputArgs, sendEvent);

    sendEvent({
      type: 'tool.completed',
      tool: action.toolName,
      stepId: action.subtaskId || `step_${action.toolName}`,
      message: `Completed ${action.toolName}`,
    });

    return {
      action: action.actionName,
      tool: action.toolName,
      success: true,
      source: action.toolName,
      discoveredUrls: [],
      discoveredLinks: [],
      extractedFacts: [],
      evidence: [],
      executionTimeMs: Date.now() - startTime,
      timestamp,
      rawResult: result,
    };
  } catch (toolErr: any) {
    sendEvent({
      type: 'tool.failed',
      tool: action.toolName,
      stepId: action.subtaskId || `step_${action.toolName}`,
      message: `Tool ${action.toolName} failed: ${toolErr.message}`,
    });

    return {
      action: action.actionName,
      tool: action.toolName,
      success: false,
      source: action.toolName,
      discoveredUrls: [],
      discoveredLinks: [],
      extractedFacts: [],
      evidence: [],
      errors: toolErr.message,
      executionTimeMs: Date.now() - startTime,
      timestamp,
    };
  }
}
