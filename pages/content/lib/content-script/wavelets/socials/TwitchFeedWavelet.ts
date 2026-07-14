import { TwitchFeedData } from './types';
import { BaseSocialWavelet } from './BaseSocialWavelet';
import { SelectorConfig } from '@chrome-extension-boilerplate/shared/lib/types/contentScript';

function parseViewerCount(text: string): number {
  const match = text.match(/([\d,.]+)\s*K?\s*viewers?/i);
  if (!match) return 0;
  const raw = match[1].replace(/,/g, '');
  const multiplier = text.toLowerCase().includes('k') ? 1000 : 1;
  const value = parseFloat(raw) * multiplier;
  return Number.isFinite(value) ? Math.round(value) : 0;
}

export class TwitchFeedWavelet extends BaseSocialWavelet {
  protected readonly messageType = 'TWITCH_FEED';
  protected readonly label = '🎮[Twitch]';

  constructor(config?: SelectorConfig) {
    super(config);
  }

  isSite(): boolean {
    if (this.selectorConfig?.hostname_patterns?.length) {
      return this.selectorConfig.hostname_patterns.some(p => window.location.hostname.includes(p));
    }
    return window.location.hostname.includes('twitch.tv');
  }

  extractPost(card: HTMLElement): TwitchFeedData | null {
    try {
      // ── Stream title ─────────────────────────────────────────────────
      const titleEl = card.querySelector<HTMLElement>(
        this.sel(card, 'stream_title', '[data-test-selector="StreamTitle"] h4'),
      );
      const title = titleEl?.textContent?.trim() ?? '';

      // ── Channel link ─────────────────────────────────────────────────
      const channelLink = card.querySelector<HTMLAnchorElement>(
        this.sel(card, 'channel_link', '[data-test-selector="TitleAndChannel"]'),
      );
      const channelUrl = channelLink?.getAttribute('href') ?? '';
      const channelHandle = channelUrl.split('/').filter(Boolean).pop() ?? '';

      // ── Display name ───────────────────────────────────────────────
      const displayNameEl = card.querySelector<HTMLElement>(
        this.sel(card, 'display_name', '[data-a-target="preview-card-channel-link"] p[title]'),
      );
      const displayName = displayNameEl?.getAttribute('title') ?? channelHandle;

      // ── Game / Category ──────────────────────────────────────────────
      const gameLink = card.querySelector<HTMLAnchorElement>(
        this.sel(card, 'game_link', '[data-test-selector="GameLink"]'),
      );
      const gameName = gameLink?.textContent?.trim() ?? '';

      // ── Viewer count ─────────────────────────────────────────────────
      const viewerStat = card.querySelector<HTMLElement>(this.sel(card, 'viewer_count', '.tw-media-card-stat'));
      const viewerCount = parseViewerCount(viewerStat?.textContent ?? '');

      // ── Tags ─────────────────────────────────────────────────────────
      const tagEls = card.querySelectorAll<HTMLElement>(this.sel(card, 'tags', '.tw-tag'));
      const tags = Array.from(tagEls)
        .map(el => el.textContent?.trim() ?? '')
        .filter(Boolean);

      // ── Verified ─────────────────────────────────────────────────────
      // aria-label on the channel link contains "(Verified)" for verified streamers.
      // svg[title="Verified"] does NOT work — <title> is a child element, not an attribute.
      const isVerified = !!card.querySelector(
        this.sel(card, 'verified', 'a[data-test-selector="TitleAndChannel"][aria-label*="(Verified)"]'),
      );

      // ── LIVE status ──────────────────────────────────────────────────
      const isLive = !!card.querySelector(this.sel(card, 'live_badge', '.tw-channel-status-text-indicator'));

      // ── Post ID ────────────────────────────────────────────────────
      const postId = channelHandle || title || `${Date.now()}`;

      if (!channelHandle) return null;

      return {
        id: postId,
        platform: 'twitch' as const,
        signal_type: 'feed' as const,
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
        is_verified: isVerified,
        captured_at: new Date().toISOString(),
        page_url: window.location.href,
        domain_id: '',
        is_ad: false,
      };
    } catch (err) {
      console.error('[🎮Twitch] extractPost — error:', err);
      return null;
    }
  }

  protected processAddedNode(el: HTMLElement): void {
    const cardSel = this.sel(document.body, 'stream_card', '[data-test-selector="shelf-card-selector"]');
    const cards: HTMLElement[] = el.matches?.(cardSel) ? [el] : Array.from(el.querySelectorAll<HTMLElement>(cardSel));

    for (const card of cards) {
      const data = this.extractPost(card);
      if (!data) continue;
      if (this.capturedIds.has(data.id)) continue;
      this.capturedIds.add(data.id);
      this.sendData(data);
    }
  }
}
