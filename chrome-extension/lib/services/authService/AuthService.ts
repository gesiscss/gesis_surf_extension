/**
 * @fileoverview Authentication service for the Chrome extension.
 * Manages user authentication state, token validation, and service initialization.
 * @implements {IAuthService}
 */

import { EventManager } from '@root/lib/events';
import { GlobalSessionService } from '../globalSession';
import { API_CONFIG } from '@chrome-extension-boilerplate/hmr/lib/constant';
import { HeartbeatService } from '../heartBeatService';
import { PrivateModeService } from '../privateModeService';
import { MessageHandler } from '@root/lib/messages';
import { MessageResponse } from '@root/lib/messages/interfaces';
import { alarms, runtime, storage, Runtime } from 'webextension-polyfill';
import { DataCollectionService } from '../dataCollectionService';
import { HostService } from '../hostService';
import { SelectorService } from '../selectorService';
import { readToken, writeToken } from '@chrome-extension-boilerplate/shared/lib/storages/tokenStorage';
import { apiRequestWithDevice } from '../apiClientWithDevice';
import { logger } from '../logger';
import {
  AuthValidationResult,
  ExtensionMetadataPayload,
} from '@chrome-extension-boilerplate/shared/lib/services/interfaces/types';

const PENDING_EXTENSION_UPDATE_KEY = 'pending_extension_update';

/**
 * Class to manage the authentication service.
 * Handles the authentication of the user.
 */
export class AuthService {
  isAuthenticated: boolean;
  apiEndpoint: string;
  globalSessionService: GlobalSessionService;
  eventManager: EventManager;
  heartbeatService: HeartbeatService;
  privateModeService: PrivateModeService;
  messageHandler: MessageHandler;
  dataCollectionService: DataCollectionService;
  hostService: HostService;
  selectorService: SelectorService;
  private static readonly RETRY_ALARM = 'authRetry';
  private static readonly RETRY_PERIOD_MINUTES = 1;
  // Kept in storage.session, which the browser clears on restart and on
  // extension reload/update, so it means "this browser session already has
  // its global session".
  private static readonly SESSION_STARTED_KEY = 'collectionStartedThisBrowserSession';
  private collectionActive = false;
  private initializationInFlight: Promise<void> | null = null;
  private messageListenerRegistered = false;
  private retryListenerRegistered = false;
  private beforeCollectionStart: (() => Promise<void>) | null = null;

  constructor(apiEndpoint: string) {
    this.isAuthenticated = false;
    this.apiEndpoint = apiEndpoint;
    this.globalSessionService = new GlobalSessionService(apiEndpoint);
    this.eventManager = new EventManager();
    this.heartbeatService = new HeartbeatService();
    this.privateModeService = new PrivateModeService();
    this.messageHandler = new MessageHandler(this, this.privateModeService);
    this.dataCollectionService = new DataCollectionService();
    this.hostService = new HostService();
    this.selectorService = new SelectorService();
  }

  /**
   * Getter for MessageHandler instance.
   * @returns MessageHandler instance
   */
  getMessageHandler(): MessageHandler {
    return this.messageHandler;
  }

  /**
   * Runs on every service-worker start, including idle wake-ups.
   * Restores message handling and private mode only. Collection and the
   * global session are started by checkAuthentication (browser start,
   * install/update, or login), never by a plain wake-up.
   */
  start(): void {
    this.startMessageListener();
    this.startRetryListener();
    void this.privateModeService.initialize();
  }

  /**
   * Registers a hook that runs once the token is validated and before
   * collection starts (used to close the login window so it is not recorded).
   * Failures are logged and never block collection.
   */
  setBeforeCollectionStart(hook: () => Promise<void>): void {
    this.beforeCollectionStart = hook;
  }

  private async runBeforeCollectionStart(): Promise<void> {
    try {
      await this.beforeCollectionStart?.();
    } catch (error) {
      console.error('[AuthService] Error before starting collection:', error);
    }
  }

