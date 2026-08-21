/**
 * Universal Task Planner — Dynamic Task Decomposition Engine
 *
 * Decomposes structured tasks into atomic, ordered, observable subtasks
 * with explicit dependencies, target tools, and completion criteria.
 */

import { Task, Subtask } from './types.js';

export function decomposeTask(task: Task): Subtask[] {
  const subtasks: Subtask[] = [];
  let stepIndex = 1;

  const createSubtask = (params: {
    title: string;
    description: string;
    objective?: string;
    requiredTool?: string;
    preferredTools?: string[];
    fallbackTools?: string[];
    targetUrl?: string;
    searchQuery?: string;
    targetFields?: string[];
    dependsOn?: string[];
    dependencies?: string[];
    expectedObservation?: string;
    completionCondition?: string;
    evidenceRequirements?: string[];
  }): Subtask => {
    const id = `subtask_${task.id}_${stepIndex++}`;
    const deps = params.dependsOn || params.dependencies || [];
    return {
      id,
      title: params.title,
      description: params.description,
      objective: params.objective || params.title,
      requiredTool: params.requiredTool,
      preferredTools: params.preferredTools || (params.requiredTool ? [params.requiredTool] : []),
      fallbackTools: params.fallbackTools || [],
      targetUrl: params.targetUrl,
      searchQuery: params.searchQuery,
      targetFields: params.targetFields || task.requiredFields,
      dependsOn: deps,
      dependencies: deps,
      expectedObservation: params.expectedObservation || 'Observable output or verified facts',
      completionCondition: params.completionCondition || 'Tool returns valid observation without unrecoverable errors',
      retryPolicy: {
        maxRetries: 3,
        backoffMs: 1000,
      },
      evidenceRequirements: params.evidenceRequirements || (params.targetFields || task.requiredFields),
      status: 'PENDING',
      retryCount: 0,
      maxRetries: 3,
    };
  };

  switch (task.intent) {
    case 'URL_INSPECTION_AND_AUDIT': {
      const url = task.target || task.source || '';
      const s1 = createSubtask({
        title: `Navigate to ${url}`,
        description: `Open destination URL in live browser and inspect initial page state`,
        requiredTool: 'browser_navigate',
        targetUrl: url,
      });
      subtasks.push(s1);

      const s2 = createSubtask({
        title: 'Extract page content and metadata',
        description: 'Read headings, readable text, forms, and metadata from active page',
        requiredTool: 'browser_extract_content',
        targetUrl: url,
        dependsOn: [s1.id],
      });
      subtasks.push(s2);

      if (task.requiredFields.length > 0) {
        const s3 = createSubtask({
          title: `Inspect internal subpages for ${task.requiredFields.join(', ')}`,
          description: 'Follow internal navigation links (About, Team, Pricing, Contact) if fields are missing on landing page',
          targetUrl: url,
          dependsOn: [s2.id],
        });
        subtasks.push(s3);
      }

      const s4 = createSubtask({
        title: 'Verify extracted facts against source text',
        description: 'Ensure all extracted data points are grounded in observable page quotes',
        dependsOn: [s2.id],
      });
      subtasks.push(s4);

      const s5 = createSubtask({
        title: 'Compile verified response',
        description: 'Generate structured findings report for user',
        dependsOn: [s4.id],
      });
      subtasks.push(s5);
      break;
    }

    case 'DISCOVERY_AND_EXTRACTION':
    case 'PROPOSAL_SYNTHESIS': {
      const qty = task.quantity || 5;
      const targetQuery = task.location
        ? `${task.originalPrompt} in ${task.location}`
        : task.originalPrompt;

      const isLocalBusiness =
        /\b(small businesses|local businesses|businesses|gyms|dentists|restaurants|cafes|bakeries|salons|plumbers|shops|stores)\b/i.test(task.originalPrompt) &&
        !/\b(ai|saas|software|crypto|fintech|tools|websites|online|global|open source)\b/i.test(task.originalPrompt);

      const discoveryTool = isLocalBusiness ? 'search_businesses' : 'google_search';

      const s1 = createSubtask({
        title: `Discover candidate entities (${qty} requested)`,
        description: `Execute search queries to find candidate businesses, companies, or URLs`,
        requiredTool: discoveryTool,
        searchQuery: targetQuery,
      });
      subtasks.push(s1);

      const s2 = createSubtask({
        title: 'Collect candidate URLs and filter duplicates',
        description: 'Extract unique candidate website URLs and register in task memory',
        dependsOn: [s1.id],
      });
      subtasks.push(s2);

      const s3 = createSubtask({
        title: 'Inspect candidate websites in Live Browser',
        description: 'Navigate to candidate URLs and observe live page content',
        requiredTool: 'browser_navigate',
        dependsOn: [s2.id],
      });
      subtasks.push(s3);

      const s4 = createSubtask({
        title: `Extract target fields (${task.requiredFields.length ? task.requiredFields.join(', ') : 'contact, overview'})`,
        description: 'Extract public email, phone, leadership/founder, and services from inspected pages',
        requiredTool: 'browser_extract_content',
        dependsOn: [s3.id],
      });
      subtasks.push(s4);

      const s5 = createSubtask({
        title: 'Follow subpages & secondary sources if needed',
        description: 'Inspect /about, /team, /contact pages if critical requested fields are absent',
        dependsOn: [s4.id],
      });
      subtasks.push(s5);

      const s6 = createSubtask({
        title: 'Verify extracted facts against citations',
        description: 'Audit facts against primary evidence quotes and calculate confidence',
        dependsOn: [s5.id],
      });
      subtasks.push(s6);

      if (task.intent === 'PROPOSAL_SYNTHESIS') {
        const s7 = createSubtask({
          title: 'Synthesize proposal intelligence & draft proposals',
          description: 'Analyze verified findings and prepare personalized client proposals',
          requiredTool: 'prepare_proposals',
          dependsOn: [s6.id],
        });
        subtasks.push(s7);
      }

      const sFinal = createSubtask({
        title: 'Generate structured final output',
        description: 'Format grounded table, lead scores, and citations',
        dependsOn: [s6.id],
      });
      subtasks.push(sFinal);
      break;
    }

    case 'SOCIAL_PROFILE_RESEARCH': {
      const platform = task.platforms[0] || 'instagram';
      const s1 = createSubtask({
        title: `Discover ${platform} candidate profiles`,
        description: `Search for public ${platform} accounts matching query`,
        requiredTool: 'google_search',
        searchQuery: `site:${platform}.com ${task.originalPrompt}`,
      });
      subtasks.push(s1);

      const s2 = createSubtask({
        title: `Inspect ${platform} public profiles`,
        description: 'Navigate to profile pages and inspect bio, contact info, and website link',
        requiredTool: 'browser_navigate',
        dependsOn: [s1.id],
      });
      subtasks.push(s2);

      const s3 = createSubtask({
        title: 'Extract bio, public email & contact handles',
        description: 'Parse text for contact info without requiring login',
        dependsOn: [s2.id],
      });
      subtasks.push(s3);

      const s4 = createSubtask({
        title: 'Verify evidence and compile report',
        description: 'Ground all extracted handles and citations',
        dependsOn: [s3.id],
      });
      subtasks.push(s4);
      break;
    }

    case 'SYSTEM_DIAGNOSTIC': {
      const s1 = createSubtask({
        title: 'Inspect system runtime and tool status',
        description: 'Verify active integrations, search providers, and AI models',
        requiredTool: 'system_status',
      });
      subtasks.push(s1);
      const s2 = createSubtask({
        title: 'Format diagnostic report',
        description: 'Summarize system health and connectivity',
        dependsOn: [s1.id],
      });
      subtasks.push(s2);
      break;
    }

    case 'DIRECT_CHAT': {
      const s1 = createSubtask({
        title: 'Formulate conversational response',
        description: 'Stream response directly from AI model',
      });
      subtasks.push(s1);
      break;
    }

    default: {
      const s1 = createSubtask({
        title: 'Discover candidate information sources',
        description: 'Search Google and authoritative web sources',
        requiredTool: 'google_search',
        searchQuery: task.originalPrompt,
      });
      subtasks.push(s1);

      const s2 = createSubtask({
        title: 'Inspect relevant pages in Live Browser',
        description: 'Navigate to candidate URLs and extract evidence',
        requiredTool: 'browser_navigate',
        dependsOn: [s1.id],
      });
      subtasks.push(s2);

      const s3 = createSubtask({
        title: 'Extract structured facts and verify evidence',
        description: 'Audit facts against primary sources',
        dependsOn: [s2.id],
      });
      subtasks.push(s3);

      const s4 = createSubtask({
        title: 'Compile final response',
        description: 'Generate grounded final answer with citations',
        dependsOn: [s3.id],
      });
      subtasks.push(s4);
      break;
    }
  }

  return subtasks;
}
