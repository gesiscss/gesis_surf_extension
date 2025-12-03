/**
 * @fileoverview Handles API operations for content script events (clicks, scrolls, HTML captures)
 * @implements {ContentScriptHandler}
 */

import { readToken } from '@chrome-extension-boilerplate/shared/lib/storages/tokenStorage';
import { GlobalSessionService } from '@root/lib/services';
import { HTMLSnapshot, ClickData, ScrollData } from '@chrome-extension-boilerplate/shared/lib/types/contentScript';
import { ClickPayload, ScrollPayload, HTMLPayload, DomainInfo } from '../types/contentScriptTypes';

/**
 * Handles API operations for content script events (clicks, scrolls, HTML captures)
 */
export default class ContentScriptHandler {
    private globalSessionService: GlobalSessionService;
    private apiUrl: string;

    private lastScrollSent: number = 0;
    private readonly SCROLL_THROTTLE = 1000;

    constructor(apiUrl: string) {
        this.apiUrl = apiUrl;
        this.globalSessionService = new GlobalSessionService(apiUrl);
    }

    /**
     * Send click event data
     * @param clickData Click event data
     * @param domainInfo Domain information
     * @param domainSessionId Domain session ID
     * @returns Promise<void>
     */
    public async sendClick(clickData: ClickData, domainInfo: DomainInfo, domainSessionId: string): Promise<void> {

        const payload: ClickPayload = {
            click_time: clickData.click_time,
            click_type: clickData.click_type,
            click_target_element: clickData.click_target_element,
            click_target_tag: clickData.click_target_tag,
            click_target_class: clickData.click_target_class,
            click_page_x: clickData.click_page_x,
            click_page_y: clickData.click_page_y,
            click_referrer: clickData.click_referrer,
            click_target_id: clickData.click_target_id || 'unknown',
            domain_id: domainInfo.id,
            domain_session_id: domainSessionId
        };

        const requestOptions = await this.requestOptions(payload, 'POST');

        const response = await fetch(`${this.apiUrl}/clicks/clicks/`, requestOptions);

        if (!response.ok) {
            throw new Error(`Click API failed: ${response.status} - ${response.statusText}`);
        }

        await response.json();
    }

    /**
     * Send scroll
     * @param scrollData Scroll event data
     * @param domainInfo Domain information
     * @param domainSessionId Domain session ID
     * @param isFinal Whether this is the final scroll event
     * @returns Promise<void>
     */
    public async sendScroll(
        scrollData: ScrollData,
        domainInfo: DomainInfo,
        domainSessionId: string,
        isFinal: boolean = false
    ): Promise<void> {

        // Rate limiting for regular scroll events
        if (!isFinal) {
            const now = Date.now();
            if (now - this.lastScrollSent < this.SCROLL_THROTTLE) {
                console.log('[ContentApiClient] Scroll throttled');
                return;
            }
            this.lastScrollSent = now;
        }

        console.log('[ContentApiClient] Sending scroll data', scrollData);

        const scrollTime = scrollData.scrollTime instanceof Date
            ? scrollData.scrollTime.toISOString()
            : scrollData.scrollTime;

        const payload: ScrollPayload = {
            scroll_time: scrollTime,
            scroll_x: scrollData.scrollX,
            scroll_y: scrollData.scrollY,
            page_x_offset: scrollData.pageXOffset,
            page_y_offset: scrollData.pageYOffset,
            scroll_metrics: scrollData.scroll_metrics,
            domain_id: domainInfo.id,
            domain_session_id: domainSessionId,
            is_final: isFinal
        };

        console.log('[ContentApiClient] Scroll payload prepared', payload);

        const requestOptions = await this.requestOptions(payload, 'POST');

        console.log('[ContentApiClient] Sending scroll to API', requestOptions);

        const response = await fetch(`${this.apiUrl}/scrolls/scrolls/`, requestOptions);

        if (!response.ok) {
            throw new Error(`Scroll API failed: ${response.status} - ${response.statusText}`);
        }

        await response.json();

    }

    /**
     * Send HTML capture
     * @param htmlData HTML snapshot data
     * @param domainInfo Domain information
     * @param domainSessionId Domain session ID
     * @returns Promise<void>
     */
    public async sendHTML(
        htmlData: HTMLSnapshot,
        domainInfo: DomainInfo,
        domainSessionId: string
    ): Promise<void> {
        
        const globalSession = await this.globalSessionService.getFromLocalStorage();
        if (!globalSession) {
            throw new Error('Global session not found');
        }

        const payload: HTMLPayload = {
            html_content: htmlData.html_content,
            meta: htmlData.meta || {},
            domain_id: domainInfo.id,
            domain_session_id: domainSessionId,
            global_session: globalSession.id,
            captured_at: new Date().toISOString(),
            size: new Blob([htmlData.html_content]).size
        };

        try {
            const endpoint = `${this.apiUrl}/domains/${payload.domain_id}/html/`;
            const requestOptions = await this.requestOptions(payload, 'POST');
            const response = await fetch(endpoint, requestOptions);

            if (!response.ok) {
                throw new Error(`HTML API failed: ${response.status} - ${response.statusText}`);
            }

            await response.json();
            console.log('[ContentApiClient] HTML sent');

        } catch (error) {
            console.error('[ContentApiClient] Error sending HTML:', error);
            throw error;
        }
    }

    /**
     * Create request options with auth
     * @param payload Payload data
     * @param method HTTP method
     * @returns RequestInit
     */
    private async requestOptions<T>(payload: T, method: string): Promise<RequestInit> {
        const token = await readToken();
        if (!token) {
            throw new Error('Authentication token not found');
        }

        return {
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Token ${token}`
            },
            body: JSON.stringify(payload)
        };
    }
}