  /**
   * Listens for the reconnect alarm. Registered synchronously on every worker
   * start so the alarm can wake the worker.
   */
  private startRetryListener(): void {
    if (this.retryListenerRegistered) return;
    this.retryListenerRegistered = true;
    alarms.onAlarm.addListener(alarm => {
      if (alarm.name === AuthService.RETRY_ALARM) {
        void this.retryStartup();
      }
    });
  }

  /**
   * Retries starting collection after the backend could not be reached when
   * the browser started or the user logged in. Never starts a second global
   * session in the same browser session.
   */
  async retryStartup(): Promise<void> {
    try {
      if (this.collectionActive || (await this.hasStartedThisBrowserSession())) {
        await this.cancelRetry();
        return;
      }
      if (this.initializationInFlight) return;
      console.log('[AuthService] Retrying startup after a connection problem');
      await this.checkAuthentication();
    } catch (error) {
      console.error('[AuthService] Error retrying startup:', error);
    }
  }

  private async scheduleRetry(): Promise<void> {
    try {
      await alarms.create(AuthService.RETRY_ALARM, { periodInMinutes: AuthService.RETRY_PERIOD_MINUTES });
      console.log(`[AuthService] Will retry starting collection every ${AuthService.RETRY_PERIOD_MINUTES} minute(s)`);
    } catch (error) {
      console.error('[AuthService] Could not schedule the startup retry:', error);
    }
  }

  private async cancelRetry(): Promise<void> {
    try {
      await alarms.clear(AuthService.RETRY_ALARM);
    } catch (error) {
      console.error('[AuthService] Could not cancel the startup retry:', error);
    }
  }

  private async hasStartedThisBrowserSession(): Promise<boolean> {
    const area = chrome.storage?.session;
    if (!area) return false;
    const result = await area.get(AuthService.SESSION_STARTED_KEY);
    return result[AuthService.SESSION_STARTED_KEY] === true;
  }

  private async markStartedThisBrowserSession(): Promise<void> {
    try {
      await chrome.storage?.session?.set({ [AuthService.SESSION_STARTED_KEY]: true });
    } catch (error) {
      console.error('[AuthService] Could not record the started session:', error);
    }
  }

  /**
   * Whether tab/window collection is currently running in this worker.
   */
  isCollectionActive(): boolean {
    return this.collectionActive;
  }

  /**
   * Function to initialize services.
   * Initializes the services required for the extension. Safe to call
   * repeatedly: collection is started at most once per worker.
   * @return Promise<void>
   * @throws {Error} If initialization fails
   */
  async initializeServices(): Promise<void> {
    if (this.collectionActive) {
      console.log('[AuthService] Services already initialized');
      return;
    }
    if (!this.initializationInFlight) {
      this.initializationInFlight = this.startServices().finally(() => {
        this.initializationInFlight = null;
      });
    }
    return this.initializationInFlight;
  }

  private async startServices(): Promise<void> {
    console.log('[AuthService] Initializing services');
    try {
      await this.dataCollectionService.initialize();
      void this.hostService.checkAndSyncVersion();
      void this.selectorService.checkAndSyncVersion();

      if (!this.dataCollectionService.shouldCollectData()) {
        console.log('[AuthService] Data collection is disabled. Skipping service initialization.');
        return;
      }

      await this.globalSessionService.createGlobalSession();
      await this.eventManager.startListeners();

      await Promise.all([this.heartbeatService.startHeartbeat(), this.privateModeService.initialize()]);

      await this.heartbeatService.startAlarmAll();
      this.collectionActive = true;
      await this.markStartedThisBrowserSession();
      await this.cancelRetry();

      console.log('[AuthService] Services initialized successfully');
    } catch (error) {
      console.error('[AuthService] Error initializing services:', error);
      throw error;
    }
  }

