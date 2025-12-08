/**
 * Background script for the Chrome extension.
 * Manages startup and installation events, and initializes services.
 */
import { runtime, Runtime } from 'webextension-polyfill';
import { AuthService} from '../services';
import { API_CONFIG } from '@chrome-extension-boilerplate/hmr/lib/constant';
import { MessageHandler } from '../messages';
// import { run } from 'node:test';

console.log('[background] Background script loaded');
const API_URL = import.meta.env?.VITE_API_URL || API_CONFIG.BASE_URL;
console.log(`[background] Using API URL: ${API_URL}`);

//  Starting Services
const authService = new AuthService(API_URL);
const messageHandler = new MessageHandler(authService, authService.privateModeService);

runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[background] Message received:', message);
    
    // Handle message asynchronously but return true synchronously
    (async () => {
        try {
            await messageHandler.handleMessage(message, sender, sendResponse);
        } catch (error) {
            console.error('[background] Error handling message:', error);
            sendResponse({ status: 'error', message: 'Internal error' });
        }
    })();
    
    // Return true to indicate we will send a response asynchronously
    return true;
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