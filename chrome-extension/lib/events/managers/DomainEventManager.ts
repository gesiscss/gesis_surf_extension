/**
 * @fileoverview Manages domain-related events in the Chrome extension.
 * Handles domain changes, transitions, and session management
 * Integrates with TabEventManager to track active domains across tabs.
 */

import { DomainHandler, DomainDataTypes, TabMapping } from '@root/lib/handlers';
import { KeyedSerialQueue } from '@root/lib/utils/keyedSerialQueue';
import { tabs as browserTabs } from 'webextension-polyfill';

const DOMAIN_STATE_KEY = 'domain-state';

/**
 * A reload of the same URL only becomes a new visit when the current visit is at
 * least this old, mirroring the focus debounce. Rapid reloads (F5 smash, redirect
 * chains, ad refresh loops) are absorbed into the open visit.
 */
const RELOAD_ABSORPTION_MS = 1000;

/**
 * Manages domain-related events in the Chrome extension.
 * Handles domain changes, transitions, and session management
 * Integrates with TabEventManager to track active domains across tabs.
 */
class DomainEventManager {
  private readonly serviceName = 'DomainEventManager';
  private currentActiveDomainSessionId: string | null = null;
  /**
   * Tracks a domain session that was registered as pending but not yet sent to the backend.
   * This happens when a domain change is detected while the tab is still loading.
   * When the same domain later reports status === 'complete', we finish sending it.
   */
  private pendingDomainSessionId: string | null = null;
  /**
   * Domain changes and cleanups read and write the shared state above across awaits.
   * Running them one at a time stops two calls for the same pending domain from both
   * sending it (duplicate domain rows).
   */
  private readonly stateQueue = new KeyedSerialQueue<string>();
  private readonly reloadAbsorptionMs = RELOAD_ABSORPTION_MS;

