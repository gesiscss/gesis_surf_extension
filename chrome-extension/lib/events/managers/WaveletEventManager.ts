import type { Runtime, Tabs } from 'webextension-polyfill';
import { DatabaseService } from '@root/lib/db';
import DomainManager from '@root/lib/handlers/clients/DomainHandler';
import { DomainPolicyService, WaveletPolicyService } from '@root/lib/services/policyService';
import { DomainResponseTypes } from '@root/lib/handlers/types/domainTypes';
import {
  LLMData,
  EventResult,
  SocialData,
  SocialMessageType,
} from '@chrome-extension-boilerplate/shared/lib/types/contentScript';
import WaveletScriptHandler from '@root/lib/handlers/clients/WaveletScriptHandler';

export default class WaveletEventManager {
  private readonly serviceName = 'WaveletEventManager';
  /**
   * Maximum time a wavelet will wait for the background domain session to be persisted.
   * Pages with heavy JS (e.g. YouTube Shorts direct navigation) can take several seconds
   * before the tab reaches 'complete' and the domain is sent to the backend.
   */
  private readonly DOMAIN_READY_TIMEOUT_MS = 10000;
  private readonly dbService: DatabaseService;
  private readonly domainManager: DomainManager;
  private readonly domainPolicyService: DomainPolicyService;
  private readonly waveletPolicyService: WaveletPolicyService;
  private readonly apiClient: WaveletScriptHandler;

  constructor(apiUrl: string) {
    this.dbService = new DatabaseService();
    this.domainManager = new DomainManager();
    this.domainPolicyService = new DomainPolicyService(this.dbService);
    this.waveletPolicyService = new WaveletPolicyService(this.dbService);
    this.apiClient = new WaveletScriptHandler(apiUrl);
  }

  /**
   * Handles incoming LLM events from the content script, resolves the domain ID, and sends the data to the Wavelet backend API.
   * @param data The LLMData received from the content script.
   * @param sender The sender of the message, used to resolve the domain ID based on the tab information.
   * @returns An EventResult indicating the success or failure of processing the event.
   */
  public async handleLLMEvent(data: LLMData, sender: Runtime.MessageSender): Promise<EventResult> {
    try {
      const url = sender.tab?.url || data.url || '';
      const decision = await this.waveletPolicyService.evaluate(url, 'llm');

      if (decision.action === 'block') {
        console.log(`[${this.serviceName}] LLM event blocked for ${url} due to policy decision: ${decision.reason}`);
        return {
          status: 'blocked',
          message: `LLM event blocked due to policy decision: ${decision.reason}`,
        };
      }

      const linkage = await this.resolveDomainLinkage(sender.tab);
      await this.apiClient.sendLLMData({ ...data, domain_id: linkage.domainId, domain_session_id: linkage.hint });
      return { status: 'success', message: 'LLM wavelet processed' };
    } catch (error) {
      console.error(`[${this.serviceName}] Error handling LLM event:`, error);
      return {
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Handles incoming social events from the content script, resolves the domain session ID, and sends the data to the backend API.
   * @param messageType The social message type (X_POST, TIKTOK_POST, etc.).
   * @param data The social post data received from the content script.
   * @param sender The sender of the message, used to resolve the domain session ID.
   * @returns An EventResult indicating the success or failure of processing the event.
   */
  public async handleSocialEvent(
    messageType: SocialMessageType,
    data: SocialData,
    sender: Runtime.MessageSender,
  ): Promise<EventResult> {
    try {
      const url = sender.tab?.url || data.page_url || '';
      const decision = await this.waveletPolicyService.evaluate(url, 'social');

      if (decision.action === 'block') {
        console.log(`[${this.serviceName}] Social event blocked for ${url} due to policy decision: ${decision.reason}`);
        return {
          status: 'blocked',
          message: `Social event blocked due to policy decision: ${decision.reason}`,
        };
      }

      const linkage = await this.resolveDomainLinkage(sender.tab);
      const enrichedData = { ...data, domain_id: linkage.domainId, domain_session_id: linkage.hint };
      await this.apiClient.sendSocialData(messageType, enrichedData);
      return { status: 'success', message: `${messageType} wavelet processed` };
    } catch (error) {
      console.error(`[${this.serviceName}] Error handling ${messageType} event:`, error);
      return {
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Resolves the domain linkage for a given tab: the backend domain UUID when already
   * known, plus the visit-specific session hint the backend can match exactly when the
   * domain has not been saved yet.
   * @param tab The tab information from which to resolve the linkage.
   * @returns The domain UUID (or empty) and the composite visit hint (or empty).
   */
  private async resolveDomainLinkage(tab?: Tabs.Tab): Promise<{ domainId: string; hint: string }> {
    if (!tab?.id || !tab?.windowId || !tab?.url) return { domainId: '', hint: '' };
    try {
      const maskUrl = await this.domainPolicyService.getMaskedUrl(tab.url);
      const domainSessionId = await this.domainManager.generateDomainSession(tab.windowId, tab.id, tab.url, maskUrl);
      let stored = await this.dbService.getItem('domainslives', domainSessionId);
      if (!stored || stored instanceof Error) {
        await this.domainManager.waitForDomainReady(domainSessionId, this.DOMAIN_READY_TIMEOUT_MS);
        stored = await this.dbService.getItem('domainslives', domainSessionId);
      }
      if (!stored || stored instanceof Error) {
        // No persisted domain yet: send the visit hint so the backend can link later.
        return { domainId: '', hint: this.domainManager.wireSessionId(domainSessionId) };
      }
      const entry = stored as unknown as DomainResponseTypes;
      return {
        domainId: String(entry.id),
        hint: entry.domain_session_id || this.domainManager.wireSessionId(domainSessionId),
      };
    } catch {
      console.log(`[${this.serviceName}] domain linkage not available (masked/denied domain)`);
      return { domainId: '', hint: '' };
    }
  }
}
