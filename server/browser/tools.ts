import { AgentTool, ToolExecutionContext } from '../tools.js';
import { browserSessionManager } from './sessionManager.js';

export const browserNavigateTool: AgentTool = {
  name: 'browser_navigate',
  description:
    'Navigates the live browser session to a destination URL and inspects page title, status, headings, text content, and links.',
  parameters: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'The complete URL to navigate to (e.g. "https://example.com").',
      },
      sessionId: {
        type: 'string',
        description: 'Optional browser session ID. If omitted, uses or creates the default session for the user.',
      },
    },
    required: ['url'],
  },
  execute: async (input, emitEvent, context) => {
    const url = input?.url || '';
    const userId = context?.userId || 'anonymous';
    const sessionId = input?.sessionId;

    emitEvent?.({
      type: 'tool.started',
      tool: 'browser_navigate',
      message: `Navigating to ${url}...`,
      detail: `Session: ${sessionId || 'active'}`,
    });

    emitEvent?.({
      type: 'browser.navigating',
      url,
      sessionId,
      title: 'Navigating to web page...',
    });

    try {
      const session = await browserSessionManager.getOrCreateSession(userId, sessionId);
      const result = await session.navigate(url);

      if (!result.success) {
        emitEvent?.({
          type: 'tool.failed',
          tool: 'browser_navigate',
          message: result.error || 'Navigation failed',
        });
        return result;
      }

      emitEvent?.({
        type: 'browser.page.loaded',
        url: result.url,
        title: result.title,
        screenshot: result.screenshotBase64,
        sessionId: session.id,
        content: result.text,
        mode: result.mode,
      });

      // Emit discovered links
      if (result.data?.links && Array.isArray(result.data.links) && result.data.links.length > 0) {
        for (const link of result.data.links.slice(0, 5)) {
          emitEvent?.({
            type: 'browser.link.discovered',
            url: link.fullUrl || link.href,
            text: link.text,
            sessionId: session.id,
          });
        }
      }

      emitEvent?.({
        type: 'tool.completed',
        tool: 'browser_navigate',
        message: `Navigated to ${result.title || result.url}`,
        detail: `Mode: ${result.mode || 'browser'} (${result.executionTimeMs}ms)`,
      });

      return {
        ...result,
        sessionId: session.id,
        runtime: session.getState().runtime || {
          mode: result.mode || 'http_fallback',
          provider: result.mode === 'live_browser' ? 'playwright-chromium' : 'http-dom-parser',
          connected: true,
          currentUrl: result.url || url,
        },
      };
    } catch (err: any) {
      emitEvent?.({
        type: 'tool.failed',
        tool: 'browser_navigate',
        message: `Navigation error: ${err.message}`,
      });
      return {
        success: false,
        action: 'navigate',
        url,
        error: err.message,
        errorCode: 'BROWSER_NAVIGATION_FAILED',
        executionTimeMs: 0,
        timestamp: new Date().toISOString(),
        runtime: {
          mode: 'http_fallback',
          provider: 'http-dom-parser',
          connected: false,
          currentUrl: url,
        },
      };
    }
  },
};

export const browserClickTool: AgentTool = {
  name: 'browser_click',
  description: 'Clicks an element or link on the active page in the live browser session.',
  parameters: {
    type: 'object',
    properties: {
      selector: {
        type: 'string',
        description: 'CSS selector or text descriptor of the element to click.',
      },
      sessionId: {
        type: 'string',
        description: 'Optional browser session ID.',
      },
    },
    required: ['selector'],
  },
  execute: async (input, emitEvent, context) => {
    const selector = input?.selector || '';
    const userId = context?.userId || 'anonymous';
    const sessionId = input?.sessionId;

    emitEvent?.({
      type: 'tool.started',
      tool: 'browser_click',
      message: `Clicking element: ${selector}`,
    });

    emitEvent?.({
      type: 'browser.action',
      action: 'click',
      selector,
      sessionId,
      detail: `Clicking ${selector}`,
    });

    try {
      const session = await browserSessionManager.getOrCreateSession(userId, sessionId);
      const result = await session.click(selector);

      if (result.screenshotBase64) {
        emitEvent?.({
          type: 'browser.screenshot',
          screenshot: result.screenshotBase64,
          url: result.url,
          title: result.title,
          sessionId: session.id,
          mode: result.mode,
        });
      }

      emitEvent?.({
        type: 'tool.completed',
        tool: 'browser_click',
        message: `Clicked element: ${selector}`,
      });

      return {
        ...result,
        sessionId: session.id,
      };
    } catch (err: any) {
      emitEvent?.({
        type: 'tool.failed',
        tool: 'browser_click',
        message: `Click error: ${err.message}`,
      });
      return {
        success: false,
        action: 'click',
        error: err.message,
        executionTimeMs: 0,
        timestamp: new Date().toISOString(),
      };
    }
  },
};

