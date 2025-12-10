/**
 * Background script for the Chrome extension.
 * Manages startup and installation events, and initializes services.
 */
import { runtime, Runtime } from 'webextension-polyfill';
import { AuthService} from '../services';
import { API_CONFIG } from '@chrome-extension-boilerplate/hmr/lib/constant';
import { MessageHandler } from '../messages';
import { ExtensionMessage } from '../messages/interfaces/types';

console.log('[background] Background script loaded');
const API_URL = import.meta.env?.VITE_API_URL || API_CONFIG.BASE_URL;
console.log(`[background] Using API URL: ${API_URL}`);

//  Starting Services
const authService = new AuthService(API_URL);
const messageHandler = new MessageHandler(authService, authService.privateModeService);

// Listen for incoming messages
runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message && (message as ExtensionMessage).type === 'AUTH_SUCCESS') {
        (async () => {
            try {
                await messageHandler.handleAuthSuccess(message, sendResponse);
            } catch (error) {
                console.log('[background] Error handling message:', error);
                sendResponse({ 
                    status: 'error', 
                    message: error instanceof Error ? error.message : 'Unknown error occurred' });
            }
        })();
        return true; 
    }
    return false; 
});

//  Listen for startup events
runtime.onStartup.addListener(async() => {
    console.log('[background] onStartup');
    await authService.checkAuthentication();
});

//  Listen for Installation or Update events
runtime.onInstalled.addListener(async(details: Runtime.OnInstalledDetailsType) =>{
    console.log('[background] onInstalled or onUpdated', details);
    await authService.checkAuthentication();
});

console.log('[background] Background script initialization complete');