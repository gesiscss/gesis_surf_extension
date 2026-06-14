/**
 * @fileoverview Abstract base class for social media platform extractors.
 * Provides shared state, deduplication, and message sending.
 * Subclasses implement site detection, post extraction, and DOM node processing.
 * Each wavelet watches for DOM changes to capture social posts as they appear.
 * Captured posts are sent to the background script for processing.
 */
import { runtime } from 'webextension-polyfill';
import { SelectorConfig, SocialPostData } from '@chrome-extension-boilerplate/shared/lib/types/contentScript';

/**
 * Abstract base class for social media platform extractors.
 * Provides shared state, deduplication, and message sending.
 * Subclasses implement site detection, post extraction, and DOM node processing.
 */
export abstract class BaseSocialWavelet {
  protected readonly capturedIds = new Set<string>();

  constructor(protected readonly selectorConfig?: SelectorConfig) {}

  /**
   * Tries each selector in the config list against parent.querySelector.
   * Returns the first selector that matches an element and passes the optional
   * validator, or the fallback if none match.
   * @param parent The parent element to query within.
   * @param key The key in the selectorConfig to look up.
   * @param fallback A default CSS selector string to use if config is missing or no matches found.
   * @param validate Optional function to confirm the matched element has useful content.
   */
  protected sel(parent: Element, key: string, fallback: string, validate?: (el: Element) => boolean): string {
    const candidates = this.selectorConfig?.selectors[key];
    if (!candidates?.length) return fallback;
    for (const selector of candidates) {
      try {
        const el = parent.querySelector(selector);
        if (el !== null && (!validate || validate(el))) return selector;
      } catch {
        /* invalid CSS - try next */
      }
    }
    return fallback;
  }

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
    runtime
      .sendMessage({ type: this.messageType, data })
      .then(() => console.log(`✅[${this.label}] Sent:`, data.id))
      .catch(e => console.error(`❌[${this.label}] Send failed:`, e));
  }

  /**
   * Sets up a MutationObserver to watch for new DOM nodes and process them.
   */
  private setupObserver(): void {
    const observer = new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach(node => {
            if (node.nodeType !== Node.ELEMENT_NODE) return;
            this.processAddedNode(node as HTMLElement);
          });
        } else if (mutation.type === 'attributes' && mutation.target.nodeType === Node.ELEMENT_NODE) {
          // Handles React deferred rendering: data-testid is set after element insertion (e.g. X/Twitter)
          this.processAddedNode(mutation.target as HTMLElement);
        }
      });
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-testid', 'data-e2e'],
    });
    console.log(`[${this.label}] Observer active`);
    // Scan posts already in the DOM before the observer started
    console.log(`[${this.label}] Initial scan (t=0)`);
    this.processAddedNode(document.body as HTMLElement);
    // Retry after SPA finishes its initial data fetch and renders the first batch
    setTimeout(() => {
      console.log(`[${this.label}] Initial scan (t=1500)`);
      this.processAddedNode(document.body as HTMLElement);
    }, 1500);
    setTimeout(() => {
      console.log(`[${this.label}] Initial scan (t=4000)`);
      this.processAddedNode(document.body as HTMLElement);
    }, 4000);
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
