import { getMeter } from '../../otel';

// Initialize metrics
const meter = getMeter();

// Command execution metrics
export const commandExecutionCounter = meter.createCounter(
  'portfolio_command_executions_total',
  {
    description: 'Total number of command executions',
  },
);

export const commandExecutionDuration = meter.createHistogram(
  'portfolio_command_execution_duration_ms',
  {
    description: 'Duration of command executions in milliseconds',
    unit: 'ms',
  },
);

export const commandErrorCounter = meter.createCounter(
  'portfolio_command_errors_total',
  {
    description: 'Total number of command execution errors',
  },
);

// AI assistant metrics
export const aiQueryCounter = meter.createCounter(
  'portfolio_ai_queries_total',
  {
    description: 'Total number of AI assistant queries',
  },
);

export const aiQueryDuration = meter.createHistogram(
  'portfolio_ai_query_duration_ms',
  {
    description: 'Duration of AI assistant queries in milliseconds',
    unit: 'ms',
  },
);

export const aiQueryErrorCounter = meter.createCounter(
  'portfolio_ai_query_errors_total',
  {
    description: 'Total number of AI query errors',
  },
);

// Database metrics
export const databaseQueryCounter = meter.createCounter(
  'portfolio_database_queries_total',
  {
    description: 'Total number of database queries',
  },
);

export const databaseQueryDuration = meter.createHistogram(
  'portfolio_database_query_duration_ms',
  {
    description: 'Duration of database queries in milliseconds',
    unit: 'ms',
  },
);

export const databaseErrorCounter = meter.createCounter(
  'portfolio_database_errors_total',
  {
    description: 'Total number of database errors',
  },
);

export const databaseRowsReturned = meter.createHistogram(
  'portfolio_database_rows_returned',
  {
    description: 'Number of rows returned by database queries',
  },
);

// HTTP request metrics
export const httpRequestCounter = meter.createCounter(
  'portfolio_http_requests_total',
  {
    description: 'Total number of HTTP requests',
  },
);

export const httpRequestDuration = meter.createHistogram(
  'portfolio_http_request_duration_ms',
  {
    description: 'Duration of HTTP requests in milliseconds',
    unit: 'ms',
  },
);

export const httpErrorCounter = meter.createCounter(
  'portfolio_http_errors_total',
  {
    description: 'Total number of HTTP errors',
  },
);

// Application metrics
export const pageViewCounter = meter.createCounter(
  'portfolio_page_views_total',
  {
    description: 'Total number of page views',
  },
);

export const sessionDuration = meter.createHistogram(
  'portfolio_session_duration_ms',
  {
    description: 'Duration of user sessions in milliseconds',
    unit: 'ms',
  },
);

// Utility functions for recording metrics
export const recordCommandExecution = (
  commandName: string,
  duration: number,
  success: boolean,
) => {
  const labels = {
    command: commandName,
    status: success ? 'success' : 'error',
  };

  commandExecutionCounter.add(1, labels);
  commandExecutionDuration.record(duration, labels);

  if (!success) {
    commandErrorCounter.add(1, { command: commandName });
  }
};

export const recordAiQuery = (
  duration: number,
  success: boolean,
  hasAnswer?: boolean,
) => {
  const labels = {
    status: success ? 'success' : 'error',
    ...(hasAnswer !== undefined && { has_answer: hasAnswer.toString() }),
  };

  aiQueryCounter.add(1, labels);
  aiQueryDuration.record(duration, labels);

  if (!success) {
    aiQueryErrorCounter.add(1);
  }
};

export const recordDatabaseQuery = (
  operation: string,
  duration: number,
  rowCount: number,
  success: boolean,
) => {
  const labels = { operation, status: success ? 'success' : 'error' };

  databaseQueryCounter.add(1, labels);
  databaseQueryDuration.record(duration, labels);

  if (success) {
    databaseRowsReturned.record(rowCount, { operation });
  } else {
    databaseErrorCounter.add(1, { operation });
  }
};

export const recordHttpRequest = (
  method: string,
  url: string,
  statusCode: number,
  duration: number,
) => {
  const success = statusCode >= 200 && statusCode < 400;
  const labels = {
    method,
    url: new URL(url).hostname, // Only record hostname for privacy
    status_code: statusCode.toString(),
    status: success ? 'success' : 'error',
  };

  httpRequestCounter.add(1, labels);
  httpRequestDuration.record(duration, labels);

  if (!success) {
    httpErrorCounter.add(1, { method, url: new URL(url).hostname });
  }
};

export const recordPageView = (page: string) => {
  pageViewCounter.add(1, { page });
};

export const recordSessionDuration = (duration: number) => {
  sessionDuration.record(duration);
};
