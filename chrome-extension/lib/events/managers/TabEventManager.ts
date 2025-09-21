// Tab Event Manager

import {tabs, Tabs} from "webextension-polyfill";
import { TabHandler, DomainHandler, DomainDataTypes, TabPayloadTypes } from "@root/lib/handlers";
import DomainEventManager from "./DomainEventManager";
import { DatabaseService, ItemTypes} from "@root/lib/db";
import WindowEventManager from "./WindowEventManager";

class TabEventManager {
    // private currentActiveDomainSessionId: string | null = null;
    private domainEventManager: DomainEventManager

    constructor(
        private tabManager: TabHandler,
        private dbService: DatabaseService,
        private domainManager: DomainHandler,
        private windowEventManager: WindowEventManager
    ) {
        this.domainEventManager = new DomainEventManager(
            this.domainManager,
            this.dbService
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
        tabs.onRemoved.addListener(this.handleTabRemoval);
        tabs.onActivated.addListener(this.handleTabActivation);
    }

    // ----------------- Event Handlers -----------------

    // --------------------------------------------------
    // Tab Activation Event Handler
    // --------------------------------------------------
    private handleTabActivation = async (activeInfo: Tabs.OnActivatedActiveInfoType) => {
        try {
            console.log('Tab Activation', activeInfo);
            const { tabId, windowId } = activeInfo;

            // Generate tab session ID
            const tabSessionId = await this.tabManager.generateTabSession(tabId, windowId);
            console.log('Tab Session ID in Activation:', tabSessionId);
            const mapping = await this.dbService.getItem('tabslives', tabSessionId);

            if (!mapping){
                // If no mapping exists, create window, tab, and domain sessions
                await this.handleNewTabActivation(tabId, windowId);
            }

            await this.handleTabUpdate(tabId, {status: 'complete'}, await tabs.get(tabId));

            } catch (error) {
                console.error('Error processing tab activation', error);
                this.handleTabError(error, 'activation');
        }
    };

    private async handleNewTabActivation(tabId: number, windowId: number) {
        console.log('New Window/Tab Activation', tabId);
        this.windowEventManager.processWindowCreation(windowId);
    }

    // --------------------------------------------------
    // Tab Update Event Handler
    // --------------------------------------------------
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
            console.log('Tab Session ID:', tabSessionId);
            const mapping = await this.dbService.getItem('tabslives', tabSessionId);

            await (mapping !== null && !(mapping instanceof Error)
                ? this.handleExistingTab(tab, mapping)
                : this.handleNewTab(tab));
        } catch (error) {
            this.handleTabError(error, 'update', tab.id);
        }
    }

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