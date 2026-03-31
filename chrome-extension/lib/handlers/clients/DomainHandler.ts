/**
 * @fileoverview Manages browser domain API operations.
 * Pure HTTP client for domain-related interactions with the backend API.
 * Policy decisions and payload construction are delegated to the DomainPolicyService.
 */

import { DatabaseService } from "@root/lib/db";
import { GlobalSessionService } from "@root/lib/services";
import { readToken } from "@chrome-extension-boilerplate/shared/lib/storages/tokenStorage";
import { DomainDataTypes, DomainResponseTypes, DomainPayloadTypes } from "../types/domainTypes";
import { apiUrl } from "../shared";
import { TabMapping } from "../types";
import { DomainPolicyService } from "@root/lib/services/policyService";

class DomainManager {
    private readonly serviceName = 'DomainManager';
    private dbService: DatabaseService;
    private globalSessionService: GlobalSessionService;
    private domainPolicyService: DomainPolicyService;

    constructor() {
        this.dbService = new DatabaseService();
        this.globalSessionService = new GlobalSessionService(apiUrl);
        this.domainPolicyService = new DomainPolicyService(this.dbService);
    }

    /**
     * Create a new Domain Session ID.
     * @param domainUrl The domain URL.
     * @param windowId The ID of the window.
     * @param tabId The ID of the tab.
     * @returns The unique domain session id with the domain URL.
     */
    async generateDomainSession(
        windowId: number, 
        tabId: number, 
        domainUrl: string,
        maskUrl?: string
    ): Promise<string> {
        const windowSessionId = await this.globalSessionService.getGlobalSessionId(windowId, 'window');
        const urlPart = maskUrl ? maskUrl : domainUrl;
        return `${windowSessionId}-tabId-${tabId}-domain-${urlPart}`;
    }

    /**
     * Transform the domain last accessed time to a human-readable format.
     * @param lastAccessed The last accessed time of the domain.
     * @returns The last accessed time in a human-readable format.
     */
    async formatLastAccessed(lastAccessed: number):  Promise<string> {
        const date = new Date(lastAccessed);
        return date.toISOString();
    }

    /**
     * Builds the payload to be sent to the server.
     * @param domain_data The domain data to be sent.
     * @returns The payload to be sent to the server.
     */
    async buildPayload(domain_data: DomainDataTypes): Promise<DomainPayloadTypes | null> {

        console.log(`[${this.serviceName}] Building payload for domain data:`, domain_data);

        if (domain_data.status !== 'complete') {
            console.log(`[${this.serviceName}] Domain data status is not complete, skipping payload build for URL: ${domain_data.url}`);
            return null;
        }
        
        try {

            const payload = await this.domainPolicyService.evaluate(domain_data.url, domain_data);

            const shouldMaskUrl = payload.domain_url !== domain_data.url;
            const urlMask = shouldMaskUrl ? payload.domain_url : undefined;

            return {
                ...payload,
                domain_last_accessed: await this.formatLastAccessed(domain_data.lastAccessed),
                domain_session_id: await this.generateDomainSession(
                    domain_data.windowId,
                    domain_data.id,
                    domain_data.url,
                    urlMask
                ),  
            };
        } catch (error) {
            console.error(`[${this.serviceName}] Error building payload:`, error);
            return null;
        }
    }

