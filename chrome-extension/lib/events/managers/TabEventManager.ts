/**
 * @fileoverview Manages tab-related events in the Chrome extension.
 * Handles tab updates, activations, and removals.
 * Integrates with DomainEventManager to track domain sessions across tabs.
 * Delegates domain-related policy decisions to the DomainPolicyService.
 */

import { tabs, Tabs } from 'webextension-polyfill';
import { TabHandler, DomainHandler, DomainDataTypes, TabPayloadTypes } from '@root/lib/handlers';
import DomainEventManager from './DomainEventManager';
import { DatabaseService, ItemTypes } from '@root/lib/db';
import { DomainPolicyService } from '@root/lib/services/policyService';

class TabEventManager {
  private readonly serviceName = 'TabEventManager';
  private domainEventManager: DomainEventManager;
  private domainPolicyService: DomainPolicyService;

  constructor(
    private tabManager: TabHandler,
    private dbService: DatabaseService,
    private domainManager: DomainHandler,
  ) {
    this.domainEventManager = new DomainEventManager(this.domainManager);
    this.domainPolicyService = new DomainPolicyService(this.dbService);
  }

  // ----------------- Core Listener -----------------
  /**
   * Initializes the event listeners for the tab events.
   * @returns void
   */
  public registerTabListeners() {
    // Register tab event listeners
    tabs.onUpdated.addListener(this.handleTabUpdate);
    tabs.onActivated.addListener(this.handleTabActivation);
    tabs.onRemoved.addListener(this.handleTabRemoval);
  }

  /**
   * Generates a domain session ID with the proper URL masking based on policy decisions.
   * Ensures the session ID matched the key stored by DomainHandler
   * @param windowId The ID of the window.
   * @param tabId The ID of the tab.
   * @param url The URL of the tab.
   * @returns The domain session ID to be used for policy decisions and storage.
   */
  private async generateMaskedDomainSessionId(windowId: number, tabId: number, url: string): Promise<string> {
    const maskUrl = await this.domainPolicyService.getMaskedUrl(url);
    console.log(`[${this.serviceName}] Generated masked URL for domain session: ${maskUrl} from original URL: ${url}`);
    return this.domainManager.generateDomainSession(windowId, tabId, url, maskUrl);
  }

  // -----------------         Helper Methods for message processing         -----------------
  // ----------------- Event Processing Helpers for unfocused tabs & windows -----------------
  /**
   * Handles the active tab focus event coming from the WindowEventManager.
   * Validates the window ID and processes the active tab focus by querying the active tab in the window and delegating to the tab activation handler.
   * @param windowId The ID of the window that has gained focus.
   * @returns void
   */
  public async handleActiveTabFocus(windowId: number | null): Promise<void> {
    try {
      if (!this.isValidWindowId(windowId)) {
        return;
      }

      await this.processActiveTabFocus(windowId!);
    } catch (error) {
      console.error(`[${this.serviceName}] Error handling active tab focus:`, error);
    }
  }

  private async processActiveTabFocus(windowId: number): Promise<void> {
    const [activeTab] = await tabs.query({ windowId, active: true });

    if (!activeTab?.id) {
      console.warn(`[${this.serviceName}] No active tab found for window:`, windowId);
      return;
    }
    await this.handleTabActivation({ tabId: activeTab.id, windowId: windowId });
  }

  /**
   * Validates the window ID before processing tab blur.
   * @param windowId The ID of the window.
   * @returns A boolean indicating if the window ID is valid.
   */
  private isValidWindowId(windowId: number | null): boolean {
    if (typeof windowId !== 'number') {
      console.warn('Invalid window ID:', windowId);
      return false;
    }
    return true;
  }

  /**
   * Processes the removal of the active tab in the specified window.
   * @param windowId The ID of the window.
   * @returns void
   */
  private async processActiveTabRemoval(windowId: number): Promise<void> {
    const [activeTab] = await tabs.query({ windowId, active: true });

    if (!activeTab?.id) {
      console.warn(`[${this.serviceName}] No active tab found for window:`, windowId);
      return;
    }

    const removeInfo = this.createRemoveInfo(windowId);
    await this.handleTabRemoval(activeTab.id, removeInfo);
    await this.domainEventManager.handleDomainCleanup();
  }

