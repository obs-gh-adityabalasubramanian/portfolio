import initSqlJs, { Database } from 'sql.js';
import { trace, context, SpanStatusCode } from '@opentelemetry/api';
import { getTracer, getLogger } from '../../otel';
import { SeverityNumber } from '@opentelemetry/api-logs';
import { recordDatabaseQuery } from './metrics';

// This promise will cache the loaded/initialized database so we only fetch and parse it once.
let dbPromise: Promise<Database> | null = null;

/**
 * Loads the SQLite database that lives in `public/notion.db` using sql.js.
 * The underlying WASM file must be available at `/sql-wasm.wasm`.
 */
export const getDatabase = async (): Promise<Database> => {
  if (dbPromise) return dbPromise;

  const tracer = getTracer();
  const logger = getLogger();

  dbPromise = (async () => {
    const span = tracer.startSpan('sqlite_database_init', {
      attributes: {
        'db.system': 'sqlite',
        'db.operation': 'init',
        'db.name': 'notion.db',
      },
    });

    try {
      // Set span in context
      trace.setSpan(context.active(), span);

      logger.emit({
        severityNumber: SeverityNumber.INFO,
        severityText: 'INFO',
        body: 'Initializing SQLite database',
        attributes: {
          'db.system': 'sqlite',
          'db.name': 'notion.db',
        },
      });

      // Initialise sql.js and point it to the wasm file served from the public folder.
      const SQL = await initSqlJs({
        locateFile: (file) => `/${file}`,
      });

      // Fetch the bundled database file.
      const response = await fetch('/notion.db');
      if (!response.ok) {
        throw new Error(
          `Could not fetch /notion.db – status ${response.status}`,
        );
      }
      const buffer = await response.arrayBuffer();

      span.setAttributes({
        'db.file.size': buffer.byteLength,
        'http.response.status_code': response.status,
      });

      // Create the database instance from the binary data.
      const database = new SQL.Database(new Uint8Array(buffer));

      logger.emit({
        severityNumber: SeverityNumber.INFO,
        severityText: 'INFO',
        body: 'SQLite database initialized successfully',
        attributes: {
          'db.file.size': buffer.byteLength,
          'http.response.status_code': response.status,
        },
      });

      span.setStatus({ code: SpanStatusCode.OK });
      return database;
    } catch (error) {
      const errorMessage = (error as Error).message;

      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: errorMessage,
      });

      span.setAttributes({
        'error.type': (error as Error).name || 'DatabaseInitError',
        'error.message': errorMessage,
      });

      logger.emit({
        severityNumber: SeverityNumber.ERROR,
        severityText: 'ERROR',
        body: 'Failed to initialize SQLite database',
        attributes: {
          'error.type': (error as Error).name || 'DatabaseInitError',
          'error.message': errorMessage,
        },
      });

      throw error;
    } finally {
      span.end();
    }
  })();

  return dbPromise;
};

/**
 * Run a parameterized query and return results as array of objects.
 * @param sql SQL query string
 * @param params Optional parameters for the query
 */
export async function runQuery<T = any>(
  sql: string,
  params?: any[],
): Promise<T[]> {
  const tracer = getTracer();
  const logger = getLogger();
  const startTime = Date.now();

  const span = tracer.startSpan('sqlite_query', {
    attributes: {
      'db.system': 'sqlite',
      'db.operation': 'query',
      'db.statement': sql.substring(0, 100), // Truncate long queries
      'db.params.count': params?.length || 0,
    },
  });

  try {
    // Set span in context
    trace.setSpan(context.active(), span);

    logger.emit({
      severityNumber: SeverityNumber.DEBUG,
      severityText: 'DEBUG',
      body: 'Executing SQLite query',
      attributes: {
        'db.statement': sql.substring(0, 100),
        'db.params.count': params?.length || 0,
      },
    });

    const db = await getDatabase();
    const stmt = db.prepare(sql);

    if (params) {
      stmt.bind(params);
      span.setAttributes({
        'db.params': JSON.stringify(params).substring(0, 200), // Truncate long params
      });
    }

    const rows: T[] = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject() as T);
    }
    stmt.free();

    span.setAttributes({
      'db.rows.count': rows.length,
    });

    logger.emit({
      severityNumber: SeverityNumber.DEBUG,
      severityText: 'DEBUG',
      body: 'SQLite query completed successfully',
      attributes: {
        'db.rows.count': rows.length,
      },
    });

    // Record successful database query metrics
    const duration = Date.now() - startTime;
    recordDatabaseQuery('query', duration, rows.length, true);

    span.setStatus({ code: SpanStatusCode.OK });
    return rows;
  } catch (error) {
    const errorMessage = (error as Error).message;

    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: errorMessage,
    });

    span.setAttributes({
      'error.type': (error as Error).name || 'SQLiteQueryError',
      'error.message': errorMessage,
    });

    logger.emit({
      severityNumber: SeverityNumber.ERROR,
      severityText: 'ERROR',
      body: 'SQLite query failed',
      attributes: {
        'error.type': (error as Error).name || 'SQLiteQueryError',
        'error.message': errorMessage,
        'db.statement': sql.substring(0, 100),
      },
    });

    // Record failed database query metrics
    const duration = Date.now() - startTime;
    recordDatabaseQuery('query', duration, 0, false);

    throw error;
  } finally {
    span.end();
  }
}
