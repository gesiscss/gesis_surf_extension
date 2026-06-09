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
import { runtime, Runtime } from 'webextension-polyfill';
import { DataCollectionService } from '../dataCollectionService';
import { HostService } from '../hostService';
import { SelectorService } from '../selectorService';
import { readToken, writeToken } from '@chrome-extension-boilerplate/shared/lib/storages/tokenStorage';
import { AuthValidationResult } from '@chrome-extension-boilerplate/shared/lib/services/interfaces/types';

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
   * Function to initialize services.
   * Initializes the services required for the extension.
   * @return Promise<void>
   * @throws {Error} If initialization fails
   */
  async initializeServices() {
    console.log('[AuthService] Initializing services');
    try {
      await this.dataCollectionService.initialize();
      await this.hostService.checkAndSyncVersion();
      await this.selectorService.checkAndSyncVersion();

      if (!this.dataCollectionService.shouldCollectData()) {
        console.log('[AuthService] Data collection is disabled. Skipping service initialization.');
        return;
      }

      await this.globalSessionService.createGlobalSession();
      await this.eventManager.startListeners();

      await Promise.all([this.heartbeatService.startHeartbeat(), this.privateModeService.initialize()]);

      await this.heartbeatService.startAlarmAll();
      await this.startMessageListener();

      console.log('[AuthService] Services initialized successfully');
    } catch (error) {
      console.error('[AuthService] Error initializing services:', error);
      throw error;
    }
  }

  /**
   * Start Listening to Messages from Content Scripts and Popups.
   * @return Promise<void>
   */
  async startMessageListener(): Promise<void> {
    console.log('[AuthService] Setting up message listener');
    runtime.onMessage.addListener(
      (message: unknown, sender: Runtime.MessageSender, sendResponse: (response: MessageResponse) => void): true => {
        (async () => {
          await this.messageHandler.handleMessage(message, sender, sendResponse);
        })();
        return true;
      },
    );
  }

  /**
   * Validates the stored token against the user info endpoint.
   * @param token The token used to retrieve user information.
   * @returns The token validation result.
   */
  async validateToken(token: string): Promise<AuthValidationResult> {
    try {
      const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.USER_ME}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Token ${token}`,
        },
      });

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
   * @return Promise<void>
   * @throws {Error} If checking authentication fails
   */
  async checkAuthentication() {
    try {
      const token = await readToken();

      if (!token) {
        console.log('[background AuthService] No token found. User is not authenticated');
        this.isAuthenticated = false;
        return;
      }

      const validationResult = await this.validateToken(token);

      switch (validationResult) {
        case 'valid':
          console.log('[background AuthService] User is authenticated');
          this.isAuthenticated = true;
          await this.initializeServices();
          return;

        case 'invalid_token':
          console.log('[background AuthService] User is not authenticated');
          await writeToken(null);
          this.isAuthenticated = false;
          return;

        case 'server_unavailable':
        case 'unexpected_response':
        case 'network_unavailable':
          console.warn('[background AuthService] Token validation deferred due to:', validationResult);
          this.isAuthenticated = false;
          return;
      }
    } catch (error) {
      console.error('[background AuthService] Error checking authentication:', error);
      this.isAuthenticated = false;
    }
  }
}
