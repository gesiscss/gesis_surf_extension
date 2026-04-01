/**
 * @fileoverview Handles browser tab events and interactions with the server.
 * Manages tab creation, updates, and closures. Integrates with DomainEventManager for domain tracking.
 * Communicates with the server to create/update tab records and manage sessions.
 */

import { Tabs } from 'webextension-polyfill';
import { DatabaseService } from '@root/lib/db';
import { GlobalSessionService } from '@root/lib/services';
import DomainManager from './DomainHandler';
import { readToken } from '@chrome-extension-boilerplate/shared/lib/storages/tokenStorage';
import { DomainObjectDataTypes, TabDataTypes, TabPayloadTypes } from '../types/tabTypes';
import { apiUrl, InfoType } from '../shared';

/**
 * Manages browser tabs requests.
 * Sends requests to the server to manage tabs.
 */
class TabManager {
  private readonly serviceName = 'TabHandler';
  private dbService: DatabaseService;
  private domainService: DomainManager;
  private globalSessionService: GlobalSessionService;

  constructor() {
    this.dbService = new DatabaseService();
    this.domainService = new DomainManager();
    this.globalSessionService = new GlobalSessionService(apiUrl);
  }

  /**
   * Generates a Session ID for the tab.
   * @param tabId The tab data to be hashed.
   * @returns the unique global session id with the tab id.
   */
  async generateTabSession(tab: TabDataTypes | number | Tabs.Tab, windowId: number): Promise<string> {
    const windowSessionId = await this.globalSessionService.getGlobalSessionId(windowId, 'window');
    const tabId = typeof tab === 'number' ? tab : tab.id;
    return `${windowSessionId}-tabId-${tabId}`;
  }

  async generateWindowSession(windowId: number): Promise<string> {
    return await this.globalSessionService.getGlobalSessionId(windowId, 'window');
  }

  /**
   * Builds the payload to be sent to the server.
   * @param tab_data The tab data to be sent.
   * @param info The type of event that triggered the payload.
   * @returns The payload to be sent to the server.
   */
  async buildPayload(tab_data: TabDataTypes, info: InfoType, windowId: number): Promise<TabPayloadTypes> {
    const tabId = typeof tab_data === 'number' ? tab_data : tab_data.id;

    const payload: TabPayloadTypes = {
      start_time: new Date().toISOString(),
      closing_time: new Date().toISOString(),
      window_num: tab_data.windowId,
      tab_num: tabId,
      window: windowId,
      domains: [],
      tab_session_id: await this.generateTabSession(tab_data, tab_data.windowId),
    };
    return payload;
  }

  /**
   * Builds the request options for the fetch request.
   * @param payload The payload to be sent to the server.
   * @param method The method to be used in the fetch request.
   * @returns The request options for the fetch request.
   */
  async requestOptions(payload: TabPayloadTypes, method: string): Promise<RequestInit | undefined> {
    try {
      const token = await readToken();
      if (token) {
        const headers = new Headers();
        headers.append('Content-Type', 'application/json');
        headers.append('Authorization', `Token ${token}`);
        const options: RequestInit = {
          method: method,
          headers: headers,
          body: JSON.stringify(payload),
        };
        return options;
      }
    } catch (error) {
      console.error(`[${this.serviceName}] Failed to get token:`, error);
    }
    return undefined;
  }

  /**
   * Sends the tab data to the server.
   * @param tab The tab data to be sent.
   * @param info The type of event that triggered the payload.
   * @param method The method to be used in the fetch request.
   * @returns The response from the server.
   * @throws An error if the request fails.
   */
  async sendTab(tab: Tabs.Tab, info: InfoType, method: string): Promise<Response> {
    console.log(`[${this.serviceName}] Tab in send tabs:`, tab);
    try {
      if (typeof tab.windowId !== 'number') {
        throw new Error('Tab window ID is not a number');
      }

      //  Getting window data for relation
      const windowSessionId = await this.globalSessionService.getGlobalSessionId(tab.windowId, 'window');
      console.log(`[${this.serviceName}] Window Session ID:`, windowSessionId);

      const windowData = await this.dbService.getItem('winlives', windowSessionId);
      console.log(`[${this.serviceName}] Window Data:`, windowData);

      if (!windowData || windowData instanceof Error) {
        throw new Error('Window data not found');
      }
      const windowId: number = windowData.id;

      if (!tab || !info || !method) {
        throw new Error('Invalid input parameters');
      }

      if (typeof tab.id !== 'number') {
        throw new Error('Tab ID is not a number');
      }

      if (typeof tab.url !== 'string') {
        throw new Error('Tab URL is not a string');
      }

      const tabData: TabDataTypes = {
        id: tab.id,
        windowId: tab.windowId,
        active: tab.active,
        url: tab.url,
        title: tab.title || '',
        favIconUrl: tab.favIconUrl || '',
        status: tab.status || '',
        lastAccessed: tab.lastAccessed || 0,
        incognito: tab.incognito || false,
        pinned: tab.pinned || false,
      };

      const payloadTab = await this.buildPayload(tabData, info, windowId);
      console.log(`[${this.serviceName}] Payload:`, payloadTab);

      // Prepare the request options for the Tab
      const requestOptionsTab = await this.requestOptions(payloadTab, method);

      if (!requestOptionsTab) {
        throw new Error('Request options are undefined');
      }

      // Send the Tab data to the server
      const tabResponse = await fetch(`${apiUrl}/tab/tabs/`, requestOptionsTab);
      if (!tabResponse.ok) {
        throw new Error('Failed to send tab');
      }

      const responseBody = await tabResponse.json();
      await this.dbService.setItem('tabslives', responseBody);

      console.log(`[${this.serviceName}] Tab Response:`, responseBody);
      return tabResponse;
    } catch (error) {
      console.error(`[${this.serviceName}] Failed to send tab:`, error);
      throw error;
    }
  }

