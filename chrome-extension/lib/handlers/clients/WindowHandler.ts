import { DatabaseService } from "@root/lib/db";
import GlobalSessionService from "@root/lib/services/globalSession/GlobalSessionService";
import { WindowDataTypes, WindowPayloadTypes } from "../types/windowTypes";
import { apiUrl, InfoType } from "../shared";

/**
 * Manages browser window events.
 * Automatically registers event listeners for window events.
 */
class WindowManager {
    dbService: DatabaseService;
    globalSessionService: GlobalSessionService;
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
    async buildPayload(windowData: WindowDataTypes | number, info: InfoType, startTime: string): Promise<WindowPayloadTypes> {

        const globalSession = await this.globalSessionService.getFromLocalStorage();

        if (!globalSession) {
            throw new Error('Global session is undefined');
        }

        const windowId = typeof windowData === 'number' ? windowData : windowData.id;

        if (windowId === undefined) {
            throw new Error('Window ID is undefined');
        }
        
        const windowSessionId = WindowManager.generateWindowSession(windowId, globalSession.global_session_id);

        const payload: WindowPayloadTypes = {
            start_time: startTime,
            closing_time: new Date().toISOString(),
            window_num: windowId,
            window_session_id: windowSessionId,
            global_session: globalSession.id
        };
        // console.log('Payload:', payload);
        return payload;
    }

    /**
     * Builds the request options for the fetch request.
     * @param payload The payload to be sent to the server.
     * @param method The method to be used in the fetch request.
     * @returns The request options for the fetch request.
     */
    async buildRequestOptions(payload: WindowPayloadTypes, method: 'POST' | 'PUT' | 'PATCH'): Promise<RequestInit | undefined> {

        try {
            const token = await this.getToken();
            return {
                method: method,
                headers: {
                    'Authorization': `Token ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload)
            };
        } catch (error) {
            console.error('Error:', error);
            throw error;
        }
    }

    /**
     * Gets the token from the local storage.
     * @returns The token from the local storage.
     */
    private getToken(): Promise<string> {
        return new Promise((resolve, reject) => {
            chrome.storage.local.get('token', (data) => {
                if (data.token) {
                    resolve(data.token);
                } else {
                    reject(new Error('Token not found'));
                }
            });
        });
    }

    /**
     * Sends the window data to the server.
     * @param window The window data to be sent.
     * @param info The type of event that triggered the payload.
    */
    async sendWindow(window: WindowDataTypes | number, info: InfoType, method: 'POST' | 'PUT' | 'PATCH', startTime: string): Promise<Response> {
        try {

            const payload = await this.buildPayload(window, info, startTime);
            const requestOptions = await this.buildRequestOptions(payload, method);

            const response = await fetch(`${this.apiUrl}/window/window/`, requestOptions)

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Error: ${response.status} - ${errorText}`);
            }

            // Save the window data response to the local database
            const responseBody = await response.json();
            console.log('Response:', responseBody);
            await this.dbService.setItem('winlives', responseBody);
        
            return response;
        } catch (error) {
            console.error('Error:', error);
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
        console.log('Item or Error:', itemOrError);

        if (!itemOrError) {
            throw new Error(`Payload not found for window session ID: ${window_session_id}`);
        }

        if (itemOrError instanceof Error) {
            throw new Error(`Error: ${itemOrError.message}`);
        }

        const payload: WindowPayloadTypes = {
            ...itemOrError,
            closing_time: new Date().toISOString()
        };

        if (payload.id === undefined) {
            throw new Error('Window ID is undefined');
        }

        const requestOptions = await this.buildRequestOptions(payload, method);
        const response = await fetch(`${this.apiUrl}/window/window/${payload.id}/`, requestOptions);

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Error: ${response.status} - ${errorText}`);
        }

        const responseBody = await response.json();
        console.log('Response Updated:', responseBody);

        await this.dbService.deleteItem('winlives', window_session_id);
    }
}

export default WindowManager;