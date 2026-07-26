/**
 * @fileoverview WaveletScriptHandler is responsible for handling communication between the content script and the Wavelet backend API.
 * It sends LLM data to the appropriate endpoints based on the LLM provider and ensures that requests are authenticated.
 */
import { LLMData, SocialData, SocialMessageType } from '@chrome-extension-boilerplate/shared/lib/types/contentScript';
import { apiRequestWithDevice } from '../../services/apiClientWithDevice';

// Phase 2: unified social endpoint — backend routes to the correct index via
// the `platform` field inside the payload (mirrors LLM /llm/ pattern).
const SOCIAL_ENDPOINT = '/social/';

export default class WaveletScriptHandler {
  private readonly serviceName = 'WaveletScriptHandler';

  constructor(private apiUrl: string) {}

  /**
   * Sends LLM data to the appropriate endpoint based on the LLM provider.
   * @param data The LLMData to be sent.
   * @returns A promise that resolves when the data is successfully sent.
   */
  public async sendLLMData(data: LLMData): Promise<void> {
    const endpoint = '/llm/';

    const payload: Record<string, string | number> = {
      chat_session_id: data.chat_session_id,
      message_content: data.message_content,
      timestamp: data.timestamp,
      message_id: data.message_id,
      message_type: data.message_type,
      llm_provider: data.llm_provider,
      turn_index: data.turn_index,
      page_title: data.page_title,
      url: data.url,
    };
    if (data.domain_id) payload['domain_id'] = data.domain_id;

    const response = await apiRequestWithDevice(
      `${this.apiUrl}${endpoint}`,
      { method: 'POST', body: JSON.stringify(payload) },
      { method: 'POST' },
    );

    if (!response.ok) {
      const body = await response.text();
      console.error(`[${this.serviceName}] ${data.llm_provider} API failed: ${response.status} - ${body}`);
      throw new Error(`[${this.serviceName}] ${data.llm_provider} API failed: ${response.status}`);
    }
    console.log(`[${this.serviceName}] ${data.llm_provider} ${data.message_type} sent`);
  }

  /**
   * Sends social post data to the unified /social/ endpoint.
   * Backend routes to the correct index via the `platform` field in the payload.
   * @param messageType The social message type (X_POST, TIKTOK_POST, etc.) — kept for logging.
   * @param data The social post data to be sent.
   */
  public async sendSocialData(messageType: SocialMessageType, data: SocialData): Promise<void> {
    // Align with backend serializer: backend expects `post_id`, frontend uses `id`
    const payload = { ...data, post_id: data.id };
    delete (payload as Record<string, unknown>).id;

    const response = await apiRequestWithDevice(
      `${this.apiUrl}${SOCIAL_ENDPOINT}`,
      { method: 'POST', body: JSON.stringify(payload) },
      { method: 'POST' },
    );

    if (!response.ok) {
      const body = await response.text();
      console.error(`[${this.serviceName}] ${messageType} API failed: ${response.status} - ${body}`);
      throw new Error(`[${this.serviceName}] ${messageType} API failed: ${response.status}`);
    }
    console.log(`[${this.serviceName}] ${messageType} sent:`, data.id);
  }
}
