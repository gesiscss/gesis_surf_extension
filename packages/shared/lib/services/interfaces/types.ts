import type { ElasticLogger } from '../logging/ElasticLogger';

export interface Wave {
  id: string;
  start_date: string;
  end_date: string;
  created_at: string;
  wave_status: string;
  wave_type: string;
  wave_number: string;
  client_id: string;
}

export interface Privacy {
  id: string;
  privacy_mode: boolean;
  privacy_start_time: string;
  privacy_end_time: string;
}

export interface Extension {
  id: string;
  extension_version: string;
  extension_installed_at: string;
  extension_updated_at: string;
  extension_browser: string;
  extension_data_collection: boolean;
  host_version: string;
  selector_version: string;
}

/**
 * Payload for PATCH /user/me/ to update extension metadata on install/update.
 */
export interface ExtensionMetadataPayload {
  extension_version: string;
  extension_browser: string;
  extension_installed_at?: string;
  extension_updated_at?: string;
}

export interface AuthResponse {
  user_id: string;
  waves: Wave[];
  privacy: Privacy | null;
  extension: Extension | null;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    message: string = 'API Error',
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export type AuthValidationResult =
  | 'valid'
  | 'invalid_token'
  | 'server_unavailable'
  | 'network_unavailable'
  | 'unexpected_response';

/**
 * Configuration for an `apiRequest` call.
 * Shared across services and the chrome-extension `apiRequestWithDevice` wrapper.
 */
export interface ApiRequestConfig {
  /** HTTP method. Defaults to 'GET'. */
  method?: string;
  /** Skip authentication (e.g., for login before a token exists). */
  skipAuth?: boolean;
  /** Additional headers to merge in (e.g., `X-Device-Id`). */
  extraHeaders?: HeadersInit;
  /** Whether to log this request/response to Elasticsearch. Defaults to false. */
  logToElasticsearch?: boolean;
  /** Logger instance. If not provided, logging is skipped even if requested. */
  logger?: ElasticLogger | null;
}
