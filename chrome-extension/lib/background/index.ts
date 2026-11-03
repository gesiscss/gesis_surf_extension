/**
 * Background script for the Chrome extension.
 * Manages startup and installation events, and initializes services.
 */
import { runtime, storage, Runtime } from 'webextension-polyfill';
import { AuthService } from '../services';
import { API_CONFIG } from '@chrome-extension-boilerplate/hmr/lib/constant';
import { MessageHandler } from '../messages';
import { ExtensionMessage } from '../messages/interfaces/types';
import { migrateLegacyToken } from '../storages/migrateLegacyToken';
import { ensureDeviceId } from '../storages/deviceId';
import { logger } from '../services/logger';
import { LoginWindowService } from '../services/loginWindow/LoginWindowService';

console.log('[background] Background script loaded');
const API_URL = import.meta.env?.VITE_API_URL || API_CONFIG.BASE_URL;
console.log(`[background] Using API URL: ${API_URL}`);

const PENDING_EXTENSION_UPDATE_KEY = 'pending_extension_update';

//  Starting Services
const authService = new AuthService(API_URL);
const messageHandler = new MessageHandler(authService, authService.privateModeService);
const loginWindowService = new LoginWindowService();
authService.setBeforeCollectionStart(() => loginWindowService.close());

// Listen for incoming messages
chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  if (message && (message as ExtensionMessage).type === 'OPEN_LOGIN_WINDOW') {
    void loginWindowService
      .open()
      .then(() => sendResponse({ status: 'success' }))
      .catch(error => {
        console.error('[background] Could not open the login window:', error);
        sendResponse({
          status: 'error',
          message: error instanceof Error ? error.message : 'Could not open the login window',
        });
      });
    return true;
  }

  if (message && (message as ExtensionMessage).type === 'AUTH_SUCCESS') {
    void (async () => {
      try {
        await messageHandler.handleAuthSuccess(message, sendResponse);
      } catch (error) {
        console.error('[background] Error handling message:', error);
        sendResponse({
          status: 'error',
          message: error instanceof Error ? error.message : 'Unknown error occurred',
        });
      }
    })();
    return true;
  }

  return false;
});

//  Listen for startup events (browser start / computer reboot)
runtime.onStartup.addListener(async () => {
  console.log('[background] onStartup');
  const deviceId = await ensureDeviceId();
  logger.setDeviceId(deviceId);
  await migrateLegacyToken();
  await authService.checkAuthentication();
});

//  Listen for Installation or Update events
runtime.onInstalled.addListener(async (details: Runtime.OnInstalledDetailsType) => {
  console.log('[background] onInstalled or onUpdated', details);
  const deviceId = await ensureDeviceId();
  logger.setDeviceId(deviceId);

  // Persist the reason so it can be sent after auth if the user isn't authenticated yet
  let reason: 'install' | 'update' | undefined;
  if (details.reason === 'install') {
    reason = 'install';
  } else if (details.reason === 'update') {
    reason = 'update';
  }

  if (reason) {
    await storage.local.set({ [PENDING_EXTENSION_UPDATE_KEY]: reason });
  }

  await migrateLegacyToken();
  await authService.checkAuthentication();
});

// Runs on every service-worker start, including idle wake-ups. Only restores
// message handling and private mode; collection and the global session are
// started by onStartup/onInstalled or a login, never by a plain wake-up.
authService.start();

console.log('[background] Background script initialization complete');
