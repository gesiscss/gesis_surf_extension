/**
 * @fileoverview Manages content event routing, validation, and processing logic
 * @implements {ContentEventManager}
 */

import { DatabaseService } from '@root/lib/db';
import { Runtime, Tabs } from 'webextension-polyfill';
import DomainManager from '@root/lib/handlers/clients/DomainHandler';
import { DomainInfo, ContentScriptHandler, ContentEventType } from '@root/lib/handlers';
import { ClickData, ScrollData, HTMLSnapshot, EventResult } from '@chrome-extension-boilerplate/shared/lib/types/contentScript';
import { storage } from 'webextension-polyfill';


/**
 * Handles content event routing and validation logic
 */
export default class ContentEventHandler {
    private domainManager: DomainManager;
    private dbService: DatabaseService;
    private apiClient: ContentScriptHandler;

    constructor(apiUrl: string) {
        this.domainManager = new DomainManager();
        this.dbService = new DatabaseService();
        this.apiClient = new ContentScriptHandler(apiUrl);
    }

    private async isPrivateModeActive(): Promise<boolean> {
        try {
            const privateModeData = await storage.local.get('privateMode');
            const state = privateModeData['privateMode'];
            return state?.mode === true;
        } catch (error) {
            console.error('[ContentEventHandler] Error checking private mode status:', error);
            return false;
        }
    }

    /**
     * Entry point for handling content events
     * @param eventType Type of content event
     * @param eventData Event data payload
     * @param sender Message sender info
     * @returns EventResult
     */
    public async handleContentEvent(
        eventType: ContentEventType,
        eventData: ClickData | ScrollData | HTMLSnapshot,
        sender: Runtime.MessageSender
    ): Promise<EventResult> {

        console.log(`[ContentEventHandler] Processing ${eventType}:`, eventData);
        
        try {
            const { domainSessionId, domainInfo } = await this.validateAndGetDomainInfo(sender);

            await this.routeEvent(eventType, eventData, domainInfo, domainSessionId);

            return { 
                status: 'success', 
                message: `${eventType} processed successfully` 
            };
            
        } catch (error) {
            console.error(`[ContentEventHandler] Error handling ${eventType}:`, error);
            return { 
                status: 'error', 
                message: error instanceof Error ? error.message : 'Unknown error' 
            };
        }
    }

    /**
     * Validate sender and get domain information
     * @param sender Message sender info
     * @returns Domain session ID and domain info
     */
    private async validateAndGetDomainInfo(sender: Runtime.MessageSender): Promise<{
        domainSessionId: string;
        domainInfo: DomainInfo;
    }> {

        const domainSessionId = await this.getDomainSessionId(sender.tab);
        if (!domainSessionId) {
            throw new Error('Failed to get domain session ID');
        }

        const domainInfo = await this.dbService.getItem('domainslives', domainSessionId);

        console.log('[ContentEventHandler] Retrieved domain info from DB:', domainInfo);
        
        if (!domainInfo) {
            throw new Error('Domain not found in database');
        }

        if (domainInfo instanceof Error) {
            throw new Error(`Database error: ${domainInfo.message}`);
        }

        const validDomainInfo = domainInfo as unknown as DomainInfo;

        return { domainSessionId, domainInfo: validDomainInfo };
    }

    /**
     * Route event to appropriate handler
     * @param eventType Type of content event
     * @param eventData Event data payload
     * 
     */
    private async routeEvent(
        eventType: ContentEventType,
        eventData: ClickData | ScrollData | HTMLSnapshot,
        domainInfo: DomainInfo,
        domainSessionId: string
    ): Promise<void> {
        switch (eventType) {
            case ContentEventType.CLICK:
                await this.handleClick(eventData as ClickData, domainInfo, domainSessionId);
                break;
                
            case ContentEventType.SCROLL:
                await this.handleScroll(eventData as ScrollData, domainInfo, domainSessionId, false);
                break;
                
            case ContentEventType.SCROLL_FINAL:
                await this.handleScroll(eventData as ScrollData, domainInfo, domainSessionId, true);
                break;
                
            case ContentEventType.HTML_CAPTURE:
                await this.handleHTML(eventData as HTMLSnapshot, domainInfo);
                break;
                
            default:
                throw new Error(`Unknown event type: ${eventType}`);
        }
    }

    /**
     * Get domain session ID using domain manager to allocate session to resource
     * @param tab Chrome tab information
     * @returns Domain session ID or null
     */
    private async getDomainSessionId(tab?: Tabs.Tab): Promise<string | null> {
        if (!tab || !tab.id || !tab.windowId || !tab.url) {
            console.error('[ContentEventHandler] Missing tab information');
            return null;
        }
        
        try {
            const domainSessionId = await this.domainManager.generateDomainSession(
                tab.windowId,
                tab.id,
                tab.url
            );

            return domainSessionId;
            
        } catch (error) {
            console.error('[ContentEventHandler] Error generating domain session:', error);
            return null;
        }
    }

    /**
     * Handle click events
     * @param clickData Click event data
     * @param domainInfo Domain information
     * @param domainSessionId Domain session ID
     * @returns Promise<void>
     */
    private async handleClick(
        clickData: ClickData,
        domainInfo: DomainInfo,
        domainSessionId: string
    ): Promise<void> {
        console.log('[ContentEventHandler] Processing click event');
        await this.apiClient.sendClick(clickData, domainInfo, domainSessionId);
    }

    /**
     * Handle scroll events
     * @param scrollData Scroll event data
     * @param domainInfo Domain information
     * @param domainSessionId Domain session ID
     * @param isFinal Whether this is the final scroll event
     * @returns Promise<void>
     */
    private async handleScroll(
        scrollData: ScrollData,
        domainInfo: DomainInfo,
        domainSessionId: string,
        isFinal: boolean
    ): Promise<void> {
        console.log(`[ContentEventHandler] Processing scroll event (final: ${isFinal})`);
        await this.apiClient.sendScroll(scrollData, domainInfo, domainSessionId, isFinal);
    }

    /**
     * Handle HTML capture events
     * @param htmlData HTML snapshot data
     * @param domainInfo Domain information
     * @param domainSessionId Domain session ID
     * @returns Promise<void>
     */
    private async handleHTML(
        htmlData: HTMLSnapshot,
        domainInfo: DomainInfo
    ): Promise<void> {
        console.log('[ContentEventHandler] Processing HTML capture');
        await this.apiClient.sendHTML(htmlData, domainInfo);
    }
}