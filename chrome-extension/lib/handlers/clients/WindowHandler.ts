/**
 * @fileoverview Manages browser window events.
 * Automatically registers event listeners for window events.
 */

import { DatabaseService } from '@root/lib/db';
import GlobalSessionService from '@root/lib/services/globalSession/GlobalSessionService';
import { WindowDataTypes, WindowPayloadTypes } from '../types/windowTypes';
import { apiUrl, InfoType } from '../shared';
import { apiRequestWithDevice } from '../../services/apiClientWithDevice';
import type { PendingWindowClose } from '../../db/interfaces/types';

// Window events are processed one at a time, so a hanging request must not block the rest.
const WINDOW_REQUEST_TIMEOUT_MS = 15000;
const MAX_CLOSE_RETRIES_PER_ALARM = 5;

/**
 * Manages browser window events.
 * Automatically registers event listeners for window events.
 */
class WindowManager {
  private readonly serviceName = 'WindowHandler';
  private dbService: DatabaseService;
  private globalSessionService: GlobalSessionService;
  private apiUrl: string;
  private retryingClosures = false;
  private retryOffset = 0;

  constructor() {
    this.dbService = new DatabaseService();
    this.apiUrl = apiUrl;
    this.globalSessionService = new GlobalSessionService(apiUrl);
  }

  /**
   * Generates a Session ID for the window.
   * @param windowId The window data to be hashed.
   * @param globalSession The global session ID to be used.
   * @returns the unique global session id with the window id.
   */
  static generateWindowSession(windowId: WindowDataTypes | number, globalSession: string): string {
    return `${globalSession}-windowId-${windowId}`;
  }

  public async globalSessionId(windowId: number): Promise<string> {
    return await this.globalSessionService.getGlobalSessionId(windowId, 'window');
  }

  /**
   * Checks whether the window has an open record stored locally.
   * @param windowId The browser window ID.
   * @returns True if a record exists for the window in the current global session.
   */
  public async hasWindowRecord(windowId: number): Promise<boolean> {
    const windowSessionId = await this.globalSessionId(windowId);
    const item = await this.dbService.getItem('winlives', windowSessionId);
    return Boolean(item) && !(item instanceof Error);
  }

  /**
   * Builds the payload to be sent to the server.
   * @param window_data The window data to be sent.
   * @param info The type of event that triggered the payload.
   * @param startTime The start time of the event.
   * @returns The payload to be sent to the server.
   */
  async buildPayload(
    windowData: WindowDataTypes | number,
    info: InfoType,
    startTime: string,
  ): Promise<WindowPayloadTypes> {
    const globalSession = await this.globalSessionService.getFromLocalStorage();

    if (!globalSession) {
      throw new Error('Global session is undefined');
    }

    const windowId = typeof windowData === 'number' ? windowData : windowData.id;

    if (windowId === undefined) {
      throw new Error('Window ID is undefined');
    }

    const windowSessionId = WindowManager.generateWindowSession(windowId, globalSession.global_session_id);
    console.log(`[${this.serviceName}] Generated window session ID:`, windowSessionId);

    const payload: WindowPayloadTypes = {
      start_time: startTime,
      closing_time: new Date().toISOString(),
      window_num: windowId,
      window_session_id: windowSessionId,
      global_session: globalSession.id,
    };
    return payload;
  }

  /**
   * Sends the window data to the server.
   * @param window The window data to be sent.
   * @param info The type of event that triggered the payload.
   */
  async sendWindow(
    window: WindowDataTypes | number,
    info: InfoType,
    method: 'POST' | 'PUT' | 'PATCH',
    startTime: string,
  ): Promise<Response> {
    try {
      const payload = await this.buildPayload(window, info, startTime);

      const response = await apiRequestWithDevice(
        `${this.apiUrl}/window/windows/`,
        { method, body: JSON.stringify(payload), signal: AbortSignal.timeout(WINDOW_REQUEST_TIMEOUT_MS) },
        { method },
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Error: ${response.status} - ${errorText}`);
      }

      // Save the window data response to the local database
      const responseBody = await response.json();
      console.log(`[${this.serviceName}] Window Response Creation:`, responseBody);
      await this.dbService.setItem('winlives', responseBody);

      return response;
    } catch (error) {
      console.error(`[${this.serviceName}] Error:`, error);
      throw error;
    }
  }

  /**
   * Updates the window data in the server.
   * @param window The window data to be sent.
   * @param info The type of event that triggered the payload.
   */
  async updateWindow(window: number, info: InfoType, method: 'PUT' | 'PATCH'): Promise<void> {
    const window_session_id = await this.globalSessionService.getGlobalSessionId(window, 'window');
    const pending = await this.dbService.retireWindow(window_session_id, new Date().toISOString(), method);
    await this.sendPendingClose(pending);
  }

  private async sendPendingClose(pending: PendingWindowClose): Promise<void> {
    const response = await apiRequestWithDevice(
      `${this.apiUrl}/window/windows/${pending.id}/`,
      {
        method: pending.method,
        body: JSON.stringify(pending.payload),
        signal: AbortSignal.timeout(WINDOW_REQUEST_TIMEOUT_MS),
      },
      { method: pending.method },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Error: ${response.status} - ${errorText}`);
    }

    await this.dbService.deleteWindowClose(pending.id);
  }

  public async retryPendingClosures(): Promise<void> {
    if (this.retryingClosures) return;
    this.retryingClosures = true;
    try {
      const session = await this.globalSessionService.getFromLocalStorage();
      if (!session?.user) {
        console.warn(`[${this.serviceName}] Cannot retry window closes without the current session owner`);
        return;
      }
      const records = await this.dbService.getAllItems('windowclosings');
      if (records instanceof Error) throw records;
      const owned = records.filter(record => record.payload.user === session.user);
      if (owned.length === 0) return;
      const start = this.retryOffset % owned.length;
      const batch = [...owned.slice(start), ...owned.slice(0, start)].slice(0, MAX_CLOSE_RETRIES_PER_ALARM);
      this.retryOffset = start + batch.length;
      for (const pending of batch) {
        try {
          await this.sendPendingClose(pending);
        } catch (error) {
          console.error(`[${this.serviceName}] Failed to retry window close ${pending.id}:`, error);
        }
      }
    } finally {
      this.retryingClosures = false;
    }
  }
}

export default WindowManager;
