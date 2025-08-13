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

// Create the AuthContext
const AuthContext = createContext<AuthContextType | null>(null);

// Custom hook to use the AuthContext
export const useAuth = () => useContext(AuthContext) as AuthContextType;

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
    const [isAuthenticated, setIsAuthenticated] = useState<boolean>(true);

    useEffect(() => {
        chrome.storage.local.get('token', (data) => {
            setIsAuthenticated(!!data.token);
        });
    }, []);

    return (
        <AuthContext.Provider value={{ isAuthenticated, setIsAuthenticated }}>
            {children}
        </AuthContext.Provider>
    );
};