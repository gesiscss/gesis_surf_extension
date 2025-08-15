import { readToken } from "../storages/tokenStorage";

export interface AuthResponse {
    valid: boolean;
    user?: {
        user_id: string;
    };
}

export class ApiError extends Error {
    constructor(
        public status: number,
        public statusText: string,
        message: string = 'API Error'
    ) {
        super(message);
        this.name = 'ApiError';
    }
}

/**
 *  Makes an authenticated API request
 * @param endpoint - The API endpoint URL.
 * @param options  - Optional fetch options.
 * @param method  - HTTP method (Get default).
 * @returns - A promise that resolves to the response of the API request.
 * @throws - Error if the user is not authenticated.
 */
export const apiRequest =async(
    endpoint: string,
    options: RequestInit = {},
    method: string = 'GET'
): Promise<Response> => {
    const token = await readToken();

    if(!token){
        throw new ApiError(401, 'Unauthorized', 'User is not authenticated. Please log in.');
    }

    const headers = {
        ...options.headers,
        'Accept': 'application/json',
        'Authorization': `Token ${token}`
    };

    try {
        const response = await fetch(endpoint, {
            ...options,
            method,
            headers,
        });

        if (!response.ok){
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
 * @returns A promise that resolves to a boolean indicating whether the token is valid.
 */
export const validateToken = async (token: string, url: string): Promise<boolean> => {
    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Authorization': `Token ${token}`
            },
        });

        if (!response.ok) {
            console.warn(`Token validation failed with status: ${response.status}`);
            return false;
        }

        const data = await response.json() as AuthResponse;
        return Boolean(data.valid);
    } catch (error) {
        console.error('Error validating token:', error);
        return false;
    }
};