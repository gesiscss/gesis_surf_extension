/**
 * AuthContext
 * Provides authentication state and functions to manage it.
 * Reads and updates the authentication state.
 * 
 * Responsabilities:
 * - Provide the current authentication state.
 * - Allow components to subscribe to authentication state changes.
 * - Provide functions to update the authentication state.
 * 
 * Usage:
 *  <AuthProvider>
 *    <App />
 *  </AuthProvider>
 */


import React, {createContext, useContext, useState, useEffect } from 'react';
import { AuthContextType, AuthProviderProps } from '@src/features/auth/auth.types';
import { readToken } from '@chrome-extension-boilerplate/shared/lib/storages/tokenStorage';

// Create the AuthContext
const AuthContext = createContext<AuthContextType | null>(null);

// Custom hook to use the AuthContext
export const useAuth = () => useContext(AuthContext) as AuthContextType;

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
    const [isAuthenticated, setIsAuthenticated] = useState<boolean>(true);

    useEffect(() => {
        let mounted = true;
        
        (async () => {
            try {
                const token = readToken();
                if (mounted) {
                    setIsAuthenticated(Boolean(token));
                }
            } catch {
                    if (mounted) setIsAuthenticated(false);
                }
            })();

            return () => {
                mounted = false;
            };
    }, []);

    return (
        <AuthContext.Provider value={{ isAuthenticated, setIsAuthenticated }}>
            {children}
        </AuthContext.Provider>
    );
};