  /**
   * Start Listening to Messages from Content Scripts and Popups.
   * Registered once per worker. Private-mode messages are always answered;
   * content events wait for an in-progress initialization and are rejected
   * while collection is inactive.
   * @return void
   */
  startMessageListener(): void {
    if (this.messageListenerRegistered) return;
    this.messageListenerRegistered = true;
    console.log('[AuthService] Setting up message listener');
    chrome.runtime.onMessage.addListener(
      (message: unknown, sender: Runtime.MessageSender, sendResponse: (response: MessageResponse) => void) => {
        const type =
          typeof message === 'object' && message !== null && 'type' in message
            ? (message as { type?: unknown }).type
            : undefined;

        // Handled by the background index listener.
        if (type === 'OPEN_LOGIN_WINDOW' || type === 'AUTH_SUCCESS') {
          return false;
        }
        // Broadcasts from the background to the popup; not requests.
        if (type === 'PRIVATE_MODE_EXPIRED') {
          return false;
        }

        void (async () => {
          try {
            if (type === 'PRIVATE_MODE') {
              await this.privateModeService.initialize();
            } else {
              await this.initializationInFlight?.catch(() => undefined);
              if (!this.collectionActive) {
                sendResponse({ status: 'error', message: 'Data collection is not active' });
                return;
              }
            }
            await this.messageHandler.handleMessage(message, sender, sendResponse);
          } catch (error) {
            console.error('[AuthService] Error handling message:', error);
            sendResponse({
              status: 'error',
              message: error instanceof Error ? error.message : 'Failed to handle message',
            });
          }
        })();
        return true;
      },
    );
  }

