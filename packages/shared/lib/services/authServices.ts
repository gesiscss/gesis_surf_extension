import { readToken } from '../storages/tokenStorage';
import { AuthResponse, ApiError } from './interfaces/types';

/**
 *  Makes an authenticated API request
 * @param endpoint - The API endpoint URL.
 * @param options  - Optional fetch options.
 * @param method  - HTTP method (Get default).
 * @returns - A promise that resolves to the response of the API request.
 * @throws - Error if the user is not authenticated.
 */
export const apiRequest = async (
  endpoint: string,
  options: RequestInit = {},
  method: string = 'GET',
  skipAuth: boolean = false,
): Promise<Response> => {
  let headers: HeadersInit = {
    ...options.headers,
    'Content-Type': 'application/json',
  };

  console.log('API Request to:', endpoint);

  if (!skipAuth) {
    const token = await readToken();
    if (!token) {
      throw new ApiError(401, 'Unauthorized', 'User is not authenticated. Please log in.');
    }
    headers = {
      ...headers,
      Authorization: `Token ${token}`,
    };
  }

  try {
    const response = await fetch(endpoint, {
      ...options,
      method,
      headers,
    });

    if (!response.ok) {
      throw new ApiError(response.status, response.statusText, `API request failed with status ${response.status}`);
    }

    return response;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    console.error('Unexpected error during API request:', error);
    throw new ApiError(500, 'Internal Server Error', 'An unexpected error occurred while processing the API request.');
  }
};

/**
 * Validates an authentication token.
 * @param token - The token to validated.
 * @param url -The validation endpoint URL.
 * @returns A promise that resolves to a TokenValidationResult.
 */
export type TokenValidationResult = 'valid' | 'invalid' | 'unreachable' | 'server_error' | 'forbidden';

export const validateToken = async (token: string, url: string): Promise<TokenValidationResult> => {
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Token ${token}`,
      },
    });

    if (response.ok) {
      const data = (await response.json()) as AuthResponse;
      return data && data.user_id ? 'valid' : 'invalid';
    }

    if (response.status === 401) return 'invalid';
    if (response.status === 403) return 'forbidden';

    console.warn(`[validateToken] Unexpected status ${response.status} — keeping token`);
    return 'server_error';
  } catch (error) {
    console.warn('[validateToken] Server unreachable — keeping token:', error);
    return 'unreachable';
  }
};
