import { DatabaseService, HostItemTypes, ItemTypes } from "@root/lib/db";
import { GlobalSessionService } from "@root/lib/services";
import { readToken } from "@chrome-extension-boilerplate/shared/lib/storages/tokenStorage";
import { DomainDataTypes, DomainResponseTypes, DomainPayloadTypes } from "../types/domainTypes";
import { apiUrl } from "../shared";
import { TabMapping } from "../types";
import { PolicyService } from "@root/lib/services/policyService/policyService";
import { HostService } from "@root/lib/services/hostService";

/**	
 * Manages browser domain requests.
 * Sends requests to the server to manage domains.
 */
class DomainManager {
    dbService: DatabaseService;
    globalSessionService: GlobalSessionService;
    policyService: PolicyService;
    hostService: HostService;

    constructor() {
        this.dbService = new DatabaseService();
        this.globalSessionService = new GlobalSessionService(apiUrl);
        this.policyService = new PolicyService();
        this.hostService = new HostService();
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

        console.log('Building payload for domain data:', domain_data);

        if (domain_data.status !== 'complete') {
            console.log('Domain data status is not complete, checking host rules.');
            return null;
        }
        
        try {
            let hostRule: HostItemTypes | null = null;
            let classification: string | undefined = undefined;

            if (domain_data.url) {
                const hostname = new URL(domain_data.url).hostname;
                const result = await this.dbService.getItem('hostslives', hostname);
                
                if (result) {
                    hostRule = result;
                    classification = hostRule?.categories?.[0]?.criteria?.criteria_classification;
                    console.log('[DomainManager] Found classification for hostname', hostname, ':', classification);
                }
            }

            const payload = this.policyService.applyPolicy(
                domain_data,
                hostRule,
                false // isPrivateMode - TODO: determine if private mode should be applied
            );
            
            // TODO: Handle URL masking based on classification
            // const shouldMaskUrl = classification === 'full_deny' || payload.domain_url === 'Private-Mode';
            // const urlMask = shouldMaskUrl ? payload.domain_url : undefined;

            return {
                ...payload,
                domain_last_accessed: await this.formatLastAccessed(domain_data.lastAccessed),
                domain_session_id: await this.generateDomainSession(
                    domain_data.windowId,
                    domain_data.id,
                    domain_data.url,
                    // urlMask --- URL masking disabled for now
                ),
            };
        } catch (error) {
            console.error('Error building payload:', error);
        }
        return null;
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
            console.error('Failed to get token:', error);
        }
        return undefined;
    }

    /**
     * Sends the domain data to the server.
     * @param domainData The domain data to be sent.
     * @param tabSessionId The tab session ID to be used.
     * @param method The method to be used in the fetch request.
     */
    async sendDomain(domainData: DomainDataTypes, tabSessionId: TabMapping, method: string): Promise<Response | undefined> {

        // Build single domain payload
        const payloadDomain = await this.buildPayload(domainData);
        console.log('Payload Domain to be sent:', payloadDomain);
        console.log('Tab Session ID to be used:', tabSessionId);

        if (!payloadDomain) {
            console.error('Error building domain payload');
            return undefined;
        }

        // Create the payload inside domains
        const payload = {
            domains: [payloadDomain],
        };

        // Create the request options
        const requestOptions = await this.requestOptions(payload, method);
        if (!requestOptions) {
            console.error('Error building request options');
            return undefined;
        }

        // Get the tab instance ID
        const windowId = tabSessionId.id;

        console.log('Payload Domain:', payloadDomain);
        console.log('Request Options:', requestOptions);
        console.log('Window ID:', windowId);
        console.log('Tab Session ID:', tabSessionId);

        try {
            const response = await fetch(`${apiUrl}/tab/tabs/${windowId}/`, requestOptions);
            const data = await response.json();
            console.log('Fetch Response:', response);
            console.log('Response Domain:', data);

            // Extract the domain session ID from the response
            console.log('Domains in response:', data.domains); // The problem is not here
            // Find the created domain in the response by domain_session_id and latest start_time (NEED CORRECTION)
            if (!data.domains || data.domains.length === 0) {
                console.error('No domains found in response');
                return undefined;
            }
            const sortedDomains = data.domains.sort((a: DomainResponseTypes, b: DomainResponseTypes) => {
                return new Date(b.start_time).getTime() - new Date(a.start_time).getTime();
            });
            const createdDomain = sortedDomains[0];
            console.log('Most recent domain:', createdDomain);
            // const createdDomain = data.domains.find((domain: DomainResponseTypes) => domain.domain_session_id === payloadDomain.domain_session_id);
            console.log('Created Domain:', createdDomain);
            if (createdDomain) {
                await this.dbService.setItem('domainslives', createdDomain);
            }
            return response;
        } catch (error) {
            console.error('Error:', error);
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
            throw new Error(`Error: ${response.status} - ${errorText}`);
        }
        console.log('Domain to be deleted:', payload);
        await this.dbService.deleteItem('domainslives', domainSessionId);
    }

}

export default DomainManager;