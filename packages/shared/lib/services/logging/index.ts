/**
 * @fileoverview Logging exports for the shared package.
 *
 * The {@link ElasticLogger} class sends structured log entries from the
 * extension to Elasticsearch, complementing Django's server-side `app+api`
 * index with a client-side `app-extension` index.
 */
export { ElasticLogger } from './ElasticLogger';
export { LogLevel } from './types';
export type { LogEntry, ElasticLoggerConfig } from './types';
