/**
 * @fileoverview Manages content event routing, validation, and processing logic.
 * All policy decisions are delegated to the ContentPolicyService.
 * @implements {ContentEventManager}
 */

import { DatabaseService } from '@root/lib/db';
import DomainManager from '@root/lib/handlers/clients/DomainHandler';
import { DomainInfo, ContentScriptHandler, ContentEventType } from '@root/lib/handlers';
import {
  ClickData,
  ScrollData,
  HTMLSnapshot,
  EventResult,
} from '@chrome-extension-boilerplate/shared/lib/types/contentScript';
import { ContentPolicyService, ContentEventKind, DomainPolicyService } from '@root/lib/services/policyService';
import { ContentPolicyDecision } from '@root/lib/services/policyService/types';
import { Runtime, Tabs } from 'webextension-polyfill';

/**
 * Handles content event routing and validation logic
 */
export default class ContentEventHandler {
  private readonly serviceName = 'ContentEventHandler';
  /**
   * Maximum time a content event (click, scroll, html) will wait for the background
   * domain session to be persisted. Matches the wavelet timeout so all content events
   * are resilient to the domain-loading race condition.
   */
  private readonly DOMAIN_READY_TIMEOUT_MS = 10000;
  private domainManager: DomainManager;
  private dbService: DatabaseService;
  private apiClient: ContentScriptHandler;
  private policyService: ContentPolicyService;
  private domainPolicyService: DomainPolicyService;

  constructor(apiUrl: string) {
    this.domainManager = new DomainManager();
    this.dbService = new DatabaseService();
    this.apiClient = new ContentScriptHandler(apiUrl);
    this.policyService = new ContentPolicyService(this.dbService);
    this.domainPolicyService = new DomainPolicyService(this.dbService);
  }

  /**
   * Maps content event types to policy evaluation kinds
   */
  private static readonly EVENT_KIND_MAP: Partial<Record<ContentEventType, ContentEventKind>> = {
    [ContentEventType.CLICK]: 'click',
    [ContentEventType.SCROLL]: 'scroll',
    [ContentEventType.SCROLL_FINAL]: 'scroll',
    [ContentEventType.HTML_CAPTURE]: 'html',
  };

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
    sender: Runtime.MessageSender,
  ): Promise<EventResult> {
    console.log(`[${this.serviceName}] Processing ${eventType}:`, eventData);

    try {
      const url = sender.tab?.url || '';
      const eventKind = ContentEventHandler.EVENT_KIND_MAP[eventType];
      if (!eventKind) {
        throw new Error(`Unsupported event type: ${eventType}`);
      }

      const decision = await this.policyService.evaluate(url, eventKind);

      if (decision.action === 'block') {
        console.log(
          `[${this.serviceName}] Blocking event ${eventType} for URL ${url} due to policy decision:`,
          decision.reason,
        );
        return {
          status: 'blocked',
          message: `Event blocked due to policy decision: ${decision.reason}`,
        };
      }

      const { domainSessionId, domainInfo } = await this.validateAndGetDomainInfo(sender);

      await this.routeEvent(eventType, eventData, domainInfo, domainSessionId, decision);

      return {
        status: 'success',
        message: `${eventType} processed successfully`,
      };
    } catch (error) {
      console.error(`[${this.serviceName}] Error handling ${eventType}:`, error);
      return {
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
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

    let domainInfo = await this.dbService.getItem('domainslives', domainSessionId);

    if (!domainInfo || domainInfo instanceof Error) {
      // The domain session may still be pending if the tab is loading. Wait for it to be
      // persisted before giving up, just like wavelets do.
      await this.domainManager.waitForDomainReady(domainSessionId, this.DOMAIN_READY_TIMEOUT_MS);
      domainInfo = await this.dbService.getItem('domainslives', domainSessionId);
    }

    console.log(`[${this.serviceName}] Retrieved domain info from DB:`, domainInfo);

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
    domainSessionId: string,
    decision: ContentPolicyDecision,
  ): Promise<void> {
    const shouldMask = decision.action === 'mask' && !!decision.maskValue;

    switch (eventType) {
      case ContentEventType.CLICK: {
        const clickData = shouldMask
          ? this.policyService.maskClickData(eventData as ClickData, decision.maskValue!)
          : (eventData as ClickData);
        await this.handleClick(clickData, domainInfo, domainSessionId);
        break;
      }

      case ContentEventType.SCROLL: {
        await this.handleScroll(eventData as ScrollData, domainInfo, domainSessionId, false);
        break;
      }

      case ContentEventType.SCROLL_FINAL: {
        await this.handleScroll(eventData as ScrollData, domainInfo, domainSessionId, true);
        break;
      }

      case ContentEventType.HTML_CAPTURE: {
        const htmlData = shouldMask
          ? this.policyService.maskHTMLSnapshot(eventData as HTMLSnapshot, decision.maskValue!)
          : (eventData as HTMLSnapshot);
        await this.handleHTML(htmlData, domainInfo);
        break;
      }

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
      console.error(`[${this.serviceName}] Missing tab information`);
      return null;
    }

    try {
      const maskUrl = await this.domainPolicyService.getMaskedUrl(tab.url);
      console.log(`[${this.serviceName}] Masked URL for domain session: ${maskUrl}`);

      const domainSessionId = await this.domainManager.generateDomainSession(tab.windowId, tab.id, tab.url, maskUrl);

      return domainSessionId;
    } catch (error) {
      console.error(`[${this.serviceName}] Error generating domain session:`, error);
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
  private async handleClick(clickData: ClickData, domainInfo: DomainInfo, domainSessionId: string): Promise<void> {
    console.log(`[${this.serviceName}] Processing click event`);
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
    isFinal: boolean,
  ): Promise<void> {
    console.log(`[${this.serviceName}] Processing scroll event (final: ${isFinal})`);
    await this.apiClient.sendScroll(scrollData, domainInfo, domainSessionId, isFinal);
  }

  /**
   * Handle HTML capture events
   * @param htmlData HTML snapshot data
   * @param domainInfo Domain information
   * @param domainSessionId Domain session ID
   * @returns Promise<void>
   */
  private async handleHTML(htmlData: HTMLSnapshot, domainInfo: DomainInfo): Promise<void> {
    console.log(`[${this.serviceName}] Processing HTML capture`);
    await this.apiClient.sendHTML(htmlData, domainInfo);
  }
}
