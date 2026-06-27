/**
 * @fileoverview Initializes and manages social media tracking by registering specific extractors for supported platforms.
 *
 * Each wavelet targets a single platform and signal type:
 *  - XWavelet           → X/Twitter feed posts (DOM insertion)
 *  - TikTokWavelet      → TikTok feed videos (DOM insertion / feed exposure)
 *  - TikTokPlayedWavelet → TikTok videos the user actually played (play event)
 *  - YouTubeShortsWavelet → YouTube Shorts (yt-navigate-finish SPA event)
 *  - YouTubeFeedWavelet → YouTube main feed videos (DOM insertion)
 *  - YouTubeWatchWavelet  → YouTube watch page videos (yt-navigate-finish SPA event)
 *  - FacebookFeedWavelet  → Facebook feed posts (DOM insertion)
 *  - FacebookReelWavelet  → Facebook Reels carousel cards (DOM insertion)
 *  - InstagramWavelet     → Instagram feed posts (DOM insertion)
 *  - LinkedInFeedWavelet  → LinkedIn feed posts (DOM insertion)
 *  - RedditFeedWavelet    → Reddit feed posts (DOM insertion)
 *  - TwitchFeedWavelet    → Twitch directory stream cards (DOM insertion)
 *  - ThreadsFeedWavelet   → Threads feed posts (DOM insertion)
 *
 * This mirrors the LLMRegistry pattern — add new wavelets here as new platforms are supported.
 */

import { storage } from 'webextension-polyfill';
import { SelectorConfig } from '@chrome-extension-boilerplate/shared/lib/types/contentScript';
import { XWavelet } from './XWavelet';
import { TikTokWavelet } from './TikTokWavelet';
import { TikTokPlayedWavelet } from './TikTokPlayedWavelet';
import { YouTubeShortsWavelet } from './YouTubeShortsWavelet';
import { FacebookFeedWavelet } from './FacebookFeedWavelet';
import { FacebookReelWavelet } from './FacebookReelWavelet';
import { InstagramWavelet } from './InstagramWavelet';
import { YouTubeFeedWavelet } from './YouTubeFeedWavelet';
import { YouTubeWatchWavelet } from './YouTubeWatchWavelet';
import { LinkedInFeedWavelet } from './LinkedInFeedWavelet';
import { RedditFeedWavelet } from './RedditFeedWavelet';
import { TwitchFeedWavelet } from './TwitchFeedWavelet';
import { TwitchStreamWavelet } from './TwitchStreamWavelet';
import { ThreadsFeedWavelet } from './ThreadsFeedWavelet';

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
  console.log(
    '[SocialRegistry] Loaded selector configs:',
    Object.keys(configs).length ? Object.keys(configs) : 'NONE (fallback to hardcoded)',
  );
  console.log('[SocialRegistry] instagram config:', configs['instagram'] ?? 'NOT FOUND');
  [
    new XWavelet(configs['x']),
    new TikTokWavelet(configs['tiktok']),
    new TikTokPlayedWavelet(configs['tiktok']),
    new YouTubeShortsWavelet(configs['youtube_shorts']),
    new YouTubeFeedWavelet(configs['youtube_feed']),
    new YouTubeWatchWavelet(configs['youtube_watch']),
    new InstagramWavelet(configs['instagram']),
    new FacebookFeedWavelet(configs['facebook']),
    new FacebookReelWavelet(configs['facebook_reels']),
    new LinkedInFeedWavelet(configs['linkedin']),
    new RedditFeedWavelet(configs['reddit']),
    new TwitchFeedWavelet(configs['twitch_feed']),
    new TwitchStreamWavelet(configs['twitch_stream']),
    new ThreadsFeedWavelet(configs['threads']),
  ].forEach(w => w.initialize());
}