export const browserTypeTool: AgentTool = {
  name: 'browser_type',
  description: 'Types text into an input or textarea element on the active live browser page.',
  parameters: {
    type: 'object',
    properties: {
      selector: {
        type: 'string',
        description: 'CSS selector or name of the input element.',
      },
      text: {
        type: 'string',
        description: 'Text string to type into the field.',
      },
      clearFirst: {
        type: 'boolean',
        description: 'Whether to clear existing field text before typing.',
      },
      sessionId: {
        type: 'string',
        description: 'Optional browser session ID.',
      },
    },
    required: ['selector', 'text'],
  },
  execute: async (input, emitEvent, context) => {
    const selector = input?.selector || '';
    const text = input?.text || '';
    const clearFirst = Boolean(input?.clearFirst);
    const userId = context?.userId || 'anonymous';
    const sessionId = input?.sessionId;

    emitEvent?.({
      type: 'tool.started',
      tool: 'browser_type',
      message: `Typing into ${selector}...`,
    });

    emitEvent?.({
      type: 'browser.action',
      action: 'type',
      selector,
      text,
      sessionId,
      detail: `Input text: "${text}"`,
    });

    try {
      const session = await browserSessionManager.getOrCreateSession(userId, sessionId);
      const result = await session.type(selector, text, { clearFirst });

      if (result.screenshotBase64) {
        emitEvent?.({
          type: 'browser.screenshot',
          screenshot: result.screenshotBase64,
          url: result.url,
          title: result.title,
          sessionId: session.id,
          mode: result.mode,
        });
      }

      emitEvent?.({
        type: 'tool.completed',
        tool: 'browser_type',
        message: `Typed text into ${selector}`,
      });

      return {
        ...result,
        sessionId: session.id,
      };
    } catch (err: any) {
      emitEvent?.({
        type: 'tool.failed',
        tool: 'browser_type',
        message: `Type error: ${err.message}`,
      });
      return {
        success: false,
        action: 'type',
        error: err.message,
        executionTimeMs: 0,
        timestamp: new Date().toISOString(),
      };
    }
  },
};

export const browserScreenshotTool: AgentTool = {
  name: 'browser_screenshot',
  description: 'Captures the current visual viewport state of the active live browser session.',
  parameters: {
    type: 'object',
    properties: {
      sessionId: {
        type: 'string',
        description: 'Optional browser session ID.',
      },
    },
  },
  execute: async (input, emitEvent, context) => {
    const userId = context?.userId || 'anonymous';
    const sessionId = input?.sessionId;

    emitEvent?.({
      type: 'tool.started',
      tool: 'browser_screenshot',
      message: 'Capturing live browser screenshot...',
    });

    try {
      const session = await browserSessionManager.getOrCreateSession(userId, sessionId);
      const result = await session.screenshot();

      emitEvent?.({
        type: 'browser.screenshot',
        screenshot: result.screenshotBase64,
        url: result.url,
        title: result.title,
        sessionId: session.id,
        mode: result.mode,
      });

      emitEvent?.({
        type: 'tool.completed',
        tool: 'browser_screenshot',
        message: 'Captured browser screenshot',
      });

      return {
        ...result,
        sessionId: session.id,
      };
    } catch (err: any) {
      emitEvent?.({
        type: 'tool.failed',
        tool: 'browser_screenshot',
        message: `Screenshot error: ${err.message}`,
      });
      return {
        success: false,
        action: 'screenshot',
        error: err.message,
        executionTimeMs: 0,
        timestamp: new Date().toISOString(),
      };
    }
  },
};