  constructor(private readonly domainManager: DomainHandler) {}

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
    return this.stateQueue.run(DOMAIN_STATE_KEY, () => this.processDomainChange(newDomain, tab, mapping));
  }

  private async processDomainChange(newDomain: string | null, tab: DomainDataTypes, mapping: TabMapping) {
    console.log(`[${this.serviceName}] Handle Domain Change to ${newDomain}`);

    try {
      if (this.isReloadOfCurrentVisit(newDomain, tab)) {
        if (this.isVisitOldEnoughToRemint(newDomain)) {
          // A real reload of the same URL ends this visit; the reopened page mints
          // a new visit so the journey records the interruption.
          console.log(`[${this.serviceName}] Reload detected for ${newDomain}; closing visit for a new one`);
          await this.closePreviousDomainSession();
          await this.initializeNewDomainSession(newDomain!, tab, mapping);
        } else {
          console.log(`[${this.serviceName}] Rapid reload absorbed into current visit: ${newDomain}`);
        }
      } else if (this.shouldUpdateDomain(newDomain)) {
        await this.processDomainTransition(newDomain, tab, mapping);
      } else if (
        newDomain &&
        newDomain === this.currentActiveDomainSessionId &&
        newDomain === this.pendingDomainSessionId &&
        this.isDomainReadyToSend(tab)
      ) {
        // The same domain is now complete; finish sending the pending domain session so
        // waiting wavelets can resolve their domain_id and the backend receives the domain.
        console.log(`[${this.serviceName}] Pending domain ${newDomain} is now complete, sending it`);
        await this.initializeNewDomainSession(newDomain, tab, mapping);
      } else {
        this.logDomainNoChange(newDomain);
      }
    } catch (error) {
      this.handleDomainError(error, newDomain);
    }
  }

  /**
   * A reload shows the same stable key while the tab is loading again. Initial loads
   * and cross-URL navigation are not reloads of the current visit.
   */
  private isReloadOfCurrentVisit(newDomain: string | null, tab: DomainDataTypes): boolean {
    return Boolean(newDomain) && newDomain === this.currentActiveDomainSessionId && tab.status === 'loading';
  }

  /**
   * A reload only becomes a new visit when the current visit is older than the
   * absorption window; rapid reloads (F5 smash, redirect chains) stay absorbed.
   */
  private isVisitOldEnoughToRemint(newDomain: string | null): boolean {
    const visitStart = newDomain ? this.domainManager.currentVisitStart(newDomain) : undefined;
    if (!visitStart) {
      return true;
    }
    return Date.now() - new Date(visitStart).getTime() >= this.reloadAbsorptionMs;
  }

  /**
   * Resets the current active domain session ID.
   * @returns void
   */
  public resetDomainSession(): void {
    console.log(`[${this.serviceName}] Resetting current active domain session ID`);
    this.currentActiveDomainSessionId = null;
    this.pendingDomainSessionId = null;
  }

  /**
   * Checks whether the current active domain session belongs to the given tab.
   * The owning tab is embedded in the domain session id (`…-tabId-<N>-domain-…`),
   * so removal of one tab can never close a domain owned by another tab.
   * @param tabId The browser tab id.
   * @returns True if the active domain belongs to that tab.
   */
  public activeDomainBelongsTo(tabId: number): boolean {
    if (this.currentActiveDomainSessionId === null) {
      return false;
    }
    return this.extractOwningTabId(this.currentActiveDomainSessionId) === tabId;
  }

  private extractOwningTabId(domainSessionId: string): number | null {
    const marker = '-tabId-';
    const markerIndex = domainSessionId.indexOf(marker);
    if (markerIndex === -1) {
      return null;
    }
    const digitsStart = markerIndex + marker.length;
    const digitsEnd = domainSessionId.indexOf('-', digitsStart);
    const digits =
      digitsEnd === -1 ? domainSessionId.slice(digitsStart) : domainSessionId.slice(digitsStart, digitsEnd);
    const parsed = Number.parseInt(digits, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  /**
   * Handles domain cleanup on tab closure or navigation away.
   * @returns void
   */
  public async handleDomainCleanup(): Promise<void> {
    return this.stateQueue.run(DOMAIN_STATE_KEY, () => this.processDomainCleanup());
  }

  private async processDomainCleanup(): Promise<void> {
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
   * Wraps the update in a try/catch so that a domain that was never sent to the
   * backend (e.g. page abandoned during loading) does not prevent the new domain
   * from being initialized. The stale ID is always cleared and the pending
   * promise (if any) is cancelled so it does not leak in the DomainManager Map.
   */
  private async closePreviousDomainSession() {
    console.log(`[${this.serviceName}] Closing domain ${this.currentActiveDomainSessionId}`);
    if (this.currentActiveDomainSessionId) {
      try {
        await this.domainManager.updateDomain(this.currentActiveDomainSessionId, 'PATCH');
      } catch (error) {
        console.warn(
          `[${this.serviceName}] Failed to close domain ${this.currentActiveDomainSessionId} ` +
            '(may never have been sent to backend):',
          error instanceof Error ? error.message : error,
        );
        // Clean up the pending promise if the domain was registered but never sent
        this.domainManager.cancelPendingDomain(this.currentActiveDomainSessionId);
      } finally {
        // ALWAYS clear the stale ID so the next domain can be initialized
        this.currentActiveDomainSessionId = null;
      }
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
    console.log(`[${this.serviceName}] Requesting HTML capture for tab ID: ${tabId}`);

    try {
      await browserTabs.sendMessage(tabId, { type: 'REQUEST_HTML_CAPTURE' });
      return;
    } catch {
      console.warn(`[${this.serviceName}] HTML capture attempt failed for tab ${tabId}, retrying in 1s...`);
    }

    await new Promise(resolve => setTimeout(resolve, 1000));

    try {
      await browserTabs.sendMessage(tabId, { type: 'REQUEST_HTML_CAPTURE' });
    } catch (retryError) {
      console.error(`[${this.serviceName}] Retry HTML capture also failed for tab ${tabId}:`, retryError);
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
    this.pendingDomainSessionId = newDomain;
    this.domainManager.registerPendingDomain(newDomain);

    try {
      if (mapping.id === undefined) {
        throw new Error('Tab ID is undefined');
      }

      if (this.isDomainReadyToSend(tab)) {
        console.log(`[${this.serviceName}] Domain is ready to be sent for ${newDomain}`);
        const savedDomainSessionId = await this.domainManager.sendDomain(tab, mapping, 'PATCH');
        this.currentActiveDomainSessionId = savedDomainSessionId || newDomain;
        this.pendingDomainSessionId = null;
        console.log(
          `[${this.serviceName}] Updated current active domain session ID to:`,
          this.currentActiveDomainSessionId,
        );
        return;
      }
      console.log(`[${this.serviceName}] Domain is not ready to be sent for ${newDomain}, waiting for completion...`);
      // Keep the pending registration alive so wavelets that arrive while the tab is still
      // loading can wait for the domain to be persisted once the tab completes.
      this.currentActiveDomainSessionId = newDomain;
    } catch (error) {
      this.domainManager.cancelPendingDomain(newDomain);
      this.pendingDomainSessionId = null;
      throw error;
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
