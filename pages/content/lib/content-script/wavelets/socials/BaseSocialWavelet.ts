/**
 * @fileoverview Abstract base class for social media platform extractors.
 * Provides shared state, deduplication, and message sending.
 * Subclasses implement site detection, post extraction, and DOM node processing.
 * Each wavelet watches for DOM changes to capture social posts as they appear.
 * Captured posts are sent to the background script for processing.
 */
import { runtime } from 'webextension-polyfill';

export interface SocialPostData {
    id: string;
    [key: string]: unknown;
}

/**
 * Abstract base class for social media platform extractors.
 * Provides shared state, deduplication, and message sending.
 * Subclasses implement site detection, post extraction, and DOM node processing.
 */
export abstract class BaseSocialWavelet {
    protected readonly capturedIds = new Set<string>();

    /** Returns true if the current page belongs to this wavelet's target platform. */
    abstract isSite(): boolean;

    /**
     * Extracts structured post data from a platform-specific container element.
     * @param element The DOM element representing a social post container.
     * @returns Structured post data, or null if extraction fails or element is not a post.
     */
    abstract extractPost(element: HTMLElement): SocialPostData | null;

    /**
     * Processes a newly added DOM node.
     * Should detect post containers inside the node and call sendData with extracted data.
     * @param element The newly added DOM element to process.
     */
    protected abstract processAddedNode(element: HTMLElement): void;

    /** Message type string sent to the background script (e.g. 'TIKTOK_POST'). */
    protected abstract readonly messageType: string;

    /** Human-readable label used in console logs (e.g. '🎵[TikTok]'). */
    protected abstract readonly label: string;

    /**
     * Sends captured post data to the background script.
     * @param data The structured post data to send.
     */
    protected sendData(data: SocialPostData): void {
        runtime.sendMessage({ type: this.messageType, data })
            .then(() => console.log(`✅[${this.label}] Sent:`, data.id))
            .catch(e => console.error(`❌[${this.label}] Send failed:`, e));
    }

    /**
     * Sets up a MutationObserver to watch for new DOM nodes and process them.
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
        console.log(`[${this.label}] Observer active`);
    }

    /**
     * Initializes the wavelet by checking if the current site matches and setting up the observer.
     */
    initialize(): void {
        if (!this.isSite()) return;
        console.log(`[${this.label}] Initializing`);
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.setupObserver());
        } else {
            this.setupObserver();
        }
    }
}