  /**
   * Updates the tab data in the server.
   * @param tab The tab data to be updated.
   * @param info The type of event that triggered the payload.
   */
  async updateTab(tabId: number, mapping: TabPayloadTypes, method: string, domainSessionId: string): Promise<Response> {
    console.log(`[${this.serviceName}] Mapping Tab:`, mapping);
    try {
      const payload = JSON.parse(JSON.stringify(mapping));
      tabId = payload.id;

      // Update the close time of the tab
      payload.close_time = new Date().toISOString();
      delete payload.domains;

      // Create the request options
      const requestOptions = await this.requestOptions(payload, method);

      if (!requestOptions) {
        throw new Error('Request options are undefined');
      }

      // Send the updated tab data to the server
      console.log(`[${this.serviceName}] Payload update:`, payload);
      const responseTab = await fetch(`${apiUrl}/tab/tabs/${tabId}/`, requestOptions);

      if (!responseTab.ok) {
        throw new Error('Failed to update tab');
      }

      console.log(`[${this.serviceName}] Domain Session ID:`, domainSessionId);
      console.log(`[${this.serviceName}] Control point after updating tab, before updating domain`);
      await this.closeDomainForTab(domainSessionId, method);

      if (mapping.tab_session_id === undefined) {
        throw new Error('Tab session ID is undefined');
      }
      await this.dbService.deleteItem('tabslives', mapping.tab_session_id);
      return responseTab;
    } catch (error) {
      console.error(`[${this.serviceName}] Failed to update tab:`, error);
      throw error;
    }
  }

  /**
   * Closes the domain associated with a tab.
   * @param domainSessionId The session ID of the domain to be closed.
   * @param method The HTTP method to be used for the request.
   * @returns A promise that resolves when the domain is closed.
   */
  private async closeDomainForTab(domainSessionId: string, method: string): Promise<void> {
    const itemOrError = await this.dbService.getItem('domainslives', domainSessionId);

    if (!itemOrError) {
      console.warn(`[${this.serviceName}] No domain found for session ID: ${domainSessionId}`);
      return;
    }

    if (itemOrError instanceof Error) {
      console.error(`[${this.serviceName}] Error retrieving domain for session ID ${domainSessionId}:`, itemOrError);
      return;
    }

    const domainItem = itemOrError as Partial<DomainObjectDataTypes>;
    const payloadDomain: DomainObjectDataTypes = {
      id: domainItem.id || 0,
      domain_fav_icon: domainItem.domain_fav_icon || '',
      domain_last_accessed: domainItem.domain_last_accessed || '',
      domain_session_id: domainItem.domain_session_id || '',
      domain_title: domainItem.domain_title || '',
      domain_url: domainItem.domain_url || '',
      start_time: domainItem.start_time || '',
      closing_time: new Date().toISOString(),
    };

    const requestOptionsDomain = await this.domainService.requestOptions(payloadDomain, method);

    if (!requestOptionsDomain) {
      console.error(`[${this.serviceName}] Request options for domain are undefined, skipping domain update`);
      return;
    }

    const responseDomain = await fetch(`${apiUrl}/domain/domains/${payloadDomain.id}/`, requestOptionsDomain);
    if (!responseDomain.ok) {
      console.error(`[${this.serviceName}] Failed to update domain for session ID: ${domainSessionId}`);
    }
  }
}

export default TabManager;
