/**
 * Popup (UI) Auth UI types.
 */
import { ReactNode } from 'react';

/**
 * Auth context type.
 * isAuthenticated - Indicates if the user is authenticated; real token validation.
 * setIsAuthenticated - Function to update the authentication status.
 */
export interface AuthContextType {
    isAuthenticated: boolean;
    setIsAuthenticated: (value: boolean) => void;
}

/**
 * Auth provider props.
 * children - The child components that will have access to the auth context.
 */
export interface AuthProviderProps {
    children: ReactNode;
}
