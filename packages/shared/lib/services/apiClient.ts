/**
 * @fileoverview Unified API client for the browser extension.
 *
 * Replaces the duplicated `requestOptions`/`buildRequestOptions` methods in
 * the handlers and the inline `fetch` calls in the services. Every API call
 * should go through `apiRequest` so that:
 *
 * - Authentication (`Authorization: Token ...`) is applied consistently.
 * - Extra headers (e.g., `X-Device-Id`) can be injected by callers.
 * - Requests and responses can be logged to Elasticsearch (opt-in per call).
 * - The response is always returned — never throws — so callers handle
 *   errors their own way (inspect `response.ok`, read status, etc.).
 *
 * This module lives in `packages/shared` and intentionally does NOT depend on
 * `webextension-polyfill`. The `device_id` injection happens in the
 * chrome-extension wrapper (`apiRequestWithDevice`), keeping `packages/shared`
 * runtime-agnostic.
 */
import { readToken } from '../storages/tokenStorage';
import type { ElasticLogger } from './logging/ElasticLogger';
import type { ApiRequestConfig } from './interfaces/types';

export type { ApiRequestConfig };

/**
 * Makes an authenticated API request with optional Elasticsearch logging.
 *
 * **Never throws.** Always returns a `Response`. Callers inspect
 * `response.ok` and `response.status` to decide how to handle errors.
 *
 * If `skipAuth` is false and no token is found, returns a synthetic 401
 * `Response` (so callers can handle the unauthenticated case uniformly
 * without a try/catch). The missing-token case is logged to Elasticsearch
 * if a logger is provided and `logToElasticsearch` is true.
 *
 * @param endpoint The full API URL to fetch.
 * @param options Standard `RequestInit` options (body, signal, etc.).
 * @param config Additional configuration (method, skipAuth, logging, etc.).
 * @returns The `Response` from `fetch` (or a synthetic 401 if no token).
 */
export async function apiRequest(
  endpoint: string,
  options: RequestInit = {},
  config: ApiRequestConfig = {},
): Promise<Response> {
  const { method = 'GET', skipAuth = false, extraHeaders = {}, logToElasticsearch = false, logger = null } = config;

  // Attach auth header unless explicitly skipped (e.g., login)
  const authResult = await buildAuthHeaders(
    skipAuth,
    options.headers,
    extraHeaders,
    endpoint,
    method,
    logger,
    logToElasticsearch,
  );
  if (authResult.syntheticResponse) return authResult.syntheticResponse;

  const headers = authResult.headers;

  // Log the outgoing request
  if (logToElasticsearch && logger) {
    logger.logRequest(endpoint, method, options.body ?? null);
  }

  let response: Response;
  try {
    response = await fetch(endpoint, { ...options, method, headers });
  } catch (error) {
    // Network failure / CORS / DNS — Django never sees this
    if (logToElasticsearch && logger) {
      logger.logClientError('Network error during API request', {
        endpoint,
        method,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    // Re-throw so callers can catch network errors distinctly from HTTP errors
    throw error;
  }

  // Log the response (WARN for non-ok, INFO for ok)
  if (logToElasticsearch && logger) {
    logger.logResponse(endpoint, method, response.status, response.ok);
  }

  return response;
}

/**
 * Builds the headers for an API request, attaching the auth token unless
 * `skipAuth` is set. Returns either the completed headers or a synthetic 401
 * response (when no token is found and auth is required).
 */
async function buildAuthHeaders(
  skipAuth: boolean,
  optionsHeaders: HeadersInit | undefined,
  extraHeaders: HeadersInit,
  endpoint: string,
  method: string,
  logger: ElasticLogger | null,
  logToElasticsearch: boolean,
): Promise<{ headers: HeadersInit; syntheticResponse?: Response }> {
  const headers: HeadersInit = {
    ...optionsHeaders,
    ...extraHeaders,
    'Content-Type': 'application/json',
  };

  if (skipAuth) return { headers };

  const token = await readToken();
  if (token) {
    return { headers: { ...headers, Authorization: `Token ${token}` } };
  }

  // No token — log and return a synthetic 401 so callers handle it uniformly
  if (logToElasticsearch && logger) {
    logger.logClientError('API request attempted without token', { endpoint, method });
  }
  return {
    headers,
    syntheticResponse: new Response(JSON.stringify({ detail: 'Authentication token not found' }), {
      status: 401,
      statusText: 'Unauthorized',
      headers: { 'Content-Type': 'application/json' },
    }),
  };
}
