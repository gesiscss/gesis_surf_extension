/**
 * @fileoverview Manages domain-related events in the Chrome extension.
 * Handles domain changes, transitions, and session management
 * Integrates with TabEventManager to track active domains across tabs.
 */

import { DomainHandler, DomainDataTypes, TabMapping } from '@root/lib/handlers';
import { tabs as browserTabs } from 'webextension-polyfill';

/**
 * Manages domain-related events in the Chrome extension.
 * Handles domain changes, transitions, and session management
 * Integrates with TabEventManager to track active domains across tabs.
 */
class DomainEventManager {
  private readonly serviceName = 'DomainEventManager';
  private currentActiveDomainSessionId: string | null = null;

  constructor(private domainManager: DomainHandler) {}

  /**
   * Gets the current active domain session ID.
   * @returns The current active domain session ID or null if none exists.
   */
  get activeDomainSessionId(): string | null {
    return this.currentActiveDomainSessionId;
  }

  /**
   * Handles domain change events.
   * @param newDomain The new domain URL.
   * @param tab The tab data.
   * @param mapping The tab mapping data
   * @returns void
   */
  async handleDomainChange(newDomain: string | null, tab: DomainDataTypes, mapping: TabMapping) {
    console.log(`[${this.serviceName}] Handle Domain Change to ${newDomain}`);

    try {
      if (this.shouldUpdateDomain(newDomain)) {
        await this.processDomainTransition(newDomain, tab, mapping);
      } else {
        this.logDomainNoChange(newDomain);
      }
    } catch (error) {
      this.handleDomainError(error, newDomain);
    }
  }

  /**
   * Resets the current active domain session ID.
   * @returns void
   */
  public resetDomainSession(): void {
    console.log(`[${this.serviceName}] Resetting current active domain session ID`);
    this.currentActiveDomainSessionId = null;
  }

  /**
   * Handles domain cleanup on tab closure or navigation away.
   * @returns void
   */
  public async handleDomainCleanup(): Promise<void> {
    try {
      if (this.currentActiveDomainSessionId) {
        console.log(`[${this.serviceName}] Cleaning up domain session for ${this.currentActiveDomainSessionId}`);
        await this.closePreviousDomainSession();
      }
      this.resetDomainSession();
    } catch (error) {
      this.resetDomainSession();
      this.handleDomainError(error, this.currentActiveDomainSessionId);
    }
  }

  /**
   * Checks if the domain should be updated.
   * @param newDomain The new domain URL.
   * @returns A boolean indicating if the domain should be updated.
   */
  private shouldUpdateDomain(newDomain: string | null) {
    if (!this.currentActiveDomainSessionId && newDomain) {
      return true;
    }

    // New domain detected (not null) and different from the current active domain
    const isNewDomain = newDomain !== null && newDomain !== this.currentActiveDomainSessionId;

    // Close the current domain session if a new domain is detected
    const shouldCloseDomain =
      this.currentActiveDomainSessionId !== null && this.currentActiveDomainSessionId !== newDomain;

    return isNewDomain || shouldCloseDomain;
  }

  /**
   * Processes the domain transition event.
   * @param newDomain The new domain URL.
   * @param tab The tab data.
   * @param mapping The tab mapping data.
   * @returns void
   */
  private async processDomainTransition(newDomain: string | null, tab: DomainDataTypes, mapping: TabMapping) {
    console.log(`[${this.serviceName}] Processing domain transition to ${newDomain}`);
    if (this.currentActiveDomainSessionId && this.currentActiveDomainSessionId !== newDomain) {
      await this.closePreviousDomainSession();
    }

    // Close previous domain session if it exists and is different from the new domain
    if (newDomain && newDomain !== this.currentActiveDomainSessionId) {
      await this.initializeNewDomainSession(newDomain, tab, mapping);
    }
  }

  /**
   * Closes the previous domain session if it exists.
   */
  private async closePreviousDomainSession() {
    console.log(`[${this.serviceName}] Closing domain ${this.currentActiveDomainSessionId}`);
    if (this.currentActiveDomainSessionId) {
      await this.domainManager.updateDomain(this.currentActiveDomainSessionId, 'PATCH');
      this.currentActiveDomainSessionId = null;
    }
  }

  /**
   * Validates if domain is ready to be sent to the server when completed
   * @param tab The tab data containing the domain information and status.
   * @returns A boolean indicating if the domain is valid.
   */
  private isDomainReadyToSend(tab: DomainDataTypes): boolean {
    // Check the status of the tab to determine if it's complete
    if (tab.status === 'complete') {
      return true;
    }
    return false;
  }

  public async requestHTMLCapture(tabId: number): Promise<void> {
    try {
      console.log(`[${this.serviceName}] Requesting HTML capture for tab ID: ${tabId}`);
      await browserTabs.sendMessage(tabId, { type: 'REQUEST_HTML_CAPTURE' });
    } catch (error) {
      console.warn(`[${this.serviceName}] First HTML capture attempt failed for tab ${tabId}, retrying in 1s...`);
      setTimeout(async () => {
        try {
          await browserTabs.sendMessage(tabId, { type: 'REQUEST_HTML_CAPTURE' });
        } catch (retryError) {
          console.error(`[${this.serviceName}] Retry HTML capture also failed for tab ${tabId}:`, retryError);
        }
      }, 1000);
    }
  }

  /**
   * Initializes a new domain session.
   * @param newDomain The new domain URL.
   * @param tab The tab data.
   * @param mapping The tab mapping data.
   * @returns void
   */
  private async initializeNewDomainSession(newDomain: string, tab: DomainDataTypes, mapping: TabMapping) {
    console.log(`[${this.serviceName}] New Active Domain ${newDomain}`);
    console.log(`[${this.serviceName}] Mapping in DomainEventManager:`, mapping);
    console.log(`[${this.serviceName}] Type if mapping.id:`, typeof mapping.id);

    this.currentActiveDomainSessionId = newDomain;

    if (mapping.id === undefined) {
      throw new Error('Tab ID is undefined');
    }

    if (this.isDomainReadyToSend(tab)) {
      console.log(`[${this.serviceName}] Domain is ready to be sent for ${newDomain}`);
      const savedDomainSessionId = await this.domainManager.sendDomain(tab, mapping, 'PATCH');
      this.currentActiveDomainSessionId = savedDomainSessionId || newDomain;
      console.log(
        `[${this.serviceName}] Updated current active domain session ID to:`,
        this.currentActiveDomainSessionId,
      );
    } else {
      console.log(`[${this.serviceName}] Domain is not ready to be sent for ${newDomain}`);
      this.currentActiveDomainSessionId = newDomain;
    }
  }

  /**
   * Logs that the domain has not changed.
   * @param newDomain The new domain URL.
   */
  private logDomainNoChange(newDomain: string | null) {
    console.log(`[${this.serviceName}] Domain has not changed: ${newDomain}`);
  }

  /**
   * Handles domain-related errors.
   * @param error The error that occurred.
   * @param domain The domain URL.
   * @returns void
   */
  private handleDomainError(error: unknown, domain: string | null) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[${this.serviceName}] Domain error for ${domain || 'unknown domain'}:`, errorMessage);
  }
}

export default DomainEventManager;
