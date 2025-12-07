/**
 * @fileoverview Service to apply policies based on privacy mode and host rules.
 * Generates domain payloads accordingly.
 * @implements {PolicyService}
 */
import { DomainPayloadTypes } from "@root/lib/handlers/types/domainTypes";
import { HostItemsTypes } from "@root/lib/db/types/hostItemsTypes";
import { Tabs } from "webextension-polyfill";
import { PolicyPayload } from "./types";


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
        tab: Tabs.Tab,
        hostRule: HostItemsTypes | null,
        htmlSnapshot: string,
        isPrivateMode: boolean
    ): PolicyPayload {

        if (isPrivateMode) {
            return this.createMaskedPayload(tab, 'Private Mode');
        }

        if (hostRule) {
            const classification = hostRule.categories?.[0]?.criteria?.criteria_classification;

            switch (classification) {
                case 'full_deny':
                    return this.createMaskedPayload(tab, classification);
                case 'only_host':
                    return this.createOnlyHostPayload(tab, hostRule);
                case 'full_allow':
                    return this.createFullAllowPayload(tab, hostRule);
                default:
                    console.warn('[PolicyService] Unknown classification, applying default payload', classification);
                    return this.createDefaultPayload(tab, htmlSnapshot);
            }
        }
        return this.createDefaultPayload(tab, htmlSnapshot);
    }

    /**
     * Creates a payload for private mode
     * @param tab The browser tab information
     * @returns PolicyPayload The constructed payload for private mode
     */
    private createMaskedPayload(tab: Tabs.Tab, maskValue: string): PolicyPayload {

        console.log('[PolicyService] Applying Private Mode policy');

        const domain = {
            domain_title: maskValue,
            domain_url: maskValue,
            domain_fav_icon: maskValue,
            snapshot_html: maskValue,
            criteria_classification: maskValue,
        };

        return this.wrapPayload(domain, tab);
    }

    /**
     * Payload based on host rule application
     * @param tab 
     * @param rule 
     * @param htmlSnapshot 
     * @returns PolicyPayload The constructed payload based on host rule
     */
    private createFullAllowPayload(
        tab: Tabs.Tab,
        rule: HostItemsTypes,
    ): PolicyPayload {

        console.log('[PolicyService] Applying Full Allow policy');

        const domain: DomainPayloadTypes = {
            domain_title: tab.title || 'No Title',
            domain_url: tab.url || 'No URL',
            domain_fav_icon: tab.favIconUrl || 'No Icon',
            start_time: new Date().toISOString(),
            closing_time: new Date().toISOString(),
            domain_last_accessed: new Date().toISOString(),
            domain_session_id: `session-${tab.windowId}-${tab.id}-${tab.url}`
        };
        return this.wrapPayload(domain, tab);
    }

    /**
     * Creates payload for only_host classification
     * Shows only hostname, masks title and HTML
     * @param tab The browser tab information
     * @param rule The host rule to apply
     * @returns PolicyPayload The only_host payload
     */
    private createOnlyHostPayload(tab: Tabs.Tab, rule: HostItemsTypes): PolicyPayload {
        console.log('[PolicyService] Creating only_host payload for:', rule.hostname);

        // Check the criteria_rules for what fields are allowed
        const domainRules = rule.criteria_rules?.[0]?.core_domain;
        
        const domain: DomainPayloadTypes = {
            // Based on your data: domain_title: False, so mask it
            domain_title: domainRules?.domain_title === false ? 'only_host' : (tab.title || 'No title'),
            
            // domain_url: True in your data, but for only_host we show just hostname
            domain_url: rule.hostname,
            
            // domain_fav_icon: False, so mask it
            domain_fav_icon: domainRules?.domain_fav_icon === false ? 'only_host' : (tab.favIconUrl || 'Not found'),
            
            // snapshot_html: False, so don't include it
            snapshot_html: domainRules?.snapshot_html === false ? undefined : 'only_host',
            
            domain_status: 'true',
            start_time: new Date().toISOString(),
            closing_time: new Date().toISOString(),
            criteria_classification: 'only_host',
            
            // Category information can still be included
            category_label: domainRules?.category_label ? rule.category_label : undefined,
            category_number: domainRules?.category_number ? rule.category_number : undefined,
        };

        return this.wrapPayload(domain, tab);
    }

    private createDefaultPayload(tab: any, htmlSnapshot: string) {
        const domain = {
            domain_title: tab.title,
            domain_url: tab.url,
            snapshot_html: htmlSnapshot,
            closing_time: new Date(),
            start_time: new Date(),
            domain_status: 'true',
            domain_fav_icon: tab.favIconUrl || 'Not found'
        };

        return this.wrapPayload(domain, tab);
    }

    private wrapPayload(domainData: any, tab: any) {
        return {
            start_time: new Date(),
            closing_time: new Date(),
            tab_num: tab.id,
            window_num: tab.windowId,
            domains: [domainData],
        };
    }
}
            