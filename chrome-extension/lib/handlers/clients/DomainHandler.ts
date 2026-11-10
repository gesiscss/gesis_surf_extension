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
import { stableKeyOf, visitTimeFromHint, VISIT_TIME_SEPARATOR } from '@root/lib/utils/domainVisitIdentity';

const DOMAIN_REQUEST_TIMEOUT_MS = 15000;

type DomainCreationDeferred = {
  promise: Promise<void>;
  resolve: () => void;
  reject: (reason?: unknown) => void;
};

/** Separator between the stable key and the visit time in wire-visible session ids. */
export { VISIT_TIME_SEPARATOR } from '@root/lib/utils/domainVisitIdentity';

class DomainManager {
  private readonly serviceName = 'DomainManager';
  private static readonly pendingDomainCreations = new Map<string, DomainCreationDeferred>();
  /**
   * Visit start time minted once per open visit, keyed by the stable local key.
   * The persisted domainslives record (its domain_session_id hint) is the durable
   * copy recovered when the worker restarts.
   */
  private static readonly visitStarts = new Map<string, string>();
  /**
   * Shared initialization promises so concurrent callers for one stable key recover
   * or mint exactly one visit timestamp instead of racing on storage misses.
   */
  private static readonly visitInitializations = new Map<string, Promise<string>>();
  private static readonly closingDomains = new Set<string>();
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

  public async registerPendingDomain(domainSessionId: string): Promise<void> {
    this.beginDomainCreation(domainSessionId);
    await this.mintVisitStart(domainSessionId);
  }

  public async cancelPendingDomain(domainSessionId: string): Promise<void> {
    await DomainManager.visitInitializations.get(domainSessionId);
    this.clearDomainCreation(domainSessionId);
    DomainManager.visitStarts.delete(domainSessionId);
    for (const store of ['domainslives', 'domainvisits'] as const) {
      const result = await this.dbService.deleteItem(store, domainSessionId);
      if (result instanceof Error) throw result;
    }
    DomainManager.closingDomains.delete(domainSessionId);
  }

  /**
   * Mints (or recovers) the visit start time for an open visit, exactly once.
   * Concurrent callers share one initialization promise per stable key, so two
   * events racing on a storage miss cannot mint two different timestamps.
   * After a worker restart the persisted domainslives record is recovered first,
   * preserving the exact original timestamp string across restarts.
   * @param domainSessionId The stable local key.
   * @returns The retained ISO timestamp for this visit.
   */
  public async mintVisitStart(domainSessionId: string): Promise<string> {
    const existing = DomainManager.visitStarts.get(domainSessionId);
    if (existing) return existing;

    let initialization = DomainManager.visitInitializations.get(domainSessionId);
    if (!initialization) {
      initialization = this.recoverOrMintVisitStart(domainSessionId);
      DomainManager.visitInitializations.set(domainSessionId, initialization);
      const clearInitialization = () => {
        if (DomainManager.visitInitializations.get(domainSessionId) === initialization) {
          DomainManager.visitInitializations.delete(domainSessionId);
        }
      };
      void initialization.then(clearInitialization, clearInitialization);
    }
    return initialization;
  }

  private async recoverOrMintVisitStart(domainSessionId: string): Promise<string> {
    const hint = await this.wireSessionId(domainSessionId);
    const recovered = visitTimeFromHint(hint);
    if (recovered) {
      DomainManager.visitStarts.set(domainSessionId, recovered);
      return recovered;
    }
    const visitStart = new Date().toISOString();
    await this.dbService.setItem('domainvisits', {
      local_key: domainSessionId,
      domain_session_id: `${domainSessionId}${VISIT_TIME_SEPARATOR}${visitStart}`,
      start_time: visitStart,
    });
    DomainManager.visitStarts.set(domainSessionId, visitStart);
    return visitStart;
  }

  /**
   * Returns the wire-visible session id: the stable key plus this visit's start time.
   * Used when a payload ships to the backend; internal lookups keep using the stable key.
   * @param domainSessionId The stable local key.
   * @returns The composite `key#visitStart` string, or '' when no safe identity exists.
   * An empty result must not be sent as a hint: it would never match exactly.
   */
  public async wireSessionId(domainSessionId: string): Promise<string> {
    if (this.isDomainClosing(domainSessionId)) return '';
    const visitStart = DomainManager.visitStarts.get(domainSessionId);
    if (visitStart) return `${domainSessionId}${VISIT_TIME_SEPARATOR}${visitStart}`;
    const stored =
      (await this.dbService.getItem('domainvisits', domainSessionId)) ??
      (await this.dbService.getItem('domainslives', domainSessionId));
    if (!stored) return '';
    const hint = stored.domain_session_id;
    const timestamp = visitTimeFromHint(hint);
    if (!timestamp) {
      console.warn(`[${this.serviceName}] Legacy Domain has no visit-specific hint: ${domainSessionId}`);
      return '';
    }
    if (stableKeyOf(hint) !== domainSessionId) {
      throw new Error(`Stored visit hint does not belong to local key: ${domainSessionId}`);
    }
    if (stored.start_time !== timestamp) {
      throw new Error(`Stored visit start does not match its hint: ${domainSessionId}`);
    }
    return hint;
  }

