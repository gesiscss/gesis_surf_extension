/**
 * @fileoverview Domain-level policy service
 * Handles policy decisions for domain-level data (title, URL, favicon) based on host rules and private mode status.
 * Responsibilities:
 * - Evaluating domain policies based on URL and host rules.
 * - Building domain payloads with appropriate masking based on policy classification.
 * - Providing a consistent interface for domain policy evaluation to be used by the DomainEventManager.
 */
import { DomainPayloadTypes, DomainDataTypes } from '@root/lib/handlers/types/domainTypes';
import { BasePolicyService } from './basePolicyService';
import { DatabaseService } from '@root/lib/db';
import { PolicyClassification } from './types';

export class DomainPolicyService extends BasePolicyService {
  constructor(dbService: DatabaseService) {
    super(dbService);
  }

  protected get serviceName(): string {
    return 'DomainPolicyService';
  }

  /**
   * Evaluates the domain policy for a given URL and domain data.
   * @param url The page URL
   * @param domain The domain data to evaluate
   * @returns DomainPayloadTypes with masked or full information based on policy classification
   */
  public async evaluate(url: string, domain: DomainDataTypes): Promise<DomainPayloadTypes> {
    const classification = await this.resolvePolicy(url);
    console.log(`[${this.serviceName}] Classification for ${url}: ${classification}`);
    return this.buildPayload(domain, classification);
  }

  /**
   * Builds the domain payload based on the policy classification.
   * - For 'private' and 'full_deny': masks title, URL, and favicon
   * - For 'only_host': shows only hostname, masks title and favicon
   * - For 'full_allow' and 'default': includes full domain information
   * @param domain The domain data to build the payload from
   * @param classification The policy classification to determine masking
   * @returns DomainPayloadTypes The constructed payload based on classification
   */
  private buildPayload(domain: DomainDataTypes, classification: PolicyClassification): DomainPayloadTypes {
    switch (classification) {
      case 'private':
        return this.createMaskedPayload(domain, 'Private-Mode', classification);

      case 'full_deny':
        return this.createMaskedPayload(domain, classification, classification);

      case 'only_host':
        return this.createOnlyHostPayload(domain, classification, classification);

      case 'full_allow':
      case 'default':
      default:
        return this.createFullAllowPayload(domain, classification);
    }
  }

  /**
   * Creates a masked payload for private mode or full deny classification
   * @param domain The domain data to build the payload from
   * @param maskValue The value to use for masking
   * @returns DomainPayloadTypes The constructed payload for private mode or full deny classification
   */
  private createMaskedPayload(domain: DomainDataTypes, maskValue: string, classification: string): DomainPayloadTypes {
    console.log(`[${this.serviceName}] Applying masked payload for classification: ${maskValue}`);
    return {
      domain_title: maskValue,
      domain_url: maskValue,
      domain_fav_icon: maskValue,
      start_time: new Date().toISOString(),
      closing_time: new Date().toISOString(),
      criteria_classification: classification,
    };
  }

  /**
   * Creates a payload for full allow classification
   * @param domain The domain data to build the payload from
   * @returns DomainPayloadTypes The constructed payload for full allow classification
   */
  private createFullAllowPayload(domain: DomainDataTypes, classification: string): DomainPayloadTypes {
    console.log(`[${this.serviceName}] Applying Full Allow policy`);
    return {
      domain_title: domain.title || 'No Title',
      domain_url: domain.url || 'No URL',
      domain_fav_icon: domain.favIconUrl || 'No Icon',
      start_time: new Date().toISOString(),
      closing_time: new Date().toISOString(),
      domain_last_accessed: new Date().toISOString(),
      criteria_classification: classification,
    };
  }

  /**
   * Creates payload for only_host classification
   * Shows only hostname, masks title and favicon
   * @param domain The domain data to build the payload from
   * @param maskValue The value to use for masking
   * @returns DomainPayloadTypes The only_host payload
   */
  private createOnlyHostPayload(
    domain: DomainDataTypes,
    maskValue: string,
    classification: string,
  ): DomainPayloadTypes {
    console.log(`[${this.serviceName}] Creating only_host payload for: ${maskValue}`);
    return {
      domain_title: maskValue,
      domain_url: this.extractHost(domain.url),
      domain_fav_icon: maskValue,
      start_time: new Date().toISOString(),
      closing_time: new Date().toISOString(),
      criteria_classification: classification,
    };
  }

  /**
   * Extracts the host from a given URL.
   * @param url The URL to extract the host from.
   * @returns The host part of the URL or the original URL if extraction fails.
   */
  private extractHost(url: string): string {
    try {
      const parsedUrl = new URL(url);
      return parsedUrl.host;
    } catch (error) {
      console.error(`[${this.serviceName}] Error extracting host from URL ${url}:`, error);
      return url;
    }
  }

  /**
   * Returns the masked URL for given URL based on policy classification.
   * Used by ContentEventManager to reconstruct the domain session ID.
   * @param url The URL to be masked.
   * @returns The masked URL if policy requires masking, otherwise returns the original URL.
   */
  public async getMaskedUrl(url: string): Promise<string | undefined> {
    const classification = await this.resolvePolicy(url);
    console.log(`[${this.serviceName}] Classification for URL ${url}: ${classification}`);
    switch (classification) {
      case 'private':
        return 'Private-Mode';
      case 'full_deny':
        return classification;
      case 'only_host':
        return this.extractHost(url);
      case 'full_allow':
      case 'default':
      default:
        return undefined;
    }
  }
}
