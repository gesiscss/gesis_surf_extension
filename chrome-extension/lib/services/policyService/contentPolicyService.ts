/**
 * @fileoverview Content-level policy service.
 * Handles policy decisions for content-level events (clicks, scrolls, HTML).
 */

import { BasePolicyService } from "./basePolicyService";
import { PolicyClassification, ContentPolicyDecision, ContentEventKind } from "./types";
import { DatabaseService } from "@root/lib/db";
import { ClickData, HTMLSnapshot } from "@chrome-extension-boilerplate/shared/lib/types/contentScript";

export class ContentPolicyService extends BasePolicyService {

    constructor(databaseService?: DatabaseService) {
        super(databaseService);
    }

    protected get serviceName(): string {
        return 'ContentPolicyService';
    }

    /**
     * Evaluates the content policy for a given URL and event kind.
     * @param url The page URL
     * @param eventKind The type of content event (click, scroll, html)
     * @returns ContentPolicyDecision with action and optional mask value
     */
    public async evaluate(url: string, eventKind: ContentEventKind): Promise<ContentPolicyDecision> {
        const classification = await this.resolvePolicy(url);
        console.log(`[ContentPolicyService] Classification for ${url}: ${classification}, event: ${eventKind}`);
        return this.decide(classification, eventKind);
    }

    /**
     * Maps classification + event kind to a content policy decision.
     */
    private decide(classification: PolicyClassification, eventKind: ContentEventKind): ContentPolicyDecision {
        switch (classification) {
            case 'full_allow':
            case 'default':
                return { action: 'allow' };

            case 'only_host':
                return this.decideOnlyHost(eventKind);

            case 'full_deny':
            case 'private':
                return { action: 'block', reason: classification };

            default:
                console.warn(`[ContentPolicyService] Unknown classification: ${classification}`);
                return { action: 'allow' };
        }
    }

    /**
     * Handles the only_host classification per event kind:
     * - Clicks: masked (referrer + target element)
     * - Scrolls: allowed (no sensitive content)
     * - HTML: blocked
     */
    private decideOnlyHost(eventKind: ContentEventKind): ContentPolicyDecision {
        switch (eventKind) {
            case 'click':
                return { action: 'mask', maskValue: 'only_host' };
            case 'scroll':
                return { action: 'allow' };
            case 'html':
                return { action: 'block', reason: 'only_host' };
            default:
                return { action: 'allow' };
        }
    }

    /**
     * Applies masking to click data based on a mask value.
     * @param clickData Original click data
     * @param maskValue The value to use for masked fields
     * @returns Masked ClickData
     */
    public maskClickData(clickData: ClickData, maskValue: string): ClickData {
        return {
            ...clickData,
            click_referrer: maskValue,
            click_target_element: maskValue,
        };
    }

    /**
     * Applies masking to HTML snapshot.
     * @param htmlData Original HTML snapshot
     * @param maskValue The value to replace content with
     * @returns Masked HTMLSnapshot
     */
    public maskHTMLSnapshot(htmlData: HTMLSnapshot, maskValue: string): HTMLSnapshot {
        return {
            ...htmlData,
            html_content: maskValue,
        };
    }
}