  /**
   * Returns the retained visit start time for an open visit, if any.
   * Does not mint or recover: only a currently initialized identity is returned.
   * @param domainSessionId The stable local key.
   */
  public currentVisitStart(domainSessionId: string): string | undefined {
    return DomainManager.visitStarts.get(domainSessionId);
  }

  public isDomainClosing(domainSessionId: string): boolean {
    return DomainManager.closingDomains.has(domainSessionId);
  }

  public async restoreActiveDomainSession(
    nextSessionId: string,
  ): Promise<{ sessionId: string; pending: boolean } | null> {
    const windowMarker = nextSessionId.indexOf('-windowId-');
    const tabMarker = nextSessionId.indexOf('-tabId-');
    const marker = windowMarker === -1 ? tabMarker : windowMarker;
    if (marker < 1) throw new Error('Cannot recover Domain state without a global session');
    const prefix = nextSessionId.slice(0, marker);
    const visits = await this.dbService.getAllItems('domainvisits');
    const domains = await this.dbService.getAllItems('domainslives');
    if (visits instanceof Error) throw visits;
    if (domains instanceof Error) throw domains;
    const keys = new Set(
      [...visits, ...domains].map(record => record.local_key).filter(key => key.startsWith(`${prefix}-`)),
    );
    if (keys.size > 1) throw new Error('Cannot safely recover multiple active Domain visits');
    const sessionId = keys.values().next().value;
    if (!sessionId) return null;
    await this.mintVisitStart(sessionId);
    return { sessionId, pending: !domains.some(record => record.local_key === sessionId) };
  }

  /** Clears the visit registry. Test-only isolation hook. */
  public static clearVisitRegistryForTests(): void {
    DomainManager.visitStarts.clear();
    DomainManager.visitInitializations.clear();
    DomainManager.pendingDomainCreations.clear();
    DomainManager.closingDomains.clear();
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
      const visitStart = await this.mintVisitStart(stableSessionId);
      const retained = await this.dbService.getItem('domainvisits', stableSessionId);
      if (retained?.payload) return retained.payload;

      return {
        ...payload,
        domain_last_accessed: await this.formatLastAccessed(domain_data.lastAccessed),
        start_time: visitStart,
        domain_session_id: await this.wireSessionId(stableSessionId),
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
    if (!domainSessionId || !payloadDomain.start_time) {
      console.error(`[${this.serviceName}] Missing domain_session_id or start_time in domain payload`);
      return undefined;
    }
    const stableSessionId = stableKeyOf(domainSessionId);

    this.beginDomainCreation(stableSessionId);
    const existing = await this.dbService.getItem('domainslives', stableSessionId);
    if (existing?.domain_session_id === domainSessionId) {
      this.finishDomainCreation(stableSessionId);
      return stableSessionId;
    }

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
      await this.dbService.setItem('domainvisits', {
        local_key: stableSessionId,
        domain_session_id: domainSessionId,
        start_time: payloadDomain.start_time,
        payload: payloadDomain,
      });
      const response = await apiRequestWithDevice(
        `${apiUrl}/tab/tabs/${windowId}/`,
        { method, body: JSON.stringify(payload), signal: AbortSignal.timeout(DOMAIN_REQUEST_TIMEOUT_MS) },
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

      const matches = data.created_domains.filter(
        (domain: DomainResponseTypes) => domain.domain_session_id === domainSessionId,
      );
      const createdDomain: DomainResponseTypes | undefined = matches.length === 1 ? matches[0] : undefined;

      if (!createdDomain) {
        console.error(
          `[${this.serviceName}] Expected one created Domain for ${domainSessionId}; received ${matches.length}`,
        );
        this.failDomainCreation(
          stableSessionId,
          new Error(`Expected one matching created Domain; received ${matches.length}`),
        );
        return undefined;
      }

      console.log(`[${this.serviceName}] Exact created domain:`, createdDomain);

      // Store under the explicit local key; the wire hint (key#visitStart) stays
      // byte-for-byte in the record's own field so closings and wavelets keep the
      // exact identity the backend resolver matches on.
      await this.dbService.setItem('domainslives', {
        ...createdDomain,
        domain_session_id: domainSessionId,
        local_key: stableSessionId,
      });

      this.finishDomainCreation(stableSessionId);

      // Callers (DomainEventManager, lookups) operate on the stable key; the
      // timestamped hint exists only in payloads and the stored record's field.
      return stableSessionId;
    } catch (error) {
      this.failDomainCreation(stableSessionId, error);
      console.error(`[${this.serviceName}] Error:`, error);
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
    DomainManager.closingDomains.add(domainSessionId);
    const itemOrError = await this.dbService.getItem('domainslives', domainSessionId);

    if (!itemOrError) {
      await this.cancelPendingDomain(domainSessionId);
      return;
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
      { method, body: JSON.stringify(payload), signal: AbortSignal.timeout(DOMAIN_REQUEST_TIMEOUT_MS) },
      { method },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`[${this.serviceName}] Error: ${response.status} - ${errorText}`);
    }
    console.log(`[${this.serviceName}] Domain updated, removed from local store`);
    await this.cancelPendingDomain(domainSessionId);
  }
}

export default DomainManager;
