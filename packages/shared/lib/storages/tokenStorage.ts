import { BaseStorage, createStorage, StorageType } from './base';

/**
 * Auth token storage (null = no token).
 * Live updates keep extension contexts in sync.
 */
export type AuthToken = string | null;

export type TokenStorage = BaseStorage<AuthToken> & {
    setToken: (token: string) => Promise<void>;
    clearToken: () => Promise<void>;
    /**
     * Returns true if a token is present, false otherwise.
     */
    hasToken: () => boolean;
}

const TOKEN_KEY = 'token';

const storage = createStorage<AuthToken>(TOKEN_KEY, null, {
    storageType: StorageType.Local,
    liveUpdate: true,
});

/**
 * Token storage. Manages the authentication token for the user.
 */
export const tokenStorage: TokenStorage = {
    ...storage,
    setToken: (token) => storage.set(token),
    clearToken: () => storage.set(null),
    hasToken: () => storage.getSnapshot() !== null,
};

/**
 * Read the auth token. If no token is present, null is returned.
 */
export const readToken = (): Promise<AuthToken> => tokenStorage.get();

/**
 * Write the auth token.
 * @param token Optional auth token string.
 * @returns A promise that resolves when the token is written.
 */
export const writeToken = (token?: string | null ): Promise<void> =>
    token ? tokenStorage.setToken(token) : tokenStorage.clearToken();


// Validate the auth token.
export const validateToken = async (token: string, url: string): Promise<boolean> => {
    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Token ${token}`
            },
            body: JSON.stringify({ token })
        });

        if (!response.ok) {
            throw new Error('Token validation failed');
        }

        const data = await response.json();
        return data.valid;
    } catch (error) {
        console.error('Error validating token:', error);
        return false;
    }
};