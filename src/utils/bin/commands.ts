// List of commands that do not require API calls
import { getDatabase, runQuery } from '../sqlite';
import * as bin from './index';
import axios from 'axios';
import { getFingerprint } from '../fingerprint';
import { trace, context, SpanStatusCode } from '@opentelemetry/api';
import { commandLogger } from '../logger';
import { portfolioMetrics } from '../metrics';

// Get tracer for command operations
const tracer = trace.getTracer('portfolio-terminal-commands');

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
  const span = tracer.startSpan('ai.query', {
    attributes: {
      'ai.question_args_count': args.length,
    },
  });

  const timer = portfolioMetrics.createTimer();
  const question = args.join(' ').trim();
  let fingerprint = '';
  let confidence = 0;

  try {
    if (!question) {
      span.setAttributes({ 'ai.error': 'empty_question' });
      span.end();
      return 'Usage: !<your question>';
    }

    span.setAttributes({
      'ai.question': question,
      'ai.question_length': question.length,
    });

    commandLogger.info('AI query started', {
      'ai.question': question,
      'ai.question_length': question.length,
    });

    // Get fingerprint data
    const fingerprintData = await getFingerprint();
    fingerprint = fingerprintData.fingerprint;
    confidence = fingerprintData.confidence;

    span.setAttributes({
      'user.fingerprint': fingerprint,
      'user.confidence': confidence,
    });

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

    const response = await axios.post(
      'https://knowledge-base.aditbala.com/ask',
      payload,
      { headers: { 'Content-Type': 'application/json' } },
    );

    span.setAttributes({
      'http.status_code': response.status,
      'ai.response_has_answer': !!response.data?.answer,
    });

    // Try to extract a useful answer
    if (response.data?.answer) {
      const duration = timer.end();
      span.setAttributes({
        'ai.answer_length': response.data.answer.length,
        'ai.success': true,
      });
      commandLogger.info('AI query completed successfully', {
        'ai.question': question,
        'ai.answer_length': response.data.answer.length,
        'user.fingerprint': fingerprint,
      });
      portfolioMetrics.recordAiQuery(duration, true, true);
      span.end();
      return response.data.answer;
    }

    const jsonResponse = JSON.stringify(response.data, null, 2);
    const duration = timer.end();
    span.setAttributes({
      'ai.response_length': jsonResponse.length,
      'ai.success': true,
    });
    commandLogger.info('AI query completed with JSON response', {
      'ai.question': question,
      'ai.response_length': jsonResponse.length,
      'user.fingerprint': fingerprint,
    });
    portfolioMetrics.recordAiQuery(duration, true, false);
    span.end();
    return jsonResponse;
  } catch (err: any) {
    const duration = timer.end();
    span.recordException(err);
    span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
    span.setAttributes({
      'ai.success': false,
      'error.message': err.message,
      'error.status_code': err?.response?.status,
    });
    commandLogger.error('AI query failed', err, {
      'ai.question': question,
      'user.fingerprint': fingerprint,
      'error.status_code': err?.response?.status,
    });
    portfolioMetrics.recordAiQuery(duration, false, false);
    portfolioMetrics.recordError('ai_query', err.name);
    span.end();

    return `Error querying knowledge base: ${
      err?.response?.data?.error || err.message
    }`;
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
