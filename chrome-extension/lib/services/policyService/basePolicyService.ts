/**
 * @fileoverview Base policy service providing shared policy resolution logic.
 * All policy services (domain, content, wavelets) should extend this base class to leverage
 * Responsabilities:
 * - Private mode detection and handling.
 * - Host rule lookup from indexed rules.
 * - Classification of policies based on host rules and private mode status.
 */

import { DatabaseService, HostItemTypes } from "@root/lib/db";
import { PolicyClassification } from "./types";
import { storage } from "webextension-polyfill";

export abstract class BasePolicyService {
    protected databaseService: DatabaseService;

    constructor(databaseService: DatabaseService) {
        this.databaseService = databaseService;
    }

    /**
     * Checks if the private mode is currently active.
     * @returns A promise that resolves to true if private mode is active, false otherwise.
     */
    protected async isPrivateModeActive(): Promise<boolean> {
        try {
            const privateModeState = await storage.local.get('private');
            const state = privateModeState['private'] as { mode?: boolean } | undefined;
            return state?.mode === true;
        } catch (error) {
            console.error(`[${this.serviceName}] Error checking private mode state:`, error);
            return false;
        }
    }

    /**
     * Parses and validates a URL, returning the hostname only for http/https URLs.
     * @param url The URL to parse and validate.
     * @returns The hostname if the URL is valid and uses http/https, or null otherwise.
     */
    protected parseAndValidateUrl(url: string): string | null {
        try {
            const parsedUrl = new URL(url);
            if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
                console.warn(`[${this.serviceName}] Unsupported URL protocol: ${parsedUrl.protocol} in URL ${url}`);
                return null;
            }
            return parsedUrl.hostname;
        } catch (error) {
            console.error(`[${this.serviceName}] Error parsing URL ${url}:`, error);
            return null;
        }
    }

    /**
     * Retrieves the host rule for a given URL from the database.
     * @param url The URL for which to retrieve the host rule.
     * @returns A promise that resolves to the host rule if found, or null if not found or an error occurs.
     */
    protected async getHostRule(url: string): Promise<HostItemTypes | null> 
    {
        const hostname = this.parseAndValidateUrl(url);
        if (!hostname) {
            console.warn(`[${this.serviceName}] Invalid URL provided for host rule lookup: ${url}`);
            return null;
        }

        try {
            const hostRule = await this.databaseService.getItem('hostslives', hostname);
            return hostRule as HostItemTypes || null;
        } catch (error) {
            console.error(`[${this.serviceName}] Error retrieving host rule for URL ${url}:`, error);
            return null;
        }
    }

    /**
     * Classifies the host rule into a policy classification based on its criteria classification.
     * @param hostRule The host rule to classify.
     * @returns The policy classification corresponding to the host rule's criteria classification.
     */
    protected classifyHostRule(hostRule: HostItemTypes): PolicyClassification {
        const classification = hostRule.categories?.[0]?.criteria?.criteria_classification;
        console.log(`[${this.serviceName}] Classifying host rule with criteria classification: ${classification}`);
        
        switch (classification) {
            case 'full_deny':
                return 'full_deny';
            case 'only_host':
                return 'only_host';
            case 'full_allow':
                return 'full_allow';
            default:
                console.warn(`[${this.serviceName}] Unrecognized criteria classification: ${classification}. Defaulting to 'default'.`);
                return 'default';
        }
    }

    /**
     * Determines if the given URL is in private mode based on stored rules.
     * @param url The URL to check for private mode status.
     * @returns A promise that resolves to true if the URL is in private mode, false otherwise.
     */
    protected async resolvePolicy(url: string): Promise<PolicyClassification> {
        if (await this.isPrivateModeActive()) {
            console.log(`[${this.serviceName}] Private mode is active. URL ${url} is considered private.`);
            return 'private';
        }

        if (url) {
            const hostRule = await this.getHostRule(url);
            if (hostRule) {
                return this.classifyHostRule(hostRule);
            }
        }

        return 'default';
    }

    protected abstract get serviceName(): string;
}