  /**
   * Updates extension metadata on the backend via PATCH /user/me/.
   * Sends extension version, browser, and install/update timestamps.
   * Non-blocking — failures are logged but do not interrupt the auth flow.
   * @param reason 'install' for first install, 'update' for version update.
   * @returns Promise<void>
   */
  async updateExtensionMetadata(reason?: 'install' | 'update'): Promise<boolean> {
    try {
      const token = await readToken();
      if (!token) {
        console.warn('[AuthService] No token found, skipping extension metadata update');
        return false;
      }

      const manifest = runtime.getManifest();
      const now = new Date().toISOString();

      const extensionPayload: ExtensionMetadataPayload = {
        extension_version: manifest.version,
        extension_browser: navigator.userAgent,
      };

      if (reason === 'install') {
        extensionPayload.extension_installed_at = now;
        extensionPayload.extension_updated_at = now;
      } else if (reason === 'update') {
        extensionPayload.extension_updated_at = now;
      }

      console.log('[AuthService] Updating extension metadata:', extensionPayload);

      const response = await apiRequestWithDevice(
        `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.USER_ME}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ extension: extensionPayload }),
        },
        { method: 'PATCH', logToElasticsearch: true, logger },
      );

      if (!response.ok) {
        console.warn(`[AuthService] Extension metadata update failed: ${response.status} ${response.statusText}`);
        return false;
      }

      console.log('[AuthService] Extension metadata updated successfully');
      return true;
    } catch (error) {
      console.error('[AuthService] Error updating extension metadata:', error);
      return false;
    }
  }

  /**
   * Checks for a pending extension metadata update stored from a previous
   * onInstalled event that fired before the user was authenticated.
   * If found, sends the PATCH and clears the pending reason from storage.
   * @returns Promise<void>
   */
  private async checkPendingExtensionUpdate(): Promise<void> {
    try {
      const pending = await storage.local.get(PENDING_EXTENSION_UPDATE_KEY);
      const reason = pending[PENDING_EXTENSION_UPDATE_KEY] as 'install' | 'update' | undefined;

      if (reason === 'install' || reason === 'update') {
        console.log(`[AuthService] Found pending extension update reason: ${reason}`);
        const updated = await this.updateExtensionMetadata(reason);
        if (updated) {
          await storage.local.remove(PENDING_EXTENSION_UPDATE_KEY);
        }
      }
    } catch (error) {
      console.error('[AuthService] Error checking pending extension update:', error);
    }
  }

  /**
   * Validates the stored token against the user info endpoint.
   * @param token The token used to retrieve user information.
   * @returns The token validation result.
   */
  async validateToken(): Promise<AuthValidationResult> {
    try {
      const response = await apiRequestWithDevice(
        `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.USER_ME}`,
        { method: 'GET' },
        { method: 'GET', logToElasticsearch: true, logger },
      );

      if (response.status === 401) {
        console.warn('Token is invalid:', response.status, response.statusText);
        return 'invalid_token';
      }

      if (response.status >= 500) {
        console.warn('Server is unavailable:', response.status, response.statusText);
        return 'server_unavailable';
      }

      if (!response.ok) {
        console.warn(`Token validation failed with status: ${response.status}`);
        return 'unexpected_response';
      }

      let data: unknown;
      try {
        data = await response.json();
      } catch (error) {
        console.error('Failed to parse token validation response as JSON:', error);
        return 'unexpected_response';
      }

      if (typeof data === 'object' && data !== null && 'user_id' in data && typeof data.user_id === 'string') {
        // Version reconciliation: compare the running extension version with the
        // version the backend has on record. If they differ (update, downgrade,
        // backend reset, or a previous PATCH that never fired because the service
        // worker was killed), send a PATCH now — fire-and-forget so it doesn't
        // block validation or the downstream initialization. This runs on every
        // startup, so it self-heals even when onInstalled never fired or its PATCH
        // was lost. The reason is inferred from the backend record: if
        // extension_installed_at is present it's an update, otherwise a first
        // install.
        const extensionData = (
          data as {
            extension?: { extension_version?: string; extension_installed_at?: string | null };
          }
        ).extension;
        const backendVersion = extensionData?.extension_version;
        const manifestVersion = runtime.getManifest().version;

        if (backendVersion !== manifestVersion) {
          const reason: 'install' | 'update' = extensionData?.extension_installed_at ? 'update' : 'install';
          console.log(
            `[AuthService] Version mismatch — backend: ${backendVersion ?? 'n/a'}, manifest: ${manifestVersion}. ` +
              `Sending PATCH (reason: ${reason}).`,
          );
          void this.updateExtensionMetadata(reason);
        }

        return 'valid';
      }

      return 'unexpected_response';
    } catch (error) {
      console.error('Error validating token:', error);
      return 'network_unavailable';
    }
  }

  /**
   * Function to check if the user is authenticated.
   * Checks if the user is authenticated by checking the token.
   * If the backend cannot be reached (or startup fails) while a token is
   * stored, the token is kept and a retry alarm is scheduled so collection
   * starts as soon as the backend is reachable again.
   * @returns Whether the token was validated and services were initialized.
   */
  async checkAuthentication(): Promise<boolean> {
    try {
      const token = await readToken();

      if (!token) {
        console.log('[background AuthService] No token found. User is not authenticated');
        this.isAuthenticated = false;
        await this.cancelRetry();
        return false;
      }

      const validationResult = await this.validateToken();

      switch (validationResult) {
        case 'valid':
          console.log('[background AuthService] User is authenticated');
          this.isAuthenticated = true;
          await this.runBeforeCollectionStart();
          await this.initializeServices();
          await this.cancelRetry();
          await this.checkPendingExtensionUpdate();
          return true;

        case 'invalid_token':
          console.log('[background AuthService] User is not authenticated');
          await writeToken(null);
          this.isAuthenticated = false;
          await this.cancelRetry();
          return false;

        case 'server_unavailable':
        case 'network_unavailable':
          console.warn('[background AuthService] Token validation deferred due to:', validationResult);
          this.isAuthenticated = false;
          await this.scheduleRetry();
          return false;

        case 'unexpected_response':
          // Not a connection problem (e.g. 403), so retrying would not help.
          console.warn('[background AuthService] Token validation deferred due to:', validationResult);
          this.isAuthenticated = false;
          await this.cancelRetry();
          return false;
      }
    } catch (error) {
      console.error('[background AuthService] Error checking authentication:', error);
      this.isAuthenticated = false;
      await this.scheduleRetry();
      return false;
    }
  }
}
