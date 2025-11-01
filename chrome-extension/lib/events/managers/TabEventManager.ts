// Tab Event Manager

import {tabs, Tabs} from "webextension-polyfill";
import { TabHandler, DomainHandler, DomainDataTypes, TabPayloadTypes } from "@root/lib/handlers";
import DomainEventManager from "./DomainEventManager";
import { DatabaseService, ItemTypes} from "@root/lib/db";

class TabEventManager {
    private domainEventManager: DomainEventManager

    constructor(
        private tabManager: TabHandler,
        private dbService: DatabaseService,
        private domainManager: DomainHandler,
    ) {
        this.domainEventManager = new DomainEventManager(
            this.domainManager
        );
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

    // ----------------- Helper Methods for message processing -----------------
    // ----------------- Event Processing Helpers for unfocused tabs & windows -----------------

    public async handleActiveTabFocus(windowId: number | null) : Promise<void> {
        try {
            if (!this.isValidWindowId(windowId)) {
                return;
            }
            
            await this.processActiveTabFocus(windowId!);

        } catch (error) {
            console.error('Error handling active tab focus:', error);
        }
    }

    private async processActiveTabFocus(windowId: number): Promise<void> {
        
        const [activeTab] = await tabs.query({ windowId, active: true });
        
        if (!activeTab?.id) {
            console.warn('No active tab found for window:', windowId);
            return;
        }
        await this.handleTabActivation({tabId: activeTab.id, windowId: windowId});
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
            console.warn('No active tab found for window:', windowId);
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
    public async handleActiveTabBlur(windowId: number | null) : Promise<void> {
        try {
            if (!this.isValidWindowId(windowId)) {
                return;
            }

            await this.processActiveTabRemoval(windowId!);
            await this.domainEventManager.handleDomainCleanup();

        } catch (error) {
            console.error('Error handling active tab blur:', error);
            await this.domainEventManager.handleDomainCleanup();
        }
    }

    // ----------------- Event Handlers -----------------

    // --------------------------------------------------
    // Tab Activation Event Handler
    // --------------------------------------------------
    private handleTabActivation = async (
        activeInfo: Tabs.OnActivatedActiveInfoType
    ) => {
        try {
            console.log('Tab Activation TAB EVENT', activeInfo);
            const { tabId, windowId } = activeInfo;

            const windowSessionId = await this.tabManager.generateWindowSession(windowId);
            const mapwindow = await this.dbService.getItem('winlives', windowSessionId);

            if (!mapwindow || mapwindow instanceof Error) {
                console.warn('No window mapping found for windowId:', windowId);
                return;
            }

            await this.handleTabUpdate(tabId, {status: 'complete'}, await tabs.get(tabId));
        
        } catch (error) {
                console.error('Error processing tab activation', error);
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
    };
    
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
     * Handles the tab update event to check if the tab is new or not.
     * @param tabId The id of the tab.
     * @param changeInfo The change information of the tab.
     * @param tab The tab data.
     * @returns void
    */
    private handleTabUpdate = async (
        tabId: number,
        changeInfo: Tabs.OnUpdatedChangeInfoType,
        tab: Tabs.Tab
    ) => {
        
        if (this.shouldProcessTabUpdate(changeInfo)) {
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
        console.log('Processing existing Tab -Domain-', tab.id);

        if (typeof tab.windowId !== 'number') {
            throw new Error('Tab window ID is not a number');
        }

        if (typeof tab.url !== 'string') {
            throw new Error('Tab URL is not a string');
        }

        if (typeof tab.id !== 'number') {
            throw new Error('Tab ID is not a number');
        }

        const domainSessionId = await this.domainManager.generateDomainSession(
            tab.windowId,
            tab.id,
            tab.url
        );

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
            incognito: tab.incognito
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

        console.log('Domain Session ID in TabEventManager:', domainSessionId);
        if (tab.url) {
            await this.domainEventManager.handleDomainChange(
                domainSessionId,
                domainData,
                tabMapping
            );
        }
    }

    /**
     * Handles the new tab creation event.
     * @param tab The tab data.
     * @returns void
     * @throws An error if the tab cannot be handled.
     */
    private async handleNewTab(tab: Tabs.Tab) {
        console.log('New Tab', tab);
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
            console.log('Tab Session ID:', tabSessionId);
            await this.tabManager.sendTab(tab, 'onCreated', 'POST');
            console.log('New Tab Session ID:', tabSessionId);

            const mapping = await this.dbService.getItem('tabslives', tabSessionId);
            console.log('Mapping:', mapping);
            
            if (mapping === null || mapping instanceof Error) {
                throw new Error('Tab mapping is null or an error');
            }
            console.log('Mapping:', mapping);

            const domainSessionId = await this.domainManager.generateDomainSession(
                tab.windowId,
                tab.id,
                tab.url
            );
            console.log('Domain Session ID in second Tab:', domainSessionId);

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
            console.log('domainData:', domainData);

            if (tab.url) {
                // Create domain session for new tab
                await this.domainEventManager.handleDomainChange(
                    domainSessionId,
                    domainData,
                    tabMapping
                );
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
    private handleTabRemoval = async (
        tabId: number,
        removeInfo: Tabs.OnRemovedRemoveInfoType
    ) => {
        try {
            const tabSessionId = await this.tabManager.generateTabSession(tabId, removeInfo.windowId);
            console.log('Tab Session ID on Removal:', tabSessionId);
            const mapping = await this.dbService.getItem('tabslives', tabSessionId);
    
            if (mapping !== null && !(mapping instanceof Error)) {
                console.log("Mapping BEFORE UPDATE:", mapping);
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
    }


    private async handleExistingTabRemoval(tabId: number, mapping: TabPayloadTypes) {
        console.log('Existing Tab Removal', tabId);

        if (typeof this.domainEventManager.activeDomainSessionId !== 'string') {
            throw new Error('Domain session ID is not a string');
        }

        await this.tabManager.updateTab(tabId, mapping, 'PATCH', this.domainEventManager.activeDomainSessionId);

        await this.domainEventManager.handleDomainCleanup();
    }

    private async handleNonExistingTabRemoval(tabId: number) {
        console.log('Non-Existing Tab Removal', tabId);
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
        console.error(`Tab ${context} error for ${tabId || 'unknown tab'}:`, errorMessage);
    }

}

export default TabEventManager;