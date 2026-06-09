import type { Runtime, Tabs } from 'webextension-polyfill';
import { DatabaseService } from '@root/lib/db';
import DomainManager from '@root/lib/handlers/clients/DomainHandler';
import { DomainPolicyService } from '@root/lib/services/policyService';
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
  private readonly dbService: DatabaseService;
  private readonly domainManager: DomainManager;
  private readonly domainPolicyService: DomainPolicyService;
  private readonly apiClient: WaveletScriptHandler;

  constructor(apiUrl: string) {
    this.dbService = new DatabaseService();
    this.domainManager = new DomainManager();
    this.domainPolicyService = new DomainPolicyService(this.dbService);
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
      const domainId = await this.resolveDomainId(sender.tab);
      await this.apiClient.sendLLMData({ ...data, domain_id: domainId });
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
      const domainId = await this.resolveDomainId(sender.tab);
      const enrichedData = { ...data, domain_id: domainId };
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
   * Resolves the domain ID for a given tab by checking the domain policy and generating a domain session if necessary.
   * @param tab The tab information from which to resolve the domain ID.
   * @returns A promise that resolves to the domain ID as a string, or an empty string if the domain is masked or denied.
   */
  private async resolveDomainId(tab?: Tabs.Tab): Promise<string> {
    if (!tab?.id || !tab?.windowId || !tab?.url) return '';
    try {
      const maskUrl = await this.domainPolicyService.getMaskedUrl(tab.url);
      const domainSessionId = await this.domainManager.generateDomainSession(tab.windowId, tab.id, tab.url, maskUrl);
      let stored = await this.dbService.getItem('domainslives', domainSessionId);
      if (!stored || stored instanceof Error) {
        await this.domainManager.waitForDomainReady(domainSessionId);
        stored = await this.dbService.getItem('domainslives', domainSessionId);
      }
      if (!stored || stored instanceof Error) return '';
      return String((stored as unknown as DomainResponseTypes).id);
    } catch {
      console.log(`[${this.serviceName}] domain_id not available (masked/denied domain)`);
      return '';
    }
  }
}
