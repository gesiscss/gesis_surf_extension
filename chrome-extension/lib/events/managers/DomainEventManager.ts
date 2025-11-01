/**
 * Manages domain-related events in the Chrome extension.
 * Handles domain changes, transitions, and session management.
 * Integrates with TabEventManager to track active domains across tabs.
 */

import { DomainHandler, DomainDataTypes, TabMapping } from '@root/lib/handlers';

/**
 * Manages domain-related events in the Chrome extension.
 * Handles domain changes, transitions, and session management
 * Integrates with TabEventManager to track active domains across tabs.
 */
class DomainEventManager {
  public currentActiveDomainSessionId: string | null = null;

  constructor(
    private domainManager: DomainHandler
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

  public resetDomainSession(): void {
    console.log('Resetting current active domain session ID');
    this.currentActiveDomainSessionId = null;
  }

  public async handleDomainCleanup(): Promise<void> {
    try{
      if (this.currentActiveDomainSessionId) {
        console.log(`Cleaning up domain session for ${this.currentActiveDomainSessionId}`);
        await this.closePreviousDomainSession();
      }
      this.resetDomainSession();
    } catch (error) {
      this.resetDomainSession();
      this.handleDomainError(error, this.currentActiveDomainSessionId);
    }
  }

  // private updateMappingForNewTab(tab: Tab, mapping: TabMapping) {


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
   * Validates if domain is ready to be sent to the server when completed
   * @param tab The domain URL.
   * @returns A boolean indicating if the domain is valid.
   * @throws Error if an error occurs during the validation.
   */
  private isDomainReadyToSend(tab: DomainDataTypes): boolean {
    // Check the status of the tab to determine if it's complete
    if (tab.status === 'complete') {
      return true;
    }
    return false;
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
    console.log('Mapping in DomainEventManager:', mapping);
    console.log('Type if mapping.id:', typeof mapping.id);

    this.currentActiveDomainSessionId = newDomain;

    if(mapping.id === undefined){
      throw new Error('Tab ID is undefined');
    }

    // const convertedMapping = {
    //   ...mapping,
    //   id: typeof mapping.id === 'string' ? Number(mapping.id) : mapping.id
    // };

    // console.log('Converted Mapping in DomainEventManager:', convertedMapping);

    // // console.log('Mapping in DomainEventManager:', convertedMapping);  ///MODIFING THE UUID TO NUMBER
    // console.log('Mapping in DomainEventManager:', mapping);
    // console.log('TAB in DomainEventManager:', tab);
    
    if (this.isDomainReadyToSend(tab)) {
      console.warn(`Domain is ready to be sent for ${newDomain}`);
      await this.domainManager.sendDomain(tab, mapping, "PATCH");
    } else {
      console.log(`Domain is not ready to be sent for ${newDomain}`);
    }
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