import { YouTubeWatchData } from './types';
import { BaseSocialWavelet } from './BaseSocialWavelet';
import { SelectorConfig } from '@chrome-extension-boilerplate/shared/lib/types/contentScript';

// ── Helpers ─────────────────────────────────────────────────────────────

function parseLikesFromAriaLabel(label: string): number {
  const match = label.match(/([\d,.]+)\s+(?:other\s+)?people?/i);
  if (!match) return 0;
  const raw = match[1].replace(/,/g, '');
  const value = parseInt(raw, 10);
  return Number.isFinite(value) ? value : 0;
}

function parseCommentsFromAriaLabel(label: string): number {
  const match = label.match(/(\d+)\s+comments?/i);
  return match ? parseInt(match[1], 10) : 0;
}

function parseViewCount(text: string): number {
  const match = text.match(/([\d,.]+)\s+views?/i);
  if (!match) return 0;
  const raw = match[1].replace(/,/g, '').replace(/\./g, '');
  const value = Number(raw);
  return Number.isFinite(value) ? value : 0;
}

function parseUploadDate(text: string): string | undefined {
  const d = new Date(text);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

function extractVideoIdFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get('v');
}

// ── Wavelet class ──────────────────────────────────────────────────────

export class YouTubeWatchWavelet extends BaseSocialWavelet {
  protected readonly messageType = 'YOUTUBE_WATCH';
  protected readonly label = '▶[YTWatch]';

  constructor(config?: SelectorConfig) {
    super(config);
  }

  isSite(): boolean {
    if (this.selectorConfig?.hostname_patterns?.length) {
      return this.selectorConfig.hostname_patterns.some(p => window.location.hostname.includes(p));
    }
    return window.location.hostname.includes('youtube.com');
  }

  extractPost(watchFlexy: HTMLElement): YouTubeWatchData | null {
    try {
      const videoId = extractVideoIdFromUrl();
      if (!videoId) return null;

      // ── Title ──────────────────────────────────────────────────────
      const title =
        watchFlexy
          .querySelector(this.sel(watchFlexy, 'title', 'ytd-watch-metadata h1 yt-formatted-string'))
          ?.textContent?.trim() ||
        watchFlexy
          .querySelector(
            this.sel(watchFlexy, 'title_alt', 'ytd-video-primary-info-renderer h1.title yt-formatted-string'),
          )
          ?.textContent?.trim() ||
        '';

      // ── Channel handle ─────────────────────────────────────────────
      const channelLink = watchFlexy.querySelector<HTMLAnchorElement>(
        this.sel(watchFlexy, 'channel_link', 'ytd-video-owner-renderer a[href^="/@"], ytd-channel-name a[href^="/@"]'),
      );
      const channelHandle = channelLink?.href?.split('/@')[1]?.split('/')[0]?.split('?')[0] || '';
      const channelName = channelLink?.textContent?.trim() || '';

      // ── Views ──────────────────────────────────────────────────────
      const viewCountEl = watchFlexy.querySelector(
        this.sel(
          watchFlexy,
          'view_count',
          'ytd-video-view-count-renderer .view-count, ytd-watch-info-text #view-count',
        ),
      );
      const views = parseViewCount(viewCountEl?.textContent || '');

      // ── Upload date ──────────────────────────────────────────────────
      const dateText =
        watchFlexy
          .querySelector(
            this.sel(
              watchFlexy,
              'upload_date',
              'ytd-video-primary-info-renderer #info-strings yt-formatted-string, ytd-watch-info-text #date-text yt-formatted-string',
            ),
          )
          ?.textContent?.trim() || '';
      const postTimestamp = parseUploadDate(dateText);

      // ── Likes ──────────────────────────────────────────────────────
      const likeBtn = watchFlexy.querySelector(
        this.sel(
          watchFlexy,
          'like_button',
          'like-button-view-model button[aria-label*="like" i], ytd-menu-renderer like-button-view-model button',
        ),
      );
      const likeLabel = likeBtn?.getAttribute('aria-label') || '';
      const likes = parseLikesFromAriaLabel(likeLabel);

      // ── Comments ─────────────────────────────────────────────────────
      const commentsHeader = watchFlexy.querySelector(
        this.sel(
          watchFlexy,
          'comments_header',
          'ytd-comments-header-renderer #count, ytd-engagement-panel-title-header-renderer #title',
        ),
      );
      const commentsLabel = commentsHeader?.getAttribute('aria-label') || commentsHeader?.textContent || '';
      const comments = parseCommentsFromAriaLabel(commentsLabel);

      // ── Description ──────────────────────────────────────────────────
      const description =
        watchFlexy
          .querySelector(
            this.sel(
              watchFlexy,
              'description',
              'ytd-text-inline-expander #snippet-text, ytd-expandable-video-description-body-renderer ytd-text-inline-expander #snippet-text',
            ),
          )
          ?.textContent?.trim() || '';

      return {
        id: videoId,
        platform: 'youtube' as const,
        signal_type: 'played' as const,
        author_handle: channelHandle,
        author_display_name: channelName,
        content_text: title || description,
        permalink: `https://www.youtube.com/watch?v=${videoId}`,
        post_timestamp: postTimestamp,
        likes,
        comments,
        views,
        post_type: 'video' as const,
        video_id: videoId,
        channel_handle: channelHandle,
        captured_at: new Date().toISOString(),
        page_url: window.location.href,
        domain_id: '',
        is_ad: false,
      };
    } catch (err) {
      console.error('[▶YTWatch] extractPost — error:', err);
      return null;
    }
  }

  // Override: use yt-navigate-finish for SPA navigation instead of MutationObserver
  protected processAddedNode(): void {}

  private extractCurrent(): void {
    if (!window.location.pathname.startsWith('/watch')) return;

    const videoId = extractVideoIdFromUrl();
    if (!videoId || this.capturedIds.has(videoId)) return;

    // Small delay to let YouTube render the watch page DOM after navigation
    setTimeout(() => {
      const watchFlexySel = this.selectorConfig?.selectors['watch_flexy']?.[0] ?? 'ytd-watch-flexy';
      const watchFlexy = document.querySelector<HTMLElement>(watchFlexySel);
      if (!watchFlexy) return;

      const data = this.extractPost(watchFlexy);
      if (!data) return;
      if (this.capturedIds.has(data.id)) return;
      this.capturedIds.add(data.id);
      this.sendData(data);
    }, 600);
  }

  initialize(): void {
    if (!this.isSite()) return;
    console.log(`[${this.label}] Initializing`);

    window.addEventListener('yt-navigate-finish', () => this.extractCurrent());

    if (window.location.pathname.startsWith('/watch')) {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => this.extractCurrent());
      } else {
        this.extractCurrent();
      }
    }
  }
}
