import { TwitchStreamData } from './types';
import { BaseSocialWavelet } from './BaseSocialWavelet';
import { SelectorConfig } from '@chrome-extension-boilerplate/shared/lib/types/contentScript';

function parseViewerCount(text: string): number {
  const match = text.match(/([\d,.]+)\s*K?/i);
  if (!match) return 0;
  const raw = match[1].replace(/,/g, '');
  const multiplier = text.toLowerCase().includes('k') ? 1000 : 1;
  const value = parseFloat(raw) * multiplier;
  return Number.isFinite(value) ? Math.round(value) : 0;
}

function parseDuration(text: string): string | undefined {
  // Twitch duration format: HH:MM:SS or MM:SS
  const match = text.match(/^(\d{1,2}):(\d{2}):(\d{2})$/) || text.match(/^(\d{1,2}):(\d{2})$/);
  return match ? text : undefined;
}

export class TwitchStreamWavelet extends BaseSocialWavelet {
  protected readonly messageType = 'TWITCH_STREAM';
  protected readonly label = '🎮[TwitchStream]';

  constructor(config?: SelectorConfig) {
    super(config);
  }

  isSite(): boolean {
    if (this.selectorConfig?.hostname_patterns?.length) {
      return this.selectorConfig.hostname_patterns.some(p => window.location.hostname.includes(p));
    }
    return window.location.hostname.includes('twitch.tv');
  }

  extractPost(streamInfo: HTMLElement): TwitchStreamData | null {
    try {
      // ── Channel handle from URL ──────────────────────────────────────
      const pathParts = window.location.pathname.split('/').filter(Boolean);
      const channelHandle = pathParts[0] ?? '';
      if (!channelHandle) return null;

      // ── Stream title ─────────────────────────────────────────────────
      const titleEl = streamInfo.querySelector<HTMLElement>(
        this.sel(streamInfo, 'stream_title', 'p[data-a-target="stream-title"]'),
      );
      const title = titleEl?.textContent?.trim() ?? '';

      // ── Display name ─────────────────────────────────────────────────
      const displayNameEl = streamInfo.querySelector<HTMLElement>(this.sel(streamInfo, 'display_name', 'h1.tw-title'));
      const displayName = displayNameEl?.textContent?.trim() ?? channelHandle;

      // ── Game / Category ──────────────────────────────────────────────
      const gameLink = streamInfo.querySelector<HTMLAnchorElement>(
        this.sel(streamInfo, 'game_link', 'a[data-a-target="stream-game-link"]'),
      );
      const gameName = gameLink?.textContent?.trim() ?? '';

      // ── Viewer count ─────────────────────────────────────────────────
      const viewerEl = streamInfo.querySelector<HTMLElement>(
        this.sel(streamInfo, 'viewer_count', 'strong[data-a-target="animated-channel-viewers-count"]'),
      );
      const viewerCount = parseViewerCount(viewerEl?.textContent ?? '');

      // ── Stream duration ──────────────────────────────────────────────
      const durationEl = streamInfo.querySelector<HTMLElement>(this.sel(streamInfo, 'duration', '.live-time span'));
      const duration = parseDuration(durationEl?.textContent ?? '');

      // ── Tags ─────────────────────────────────────────────────────────
      const tagEls = streamInfo.querySelectorAll<HTMLElement>(this.sel(streamInfo, 'tags', '.tw-tag'));
      const tags = Array.from(tagEls)
        .map(el => el.textContent?.trim() ?? '')
        .filter(Boolean);

      // ── Verified ─────────────────────────────────────────────────────
      const isVerified = !!streamInfo.querySelector(
        this.sel(streamInfo, 'verified', 'svg[aria-label="Verified Partner"]'),
      );

      // ── LIVE status ──────────────────────────────────────────────────
      const isLive = !!streamInfo.querySelector(
        this.sel(streamInfo, 'live_badge', '.tw-channel-status-text-indicator'),
      );

      // ── Post ID ──────────────────────────────────────────────────────
      const postId = `${channelHandle}_${Date.now()}`;

      return {
        id: postId,
        platform: 'twitch' as const,
        signal_type: 'played' as const,
        author_handle: channelHandle,
        author_display_name: displayName,
        content_text: title,
        permalink: `https://www.twitch.tv/${channelHandle}`,
        post_type: 'video' as const,
        likes: 0,
        comments: 0,
        views: viewerCount,
        viewer_count: viewerCount,
        is_live: isLive,
        game_name: gameName,
        tags,
        stream_duration: duration,
        is_verified: isVerified,
        captured_at: new Date().toISOString(),
        page_url: window.location.href,
        domain_id: '',
        is_ad: false,
      };
    } catch (err) {
      console.error('[🎮TwitchStream] extractPost — error:', err);
      return null;
    }
  }

  private extractCurrent(): void {
    // Only extract on actual channel pages (not directory)
    const pathParts = window.location.pathname.split('/').filter(Boolean);
    if (pathParts.length !== 1) return; // e.g., /oilrats247

    const channelHandle = pathParts[0];
    if (this.capturedIds.has(channelHandle)) return;
    this.capturedIds.add(channelHandle); // claim slot before async delay

    // Delay to let Twitch render the stream info DOM, then retry once if viewer count is still 0.
    this.tryExtract(channelHandle, 1000);
  }

  private tryExtract(channelHandle: string, delay: number, isRetry = false): void {
    setTimeout(() => {
      const streamInfoSel = this.selectorConfig?.selectors['stream_info']?.[0] ?? '#live-channel-stream-information';
      const streamInfo = document.querySelector<HTMLElement>(streamInfoSel) ?? document.body;

      const data = this.extractPost(streamInfo);
      if (!data) return;

      if (!isRetry && data.views === 0) {
        // Viewer count may still be loading; retry once after another second.
        this.capturedIds.delete(channelHandle);
        this.tryExtract(channelHandle, 1000, true);
        return;
      }

      this.sendData(data);
    }, delay);
  }

  // Override: use URL change detection for SPA navigation
  protected processAddedNode(): void {}

  initialize(): void {
    if (!this.isSite()) return;
    console.log(`[${this.label}] Initializing`);

    // Listen for SPA navigation (Twitch uses history API)
    let lastPath = window.location.pathname;
    const checkNavigation = () => {
      const currentPath = window.location.pathname;
      if (currentPath !== lastPath) {
        lastPath = currentPath;
        // Clear captured IDs on navigation to allow re-extraction
        this.capturedIds.clear();
        this.extractCurrent();
      }
    };

    // Poll for URL changes (Twitch doesn't fire a custom event like yt-navigate-finish)
    setInterval(checkNavigation, 500);

    // Also check on initial load
    this.extractCurrent();
  }
}
