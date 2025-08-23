// List of commands that do not require API calls
import { getDatabase, runQuery } from '../sqlite';
import * as bin from './index';
import axios from 'axios';
import { getFingerprint } from '../fingerprint';
import { trace, context, SpanStatusCode } from '@opentelemetry/api';
import { getTracer, getLogger } from '../../../otel';
import { SeverityNumber } from '@opentelemetry/api-logs';
import { recordHttpRequest } from '../metrics';

// Help
export const help = async (_args: string[]): Promise<string> => {
  const lines = Object.keys(bin)
    .sort()
    .map((cmd) => {
      const desc = (bin as any)[cmd]?.description || '';
      return `${cmd} - ${desc}`.trim();
    })
    .join('\n');

  return `${lines}\n`;
};
(help as any).description = 'Show available commands';

// About, Contact, CV from DB - now trigger modals
export const about = async () => {
  // Trigger modal event
  const event = new CustomEvent('openModal', {
    detail: { type: 'about' },
  });
  window.dispatchEvent(event);
  return 'Opening about page...';
};
(about as any).description = 'See more about me!';

export const contact = async () => {
  // Trigger modal event
  const event = new CustomEvent('openModal', {
    detail: { type: 'contact' },
  });
  window.dispatchEvent(event);
  return 'Opening contact page...';
};
(contact as any).description = 'Get in touch with me!';

export const cv = async () => {
  // Trigger modal event
  const event = new CustomEvent('openModal', {
    detail: { type: 'cv' },
  });
  window.dispatchEvent(event);
  return 'Opening CV page...';
};
(cv as any).description = 'See more about my work!';

export const projects = async () => {
  // Trigger modal event
  const event = new CustomEvent('openModal', {
    detail: { type: 'projects' },
  });
  window.dispatchEvent(event);
};
(projects as any).description = 'See some of the projects I have created!';

// Blog command
export const blog = async () => {
  const prettyDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const rows = await runQuery(
    `SELECT id, title, description, tags, created_at FROM notion WHERE status = 'published' AND (tags IS NULL OR tags = '' OR tags = '[]' OR tags NOT LIKE '%metadata%') ORDER BY created_at DESC LIMIT 10`,
  );
  if (!rows.length) return 'No blog articles found.';
  // Each row: {id, title, description, tags, created_at}
  // tags is JSON string, parse if present
  return (
    'Title | Description | Tags | Date<br/>' +
    rows
      .map((row: any) => {
        const tags = row.tags ? JSON.parse(row.tags) : [];
        return [
          `<span class=\"blog-title\" data-article-id=\"${row.id}\">${row.title}</span>`,
          row.description,
          tags.length ? tags.join(', ') : '',
          prettyDate(row.created_at),
        ]
          .filter(Boolean)
          .join(' | ');
      })
      .join('<br/>') +
    '<br/><span class="blog-hint">Click a title to view the article.</span>'
  );
};
(blog as any).description = 'List all blog articles. Click a title to view.';

// Banner
export const banner = (_args?: string[]): string => {
  return `
               █████  ███   █████     ██                                     █████    
              ░░███  ░░░   ░░███     ███                                    ░░███     
  ██████    ███████  ████  ███████  ░░░   █████     █████ ███ █████  ██████  ░███████ 
 ░░░░░███  ███░░███ ░░███ ░░░███░        ███░░     ░░███ ░███░░███  ███░░███ ░███░░███
  ███████ ░███ ░███  ░███   ░███        ░░█████     ░███ ░███ ░███ ░███████  ░███ ░███
 ███░░███ ░███ ░███  ░███   ░███ ███     ░░░░███    ░░███████████  ░███░░░   ░███ ░███
░░████████░░████████ █████  ░░█████      ██████      ░░████░████   ░░██████  ████████ 
 ░░░░░░░░  ░░░░░░░░ ░░░░░    ░░░░░      ░░░░░░        ░░░░ ░░░░     ░░░░░░  ░░░░░░░░  
                                                                                      
                                                                                      
                                                                                      

Type 'help' to see the list of available commands.
Type 'clear' to clear the terminal.

Prefix your query with '!' to ask my AI assistant about anything I've written about!

For example, try \`!What has Aditya written about running?\`
`;
};
(banner as any).description = 'Display the welcome banner';

