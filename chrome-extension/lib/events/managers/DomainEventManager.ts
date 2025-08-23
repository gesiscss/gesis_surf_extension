/**
 * Manages domain-related events in the Chrome extension.
 * Handles domain changes, transitions, and session management.
 * Integrates with TabEventManager to track active domains across tabs.
 */

import { DomainHandler, DomainDataTypes, TabMapping } from '@root/lib/handlers';
import { DatabaseService} from '@root/lib/db';


/**
 * Manages domain-related events in the Chrome extension.
 * Handles domain changes, transitions, and session management
 * Integrates with TabEventManager to track active domains across tabs.
 */
class DomainEventManager {
  private currentActiveDomainSessionId: string | null = null;

  constructor(
    private domainManager: DomainHandler,
    private dbService: DatabaseService
  ) {}

  /**
   * Gets the current active domain session ID.
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
  async handleDomainChange(newDomain: string | null, tab: DomainDataTypes , mapping: TabMapping) {
    console.log(`Handle Domain Change to ${newDomain}`); 
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

  // private updateMappingForNewTab(tab: Tab, mapping: TabMapping) {


  /**
   * Checks if the domain should be updated.
   * @param newDomain The new domain URL.
   * @returns A boolean indicating if the domain should be updated.
   */
  private shouldUpdateDomain(newDomain: string | null) {

    // New domain detected (not null) and different from the current active domain
    const isNewDomain = newDomain !== null &&
                        newDomain !== this.currentActiveDomainSessionId;

    // Close the current domain session if a new domain is detected
    const shouldCloseDomain = this.currentActiveDomainSessionId !== null &&
                              this.currentActiveDomainSessionId !== newDomain;
    
    return isNewDomain || shouldCloseDomain;
  }

  /**
   * Processes the domain transition event.
   * @param newDomain The new domain URL.
   * @param tab The tab data.
   * @param mapping The tab mapping data.
   * @returns void
   * @throws Error if an error occurs during the domain transition.
   */
  private async processDomainTransition(newDomain: string | null, tab: DomainDataTypes, mapping: TabMapping) {
    console.log(`Processing domain transition to ${newDomain}`);
    if (this.currentActiveDomainSessionId &&
        this.currentActiveDomainSessionId !== newDomain) {
          await this.closePreviousDomainSession();
        }
// COMO AQUI YA CAMBIE LA LOGICA TENDRIAMOS QUE HACER UPDATE DE DOMAIN Y NO DE TAB
    if (newDomain && newDomain !== this.currentActiveDomainSessionId) {
      await this.initializeNewDomainSession(newDomain, tab, mapping);
    }
  }

  /**
   * Closes the previous domain session.
   * @param mapping The tab mapping data.
   * @returns void
   * @throws Error if an error occurs during the domain session closure.
   * @throws Error if the current active domain session ID is null.
   */
  private async closePreviousDomainSession() {
    console.log(`Closing domain ${this.currentActiveDomainSessionId}`);
    if (this.currentActiveDomainSessionId) {
      await this.domainManager.updateDomain(
        this.currentActiveDomainSessionId,
        "PATCH"
      );
      this.currentActiveDomainSessionId = null;
    }
  }

  /**
   * Initializes a new domain session.
   * @param newDomain The new domain URL.
   * @param tab The tab data.
   * @param mapping The tab mapping data.
   * @returns void
   * @throws Error if an error occurs during the domain session initialization.
   */
  private async initializeNewDomainSession(newDomain: string, tab: DomainDataTypes, mapping: TabMapping) {
    console.log(`New Active Domain ${newDomain}`);
    this.currentActiveDomainSessionId = newDomain;

    if(mapping.id === undefined){
      throw new Error('Tab ID is undefined');
    }

    const convertedMapping = {
      ...mapping,
      id: typeof mapping.id === 'string' ? Number(mapping.id) : mapping.id
    };

    await this.domainManager.sendDomain(tab, convertedMapping, "PATCH");
  }

  /**
   * Logs that the domain has not changed.
   * @param newDomain The new domain URL.
   * @returns void
   * @throws Error if the new domain is null.
   */
  private logDomainNoChange(newDomain: string | null) {
    console.log(`Domain not changed ${newDomain || 'null'}`);
  }

  /**
   * Handles domain-related errors.
   * @param error The error that occurred.
   * @param domain The domain URL.
   * @returns void
   */
  private handleDomainError(error: unknown, domain: string | null) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Domain error for ${domain || 'unknown domain'}:`, errorMessage);
  }

}

export default DomainEventManager;