/**
 * @fileoverview Manages browser domain API operations.
 * Pure HTTP client for domain-related interactions with the backend API.
 * Policy decisions and payload construction are delegated to the DomainPolicyService.
 */

import { DatabaseService } from '@root/lib/db';
import { GlobalSessionService } from '@root/lib/services';
import { DomainDataTypes, DomainResponseTypes, DomainPayloadTypes } from '../types/domainTypes';
import { apiUrl } from '../shared';
import { TabMapping } from '../types';
import { DomainPolicyService } from '@root/lib/services/policyService';
import { apiRequestWithDevice } from '../../services/apiClientWithDevice';
import { sanitizeText } from '@root/lib/utils/sanitizeText';

type DomainCreationDeferred = {
  promise: Promise<void>;
  resolve: () => void;
  reject: (reason?: unknown) => void;
};

/** Separator between the stable key and the visit time in wire-visible session ids. */
export const VISIT_TIME_SEPARATOR = '#';

class DomainManager {
  private readonly serviceName = 'DomainManager';
  private static readonly pendingDomainCreations = new Map<string, DomainCreationDeferred>();
  /**
   * Visit start time minted once per open visit, keyed by the stable domain session id.
   * Dies with the service worker together with pendingDomainCreations; the persisted
   * domainslives entry (start_time) is the durable copy for a restarted worker.
   */
  private static readonly visitStarts = new Map<string, string>();
  private readonly dbService: DatabaseService;
  private readonly globalSessionService: GlobalSessionService;
  private readonly domainPolicyService: DomainPolicyService;

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
  async generateDomainSession(windowId: number, tabId: number, domainUrl: string, maskUrl?: string): Promise<string> {
    const windowSessionId = await this.globalSessionService.getGlobalSessionId(windowId, 'window');
    const urlPart = sanitizeText(maskUrl || domainUrl);
    return `${windowSessionId}-tabId-${tabId}-domain-${urlPart}`;
  }

  private createDeferred(): DomainCreationDeferred {
    let resolve!: () => void;
    let reject!: (reason?: unknown) => void;

    const promise = new Promise<void>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    // Waiters race this promise with a timeout; when nobody is waiting a rejection
    // would otherwise surface as an unhandled rejection. Errors still reach every
    // actual waiter through waitForDomainReady.
    promise.catch(() => undefined);

    return { promise, resolve, reject };
  }

  private beginDomainCreation(domainSessionId: string): DomainCreationDeferred {
    const existing = DomainManager.pendingDomainCreations.get(domainSessionId);
    if (existing) return existing;

    const deferred = this.createDeferred();
    DomainManager.pendingDomainCreations.set(domainSessionId, deferred);
    return deferred;
  }

  private finishDomainCreation(domainSessionId: string): void {
    const deferred = DomainManager.pendingDomainCreations.get(domainSessionId);
    if (!deferred) return;

    deferred.resolve();
    DomainManager.pendingDomainCreations.delete(domainSessionId);
  }

  private failDomainCreation(domainSessionId: string, reason?: unknown): void {
    const deferred = DomainManager.pendingDomainCreations.get(domainSessionId);
    if (!deferred) return;

    deferred.reject(reason);
    DomainManager.pendingDomainCreations.delete(domainSessionId);
  }

  private clearDomainCreation(domainSessionId: string): void {
    DomainManager.pendingDomainCreations.delete(domainSessionId);
  }

  public registerPendingDomain(domainSessionId: string): void {
    this.beginDomainCreation(domainSessionId);
    this.mintVisitStart(domainSessionId);
  }

  public cancelPendingDomain(domainSessionId: string): void {
    this.clearDomainCreation(domainSessionId);
    DomainManager.visitStarts.delete(domainSessionId);
  }

  /**
   * Mints the visit start time once for an open visit and reuses it afterwards.
   * Duplicate browser events for the same open visit therefore share one timestamp,
   * which is what makes the wire session id unique per visit and stable on retry.
   * @param domainSessionId The stable domain session id.
   * @returns The retained ISO timestamp for this visit.
   */
  public mintVisitStart(domainSessionId: string): string {
    let visitStart = DomainManager.visitStarts.get(domainSessionId);
    if (!visitStart) {
      visitStart = new Date().toISOString();
      DomainManager.visitStarts.set(domainSessionId, visitStart);
    }
    return visitStart;
  }

  /**
   * Returns the wire-visible session id: the stable key plus this visit's start time.
   * Used when a payload ships to the backend; internal lookups keep using the stable key.
   * @param domainSessionId The stable domain session id.
   * @returns The composite `key#visitStart` string, or the bare key when no visit is open.
   */
  public wireSessionId(domainSessionId: string): string {
    const visitStart = DomainManager.visitStarts.get(domainSessionId);
    return visitStart ? `${domainSessionId}${VISIT_TIME_SEPARATOR}${visitStart}` : domainSessionId;
  }

  /**
   * Returns the retained visit start time for an open visit, if any.
   * @param domainSessionId The stable domain session id.
   */
  public currentVisitStart(domainSessionId: string): string | undefined {
    return DomainManager.visitStarts.get(domainSessionId);
  }

  /** Clears the visit registry. Test-only isolation hook. */
  public static clearVisitRegistryForTests(): void {
    DomainManager.visitStarts.clear();
  }