  /**
   * Creates the remove info object for tab removal.
   * @param windowId The ID of the window.
   * @param isWindowClosing Indicates if the window is closing.
   * @returns The remove info object.
   */
  private createRemoveInfo(windowId: number, isWindowClosing: boolean = false): Tabs.OnRemovedRemoveInfoType {
    return {
      windowId: windowId,
      isWindowClosing: isWindowClosing,
    };
  }

  /**
   * Principal method for handling active tab blur events coming from the WindowEventManager.
   * @param windowId The ID of the window.
   * @returns void
   */
  public async handleActiveTabBlur(windowId: number | null): Promise<void> {
    try {
      if (!this.isValidWindowId(windowId)) {
        return;
      }

      await this.processActiveTabRemoval(windowId!);
      await this.domainEventManager.handleDomainCleanup();
    } catch (error) {
      console.error(`[${this.serviceName}] Error handling active tab blur:`, error);
      await this.domainEventManager.handleDomainCleanup();
    }
  }

  // ----------------- Event Handlers -----------------

  // --------------------------------------------------
  // Tab Activation Event Handler
  // --------------------------------------------------
  private handleTabActivation = async (activeInfo: Tabs.OnActivatedActiveInfoType) => {
    try {
      console.log(`[${this.serviceName}] Tab Activation TAB EVENT`, activeInfo);
      const { tabId, windowId } = activeInfo;

      const windowSessionId = await this.tabManager.generateWindowSession(windowId);
      const mapwindow = await this.dbService.getItem('winlives', windowSessionId);

      if (!mapwindow || mapwindow instanceof Error) {
        console.warn(`[${this.serviceName}] No window mapping found for windowId:`, windowId);
        return;
      }

      const tab = await tabs.get(tabId);
      await this.handleTabUpdate(tabId, { status: 'complete' }, tab);

      // Only trigger HTML capture for re-activation (tab already loaded).
      // Fresh page loads are handled by the content script's own load+1s capture (Path B).
      if (tab.status === 'complete') {
        await this.domainEventManager.requestHTMLCapture(tabId);
      }
    } catch (error) {
      console.error(`[${this.serviceName}] Error processing tab activation`, error);
      this.handleTabError(error, 'activation');
    }
  };

  // --------------------------------------------------
  // TAB UPDATE EVENT HANDLER
  // --------------------------------------------------

  /**
   * Checks if the tab should be processed after the update is complete.
   * @param changeInfo The change information of the tab.
   * @returns A boolean indicating if the tab should be processed.
   */
  private shouldProcessTabUpdate(changeInfo: Tabs.OnUpdatedChangeInfoType) {
    return changeInfo.status === 'complete';
  }

  /**
   * Processes the tab update event.
   * @param tab The tab data.
   * @returns void
   */
  private async processTabUpdate(tab: Tabs.Tab) {
    try {
      if (typeof tab.windowId !== 'number') {
        throw new Error('Tab window ID is not a number');
      }

      const tabSessionId = await this.tabManager.generateTabSession(tab, tab.windowId);
      const mapping = await this.dbService.getItem('tabslives', tabSessionId);

      await (mapping !== null && !(mapping instanceof Error)
        ? this.handleExistingTab(tab, mapping)
        : this.handleNewTab(tab));
    } catch (error) {
      this.handleTabError(error, 'update', tab.id);
    }
  }

