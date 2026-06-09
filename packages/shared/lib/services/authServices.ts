import { readToken } from '../storages/tokenStorage';
import { ApiError, AuthValidationResult } from './interfaces/types';

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
 * @param token - The token used to retrieve user information.
 * @param url - The validation endpoint URL.
 * @returns A promise that resolves to an AuthValidationResult indicating the validation outcome.
 */
export const validateToken = async (token: string, url: string): Promise<AuthValidationResult> => {
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Token ${token}`,
      },
    });

    if (response.status === 401) {
      console.warn('Token is invalid:', response.status, response.statusText);
      return 'invalid_token';
    }

    if (response.status >= 500) {
      console.warn('Server is unavailable:', response.status, response.statusText);
      return 'server_unavailable';
    }

    if (!response.ok) {
      console.warn(`Token validation failed with status: ${response.status}`);
      return 'unexpected_response';
    }

    let data: unknown;
    try {
      data = await response.json();
    } catch (error) {
      console.error('Failed to parse token validation response as JSON:', error);
      return 'unexpected_response';
    }

    if (typeof data === 'object' && data !== null && 'user_id' in data && typeof data.user_id === 'string') {
      console.log('Token is valid. User ID:', data.user_id);
      return 'valid';
    }
    return 'unexpected_response';
  } catch (error) {
    console.error('Network error during token validation:', error);
    return 'network_unavailable';
  }
};
