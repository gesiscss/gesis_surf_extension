/**
 * @fileoverview Chrome-extension wrapper around the shared `apiRequest`.
 *
 * Injects the `X-Device-Id` header (read from / generated into
 * `storage.local`) into every request. This is the function all
 * chrome-extension services and handlers should use for API calls.
 *
 * Lives in `chrome-extension` (not `packages/shared`) because it depends on
 * `webextension-polyfill` for `storage.local` access, which `packages/shared`
 * intentionally avoids.
 */
import { apiRequest } from '@chrome-extension-boilerplate/shared/lib/services/apiClient';
import type { ApiRequestConfig } from '@chrome-extension-boilerplate/shared/lib/services/interfaces/types';
import { ensureDeviceId } from '../storages/deviceId';

export { getDeviceId } from '../storages/deviceId';

/**
 * Wrapper around `apiRequest` that injects the `X-Device-Id` header
 * automatically. Passes through all other options unchanged.
 *
 * @param endpoint The full API URL to fetch.
 * @param options Standard `RequestInit` options (body, signal, etc.).
 * @param config Additional configuration (method, skipAuth, logging, etc.).
 * @returns The `Response` from `fetch` (or a synthetic 401 if no token).
 */
export async function apiRequestWithDevice(
  endpoint: string,
  options: RequestInit = {},
  config: Omit<ApiRequestConfig, 'extraHeaders'> = {},
): Promise<Response> {
  const deviceId = await ensureDeviceId();
  return apiRequest(endpoint, options, {
    ...config,
    extraHeaders: { 'X-Device-Id': deviceId },
  });
}
