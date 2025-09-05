import React from 'react';
import * as bin from './bin';
import { trace, context, SpanStatusCode } from '@opentelemetry/api';
import { shellLogger } from './logger';
import { portfolioMetrics } from './metrics';

// Get tracer for shell operations
const tracer = trace.getTracer('portfolio-terminal-shell');

const aiPlaceholders = [
  "peering into Aditya's deepest darkest secrets...",
  "consulting Aditya's alter ego...",
  'cooking up lies about my creator...',
  "paging through Aditya's brain dump...",
  "intruding into Aditya's intrusive thoughts...",
];
const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export const shell = async (
  command: string,
  setHistory: (
    output: string,
    usernameOverride?: string,
    commandOverride?: string,
  ) => void,
  updateLastEntry: (payload: any) => void,
  clearHistory: () => void,
  setCommand: React.Dispatch<React.SetStateAction<string>>,
) => {
  const span = tracer.startSpan('shell.execute_command', {
    attributes: {
      'command.input': command,
      'command.length': command.length,
    },
  });

  const timer = portfolioMetrics.createTimer();

  shellLogger.info('Command execution started', {
    'command.input': command,
    'command.length': command.length,
  });

  try {
    const args = command.split(' ');
    args[0] = args[0].toLowerCase();

    span.setAttributes({
      'command.name': args[0],
      'command.args_count': args.length - 1,
    });

    // Handle AI assistant queries starting with '!'
    if (command.trim().startsWith('!')) {
      span.setAttributes({
        'command.type': 'ai_query',
        'ai.query': command.slice(1).trim(),
      });

      const { ai } = await import('./bin');

      // 1) Record the user's command line in history (guest user)
      setHistory('', undefined, command);

      // 2) Add AI placeholder line
      let placeholderIndex = 0;
      let spinnerIndex = 0;
      const spinner = spinnerFrames[spinnerIndex];
      setHistory('', 'ai', `${spinner} ${aiPlaceholders[placeholderIndex]}`);

      // Rotate spinner (and occasionally placeholder) while waiting
      const interval = setInterval(() => {
        spinnerIndex = (spinnerIndex + 1) % spinnerFrames.length;
        if (spinnerIndex % 4 === 0) {
          placeholderIndex = (placeholderIndex + 1) % aiPlaceholders.length;
        }
        const frame = spinnerFrames[spinnerIndex];
        const text = aiPlaceholders[placeholderIndex];
        updateLastEntry({ command: `${frame} ${text}` });
      }, 200);

      try {
        const answer = await ai([command.slice(1).trim()]);
        clearInterval(interval);
        updateLastEntry({ command: '', output: answer });
        span.setAttributes({
          'ai.response_length': answer.length,
          'ai.success': true,
        });
        shellLogger.info('AI query completed successfully', {
          'ai.query': command.slice(1).trim(),
          'ai.response_length': answer.length,
        });
      } catch (e: any) {
        clearInterval(interval);
        updateLastEntry({ command: '', output: `Error: ${e.message}` });
        span.recordException(e);
        span.setStatus({ code: SpanStatusCode.ERROR, message: e.message });
        span.setAttributes({
          'ai.success': false,
          'error.message': e.message,
        });
        shellLogger.error('AI query failed', e, {
          'ai.query': command.slice(1).trim(),
        });
      }

      setCommand('');
      span.end();
      return;
    }

    if (args[0] === 'clear') {
      span.setAttributes({ 'command.type': 'clear' });
      shellLogger.info('Clear command executed');
      clearHistory();
      portfolioMetrics.recordCommand('clear', timer.end(), true);
    } else if (command === '') {
      span.setAttributes({ 'command.type': 'empty' });
      shellLogger.debug('Empty command executed');
      setHistory('');
      portfolioMetrics.recordCommand('empty', timer.end(), true);
    } else if (Object.keys(bin).indexOf(args[0]) === -1) {
      span.setAttributes({
        'command.type': 'unknown',
        'command.found': false,
      });
      shellLogger.warn('Unknown command attempted', {
        'command.name': args[0],
      });
      setHistory(
        `shell: command not found: ${args[0]}. Try 'help' to get started.`,
      );
      portfolioMetrics.recordCommand(args[0], timer.end(), false);
    } else {
      span.setAttributes({
        'command.type': 'builtin',
        'command.found': true,
      });
      shellLogger.info('Executing builtin command', {
        'command.name': args[0],
        'command.args_count': args.length - 1,
      });
      const output = await (bin as any)[args[0]](args.slice(1));
      setHistory(output);
      span.setAttributes({
        'command.output_length': output.length,
      });
      shellLogger.info('Builtin command completed', {
        'command.name': args[0],
        'command.output_length': output.length,
      });
      portfolioMetrics.recordCommand(args[0], timer.end(), true);
    }

    setCommand('');
    span.end();
  } catch (error: any) {
    const duration = timer.end();
    const commandName = command.split(' ')[0].toLowerCase();

    span.recordException(error);
    span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
    shellLogger.error('Command execution failed', error, {
      'command.input': command,
    });
    portfolioMetrics.recordCommand(commandName, duration, false);
    portfolioMetrics.recordError('command_execution', error.name);
    span.end();
    throw error;
  }
};