  /**
   * Registers the domain session early when the tab starts loading.
   * This closes any previous domain and marks the new one as pending so that
   * wavelets and content events that fire while the page is still loading can
   * wait for the domain instead of getting an empty domain_id.
   * @param tab The tab data.
   * @returns void
   */
  private async processTabLoading(tab: Tabs.Tab): Promise<void> {
    try {
      if (typeof tab.windowId !== 'number') {
        throw new Error('Tab window ID is not a number');
      }
      if (typeof tab.id !== 'number') {
        throw new Error('Tab ID is not a number');
      }
      if (typeof tab.url !== 'string') {
        throw new Error('Tab URL is not a string');
      }

      const tabSessionId = await this.tabManager.generateTabSession(tab, tab.windowId);
      const mapping = await this.dbService.getItem('tabslives', tabSessionId);

      // If the tab has not been persisted yet (new tab), we cannot register a domain
      // session early because we lack the backend tab ID. Fall back to the complete flow.
      if (mapping === null || mapping instanceof Error) {
        return;
      }

      const domainSessionId = await this.generateMaskedDomainSessionId(tab.windowId, tab.id, tab.url);

      const tabMapping = {
        ...mapping,
        id: mapping.id.toString(),
        url: tab.url,
        windowId: tab.windowId,
        domainSessionId: domainSessionId,
        index: tab.index,
        highlighted: tab.highlighted,
        active: tab.active,
        pinned: tab.pinned,
        incognito: tab.incognito,
      };

      const domainData: DomainDataTypes = {
        id: tab.id,
        favIconUrl: tab.favIconUrl || '',
        url: tab.url,
        title: tab.title || '',
        lastAccessed: tab.lastAccessed || 0,
        windowId: tab.windowId,
        status: 'loading',
      };

      console.log(`[${this.serviceName}] Early domain registration for loading tab:`, domainSessionId);
      await this.domainEventManager.handleDomainChange(domainSessionId, domainData, tabMapping);
    } catch (error) {
      this.handleTabError(error, 'loading', tab.id);
    }
  }

  /**
   * Handles the tab update event to check if the tab is new or not.
   * @param tabId The id of the tab.
   * @param changeInfo The change information of the tab.
   * @param tab The tab data.
   * @returns void
   */
  private handleTabUpdate = async (tabId: number, changeInfo: Tabs.OnUpdatedChangeInfoType, tab: Tabs.Tab) => {
    if (changeInfo.status === 'loading') {
      await this.processTabLoading(tab);
    } else if (this.shouldProcessTabUpdate(changeInfo)) {
      await this.processTabUpdate(tab);
    }
  };

  /**
   * Handles the existing tab updating the domain.
   * @param tab The tab data.
   * @param mapping The mapping data.
   * @returns void
   */
  private async handleExistingTab(tab: Tabs.Tab, mapping: ItemTypes) {
    console.log(`[${this.serviceName}] Processing existing Tab -Domain-`, tab.id);

    if (typeof tab.windowId !== 'number') {
      throw new Error('Tab window ID is not a number');
    }

    if (typeof tab.url !== 'string') {
      throw new Error('Tab URL is not a string');
    }

    if (typeof tab.id !== 'number') {
      throw new Error('Tab ID is not a number');
    }

    const domainSessionId = await this.generateMaskedDomainSessionId(tab.windowId, tab.id, tab.url);

    const tabMapping = {
      ...mapping,
      id: mapping.id.toString(),
      url: tab.url,
      windowId: tab.windowId,
      domainSessionId: domainSessionId,
      index: tab.index,
      highlighted: tab.highlighted,
      active: tab.active,
      pinned: tab.pinned,
      incognito: tab.incognito,
    };

    const domainData: DomainDataTypes = {
      id: tab.id,
      favIconUrl: tab.favIconUrl || '',
      url: tab.url,
      title: tab.title || '',
      lastAccessed: tab.lastAccessed || 0,
      windowId: tab.windowId,
      status: tab.status || '',
    };

    console.log(`[${this.serviceName}] Domain Session ID in TabEventManager:`, domainSessionId);
    if (tab.url) {
      await this.domainEventManager.handleDomainChange(domainSessionId, domainData, tabMapping);
    }
  }

