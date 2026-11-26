/**
 * @fileoverview Types for the extension logging system.
 *
 * Log levels are ordered by severity. The {@link ElasticLogger} only sends
 * entries at or above its configured `minLevel` to Elasticsearch.
 */

/**
 * Log levels, ordered by severity (DEBUG < INFO < WARN < ERROR).
 * Mirrors common logging conventions (Python logging, syslog, etc.).
 */
export enum LogLevel {
  /** Fine-grained diagnostic info. Filtered out by default (minLevel = INFO). */
  DEBUG = 'debug',
  /** General informational messages (request sent, response received). */
  INFO = 'info',
  /** Warnings — non-ok responses, degraded behavior, recoverable issues. */
  WARN = 'warn',
  /** Errors — failures that prevent normal operation. */
  ERROR = 'error',
}

/**
 * A single log entry sent to Elasticsearch.
 * Mirrors the structure Django's `app+api` index uses, but tagged with
 * `source: 'app-extension'` so client-side and server-side logs can be
 * distinguished in Kibana.
 */
export interface LogEntry {
  /** ISO 8601 timestamp. */
  timestamp: string;
  /** Log level (debug/info/warn/error). */
  level: LogLevel;
  /** Identifies the log source — always 'app-extension' for client-side logs. */
  source: string;
  /** Human-readable message. */
  message: string;
  /** API endpoint, if this log is about an HTTP request. */
  endpoint?: string;
  /** HTTP method, if applicable. */
  method?: string;
  /** Request body (truncated to 1000 chars), if applicable. */
  request_body?: string;
  /** HTTP response status code, if applicable. */
  response_status?: number;
  /** Whether the response was ok (status 2xx), if applicable. */
  response_ok?: boolean;
  /** Error message, if this is an error log. */
  error?: string;
  /** Device id — correlates with the `X-Device-Id` header in Django's logs. */
  device_id?: string;
  /** User id — correlates with Django's user UUID. */
  user_id?: string;
  /** Additional structured context. */
  context?: Record<string, unknown>;
}

/**
 * Configuration for the {@link ElasticLogger}.
 */
export interface ElasticLoggerConfig {
  /** Elasticsearch ingest endpoint URL. */
  endpoint: string;
  /** Index name / source tag. Defaults to 'app-extension'. */
  index?: string;
  /** Minimum level to send. Entries below this are dropped. Defaults to INFO. */
  minLevel?: LogLevel;
  /** Maximum length of request_body before truncation. Defaults to 1000. */
  maxBodyLength?: number;
}
