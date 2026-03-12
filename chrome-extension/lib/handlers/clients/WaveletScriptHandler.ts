/**
 * @fileoverview WaveletScriptHandler is responsible for handling communication between the content script and the Wavelet backend API.
 * It sends LLM data to the appropriate endpoints based on the LLM provider and ensures that requests are authenticated.
 */
import { readToken } from '@chrome-extension-boilerplate/shared/lib/storages/tokenStorage';
import { LLMData } from '@chrome-extension-boilerplate/shared/lib/types/contentScript';

// Endpoints for different Wavelets.
const LLM_ENDPOINTS: Record<string, string> = {
    chatgpt:  '/chatgpt/',
    claude:   '/claude/',
    deepseek: '/deepseek/',
    gemini:   '/gemini/',
};

export default class WaveletScriptHandler {
    private readonly serviceName = 'WaveletScriptHandler';

    constructor(private apiUrl: string) {}

    /**
     * Sends LLM data to the appropriate endpoint based on the LLM provider.
     * @param data The LLMData to be sent.
     * @returns A promise that resolves when the data is successfully sent.
     */
    public async sendLLMData(data: LLMData): Promise<void> {
        const endpoint = LLM_ENDPOINTS[data.llm_provider];
        if (!endpoint) throw new Error(`Unknown LLM provider: ${data.llm_provider}`);

        const payload: Record<string, string | number> = {
            conversation_id: data.chat_session_id,
            conversation:    data.message_content,
            timestamp:       data.timestamp,
            message_id:         data.message_id,
            message_type:       data.message_type,
            llm_provider:       data.llm_provider,
            turn_index:          data.turn_index,
        };
        if (data.domain_id) payload['domain_id'] = data.domain_id;

        const options = await this.requestOptions(payload, 'POST');
        // console.log(`[${this.serviceName}] Sending payload`, payload);
        const response = await fetch(`${this.apiUrl}${endpoint}`, options);


        if (!response.ok) {
            const body = await response.text();
            console.error(`[${this.serviceName}] ${data.llm_provider} API failed: ${response.status} - ${body}`);
            throw new Error(`[${this.serviceName}] ${data.llm_provider} API failed: ${response.status}`);
        }
        console.log(`[${this.serviceName}] ${data.llm_provider} ${data.message_type} sent`);
    }

    // Future: sendXPost(data: XPostData): Promise<void> { ... }
    /**
     * Requests the necessary options for making an authenticated API call, including the token.
     * @param payload The data payload to be sent in the request body.
     * @param method The HTTP method to be used for the request (e.g., 'POST').
     * @returns A promise that resolves to the RequestInit object containing method, headers, and body for the fetch call.
     */
    private async requestOptions<T>(payload: T, method: string): Promise<RequestInit> {
        const token = await readToken();
        if (!token) throw new Error('Authentication token not found');
        return {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Token ${token}`,
            },
            body: JSON.stringify(payload),
        };
    }
}