/**
 * @fileoverview Abstract base class for LLM chat extractors.
 * Provides shared state, debounce logic, deduplication, and message sending.
 * Subclasses implement site detection, message extraction, and element watching.
 * Each extractor watches for DOM changes to capture LLM messages as they appear.
 * Captured messages are sent to the background script for processing.
 */

import { LLMData } from './types';
import { runtime } from 'webextension-polyfill';

/**
 * Abstract base class for LLM chat extractors.
 * Provides shared state, debounce logic, deduplication, and message sending.
 * Subclasses implement site detection, message extraction, and element watching.
 */
export abstract class BaseLLMExtractor {
    protected readonly pendingCaptures = new Map<HTMLElement, ReturnType<typeof setTimeout>>();
    protected readonly sentMessageIds = new Set<string>();

    /** Returns true if the current page belongs to this extractor's LLM site. */
    abstract isSite(): boolean;

    /** Extracts structured LLMData from a message element, or null if not applicable.
     * @param element The DOM element representing a chat message to extract data from.
     * Must return an object with at least llm_provider, message_type, and message_id.
     * The implementation depends on the site's DOM structure and data attributes.
     */
    abstract extractMessage(element: HTMLElement): LLMData | null;

    /**
     * Sets up watching for a streaming assistant element.
     * Called when an assistant container is first inserted (may be empty).
     * Implementation differs per site (debounce vs attribute watch).
     * @param element The assistant container element to watch for updates.
     */
    abstract watchElement(element: HTMLElement): void;

    /**
     * Processes a newly added DOM node.
     * Should detect message elements inside the node and route to
     * scheduleCapture (user) or watchElement (assistant).
     * @param element The newly added DOM element to process.
     */
    protected abstract processAddedNode(element: HTMLElement): void;

    /**
     * Debounced capture. Resets the timer on every call for the same element.
     * Fires after `delay` ms of silence → extract → deduplicate → send.
     * @param element The DOM element to capture.
     * @param delay The debounce delay in milliseconds.
     */
    protected scheduleCapture(element: HTMLElement, delay = 1500): void {
        const existing = this.pendingCaptures.get(element);
        if (existing) clearTimeout(existing);

        const timer = setTimeout(() => {
        this.pendingCaptures.delete(element);
        const data = this.extractMessage(element);
        if (!data) return;
        if (this.sentMessageIds.has(data.message_id)) return;
        this.sentMessageIds.add(data.message_id);
        this.sendData(data);
        }, delay);

        this.pendingCaptures.set(element, timer);
    }

    /** Sends captured LLM data to the background script.
     * Includes logging and error handling. Uses webextension-polyfill runtime API.
     * @param data The structured LLMData to send. Must include llm_provider, message_type, and message_id.
    */
    protected sendData(data: LLMData): void {
        runtime.sendMessage({ type: 'LLM_MESSAGE', data })
        .then(() => console.log(`✅[${data.llm_provider}] Sent:`, data.message_type, data.message_id))
        .catch(e => console.error(`❌[${data.llm_provider}] Send failed:`, e));
    }

    /** Attaches a MutationObserver to document.body and routes added nodes to processAddedNode.
     * This is the main mechanism for detecting new messages and assistant containers in the DOM.
     */
    private setupObserver(): void {
        const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
            if (node.nodeType !== Node.ELEMENT_NODE) return;
            this.processAddedNode(node as HTMLElement);
            });
        });
        });

        observer.observe(document.body, { childList: true, subtree: true });
        console.log(`🤖[LLM] Observer active for ${this.constructor.name}`);
    }

    /** Entry point. Checks site, waits for DOM ready, starts observer. */
    initialize(): void {
        if (!this.isSite()) return;

        console.log(`🤖[LLM] Initializing ${this.constructor.name}`);

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.setupObserver());
        } else {
            this.setupObserver();
        }
    }
}