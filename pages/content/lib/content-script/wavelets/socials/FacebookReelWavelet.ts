import { FacebookReelData } from './types';
import { BaseSocialWavelet } from './BaseSocialWavelet';
import { SelectorConfig } from '@chrome-extension-boilerplate/shared/lib/types/contentScript';

function extractReelId(href: string): string | null {
  const match = href.match(/\/reel\/(\d+)/);
  return match?.[1] ?? null;
}

/**
 * Parses the author display name from a Facebook Reel aria-label.
 * Facebook localizes the prefix:
 *   "Reel de Monica Rosales"   (Spanish / French / Portuguese)
 *   "Reel from Monica Rosales"  (English)
 *   "Reel von Monica Rosales"   (German)
 *   "Reel di Monica Rosales"    (Italian)
 * Returns the name portion, or the full label if no known prefix matches.
 */
function parseAuthorFromAriaLabel(ariaLabel: string): string {
  const match = ariaLabel.match(/^reel\s+(?:from|de|von|di|da|van)\s+(.+)$/i);
  return match?.[1]?.trim() ?? ariaLabel.trim();
}

/**
 * Derives a pseudo-handle from a display name.
 * "Monica Rosales" → "monica.rosales"
 * "Isa Luna & Merlan" → "isa.luna.merlan"
 * Falls back to reel_<id> if the name is empty.
 */
function deriveHandle(displayName: string, reelId: string): string {
  const handle = displayName
    .toLowerCase()
    .replaceAll('&', ' ')
    .replace(/[^a-z0-9. ]/g, '')
    .trim()
    .replace(/\s+/g, '.')
    .replace(/\.+/g, '.')
    .replace(/^\.|\.$/g, '');
  return handle || `reel_${reelId}`;
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
      const authorDisplayName = parseAuthorFromAriaLabel(ariaLabel);
      const authorHandle = deriveHandle(authorDisplayName, reelId);

      // Thumbnail — uses sel() so the backend can remotely update the selector
      const thumbnailSel = this.sel(el, 'thumbnail', 'img[src*="fbcdn"]');
      const thumbnail = el.querySelector<HTMLImageElement>(thumbnailSel)?.getAttribute('src') ?? '';

      return {
        id: reelId,
        platform: 'facebook' as const,
        signal_type: 'reel' as const,
        author_handle: authorHandle,
        author_display_name: authorDisplayName || ariaLabel,
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
