/**
 * @fileoverview Manages browser window events.
 * Automatically registers event listeners for window events.
 */

import { DatabaseService } from '@root/lib/db';
import GlobalSessionService from '@root/lib/services/globalSession/GlobalSessionService';
import { WindowDataTypes, WindowPayloadTypes } from '../types/windowTypes';
import { apiUrl, InfoType } from '../shared';
import { apiRequestWithDevice } from '../../services/apiClientWithDevice';

/**
 * Manages browser window events.
 * Automatically registers event listeners for window events.
 */
class WindowManager {
  private readonly serviceName = 'WindowHandler';
  private dbService: DatabaseService;
  private globalSessionService: GlobalSessionService;
  private apiUrl: string;

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
        { method, body: JSON.stringify(payload) },
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
    const itemOrError = await this.dbService.getItem('winlives', window_session_id);
    console.log(`[${this.serviceName}] Item or Error:`, itemOrError);

    if (!itemOrError) {
      throw new Error(`Payload not found for window session ID: ${window_session_id}`);
    }

    if (itemOrError instanceof Error) {
      throw new Error(`Error: ${itemOrError.message}`);
    }

    const payload: WindowPayloadTypes = {
      ...itemOrError,
      closing_time: new Date().toISOString(),
    };

    console.log(`[${this.serviceName}] Window Payload to be updated:`, payload);

    if (payload.id === undefined) {
      throw new Error('Window ID is undefined');
    }

    const response = await apiRequestWithDevice(
      `${this.apiUrl}/window/windows/${payload.id}/`,
      { method, body: JSON.stringify(payload) },
      { method },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Error: ${response.status} - ${errorText}`);
    }

    const responseBody = await response.json();
    console.log(`[${this.serviceName}] Window Response Updated :`, responseBody);

    await this.dbService.deleteItem('winlives', window_session_id);
  }
}

export default WindowManager;
