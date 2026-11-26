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

import React, { createContext, useContext, useState, useEffect } from 'react';
import { AuthContextType, AuthProviderProps } from '@src/features/auth/auth.types';
import { readToken, tokenStorage } from '@chrome-extension-boilerplate/shared/lib/storages/tokenStorage';

// Create the AuthContext
const AuthContext = createContext<AuthContextType | null>(null);

// Custom hook to use the AuthContext
export const useAuth = () => useContext(AuthContext) as AuthContextType;

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(true);
  console.log('Checking Authentication ...');

  useEffect(() => {
    let mounted = true;
    let updateSequence = 0;

    const updateAuthentication = async () => {
      const currentUpdate = ++updateSequence;
      try {
        const token = await readToken();
        if (mounted && currentUpdate === updateSequence) {
          setIsAuthenticated(Boolean(token));
        }
      } catch (error) {
        console.error('[AuthContext] Could not read the authentication token:', error);
        if (mounted && currentUpdate === updateSequence) setIsAuthenticated(false);
      }
    };

    const unsubscribe = tokenStorage.subscribe(() => {
      void updateAuthentication();
    });
    void updateAuthentication();

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  return <AuthContext.Provider value={{ isAuthenticated, setIsAuthenticated }}>{children}</AuthContext.Provider>;
};
