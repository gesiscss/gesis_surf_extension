import React, {createContext, useContext, useState, useEffect } from 'react';
import { AuthContextType, AuthProviderProps } from '@src/features/auth/auth.types';

const AuthContext = createContext<AuthContextType | null>(null);

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