  public async waitForDomainReady(domainSessionId: string, timeoutMs: number = 1000): Promise<void> {
    const pending = DomainManager.pendingDomainCreations.get(domainSessionId);
    if (!pending) return;

    try {
      await Promise.race([pending.promise, new Promise<void>(resolve => setTimeout(resolve, timeoutMs))]);
    } catch {
      // Fall back to the DB re-read path when domain creation fails.
    }
  }

  /**
   * Transform the domain last accessed time to a human-readable format.
   * @param lastAccessed The last accessed time of the domain.
   * @returns The last accessed time in a human-readable format.
   */
  async formatLastAccessed(lastAccessed: number): Promise<string> {
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
      console.log(
        `[${this.serviceName}] Domain data status is not complete, skipping payload build for URL: ${domain_data.url}`,
      );
      return null;
    }

    try {
      const payload = await this.domainPolicyService.evaluate(domain_data.url, domain_data);

      const shouldMaskUrl = payload.domain_url !== sanitizeText(domain_data.url);
      const urlMask = shouldMaskUrl ? payload.domain_url : undefined;

      const stableSessionId = await this.generateDomainSession(
        domain_data.windowId,
        domain_data.id,
        domain_data.url,
        urlMask,
      );
      const visitStart = this.mintVisitStart(stableSessionId);

      return {
        ...payload,
        domain_last_accessed: await this.formatLastAccessed(domain_data.lastAccessed),
        start_time: visitStart,
        domain_session_id: this.wireSessionId(stableSessionId),
      };
    } catch (error) {
      console.error(`[${this.serviceName}] Error building payload:`, error);
      return null;
    }
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

    const domainSessionId = payloadDomain.domain_session_id;
    if (!domainSessionId) {
      console.error(`[${this.serviceName}] Missing domain_session_id in domain payload`);
      return undefined;
    }
    const stableSessionId = this.stableKeyOf(domainSessionId);

    this.beginDomainCreation(stableSessionId);

    // Create the payload inside domains
    const payload = {
      domains: [payloadDomain],
    };

    // Get the tab instance ID
    const windowId = tabSessionId.id;

    console.log(`[${this.serviceName}] Payload Domain:`, payloadDomain);
    console.log(`[${this.serviceName}] Window ID:`, windowId);
    console.log(`[${this.serviceName}] Tab Session ID:`, tabSessionId);

    try {
      const response = await apiRequestWithDevice(
        `${apiUrl}/tab/tabs/${windowId}/`,
        { method, body: JSON.stringify(payload) },
        { method },
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(`[${this.serviceName}] Error: ${response.status} - ${JSON.stringify(data)}`);
      }

      console.log(`[${this.serviceName}] Fetch Response:`, response);
      console.log(`[${this.serviceName}] Response Domain:`, data);

      // Extract the domain session ID from the response
      console.log(`[${this.serviceName}] Domains in response:`, data.domains);
      console.log(`[${this.serviceName}] Created domains in response:`, data.created_domains);

      // B5: match the exact requested visit against the domains this request created
      // or recovered. Never pick the newest row from the tab's full history: a revisit
      // of the same URL would silently link to the wrong visit.
      if (!Array.isArray(data.created_domains) || data.created_domains.length === 0) {
        console.error(`[${this.serviceName}] Response contains no created_domains for hint: ${domainSessionId}`);
        this.failDomainCreation(stableSessionId, new Error('created_domains missing in tab response'));
        return undefined;
      }

      const createdDomain = data.created_domains.find(
        (domain: DomainResponseTypes) => domain.domain_session_id === domainSessionId,
      );

      if (!createdDomain) {
        console.error(
          `[${this.serviceName}] created_domains does not contain the requested visit hint: ${domainSessionId}`,
        );
        this.failDomainCreation(
          stableSessionId,
          new Error('created_domains does not contain the requested visit hint'),
        );
        return undefined;
      }

      console.log(`[${this.serviceName}] Exact created domain:`, createdDomain);

      // Store under the stable key: domainslives is keyed by domain_session_id and
      // every consumer looks it up by the reconstructable stable key. The wire
      // (composite) session id stays available in the entry's own field.
      await this.dbService.setItem('domainslives', { ...createdDomain, domain_session_id: stableSessionId });

      this.finishDomainCreation(stableSessionId);

      return createdDomain.domain_session_id;
    } catch (error) {
      this.failDomainCreation(stableSessionId, error);
      console.error(`[${this.serviceName}] Error:`, error);
      return undefined;
    }
  }

  /**
   * Strips the visit time suffix from a wire-visible session id, returning the stable
   * key used for internal lookups. Bare keys pass through unchanged.
   * @param wireSessionId A stable or composite session id.
   */
  private stableKeyOf(wireSessionId: string): string {
    const separatorIndex = wireSessionId.indexOf(VISIT_TIME_SEPARATOR);
    return separatorIndex === -1 ? wireSessionId : wireSessionId.slice(0, separatorIndex);
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

    const response = await apiRequestWithDevice(
      `${apiUrl}/domain/domains/${payload.id}/`,
      { method, body: JSON.stringify(payload) },
      { method },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`[${this.serviceName}] Error: ${response.status} - ${errorText}`);
    }
    console.log(`[${this.serviceName}] Domain updated, removed from local store`);
    await this.dbService.deleteItem('domainslives', domainSessionId);
    DomainManager.visitStarts.delete(this.stableKeyOf(domainSessionId));
  }
}

export default DomainManager;
