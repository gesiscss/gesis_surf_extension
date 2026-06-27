import { FacebookReelData } from './types';
import { BaseSocialWavelet } from './BaseSocialWavelet';
import { SelectorConfig } from '@chrome-extension-boilerplate/shared/lib/types/contentScript';

function extractReelId(href: string): string | null {
  const match = href.match(/\/reel\/(\d+)/);
  return match?.[1] ?? null;
}

export class FacebookReelWavelet extends BaseSocialWavelet {
  protected readonly messageType = 'FACEBOOK_REEL';
  protected readonly label = '📱[Facebook Reel]';

  constructor(config?: SelectorConfig) {
    super(config);
  }

  isSite(): boolean {
    if (this.selectorConfig?.hostname_patterns?.length) {
      return this.selectorConfig.hostname_patterns.some(p => window.location.hostname.includes(p));
    }
    return window.location.hostname.includes('facebook.com');
  }

  extractPost(el: HTMLElement): FacebookReelData | null {
    try {
      const link = el as HTMLAnchorElement;
      const href = link.href ?? '';

      const reelId = extractReelId(href);
      if (!reelId) return null;

      // Author from aria-label — localized: "Reel de [name]", "Reel from [name]", etc.
      const ariaLabel = link.getAttribute('aria-label') ?? '';

      // Thumbnail from the img inside the card
      const thumbnail = el.querySelector<HTMLImageElement>('img[src*="fbcdn"]')?.getAttribute('src') ?? '';

      return {
        id: reelId,
        platform: 'facebook' as const,
        signal_type: 'reel' as const,
        author_handle: '',
        author_display_name: ariaLabel,
        content_text: '',
        permalink: href.split('?')[0],
        thumbnail_url: thumbnail,
        is_public: true, // Reels carousel is always public
        likes: 0,
        comments: 0,
        captured_at: new Date().toISOString(),
        page_url: window.location.href,
        domain_id: '',
      };
    } catch {
      return null;
    }
  }

  protected processAddedNode(el: HTMLElement): void {
    const reelSel = this.sel(document.body, 'reel_card', 'a[href*="/reel/"][aria-label]');

    const cards: HTMLElement[] = el.matches?.(reelSel) ? [el] : Array.from(el.querySelectorAll<HTMLElement>(reelSel));

    for (const card of cards) {
      const data = this.extractPost(card);
      if (!data) continue;
      if (this.capturedIds.has(data.id)) continue;
      this.capturedIds.add(data.id);
      this.sendData(data);
    }
  }
}
