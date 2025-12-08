/**
 * @fileoverview Service to apply policies based on privacy mode and host rules.
 * Generates domain payloads accordingly.
 * @implements {PolicyService}
 */
import {  DomainPayloadTypes, DomainDataTypes } from "@root/lib/handlers/types/domainTypes";
import { HostItemTypes } from "../../db/interfaces/types";


export class PolicyService {

    /**
     * Constructs the domain payload based on privacy mode and host rules
     * @param tab The browser tab information
     * @param hostRules The rules found by HostService
     * @param htmlSnapshot The HTML snapshot of the page
     * @param isPrivateMode Whether the browser is in private mode
     * @returns PolicyPayload The constructed payload
     */
    applyPolicy(
        domain: DomainDataTypes,
        hostRule: HostItemTypes | null,
        isPrivateMode: boolean
    ): DomainPayloadTypes {

        if (isPrivateMode) {
            return this.createMaskedPayload(domain, 'Private-Mode');
        }

        if (hostRule) {
            const classification = hostRule.categories?.[0]?.criteria?.criteria_classification;

            switch (classification) {
                case 'full_deny':
                    return this.createMaskedPayload(domain, classification);
                case 'only_host':
                    return this.createOnlyHostPayload(domain, classification);
                case 'full_allow':
                    return this.createFullAllowPayload(domain);
                default:
                    console.warn('[PolicyService] Unknown classification, applying default payload', classification);
                    return this.createDefaultPayload(domain);
            }
        }
        return this.createDefaultPayload(domain);
    }

    /**
     * Creates a payload for private mode
     * @param tab The browser tab information
     * @returns PolicyPayload The constructed payload for private mode
     */
    private createMaskedPayload(domain: DomainDataTypes, maskValue: string): DomainPayloadTypes {

        console.log('[PolicyService] Applying Private Mode policy');

        return {
            domain_title: maskValue,
            domain_url: maskValue,
            domain_fav_icon: maskValue,
            start_time: new Date().toISOString(),
            closing_time: new Date().toISOString(),
        };

    }

    /**
     * Payload based on host rule application
     * @param tab 
     * @param rule 
     * @param htmlSnapshot 
     * @returns PolicyPayload The constructed payload based on host rule
     */
    private createFullAllowPayload(
        domain: DomainDataTypes,
    ): DomainPayloadTypes {

        console.log('[PolicyService] Applying Full Allow policy');

        return {
            domain_title: domain.title || 'No Title',
            domain_url: domain.url || 'No URL',
            domain_fav_icon: domain.favIconUrl || 'No Icon',
            start_time: new Date().toISOString(),
            closing_time: new Date().toISOString(),
            domain_last_accessed: new Date().toISOString(),
        };
    }

    /**
     * Creates payload for only_host classification
     * Shows only hostname, masks title and HTML
     * @param tab The browser tab information
     * @param rule The host rule to apply
     * @returns PolicyPayload The only_host payload
     */
    private createOnlyHostPayload(domain: DomainDataTypes, rule: string): DomainPayloadTypes {
        console.log('[PolicyService] Creating only_host payload for:', rule);
        
        return {
            domain_title: rule,
            domain_url: new URL(domain.url).hostname,
            domain_fav_icon: rule,
            start_time: new Date().toISOString(),
            closing_time: new Date().toISOString(),
        };

    }

    private createDefaultPayload(domain: DomainDataTypes): DomainPayloadTypes {
        console.log('[PolicyService] Creating default payload');

        return {
            domain_title: domain.title,
            domain_url: domain.url,
            closing_time: new Date().toISOString(),
            start_time: new Date().toISOString(),
            domain_fav_icon: domain.favIconUrl || 'Not found'
        };
    }
}
            