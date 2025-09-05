import { trace, context } from '@opentelemetry/api';
import { SeverityNumber } from '@opentelemetry/api-logs';

// Logger utility that includes trace correlation
export class StructuredLogger {
  private serviceName: string;
  private logger: any;

  constructor(serviceName: string) {
    this.serviceName = serviceName;

    // Import logger based on environment
    if (typeof window !== 'undefined') {
      // Client-side
      import('../otel-client').then(({ logger }) => {
        this.logger = logger;
      });
    } else {
      // Server-side
      import('../otel-server').then(({ logger }) => {
        this.logger = logger;
      });
    }
  }

  private getTraceContext() {
    const activeSpan = trace.getActiveSpan();
    if (activeSpan) {
      const spanContext = activeSpan.spanContext();
      return {
        traceId: spanContext.traceId,
        spanId: spanContext.spanId,
        traceFlags: spanContext.traceFlags,
      };
    }
    return {};
  }

  private log(
    level: SeverityNumber,
    levelText: string,
    message: string,
    attributes: Record<string, any> = {},
  ) {
    if (!this.logger) {
      // Fallback to console if logger not ready
      // eslint-disable-next-line no-console
      console.log(`[${levelText}] ${message}`, attributes);
      return;
    }

    const traceContext = this.getTraceContext();

    this.logger.emit({
      severityNumber: level,
      severityText: levelText,
      body: message,
      attributes: {
        service: this.serviceName,
        ...traceContext,
        ...attributes,
        timestamp: new Date().toISOString(),
      },
    });
  }

  info(message: string, attributes?: Record<string, any>) {
    this.log(SeverityNumber.INFO, 'INFO', message, attributes);
  }

  warn(message: string, attributes?: Record<string, any>) {
    this.log(SeverityNumber.WARN, 'WARN', message, attributes);
  }

  error(message: string, error?: Error, attributes?: Record<string, any>) {
    const errorAttributes = error
      ? {
          'error.name': error.name,
          'error.message': error.message,
          'error.stack': error.stack,
        }
      : {};

    this.log(SeverityNumber.ERROR, 'ERROR', message, {
      ...errorAttributes,
      ...attributes,
    });
  }

  debug(message: string, attributes?: Record<string, any>) {
    this.log(SeverityNumber.DEBUG, 'DEBUG', message, attributes);
  }
}

// Create default loggers for different parts of the application
export const shellLogger = new StructuredLogger('portfolio-terminal-shell');
export const commandLogger = new StructuredLogger(
  'portfolio-terminal-commands',
);
export const appLogger = new StructuredLogger('portfolio-terminal-app');
