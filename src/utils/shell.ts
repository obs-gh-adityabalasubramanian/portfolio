import React from 'react';
import * as bin from './bin';
import { trace, context, SpanStatusCode } from '@opentelemetry/api';
import { getTracer, getLogger } from '../../otel';
import { SeverityNumber } from '@opentelemetry/api-logs';
import { recordCommandExecution, recordAiQuery } from './metrics';

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
  const tracer = getTracer();
  const logger = getLogger();
  const args = command.split(' ');
  args[0] = args[0].toLowerCase();
  const startTime = Date.now();

  const span = tracer.startSpan('shell_command_execution', {
    attributes: {
      'shell.command': command,
      'shell.command.name': args[0] || '',
      'shell.command.args.count': args.length - 1,
      'shell.command.type': command.trim().startsWith('!')
        ? 'ai_query'
        : 'regular',
    },
  });

  try {
    // Set span in context
    trace.setSpan(context.active(), span);

    logger.emit({
      severityNumber: SeverityNumber.INFO,
      severityText: 'INFO',
      body: 'Shell command execution started',
      attributes: {
        'shell.command': command,
        'shell.command.name': args[0] || '',
        'shell.command.args.count': args.length - 1,
      },
    });

    // Handle AI assistant queries starting with '!'
    if (command.trim().startsWith('!')) {
      span.setAttributes({
        'shell.command.type': 'ai_query',
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
        const aiStartTime = Date.now();
        const answer = await ai([command.slice(1).trim()]);
        const aiDuration = Date.now() - aiStartTime;

        clearInterval(interval);
        updateLastEntry({ command: '', output: answer });

        span.setAttributes({
          'ai.response.length': answer.length,
        });

        logger.emit({
          severityNumber: SeverityNumber.INFO,
          severityText: 'INFO',
          body: 'AI query completed successfully',
          attributes: {
            'ai.response.length': answer.length,
          },
        });

        // Record AI query metrics
        recordAiQuery(aiDuration, true, !!answer);

        span.setStatus({ code: SpanStatusCode.OK });
      } catch (e: any) {
        const aiDuration = Date.now() - (Date.now() - (Date.now() - startTime)); // Approximate duration

        clearInterval(interval);
        updateLastEntry({ command: '', output: `Error: ${e.message}` });

        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: e.message,
        });

        span.setAttributes({
          'error.type': e.name || 'AIQueryError',
          'error.message': e.message,
        });

        logger.emit({
          severityNumber: SeverityNumber.ERROR,
          severityText: 'ERROR',
          body: 'AI query failed',
          attributes: {
            'error.type': e.name || 'AIQueryError',
            'error.message': e.message,
          },
        });

        // Record AI query error metrics
        recordAiQuery(aiDuration, false);
      }

      setCommand('');
      return;
    }

    // Handle regular commands
    if (args[0] === 'clear') {
      span.setAttributes({
        'shell.command.type': 'clear',
      });

      logger.emit({
        severityNumber: SeverityNumber.INFO,
        severityText: 'INFO',
        body: 'Clear command executed',
      });

      clearHistory();
      span.setStatus({ code: SpanStatusCode.OK });

      // Record clear command metrics
      recordCommandExecution('clear', Date.now() - startTime, true);
    } else if (command === '') {
      span.setAttributes({
        'shell.command.type': 'empty',
      });

      setHistory('');
      span.setStatus({ code: SpanStatusCode.OK });

      // Record empty command metrics
      recordCommandExecution('empty', Date.now() - startTime, true);
    } else if (Object.keys(bin).indexOf(args[0]) === -1) {
      span.setAttributes({
        'shell.command.type': 'unknown',
        'shell.command.found': false,
      });

      logger.emit({
        severityNumber: SeverityNumber.WARN,
        severityText: 'WARN',
        body: 'Unknown command executed',
        attributes: {
          'shell.command.name': args[0],
        },
      });

      setHistory(
        `shell: command not found: ${args[0]}. Try 'help' to get started.`,
      );
      span.setStatus({ code: SpanStatusCode.OK }); // Not an error, just unknown command

      // Record unknown command metrics
      recordCommandExecution(
        args[0] || 'unknown',
        Date.now() - startTime,
        false,
      );
    } else {
      span.setAttributes({
        'shell.command.type': 'builtin',
        'shell.command.found': true,
      });

      try {
        const output = await (bin as any)[args[0]](args.slice(1));
        setHistory(output);

        span.setAttributes({
          'shell.command.output.length': output?.length || 0,
        });

        logger.emit({
          severityNumber: SeverityNumber.INFO,
          severityText: 'INFO',
          body: 'Built-in command executed successfully',
          attributes: {
            'shell.command.name': args[0],
            'shell.command.output.length': output?.length || 0,
          },
        });

        span.setStatus({ code: SpanStatusCode.OK });

        // Record successful command execution metrics
        recordCommandExecution(args[0], Date.now() - startTime, true);
      } catch (error) {
        const errorMessage = (error as Error).message;

        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: errorMessage,
        });

        span.setAttributes({
          'error.type': (error as Error).name || 'CommandExecutionError',
          'error.message': errorMessage,
        });

        logger.emit({
          severityNumber: SeverityNumber.ERROR,
          severityText: 'ERROR',
          body: 'Built-in command execution failed',
          attributes: {
            'shell.command.name': args[0],
            'error.type': (error as Error).name || 'CommandExecutionError',
            'error.message': errorMessage,
          },
        });

        setHistory(`Error executing command: ${errorMessage}`);

        // Record failed command execution metrics
        recordCommandExecution(args[0], Date.now() - startTime, false);
      }
    }

    setCommand('');
  } catch (error) {
    const errorMessage = (error as Error).message;

    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: errorMessage,
    });

    span.setAttributes({
      'error.type': (error as Error).name || 'ShellError',
      'error.message': errorMessage,
    });

    logger.emit({
      severityNumber: SeverityNumber.ERROR,
      severityText: 'ERROR',
      body: 'Shell command execution failed',
      attributes: {
        'error.type': (error as Error).name || 'ShellError',
        'error.message': errorMessage,
      },
    });

    setCommand('');
    throw error;
  } finally {
    span.end();
  }
};