    /**
     * Creates the request options for the fetch request.
     * @param payload The payload to be sent.
     * @param method The method to be used in the fetch request.
     * @returns The request options for the fetch request.
     */
    async requestOptions<T>(payload: T, method: string): Promise<RequestInit | undefined> {
        try{
            const token = await readToken();
            if (token){
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
     * Sends the domain data to the server.
     * @param domainData The domain data to be sent.
     * @param tabSessionId The tab session ID to be used.
     * @param method The method to be used in the fetch request.
     */
    async sendDomain(domainData: DomainDataTypes, tabSessionId: TabMapping, method: string): Promise<string | undefined> {

        // Build single domain payload
        const payloadDomain = await this.buildPayload(domainData);
        
        console.log(`[${this.serviceName}] Payload Domain to be sent:`, payloadDomain);
        console.log(`[${this.serviceName}] Tab Session ID to be used:`, tabSessionId);

        if (!payloadDomain) {
            console.error(`[${this.serviceName}] Error building domain payload`);
            return undefined;
        }

        // Create the payload inside domains
        const payload = {
            domains: [payloadDomain],
        };

        // Create the request options
        const requestOptions = await this.requestOptions(payload, method);
        if (!requestOptions) {
            console.error(`[${this.serviceName}] Error building request options`);
            return undefined;
        }

        // Get the tab instance ID
        const windowId = tabSessionId.id;

        console.log(`[${this.serviceName}] Payload Domain:`, payloadDomain);
        console.log(`[${this.serviceName}] Request Options:`, requestOptions);
        console.log(`[${this.serviceName}] Window ID:`, windowId);
        console.log(`[${this.serviceName}] Tab Session ID:`, tabSessionId);

        try {
            const response = await fetch(`${apiUrl}/tab/tabs/${windowId}/`, requestOptions);
            const data = await response.json();

            if (!response.ok) {
                throw new Error(`[${this.serviceName}] Error: ${response.status} - ${JSON.stringify(data)}`);
            }

            console.log(`[${this.serviceName}] Fetch Response:`, response);
            console.log(`[${this.serviceName}] Response Domain:`, data);

            // Extract the domain session ID from the response
            console.log(`[${this.serviceName}] Domains in response:`, data.domains);

            // Find the created domain in the response by domain_session_id and latest start_time (NEED CORRECTION)
            if (!data.domains || data.domains.length === 0) {
                console.error(`[${this.serviceName}] No domains found in response`);
                return undefined;
            }

            const sortedDomains = data.domains.sort((a: DomainResponseTypes, b: DomainResponseTypes) => {
                return new Date(b.start_time).getTime() - new Date(a.start_time).getTime();
            });

            const createdDomain = sortedDomains[0];

            console.log(`[${this.serviceName}] Most recent domain:`, createdDomain);
            console.log(`[${this.serviceName}] Created Domain:`, createdDomain);
            
            if (createdDomain) {
                await this.dbService.setItem('domainslives', createdDomain);
            }

            return createdDomain?.domain_session_id || payloadDomain.domain_session_id;
        } catch (error) {
            console.error(`[${this.serviceName}] Error:`, error);
            return undefined;
        }
    }

    /**
     * Updates the domain data in the server.
     * @param url The URL of the domain to be updated.
     * @param method The method to be used in the fetch request.
     */
    async updateDomain(url: string, method: string): Promise<void> {
        
        const domainSessionId = url;
        const itemOrError = await this.dbService.getItem('domainslives', domainSessionId);

        if (!itemOrError) {
            throw new Error(`Payload not found for domain session ID: ${domainSessionId}`);
        }

        if (itemOrError instanceof Error) {
            throw new Error(`Error: ${itemOrError.message}`);
        }

        const stored = itemOrError as Partial<DomainPayloadTypes>;
        const payload: DomainPayloadTypes = {
            start_time: stored.start_time,
            closing_time: new Date().toISOString(),
            domain_url: stored.domain_url || '',
            domain_title: stored.domain_title || '',
            domain_fav_icon: stored.domain_fav_icon || '',
            domain_last_accessed: stored.domain_last_accessed || '',
            domain_session_id: stored.domain_session_id || '',
            id: stored.id,
        };

        const requestOptions = await this.requestOptions(payload, method);
        const response = await fetch(`${apiUrl}/domain/domains/${payload.id}/`, requestOptions);
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`[${this.serviceName}] Error: ${response.status} - ${errorText}`);
        }
        console.log(`[${this.serviceName}] Domain updated, removed from local store`);
        await this.dbService.deleteItem('domainslives', domainSessionId);
    }

}

export default DomainManager;