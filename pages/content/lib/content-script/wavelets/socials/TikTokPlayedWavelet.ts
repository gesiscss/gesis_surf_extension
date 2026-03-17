import { SelectorConfig } from '@chrome-extension-boilerplate/shared/lib/types/contentScript';
import { TikTokWavelet } from './TikTokWavelet';

/**
 * Captures TikTok videos the user actually *played* (autoplay or manual).
 *
 * Extends TikTokWavelet to reuse isSite(), EXCLUDED_PATHS, and extractPost().
 * Instead of MutationObserver, listens for the native 'play' event on <video>
 * elements (useCapture=true required because 'play' does not bubble).
 *
 * Emits messageType: 'TIKTOK_PLAYED' — separate signal from 'TIKTOK_POST'
 * (which fires on DOM insertion / feed pre-load).
 */
export class TikTokPlayedWavelet extends TikTokWavelet {
    protected readonly messageType = 'TIKTOK_PLAYED';
    protected readonly label = '▶[TikTok-Played]';

    constructor(config?: SelectorConfig) { super(config); }

    // Override base initialize() — no MutationObserver, use play event instead
    initialize(): void {
        if (!this.isSite()) return;
        console.log(`[${this.label}] Initializing`);

        // useCapture=true: 'play' does not bubble, so we must intercept at capture phase
        document.addEventListener(
            'play',
            (e) => {
                if (!(e.target instanceof HTMLVideoElement)) return;

                // Re-check path on every play in case SPA navigated away from feed
                if (!this.isSite()) return;

                // Walk up from the <video> to the outer flex container TikTok uses
                const contentFlexSel = this.selectorConfig?.selectors['content_flex']?.[0] ?? 'div[class*="DivContentFlexLayout"]';
                const container = e.target.closest<HTMLElement>(contentFlexSel);
                if (!container) return;

                const data = this.extractPost(container);
                if (!data) return;
                if (this.capturedIds.has(data.video_id)) return;
                this.capturedIds.add(data.video_id);
                data.feed_position = ++this.feedPosition;
                this.sendData(data);
            },
            true, // useCapture
        );
    }
}