// AI Assistant command: !<query>
export const ai = async (args: string[]): Promise<string> => {
  const tracer = getTracer();
  const logger = getLogger();
  const question = args.join(' ').trim();

  if (!question) return 'Usage: !<your question>';

  const span = tracer.startSpan('ai_assistant_query', {
    attributes: {
      'ai.question.length': question.length,
      'ai.operation': 'knowledge_base_query',
    },
  });

  try {
    // Set span in context
    trace.setSpan(context.active(), span);

    logger.emit({
      severityNumber: SeverityNumber.INFO,
      severityText: 'INFO',
      body: 'AI assistant query started',
      attributes: {
        'ai.question.length': question.length,
        operation: 'ai_query',
      },
    });

    // Get fingerprint data
    const { fingerprint, confidence } = await getFingerprint();

    interface ApiRequestPayload {
      question: string;
      fingerprint: string;
      confidence: string;
    }

    const payload: ApiRequestPayload = {
      question,
      fingerprint,
      confidence: confidence.toString(),
    };

    span.setAttributes({
      'ai.fingerprint.confidence': confidence,
      'http.method': 'POST',
      'http.url': 'https://knowledge-base.aditbala.com/ask',
      'http.request.body.size': JSON.stringify(payload).length,
    });

    const httpStartTime = Date.now();
    const response = await axios.post(
      'https://knowledge-base.aditbala.com/ask',
      payload,
      { headers: { 'Content-Type': 'application/json' } },
    );
    const httpDuration = Date.now() - httpStartTime;

    span.setAttributes({
      'http.response.status_code': response.status,
      'http.response.body.size': JSON.stringify(response.data).length,
      'ai.response.has_answer': !!response.data?.answer,
    });

    // Record HTTP request metrics
    recordHttpRequest(
      'POST',
      'https://knowledge-base.aditbala.com/ask',
      response.status,
      httpDuration,
    );

    logger.emit({
      severityNumber: SeverityNumber.INFO,
      severityText: 'INFO',
      body: 'AI assistant query completed successfully',
      attributes: {
        'http.response.status_code': response.status,
        'ai.response.has_answer': !!response.data?.answer,
      },
    });

    // Try to extract a useful answer
    if (response.data?.answer) {
      span.setStatus({ code: SpanStatusCode.OK });
      return response.data.answer;
    }
    span.setStatus({ code: SpanStatusCode.OK });
    return JSON.stringify(response.data, null, 2);
  } catch (err: any) {
    const errorMessage = err?.response?.data?.error || err.message;
    const statusCode = err?.response?.status;

    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: errorMessage,
    });

    span.setAttributes({
      'error.type': err.name || 'UnknownError',
      'error.message': errorMessage,
      'http.response.status_code': statusCode || 0,
    });

    logger.emit({
      severityNumber: SeverityNumber.ERROR,
      severityText: 'ERROR',
      body: 'AI assistant query failed',
      attributes: {
        'error.type': err.name || 'UnknownError',
        'error.message': errorMessage,
        'http.response.status_code': statusCode || 0,
      },
    });

    return `Error querying knowledge base: ${errorMessage}`;
  } finally {
    span.end();
  }
};
(
  ai as any
).description = `Prefix your query with '!' to ask my AI assistant about anything I've written about!

ex. !What has Aditya written about running?`;

// Theme switcher command
export const theme = async (args: string[]): Promise<string> => {
  // Dynamically import the theme palette so it is only bundled once and remains tree-shakable
  const themesModule = await import('../../../themes.json');
  // .default for ESM / raw object for CJS
  const themes: Record<string, any> =
    (themesModule as any).default || themesModule;

  const availableThemes = Object.keys(themes);
  const requested = (args[0] || '').toLowerCase();
  const isLightMode = args.includes('-l');

  // If no theme requested or user asked for list, show available options
  if (!requested || requested === 'list') {
    return `Available themes: ${availableThemes.join(
      ', ',
    )}\n\nUse -l flag for light mode variant (e.g., theme dracula -l)`;
  }

  // Find case-insensitive match
  const matchedKey = availableThemes.find((t) => t.toLowerCase() === requested);
  if (!matchedKey) {
    return `Theme "${
      args[0]
    }" not found. Available themes: ${availableThemes.join(', ')}`;
  }

  const selectedTheme = themes[matchedKey];

  // Helper to generate CSS that overrides the existing Tailwind-generated classes
  const generateCss = (themeObj: any, forceLight: boolean = false): string => {
    let css = '';

    if (forceLight && themeObj.light) {
      // Force light mode - apply light colors regardless of system preference
      Object.entries(themeObj.light).forEach(([name, hex]) => {
        css += `\n.bg-light-${name}{background-color:${hex} !important;}\n`;
        css += `.text-light-${name}{color:${hex} !important;}\n`;
        css += `.border-light-${name}{border-color:${hex} !important;}\n`;
        // Override dark mode classes to use light colors
        css += `.dark\\:bg-dark-${name}{background-color:${hex} !important;}\n`;
        css += `.dark\\:text-dark-${name}{color:${hex} !important;}\n`;
        css += `.dark\\:border-dark-${name}{border-color:${hex} !important;}\n`;
      });
    } else {
      // Normal behavior - light colors for light mode, dark colors for dark mode
      if (themeObj.light) {
        Object.entries(themeObj.light).forEach(([name, hex]) => {
          css += `\n.bg-light-${name}{background-color:${hex} !important;}\n`;
          css += `.text-light-${name}{color:${hex} !important;}\n`;
          css += `.border-light-${name}{border-color:${hex} !important;}\n`;
        });
      }

      // Dark palette overrides (inside media-query so light mode is unaffected)
      if (themeObj.dark) {
        css += '\n@media (prefers-color-scheme: dark){';
        Object.entries(themeObj.dark).forEach(([name, hex]) => {
          css += `\n.dark\\:bg-dark-${name}{background-color:${hex} !important;}\n`;
          css += `.dark\\:text-dark-${name}{color:${hex} !important;}\n`;
          css += `.dark\\:border-dark-${name}{border-color:${hex} !important;}\n`;
        });
        css += '}';
      }
    }
    return css;
  };

  // Inject (or replace) the <style> block that contains the generated overrides
  const styleId = 'dynamic-theme';
  let styleEl = document.getElementById(styleId) as HTMLStyleElement;
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = styleId;
    document.head.appendChild(styleEl);
  }
  styleEl.innerHTML = generateCss(selectedTheme, isLightMode);

  // Persist the selection so it can be restored on reload (optional)
  try {
    localStorage.setItem('selectedTheme', matchedKey);
    localStorage.setItem('themeLightMode', isLightMode.toString());
  } catch (_e) {
    // Ignore if browser storage is unavailable (e.g., privacy mode)
  }

  const modeText = isLightMode ? ' (light mode)' : '';
  return `Theme changed to ${matchedKey}${modeText}.`;
};
(theme as any).description =
  "Change the site's colour theme. Usage: theme <theme_name> | theme <theme_name> -l";
