import { metrics } from '@opentelemetry/api';

// Metrics utility for the portfolio terminal application
export class PortfolioMetrics {
  private meter: any;
  private commandCounter: any;
  private commandDuration: any;
  private aiQueryCounter: any;
  private aiQueryDuration: any;
  private errorCounter: any;

  constructor() {
    // Initialize meter based on environment
    if (typeof window !== 'undefined') {
      // Client-side - we'll use a simple meter for now
      this.meter = metrics.getMeter('portfolio-terminal-client');
    } else {
      // Server-side
      this.meter = metrics.getMeter('portfolio-terminal-server');
    }

    this.initializeMetrics();
  }

  private initializeMetrics() {
    // Command execution metrics
    this.commandCounter = this.meter.createCounter('terminal_commands_total', {
      description: 'Total number of terminal commands executed',
    });

    this.commandDuration = this.meter.createHistogram(
      'terminal_command_duration_ms',
      {
        description: 'Duration of terminal command execution in milliseconds',
      },
    );

    // AI query metrics
    this.aiQueryCounter = this.meter.createCounter('ai_queries_total', {
      description: 'Total number of AI queries made',
    });

    this.aiQueryDuration = this.meter.createHistogram('ai_query_duration_ms', {
      description: 'Duration of AI query processing in milliseconds',
    });

    // Error metrics
    this.errorCounter = this.meter.createCounter('terminal_errors_total', {
      description: 'Total number of errors in terminal operations',
    });
  }

  // Record command execution
  recordCommand(
    commandName: string,
    duration: number,
    success: boolean = true,
  ) {
    const labels = {
      command: commandName,
      success: success.toString(),
    };

    this.commandCounter.add(1, labels);
    this.commandDuration.record(duration, labels);

    if (!success) {
      this.errorCounter.add(1, {
        operation: 'command_execution',
        command: commandName,
      });
    }
  }

  // Record AI query
  recordAiQuery(
    duration: number,
    success: boolean = true,
    hasAnswer: boolean = false,
  ) {
    const labels = {
      success: success.toString(),
      has_answer: hasAnswer.toString(),
    };

    this.aiQueryCounter.add(1, labels);
    this.aiQueryDuration.record(duration, labels);

    if (!success) {
      this.errorCounter.add(1, {
        operation: 'ai_query',
      });
    }
  }

  // Record general errors
  recordError(operation: string, errorType: string = 'unknown') {
    this.errorCounter.add(1, {
      operation,
      error_type: errorType,
    });
  }

  // Create a timer for measuring durations
  createTimer() {
    const startTime = Date.now();
    return {
      end: () => Date.now() - startTime,
    };
  }
}

// Create a singleton instance
export const portfolioMetrics = new PortfolioMetrics();
