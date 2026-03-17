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

import { storage } from 'webextension-polyfill';
import { SelectorConfig } from '@chrome-extension-boilerplate/shared/lib/types/contentScript';
import { XWavelet } from './XWavelet';
import { TikTokWavelet } from './TikTokWavelet';
import { TikTokPlayedWavelet } from './TikTokPlayedWavelet';
import { YouTubeShortsWavelet } from './YouTubeShortsWavelet';

/**
 * Initializes social media tracking by creating instances of all supported platform
 * extractors and calling their initialization methods.
 *
 * Reads per-provider SelectorConfig objects from storage.local so the backend can
 * push dynamic CSS selector overrides without requiring an extension update.
 * Falls back to hardcoded selectors if storage is unavailable or the key is absent.
 *
 * Each wavelet checks whether the current page matches its target site before
 * attaching any observers or listeners — safe to call on every page load.
 *
 * @returns {Promise<void>}
 */
export async function initializeSocialTracking(): Promise<void> {
    let configs: Record<string, SelectorConfig> = {};
    try {
        const result = await storage.local.get('selectors');
        configs = (result['selectors'] as Record<string, SelectorConfig>) ?? {};
    } catch {
        // storage unavailable — wavelets will fall back to hardcoded selectors
    }
    [
        new XWavelet(configs['x']),
        new TikTokWavelet(configs['tiktok']),
        new TikTokPlayedWavelet(configs['tiktok']),
        new YouTubeShortsWavelet(configs['youtube_shorts']),
    ].forEach(w => w.initialize());
}
