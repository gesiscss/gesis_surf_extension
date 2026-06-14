import { YouTubeWatchData } from './types';
import { BaseSocialWavelet } from './BaseSocialWavelet';
import { SelectorConfig } from '@chrome-extension-boilerplate/shared/lib/types/contentScript';

// ── Helpers ─────────────────────────────────────────────────────────────

function parseLikesFromAriaLabel(label: string): number {
  // "I like this" (no count), "like this video along with 1,234 other people",
  // "1,234" shorthand, or "1.2K"
  const match = label.match(/([\d,.]+)\s*(?:[KMB]?(?:\s+other)?\s+people?|other\s+people?)/i);
  if (!match) return 0;
  const raw = match[1].replace(/,/g, '');
  const value = parseInt(raw, 10);
  return Number.isFinite(value) ? value : 0;
}

function parseCommentsFromAriaLabel(label: string): number {
  // Match "1,176 Comments", "305 comments", "1.2K Comments", "1M comments"
  const match = label.match(/([\d,.]+)\s*([KMB]?)\s+comments?/i);
  if (!match) return 0;
  const raw = match[1].replace(/,/g, '');
  const value = Number(raw);
  if (!Number.isFinite(value) || value > 9_999_999_999_999) return 0;

  const suffix = match[2].toUpperCase();
  const multiplier = suffix === 'K' ? 1_000 : suffix === 'M' ? 1_000_000 : suffix === 'B' ? 1_000_000_000 : 1;
  return Math.floor(value * multiplier);
}

function parseViewCount(text: string): number {
  // "1,162 views", "1.2M views", "1,234,567 views", "79k views", "80K views"
  const match = text.match(/([\d,.]+)\s*([KMB]?)\s+views?/i);
  if (!match) return 0;
  const raw = match[1].replace(/,/g, '');
  const value = Number(raw);
  if (!Number.isFinite(value) || value > 9_999_999_999_999) return 0;

  const suffix = match[2].toUpperCase();
  const multiplier = suffix === 'K' ? 1_000 : suffix === 'M' ? 1_000_000 : suffix === 'B' ? 1_000_000_000 : 1;
  return Math.floor(value * multiplier);
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

  extractPost(watchFlexy: HTMLElement, attempt = 0, maxAttempts = 5): YouTubeWatchData | null {
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
        this.sel(
          watchFlexy,
          'channel_link',
          'ytd-channel-name a[href^="/@"], ytd-video-owner-renderer a[href^="/@"], #upload-info a[href^="/@"]',
        ),
      );
      const channelHandle = channelLink?.href?.split('/@')[1]?.split('/')[0]?.split('?')[0] || '';
      const channelName =
        watchFlexy
          .querySelector(
            this.sel(
              watchFlexy,
              'channel_name',
              'ytd-channel-name #text, ytd-video-owner-renderer #text, #upload-info #channel-name #text',
            ),
          )
          ?.textContent?.trim() ||
        channelLink?.textContent?.trim() ||
        '';

      // ── Views ──────────────────────────────────────────────────────
      // Scan all candidate selectors and pick the one whose text actually
      // contains "views". This avoids sel() returning an empty matched element.
      const viewCandidates = this.selectorConfig?.selectors['view_count'] ?? [
        'ytd-watch-info-text #info',
        'ytd-watch-info-text yt-formatted-string',
        'ytd-video-view-count-renderer .view-count',
        'ytd-watch-info-text #view-count',
        '#info-container #view-count',
      ];
      let views = 0;
      for (const selector of viewCandidates) {
        try {
          const el = watchFlexy.querySelector(selector);
          const text = el?.textContent || '';
          const parsed = parseViewCount(text);
          if (parsed > 0) {
            views = parsed;
            break;
          }
        } catch {
          /* invalid selector - try next */
        }
      }

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
          'like-button-view-model button[aria-label*="like" i], ytd-menu-renderer like-button-view-model button, ytd-toggle-button-renderer[aria-label*="like" i] button',
        ),
      );
      const likeLabel = likeBtn?.getAttribute('aria-label') || '';
      const likes = parseLikesFromAriaLabel(likeLabel);

      // ── Comments ─────────────────────────────────────────────────────
      // The comments header lives outside ytd-watch-flexy, so scan the whole
      // document. Try the formatted-string count first, then fall back to
      // aria-label/text matching. Comments are lazy-loaded, so this may be 0.
      const commentsCandidates = this.selectorConfig?.selectors['comments_header'] ?? [
        'ytd-comments-header-renderer #count yt-formatted-string',
        'ytd-comments-header-renderer #count',
        'ytd-comments-header-renderer #title',
        'ytd-engagement-panel-title-header-renderer #title',
        'ytd-comments-entry-point-header-renderer #header #count',
      ];
      let comments = 0;
      for (const selector of commentsCandidates) {
        try {
          const el = document.querySelector(selector);
          const text = el?.getAttribute('aria-label') || el?.textContent || '';
          const parsed = parseCommentsFromAriaLabel(text);
          if (parsed > 0) {
            comments = parsed;
            break;
          }
        } catch {
          /* invalid selector - try next */
        }
      }

      // If the watch page metadata hasn't fully rendered yet, signal not-ready
      // so extractCurrent can retry. Views should always be present on a watch page.
      if (views === 0 && attempt < maxAttempts) return null;

      // Comments are lazy-loaded; if not found yet we still send the event.
      // A missing header is different from 0 comments.

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

  private extractCurrent(attempt = 0, maxAttempts = 5): void {
    if (!window.location.pathname.startsWith('/watch')) return;

    const videoId = extractVideoIdFromUrl();
    if (!videoId || this.capturedIds.has(videoId)) return;

    // Small delay to let YouTube render the watch page DOM after navigation
    setTimeout(() => {
      const watchFlexySel = this.selectorConfig?.selectors['watch_flexy']?.[0] ?? 'ytd-watch-flexy';
      const watchFlexy = document.querySelector<HTMLElement>(watchFlexySel);

      if (!watchFlexy && attempt < maxAttempts) {
        console.log(`[${this.label}] Watch flexy not ready for ${videoId}, retrying (${attempt + 1}/${maxAttempts})`);
        this.extractCurrent(attempt + 1, maxAttempts);
        return;
      }

      if (!watchFlexy) {
        console.warn(`[${this.label}] Watch flexy not found for ${videoId} after ${maxAttempts} attempts`);
        return;
      }

      const data = this.extractPost(watchFlexy, attempt, maxAttempts);
      if (!data) {
        if (attempt < maxAttempts) {
          console.log(`[${this.label}] Data not ready for ${videoId}, retrying (${attempt + 1}/${maxAttempts})`);
          this.extractCurrent(attempt + 1, maxAttempts);
        }
        return;
      }
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
