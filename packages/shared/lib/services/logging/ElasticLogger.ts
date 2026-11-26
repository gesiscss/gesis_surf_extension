/**
 * @fileoverview Elasticsearch logger for the browser extension.
 *
 * Sends structured log entries from the extension to Elasticsearch, complementing
 * Django's server-side `app+api` index with a client-side `app-extension` index.
 * This allows correlating what the extension sent vs what the server received,
 * and captures events Django cannot see (failed requests, client-side errors,
 * internal messaging, request/response bodies).
 *
 * Design principles:
 * - Never throws — logging failures are swallowed to avoid breaking the request flow.
 * - Fire-and-forget — log calls return `void` and don't block the caller.
 * - Level-filtered — entries below `minLevel` are dropped before sending.
 * - Context-aware — `device_id` and `user_id` are set once and included in every entry.
 */
import { LogLevel } from './types';
import type { LogEntry, ElasticLoggerConfig } from './types';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  [LogLevel.DEBUG]: 10,
  [LogLevel.INFO]: 20,
  [LogLevel.WARN]: 30,
  [LogLevel.ERROR]: 40,
};

/**
 * Sends structured log entries to Elasticsearch from the extension.
 *
 * Complements Django's `app+api` index (server-side) with an `app-extension`
 * index (client-side) so you can correlate what the extension sent vs what
 * the server received. Captures events Django cannot see: failed requests
 * (network errors, CORS blocks), request/response bodies, client-side
 * decision context, and internal extension messaging.
 *
 * @example
 * const logger = new ElasticLogger({ endpoint: 'https://elastic.example.com/ingest' });
 * logger.setDeviceId('aaa-111');
 * logger.info('Login attempt', { endpoint: '/user/token/', method: 'POST' });
 * logger.error('Login failed', { response_status: 400, error: 'bad credentials' });
 */
export class ElasticLogger {
  private readonly endpoint: string;
  private readonly index: string;
  private minLevel: LogLevel;
  private readonly maxBodyLength: number;
  private deviceId?: string;
  private userId?: string;

  constructor(config: ElasticLoggerConfig) {
    this.endpoint = config.endpoint;
    this.index = config.index ?? 'app-extension';
    this.minLevel = config.minLevel ?? LogLevel.INFO;
    this.maxBodyLength = config.maxBodyLength ?? 1000;
  }

  /**
   * Sets the device id to include in every subsequent log entry.
   * Should be called once after `device_id` is generated/loaded.
   */
  setDeviceId(deviceId: string): void {
    this.deviceId = deviceId;
  }

  /**
   * Sets the user id to include in every subsequent log entry.
   * Should be called after authentication succeeds.
   */
  setUserId(userId: string): void {
    this.userId = userId;
  }

  /**
   * Updates the minimum level at runtime.
   * Useful for raising to WARN in production or lowering to DEBUG in staging.
   */
  setMinLevel(level: LogLevel): void {
    this.minLevel = level;
  }

  /** Logs a debug message. Filtered out by default (minLevel = INFO). */
  debug(message: string, context: Record<string, unknown> = {}): void {
    this.log(LogLevel.DEBUG, message, context);
  }

  /** Logs an info message. */
  info(message: string, context: Record<string, unknown> = {}): void {
    this.log(LogLevel.INFO, message, context);
  }

  /** Logs a warning. */
  warn(message: string, context: Record<string, unknown> = {}): void {
    this.log(LogLevel.WARN, message, context);
  }

  /** Logs an error. */
  error(message: string, context: Record<string, unknown> = {}): void {
    this.log(LogLevel.ERROR, message, context);
  }

  /**
   * Convenience: logs a request about to be sent.
   * Call this right before `fetch()` in the API client.
   */
  logRequest(endpoint: string, method: string, body: BodyInit | null): void {
    this.info(`→ ${method} ${endpoint}`, {
      endpoint,
      method,
      request_body: body ? this.truncateBody(String(body)) : undefined,
    });
  }

  /**
   * Convenience: logs a response received.
   * Call this right after `fetch()` resolves.
   * Uses WARN level for non-ok responses so failures are visible in Kibana.
   */
  logResponse(endpoint: string, method: string, status: number, ok: boolean): void {
    const level = ok ? LogLevel.INFO : LogLevel.WARN;
    this.log(level, `← ${status} ${method} ${endpoint}`, {
      endpoint,
      method,
      response_status: status,
      response_ok: ok,
    });
  }

  /**
   * Convenience: logs a client-side error where no request was made
   * (e.g., token not found, service worker killed, internal error).
   */
  logClientError(message: string, context: Record<string, unknown> = {}): void {
    this.error(message, context);
  }

  /**
   * Core logging method. Builds the entry, applies level filtering, and
   * sends to Elasticsearch fire-and-forget. Never throws.
   */
  private log(level: LogLevel, message: string, context: Record<string, unknown>): void {
    // Level filter — drop entries below the minimum
    if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[this.minLevel]) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      source: this.index,
      message,
      device_id: this.deviceId,
      user_id: this.userId,
      ...context,
    };

    // Fire-and-forget — don't await, don't throw
    void this.send(entry).catch(err => {
      // Logging must never break the actual request flow
      console.error('[ElasticLogger] Failed to send log:', err);
    });
  }

  /**
   * Sends a log entry to Elasticsearch. Silently skips if no endpoint is
   * configured. Recursion-safe: the logging request itself is not logged.
   */
  private async send(entry: LogEntry): Promise<void> {
    if (!this.endpoint) return;

    // Don't log the logging request to itself (avoid infinite recursion)
    // The fetch here intentionally does NOT go through apiRequest.
    await fetch(this.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    });
  }

  /** Truncates a request body to the configured maximum length. */
  private truncateBody(body: string): string {
    if (body.length <= this.maxBodyLength) return body;
    return `${body.slice(0, this.maxBodyLength)}...[truncated]`;
  }
}
