/**
 * Declarative Tool Schemas for Universal Agent Brain
 */

export interface BrainToolDefinition {
  name: string;
  description: string;
  category: 'browser' | 'search' | 'audit' | 'utility';
  parameters: {
    type: 'object';
    properties: Record<
      string,
      {
        type: string;
        description: string;
        enum?: string[];
        items?: { type: string };
        default?: any;
      }
    >;
    required?: string[];
  };
}

export const BRAIN_AVAILABLE_TOOLS: BrainToolDefinition[] = [
  {
    name: 'google_search',
    description:
      'Search Google/web index for live webpages, company websites, social media profiles, and directories.',
    category: 'search',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query or keyword (e.g. "Srinagar top bakeries", "Zapier founder email", "site:instagram.com ___tauqeer.x").',
        },
        location: {
          type: 'string',
          description: 'Optional geographic location filter.',
        },
        limit: {
          type: 'number',
          description: 'Number of results to return (default 10, max 20).',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'browser_navigate',
    description:
      'Navigates the live browser session directly to a destination URL and inspects page title, status, headings, text content, links, and forms.',
    category: 'browser',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The complete URL to navigate to (e.g. "https://example.com" or destination page).',
        },
        sessionId: {
          type: 'string',
          description: 'Optional browser session ID.',
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'browser_extract_content',
    description:
      'Extracts clean textual content, headings (h1, h2, h3), internal navigation links, contact info, and forms from the currently active browser page.',
    category: 'browser',
    parameters: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'Optional CSS container selector to extract from (e.g. "main", "body", "article", ".content").',
        },
        sessionId: {
          type: 'string',
          description: 'Optional browser session ID.',
        },
      },
    },
  },
  {
    name: 'browser_click',
    description:
      'Clicks an interactive element, button, tab, or link (e.g. "About Us", "Pricing", "Contact", "Team", "Menu", "Services") in the live browser session.',
    category: 'browser',
    parameters: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector or text descriptor of the element to click (e.g. "a[href*=\'pricing\']", "a[href*=\'contact\']", "button.load-more").',
        },
        sessionId: {
          type: 'string',
          description: 'Optional browser session ID.',
        },
      },
      required: ['selector'],
    },
  },
  {
    name: 'browser_type',
    description:
      'Types text into an input field or search bar on the active live browser page.',
    category: 'browser',
    parameters: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector of the input field (e.g. "input[type=\'search\']", "#search-box").',
        },
        text: {
          type: 'string',
          description: 'Text to enter.',
        },
        clearFirst: {
          type: 'boolean',
          description: 'Whether to clear existing text before typing.',
        },
        sessionId: {
          type: 'string',
          description: 'Optional browser session ID.',
        },
      },
      required: ['selector', 'text'],
    },
  },
  {
    name: 'browser_press',
    description:
      'Simulates pressing a keyboard key (e.g. "Enter", "Tab", "Escape", "ArrowDown") in the active browser session.',
    category: 'browser',
    parameters: {
      type: 'object',
      properties: {
        key: {
          type: 'string',
          description: 'Keyboard key name (e.g. "Enter", "Tab", "Escape", "ArrowDown").',
        },
        sessionId: {
          type: 'string',
          description: 'Optional browser session ID.',
        },
      },
      required: ['key'],
    },
  },
  {
    name: 'browser_scroll',
    description:
      'Scrolls the active browser session window up, down, to top, or to bottom to reveal lazy-loaded content or footer information.',
    category: 'browser',
    parameters: {
      type: 'object',
      properties: {
        direction: {
          type: 'string',
          description: 'Scroll direction ("down", "up", "to_top", "to_bottom").',
          enum: ['down', 'up', 'to_top', 'to_bottom'],
        },
        amount: {
          type: 'number',
          description: 'Pixel scroll amount (default 500).',
        },
        sessionId: {
          type: 'string',
          description: 'Optional browser session ID.',
        },
      },
      required: ['direction'],
    },
  },
  {
    name: 'browser_screenshot',
    description:
      'Captures the current visual viewport state of the active live browser session.',
    category: 'browser',
    parameters: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'Optional browser session ID.',
        },
      },
    },
  },
  {
    name: 'browser_go_back',
    description:
      'Navigates back to the previous URL in the active browser session history.',
    category: 'browser',
    parameters: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'Optional browser session ID.',
        },
      },
    },
  },
  {
    name: 'browser_go_forward',
    description:
      'Navigates forward in the active browser session history.',
    category: 'browser',
    parameters: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'Optional browser session ID.',
        },
      },
    },
  },
  {
    name: 'browser_reload',
    description:
      'Reloads the current page in the active browser session.',
    category: 'browser',
    parameters: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'Optional browser session ID.',
        },
      },
    },
  },
  {
    name: 'browser_session_status',
    description:
      'Returns the current state, active URL, history, and status of the live browser session.',
    category: 'browser',
    parameters: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'Optional browser session ID.',
        },
      },
    },
  },
  {
    name: 'browser_close',
    description:
      'Closes the active live browser session and cleans up resources.',
    category: 'browser',
    parameters: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'Browser session ID to close.',
        },
      },
    },
  },
  {
    name: 'analyze_website',
    description:
      'Performs real website technical analysis and diagnostic check on a live URL (response time, HTTP status, SSL, headings, metadata, tech stack hints, contacts).',
    category: 'audit',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The URL of the website to analyze.',
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'deep_web_research',
    description:
      'Autonomous deep research engine that traverses candidate URLs, follows internal links (About, Team, Pricing, Contact, Services), inspects pages, and extracts structured verified facts.',
    category: 'search',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The research entity name or target topic.',
        },
        targetUrl: {
          type: 'string',
          description: 'Optional direct target website URL.',
        },
        location: {
          type: 'string',
          description: 'Optional geographic location.',
        },
        specificFields: {
          type: 'string',
          description: 'Comma-separated fields to extract (e.g. "founder, email, phone, pricing, services").',
        },
        limit: {
          type: 'number',
          description: 'Max entities to discover and inspect.',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'calculate_lead_score',
    description:
      'Calculates an objective 0–100 lead health score, sales tier, and urgency based on verified technical deficiencies.',
    category: 'audit',
    parameters: {
      type: 'object',
      properties: {
        businessName: {
          type: 'string',
          description: 'Name of the business.',
        },
        hasWebsite: {
          type: 'boolean',
          description: 'Whether business has an active website.',
        },
        hasPhone: {
          type: 'boolean',
          description: 'Whether verified phone number is available.',
        },
        hasEmail: {
          type: 'boolean',
          description: 'Whether verified email address is available.',
        },
        websiteAnalysis: {
          type: 'object',
          description: 'Diagnostic output from analyze_website tool.',
        },
      },
      required: ['businessName'],
    },
  },
  {
    name: 'generate_proposal',
    description:
      'Generates a structured, professional business proposal addressing specific verified technical deficiencies.',
    category: 'audit',
    parameters: {
      type: 'object',
      properties: {
        businessName: {
          type: 'string',
          description: 'Name of the business.',
        },
        websiteUrl: {
          type: 'string',
          description: 'Website URL (if applicable).',
        },
        identifiedWeaknesses: {
          type: 'string',
          description: 'Summary of identified issues to solve.',
        },
        targetService: {
          type: 'string',
          description: 'Main service offer.',
        },
      },
      required: ['businessName'],
    },
  },
  {
    name: 'get_system_status',
    description:
      'Returns real runtime information, tool availability, and configuration status for SanMine Space.',
    category: 'utility',
    parameters: {
      type: 'object',
      properties: {
        checkType: {
          type: 'string',
          description: 'Type of check ("overview", "tools", "connectivity").',
          enum: ['overview', 'tools', 'connectivity'],
        },
      },
      required: ['checkType'],
    },
  },
  {
    name: 'search_businesses',
    description:
      'Searches for local businesses or establishments matching query and location using active business search provider.',
    category: 'search',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Business keyword (e.g. "bakeries", "restaurants", "dentists").',
        },
        location: {
          type: 'string',
          description: 'City or geographic area (e.g. "Srinagar", "Delhi", "New York").',
        },
        limit: {
          type: 'number',
          description: 'Max results to return (default 20).',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'send_email',
    description:
      'Dispatches an email or outreach proposal to a verified recipient email address via configured Gmail OAuth or SMTP credentials.',
    category: 'utility',
    parameters: {
      type: 'object',
      properties: {
        to: {
          type: 'string',
          description: 'Recipient email address (e.g. "owner@business.com").',
        },
        businessName: {
          type: 'string',
          description: 'Target business or recipient name.',
        },
        subject: {
          type: 'string',
          description: 'Subject line of the email.',
        },
        body: {
          type: 'string',
          description: 'Body text or markdown of the personalized outreach proposal.',
        },
      },
      required: ['to', 'subject', 'body'],
    },
  },
];

export function getBrainToolDeclarationsForPrompt(): string {
  return BRAIN_AVAILABLE_TOOLS.map((t) => {
    const props = Object.entries(t.parameters.properties || {})
      .map(([k, v]) => `    - ${k} (${v.type}${t.parameters.required?.includes(k) ? ', REQUIRED' : ''}): ${v.description}${v.enum ? ` [Options: ${v.enum.join(', ')}]` : ''}`)
      .join('\n');
    return `### Tool: \`${t.name}\`\nDescription: ${t.description}\nCategory: ${t.category}\nArguments:\n${props}`;
  }).join('\n\n');
}

export function isToolRegistered(toolName: string): boolean {
  return BRAIN_AVAILABLE_TOOLS.some((t) => t.name === toolName);
}
