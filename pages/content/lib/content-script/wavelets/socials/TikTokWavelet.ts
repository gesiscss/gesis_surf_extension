import { TikTokPostData } from './types';
import { BaseSocialWavelet } from './BaseSocialWavelet';
import { SelectorConfig } from '@chrome-extension-boilerplate/shared/lib/types/contentScript';

function parseAbbreviatedMetric(text: string): number {
  const clean = text.replace(/,/g, '').trim();
  const match = clean.match(/^([\d.]+)([KMB]?)$/i);
  if (!match) return 0;
  const value = parseFloat(match[1]);
  const suffix = match[2].toUpperCase();
  if (suffix === 'K') return Math.round(value * 1_000);
  if (suffix === 'M') return Math.round(value * 1_000_000);
  if (suffix === 'B') return Math.round(value * 1_000_000_000);
  return Math.round(value);
}

function parseFavoritesFromAriaLabel(label: string): number {
  const match = label.match(/([\d.]+[KMB]?)\s+added to Favorites/i);
  return match ? parseAbbreviatedMetric(match[1]) : 0;
}

export class TikTokWavelet extends BaseSocialWavelet {
  protected readonly messageType: string = 'TIKTOK_POST';
  protected readonly label: string = '🎵[TikTok]';
  protected feedPosition = 0; // increments each time a new video is captured

  private static readonly EXCLUDED_PATHS = ['/messages', '/inbox', '/live', '/foryou/messages'];

  constructor(config?: SelectorConfig) {
    super(config);
  }

  isSite(): boolean {
    if (this.selectorConfig?.hostname_patterns?.length) {
      return (
        this.selectorConfig.hostname_patterns.some(p => window.location.hostname.includes(p)) &&
        !TikTokWavelet.EXCLUDED_PATHS.some(p => window.location.pathname.startsWith(p))
      );
    }
    if (!window.location.hostname.includes('tiktok.com')) return false;
    return !TikTokWavelet.EXCLUDED_PATHS.some(p => window.location.pathname.startsWith(p));
  }

  extractPost(container: HTMLElement): TikTokPostData | null {
    try {
      // Video ID from xgwrapper-0-{videoId}
      const playerWrapper = container.querySelector<HTMLElement>(
        this.sel(container, 'player_wrapper', '[id^="xgwrapper-"]'),
      );
      if (!playerWrapper) return null;
      const idParts = playerWrapper.id.split('-');
      const videoId = idParts[idParts.length - 1];
      if (!videoId) return null;

      // Author handle from avatar link href="/@handle"
      const avatarLink = container.querySelector<HTMLAnchorElement>(
        this.sel(container, 'author_avatar', '[data-e2e="video-author-avatar"]'),
      );
      if (!avatarLink) return null;
      const authorHandle = avatarLink.getAttribute('href')?.replace('/@', '') ?? '';
      if (!authorHandle) return null;

      // Display name from creator info text
      const displayName =
        container
          .querySelector<HTMLElement>(this.sel(container, 'display_name', '[data-e2e="video-author-avatar"] ~ * p'))
          ?.textContent?.trim() ?? authorHandle;

      // Verified = teal checkmark svg present near creator info
      const isVerified = !!container.querySelector(
        this.sel(container, 'verified_check', '[data-e2e="video-author-avatar"] ~ * path[fill="#20D5EC"]'),
      );

      // Caption: join all desc-span elements
      const caption = Array.from(
        container.querySelectorAll(this.sel(container, 'caption_span', '[data-e2e^="desc-span"]')),
      )
        .map(el => el.textContent ?? '')
        .join('')
        .trim()
        .substring(0, 5000);

      // Metrics via stable data-e2e attributes
      const likesText =
        container.querySelector(this.sel(container, 'like_count', '[data-e2e="like-count"]'))?.textContent?.trim() ??
        '0';
      const commentsText =
        container
          .querySelector(this.sel(container, 'comment_count', '[data-e2e="comment-count"]'))
          ?.textContent?.trim() ?? '0';
      const sharesText =
        container.querySelector(this.sel(container, 'share_count', '[data-e2e="share-count"]'))?.textContent?.trim() ??
        '0';

      // Favorites: data-e2e is "undefined-count" on TikTok's side, parse from aria-label instead
      const favLabel =
        container
          .querySelector(this.sel(container, 'favorites_button', 'button[aria-label*="Favorites"]'))
          ?.getAttribute('aria-label') ?? '';

      // Music
      const musicLink = container.querySelector<HTMLAnchorElement>(
        this.sel(container, 'music_link', '[data-e2e="video-music"]'),
      );
      const musicHref = musicLink?.getAttribute('href') ?? '';
      const musicIdMatch = musicHref.match(/-(\d+)$/);
      const musicId = musicIdMatch ? musicIdMatch[1] : '';
      const musicName =
        musicLink
          ?.getAttribute('aria-label')
          ?.replace(/^Watch more videos with music\s+/i, '')
          .trim() ?? '';

      return {
        id: videoId,
        platform: 'tiktok' as const,
        feed_position: 0, // overwritten by processAddedNode / play handler
        author_handle: `@${authorHandle}`,
        author_display_name: displayName,
        is_verified: isVerified,
        content_text: caption,
        permalink: `https://www.tiktok.com/@${authorHandle}/video/${videoId}`,
        music_id: musicId,
        music_name: musicName,
        likes: parseAbbreviatedMetric(likesText),
        comments: parseAbbreviatedMetric(commentsText),
        shares: parseAbbreviatedMetric(sharesText),
        favorites: parseFavoritesFromAriaLabel(favLabel),
        captured_at: new Date().toISOString(),
        page_url: window.location.href,
        domain_id: '',
        signal_type: 'feed',
      };
    } catch {
      return null;
    }
  }

  protected processAddedNode(el: HTMLElement): void {
    if (TikTokWavelet.EXCLUDED_PATHS.some(p => window.location.pathname.startsWith(p))) return;

    // Feed video sections are identified by data-e2e="feed-video" on the inner <section>
    const feedSectionSel = this.sel(document.body, 'feed_section', '[data-e2e="feed-video"]');
    const contentFlexSel = this.selectorConfig?.selectors['content_flex']?.[0] ?? 'div[class*="DivContentFlexLayout"]';
    const feedSections: HTMLElement[] = el.matches?.(feedSectionSel)
      ? [el]
      : Array.from(el.querySelectorAll<HTMLElement>(feedSectionSel));

    for (const section of feedSections) {
      // Walk up to the outer flex container that holds both media and action bar
      const container = section.closest<HTMLElement>(contentFlexSel) ?? (section.parentElement as HTMLElement);
      if (!container) continue;

      const data = this.extractPost(container);
      if (!data) continue;
      if (this.capturedIds.has(data.id)) continue;
      this.capturedIds.add(data.id);
      data.feed_position = ++this.feedPosition;
      this.sendData(data);
    }
  }
}