  /**
   * Handles the new tab creation event.
   * @param tab The tab data.
   * @returns void
   * @throws An error if the tab cannot be handled.
   */
  private async handleNewTab(tab: Tabs.Tab) {
    console.log(`[${this.serviceName}] New Tab`, tab);
    try {
      if (typeof tab.windowId !== 'number') {
        throw new Error('Tab window ID is not a number');
      }
      if (typeof tab.id !== 'number') {
        throw new Error('Tab ID is not a number');
      }
      if (typeof tab.url !== 'string') {
        throw new Error('Tab URL is not a string');
      }

      const tabSessionId = await this.tabManager.generateTabSession(tab, tab.windowId);
      console.log(`[${this.serviceName}] Tab Session ID:`, tabSessionId);
      await this.tabManager.sendTab(tab, 'onCreated', 'POST');
      console.log(`[${this.serviceName}] New Tab Session ID:`, tabSessionId);

      const mapping = await this.dbService.getItem('tabslives', tabSessionId);
      console.log(`[${this.serviceName}] Mapping:`, mapping);

      if (mapping === null || mapping instanceof Error) {
        throw new Error('Tab mapping is null or an error');
      }
      console.log(`[${this.serviceName}] Mapping:`, mapping);

      const domainSessionId = await this.generateMaskedDomainSessionId(tab.windowId, tab.id, tab.url);
      console.log(`[${this.serviceName}] Domain Session ID in second Tab:`, domainSessionId);

      const tabMapping = {
        ...mapping,
        id: mapping.id.toString(),
        url: tab.url,
        windowId: tab.windowId,
        domainSessionId: domainSessionId,
        index: tab.index,
        highlighted: tab.highlighted,
        active: tab.active,
        pinned: tab.pinned,
        incognito: tab.incognito,
      };

      const domainData: DomainDataTypes = {
        id: tab.id,
        favIconUrl: tab.favIconUrl || '',
        url: tab.url,
        title: tab.title || '',
        lastAccessed: tab.lastAccessed || 0,
        windowId: tab.windowId,
        status: tab.status || '',
      };
      console.log(`[${this.serviceName}] domainData:`, domainData);

      if (tab.url) {
        // Create domain session for new tab
        await this.domainEventManager.handleDomainChange(domainSessionId, domainData, tabMapping);
      }
    } catch (error) {
      this.handleTabError(error, 'create', tab.id);
    }
  }

  // --------------------------------------------------
  // Tab Removal Event Handler
  // --------------------------------------------------

  /**
   * Handles the tab removal event to check if the tab is new or not.
   * @param tabId The id of the tab.
   * @param removeInfo The remove information of the tab.
   * @returns void
   * @throws An error if the tab cannot be handled.
   * @example
   * handleTabRemoval(tabId, removeInfo);
   */
  private handleTabRemoval = async (tabId: number, removeInfo: Tabs.OnRemovedRemoveInfoType) => {
    try {
      const tabSessionId = await this.tabManager.generateTabSession(tabId, removeInfo.windowId);
      console.log(`[${this.serviceName}] Tab Session ID on Removal:`, tabSessionId);
      const mapping = await this.dbService.getItem('tabslives', tabSessionId);

      if (mapping !== null && !(mapping instanceof Error)) {
        console.log(`[${this.serviceName}] Mapping BEFORE UPDATE:`, mapping);
        const payloadMapping: TabPayloadTypes = {
          closing_time: mapping.close_time,
          id: mapping.id,
          start_time: mapping.start_time,
          window_num: mapping.window_num,
          window: mapping.window,
          tab_num: mapping.tab_num,
          tab_session_id: mapping.tab_session_id,
          user: mapping.user,
          domains: [],
        };
        await this.handleExistingTabRemoval(tabId, payloadMapping);
      } else {
        await this.handleNonExistingTabRemoval(tabId);
      }
    } catch (error) {
      this.handleTabError(error, 'removal', tabId);
    }
  };

  private async handleExistingTabRemoval(tabId: number, mapping: TabPayloadTypes) {
    console.log(`[${this.serviceName}] Existing Tab Removal`, tabId);

    const domainSessionId = this.domainEventManager.activeDomainSessionId;

    if (domainSessionId) {
      await this.tabManager.updateTab(tabId, mapping, 'PATCH', domainSessionId);
    } else {
      console.warn(`[${this.serviceName}] No active domain session ID found for tab removal of tab ${tabId}`);
    }

    await this.domainEventManager.handleDomainCleanup();
  }

  private async handleNonExistingTabRemoval(tabId: number) {
    console.log(`[${this.serviceName}] Non-Existing Tab Removal`, tabId);
  }

  // --------------------------------------------------
  // Error Handlers
  // --------------------------------------------------

  /**
   * Handles the error for the tab event or delegate to the domain manager.
   * @param error The error data.
   * @param context The context of the error.
   * @param tabId The id of the tab.
   * @returns void
   */
  private handleTabError(error: unknown, context: string, tabId?: number) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[${this.serviceName}] Tab ${context} error for ${tabId || 'unknown tab'}:`, errorMessage);
  }
}

export default TabEventManager;
