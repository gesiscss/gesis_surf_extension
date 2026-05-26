import { YouTubePostData } from './types';
import { BaseSocialWavelet } from './BaseSocialWavelet';
import { SelectorConfig } from '@chrome-extension-boilerplate/shared/lib/types/contentScript';

// ── Helper: parse view count ─────────────────────────────────────────────
function parseViewCount(text: string): number {
  const match = text.match(/([\d,.]+)\s+views?/i);
  if (!match) return 0;
  const raw = match[1].replace(/,/g, '').replace(/\./g, '');
  const value = Number(raw);
  return Number.isFinite(value) ? value : 0;
}

// ── Helper: parse relative YouTube timestamp → ISO ───────────────────────
function parseYouTubeRelativeTime(text: string): string | undefined {
  const match = text.match(/\b(\d+)\s*(second|minute|hour|day|week|month|year)s?\s+ago\b/i);
  if (!match) return undefined;

  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const now = new Date();

  switch (unit) {
    case 'second':
      now.setSeconds(now.getSeconds() - value);
      break;
    case 'minute':
      now.setMinutes(now.getMinutes() - value);
      break;
    case 'hour':
      now.setHours(now.getHours() - value);
      break;
    case 'day':
      now.setDate(now.getDate() - value);
      break;
    case 'week':
      now.setDate(now.getDate() - value * 7);
      break;
    case 'month':
      now.setMonth(now.getMonth() - value);
      break;
    case 'year':
      now.setFullYear(now.getFullYear() - value);
      break;
    default:
      return undefined;
  }

  return now.toISOString();
}

// ── Helper: extract video ID from href ───────────────────────────────────
function extractVideoId(href: string): string | null {
  const match = href.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

// ── Wavelet class ──────────────────────────────────────────────────────
export class YouTubeFeedWavelet extends BaseSocialWavelet {
  protected readonly messageType = 'YOUTUBE_POST';
  protected readonly label = '▶[YouTube]';

  constructor(config?: SelectorConfig) {
    super(config);
  }

  isSite(): boolean {
    if (this.selectorConfig?.hostname_patterns?.length) {
      return this.selectorConfig.hostname_patterns.some(p => window.location.hostname.includes(p));
    }
    return window.location.hostname.includes('youtube.com');
  }

  extractPost(item: HTMLElement): YouTubePostData | null {
    try {
      // ── Video link ─────────────────────────────────────────────────
      const videoLink = item.querySelector<HTMLAnchorElement>(this.sel(item, 'video_link', 'a[href*="/watch?v="]'));
      if (!videoLink) return null;

      const videoId = extractVideoId(videoLink.href);
      if (!videoId) return null;

      // ── Title ──────────────────────────────────────────────────────
      const title =
        videoLink
          .getAttribute('aria-label')
          ?.replace(/\s+\d+:\d+.*$/, '')
          ?.trim() ||
        item
          .querySelector(this.sel(item, 'title', 'h3 a span, .ytLockupMetadataViewModelTitle span'))
          ?.textContent?.trim() ||
        '';

      // ── Channel ────────────────────────────────────────────────────
      const channelLink = item.querySelector<HTMLAnchorElement>(this.sel(item, 'channel_link', 'a[href^="/@"]'));
      const channelHandle = channelLink?.href?.split('/@')[1]?.split('/')[0]?.split('?')[0] || '';
      if (!channelHandle) return null; // skip non-channel items (mixes, playlists, etc.)
      const channelName = channelLink?.textContent?.trim() || '';

      // ── Metadata (views + upload time) ─────────────────────────────
      const metadataText =
        item.querySelector(this.sel(item, 'metadata', 'yt-content-metadata-view-model'))?.textContent || '';

      // ── Ad detection ───────────────────────────────────────────────────
      const isAd = !!item.querySelector(
        this.sel(item, 'ad_badge', 'yt-ad-slot-renderer, [aria-label*="sponsored" i], [aria-label*="ad" i]'),
      );

      return {
        id: videoId,
        platform: 'youtube' as const,
        signal_type: 'feed' as const,
        author_handle: channelHandle,
        author_display_name: channelName,
        content_text: title.substring(0, 5000),
        permalink: `https://www.youtube.com/watch?v=${videoId}`,
        post_timestamp: parseYouTubeRelativeTime(metadataText),
        likes: 0, // Not shown on feed cards
        comments: 0, // Not shown on feed cards
        views: parseViewCount(metadataText),
        post_type: 'video' as const,
        video_id: videoId,
        channel_handle: channelHandle,
        captured_at: new Date().toISOString(),
        page_url: window.location.href,
        domain_id: '',
        is_ad: isAd,
      };
    } catch (err) {
      console.error('[▶YouTube] extractPost — error:', err);
      return null;
    }
  }

  protected processAddedNode(el: HTMLElement): void {
    const itemSel = this.sel(document.body, 'feed_item', 'ytd-rich-item-renderer, ytd-video-renderer');
    const items: HTMLElement[] = el.matches?.(itemSel) ? [el] : Array.from(el.querySelectorAll<HTMLElement>(itemSel));

    for (const item of items) {
      const data = this.extractPost(item);
      if (!data) continue;
      if (this.capturedIds.has(data.id)) continue;
      this.capturedIds.add(data.id);
      this.sendData(data);
    }
  }
}