export const browserPressTool: AgentTool = {
  name: 'browser_press',
  description: 'Simulates pressing a keyboard key (e.g. Enter, Tab, Escape, ArrowDown) in the active browser session.',
  parameters: {
    type: 'object',
    properties: {
      key: {
        type: 'string',
        description: 'Keyboard key to press (default: Enter).',
      },
      sessionId: {
        type: 'string',
        description: 'Optional browser session ID.',
      },
    },
    required: ['key'],
  },
  execute: async (input, emitEvent, context) => {
    const userId = context?.userId || 'anonymous';
    const sessionId = input?.sessionId;
    const key = input?.key || 'Enter';

    emitEvent?.({
      type: 'browser.action',
      action: 'press',
      key,
      sessionId,
      detail: `Key pressed: ${key}`,
    });

    const session = await browserSessionManager.getOrCreateSession(userId, sessionId);
    const result = await session.press(key);

    return {
      ...result,
      sessionId: session.id,
    };
  },
};

export const browserScrollTool: AgentTool = {
  name: 'browser_scroll',
  description: 'Scrolls the active browser session window up, down, to top, or to bottom.',
  parameters: {
    type: 'object',
    properties: {
      direction: {
        type: 'string',
        description: 'Scroll direction ("up", "down", "to_top", "to_bottom").',
        enum: ['up', 'down', 'to_top', 'to_bottom'],
      },
      amount: {
        type: 'number',
        description: 'Optional pixel scroll amount (default 500).',
      },
      sessionId: {
        type: 'string',
        description: 'Optional browser session ID.',
      },
    },
    required: ['direction'],
  },
  execute: async (input, emitEvent, context) => {
    const userId = context?.userId || 'anonymous';
    const sessionId = input?.sessionId;
    const direction = input?.direction || 'down';
    const amount = input?.amount || 500;

    emitEvent?.({
      type: 'browser.action',
      action: 'scroll',
      direction,
      amount,
      sessionId,
      detail: `Scroll ${direction} (${amount}px)`,
    });

    const session = await browserSessionManager.getOrCreateSession(userId, sessionId);
    const result = await session.scroll(direction, amount);

    return {
      ...result,
      sessionId: session.id,
    };
  },
};

export const browserGoBackTool: AgentTool = {
  name: 'browser_go_back',
  description: 'Navigates back to the previous URL in the active browser session history.',
  parameters: {
    type: 'object',
    properties: {
      sessionId: {
        type: 'string',
        description: 'Optional browser session ID.',
      },
    },
  },
  execute: async (input, emitEvent, context) => {
    const userId = context?.userId || 'anonymous';
    const sessionId = input?.sessionId;

    const session = await browserSessionManager.getOrCreateSession(userId, sessionId);
    const result = await session.goBack();

    if (result.success) {
      emitEvent?.({
        type: 'browser.page.loaded',
        url: result.url,
        title: result.title,
        screenshot: result.screenshotBase64,
        sessionId: session.id,
        mode: result.mode,
      });
    }

    return {
      ...result,
      sessionId: session.id,
    };
  },
};

export const browserGoForwardTool: AgentTool = {
  name: 'browser_go_forward',
  description: 'Navigates forward in the active browser session history.',
  parameters: {
    type: 'object',
    properties: {
      sessionId: {
        type: 'string',
        description: 'Optional browser session ID.',
      },
    },
  },
  execute: async (input, emitEvent, context) => {
    const userId = context?.userId || 'anonymous';
    const sessionId = input?.sessionId;

    const session = await browserSessionManager.getOrCreateSession(userId, sessionId);
    const result = await session.goForward();

    if (result.success) {
      emitEvent?.({
        type: 'browser.page.loaded',
        url: result.url,
        title: result.title,
        screenshot: result.screenshotBase64,
        sessionId: session.id,
        mode: result.mode,
      });
    }

    return {
      ...result,
      sessionId: session.id,
    };
  },
};

