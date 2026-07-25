/**
 * @fileoverview ElasticLogger singleton for the chrome extension.
 *
 * Extracted from background/index.ts to avoid circular dependencies:
 * background imports AuthService, and AuthService imports the logger.
 * If the logger lived in background/index.ts, importing it from AuthService
 * would trigger the entire background script to load (including AuthService
 * construction), causing a circular dependency.
 *
 * This module is safe to import from anywhere — it only creates the
 * ElasticLogger instance, it does not import any services.
 */
import { API_CONFIG } from '@chrome-extension-boilerplate/hmr/lib/constant';
import { ElasticLogger, LogLevel } from '@chrome-extension-boilerplate/shared/lib/services/logging';

const API_URL = import.meta.env?.VITE_API_URL || API_CONFIG.BASE_URL;

/**
 * Singleton ElasticLogger instance.
 * Sends structured log entries to Django's /extension-logs/ endpoint,
 * which forwards them to Elasticsearch (app-extension index).
 */
export const logger = new ElasticLogger({
  endpoint: `${API_URL}/extension-logs/`,
  index: 'app-extension',
  minLevel: LogLevel.INFO, // DEBUG filtered out in production
});
