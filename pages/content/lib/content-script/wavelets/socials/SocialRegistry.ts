/**
 * @fileoverview Initializes and manages social media tracking by registering specific extractors for supported platforms.
 *
 * Each wavelet targets a single platform and signal type:
 *  - XWavelet           → X/Twitter feed posts (DOM insertion)
 *  - TikTokWavelet      → TikTok feed videos (DOM insertion / feed exposure)
 *  - TikTokPlayedWavelet → TikTok videos the user actually played (play event)
 *  - YouTubeShortsWavelet → YouTube Shorts (yt-navigate-finish SPA event)
 *
 * This mirrors the LLMRegistry pattern — add new wavelets here as new platforms are supported.
 */

import { XWavelet } from './XWavelet';
import { TikTokWavelet } from './TikTokWavelet';
import { TikTokPlayedWavelet } from './TikTokPlayedWavelet';
import { YouTubeShortsWavelet } from './YouTubeShortsWavelet';

/**
 * Initializes social media tracking by creating instances of all supported platform
 * extractors and calling their initialization methods.
 *
 * Each wavelet checks whether the current page matches its target site before
 * attaching any observers or listeners — safe to call on every page load.
 *
 * @returns {void}
 */
export function initializeSocialTracking(): void {
    [
        new XWavelet(),
        new TikTokWavelet(),
        new TikTokPlayedWavelet(),
        new YouTubeShortsWavelet(),
    ].forEach(w => w.initialize());
}