export const browserReloadTool: AgentTool = {
  name: 'browser_reload',
  description: 'Reloads the current page in the active browser session.',
  parameters: {
    type: 'object',
    properties: {
      sessionId: {
        type: 'string',
        description: 'Optional browser session ID.',
      },
    },
  },
  execute: async (input, emitEvent, context) => {
    const userId = context?.userId || 'anonymous';
    const sessionId = input?.sessionId;

    const session = await browserSessionManager.getOrCreateSession(userId, sessionId);
    const result = await session.reload();

    return {
      ...result,
      sessionId: session.id,
    };
  },
};

export const browserExtractContentTool: AgentTool = {
  name: 'browser_extract_content',
  description:
    'Extracts headings, textual content, links, and forms from the active page in the live browser session.',
  parameters: {
    type: 'object',
    properties: {
      sessionId: {
        type: 'string',
        description: 'Optional browser session ID.',
      },
      selector: {
        type: 'string',
        description: 'Optional specific CSS container selector to extract from.',
      },
    },
  },
  execute: async (input, emitEvent, context) => {
    const userId = context?.userId || 'anonymous';
    const sessionId = input?.sessionId;
    const selector = input?.selector;

    emitEvent?.({
      type: 'tool.started',
      tool: 'browser_extract_content',
      message: 'Extracting content from active page...',
    });

    try {
      const session = await browserSessionManager.getOrCreateSession(userId, sessionId);
      const result = await session.extractContent(selector);

      emitEvent?.({
        type: 'browser.content.extracted',
        url: result.url,
        title: result.title,
        data: result.data,
        sessionId: session.id,
        mode: result.mode,
      });

      emitEvent?.({
        type: 'tool.completed',
        tool: 'browser_extract_content',
        message: `Extracted content from ${result.title || result.url}`,
      });

      return {
        ...result,
        sessionId: session.id,
      };
    } catch (err: any) {
      emitEvent?.({
        type: 'tool.failed',
        tool: 'browser_extract_content',
        message: `Content extraction error: ${err.message}`,
      });
      return {
        success: false,
        action: 'extract_content',
        error: err.message,
        executionTimeMs: 0,
        timestamp: new Date().toISOString(),
      };
    }
  },
};

export const browserSessionStatusTool: AgentTool = {
  name: 'browser_session_status',
  description: 'Returns the current state, active URL, history, and status of the live browser session.',
  parameters: {
    type: 'object',
    properties: {
      sessionId: {
        type: 'string',
        description: 'Optional browser session ID.',
      },
    },
  },
  execute: async (input, emitEvent, context) => {
    const userId = context?.userId || 'anonymous';
    const sessionId = input?.sessionId;

    const session = await browserSessionManager.getOrCreateSession(userId, sessionId);
    const state = session.getState();

    return {
      success: true,
      session: state,
    };
  },
};

export const browserCloseTool: AgentTool = {
  name: 'browser_close',
  description: 'Closes the active live browser session and cleans up resources.',
  parameters: {
    type: 'object',
    properties: {
      sessionId: {
        type: 'string',
        description: 'Browser session ID to close.',
      },
    },
  },
  execute: async (input, emitEvent, context) => {
    const userId = context?.userId || 'anonymous';
    const sessionId = input?.sessionId;

    if (!sessionId) {
      return { success: false, error: 'No sessionId provided to close.' };
    }

    const closed = await browserSessionManager.closeSession(sessionId, userId);

    if (closed) {
      emitEvent?.({
        type: 'browser.session.closed',
        sessionId,
        message: 'Browser session closed',
      });
    }

    return {
      success: closed,
      sessionId,
      message: closed ? 'Session closed successfully' : 'Session not found or not owned by user',
    };
  },
};

import { webResearchTool } from '../research/webResearchTool.js';
export { webResearchTool };

export const browserTools: AgentTool[] = [
  browserNavigateTool,
  browserClickTool,
  browserTypeTool,
  browserPressTool,
  browserScrollTool,
  browserScreenshotTool,
  browserExtractContentTool,
  browserGoBackTool,
  browserGoForwardTool,
  browserReloadTool,
  browserSessionStatusTool,
  browserCloseTool,
  webResearchTool,
];
