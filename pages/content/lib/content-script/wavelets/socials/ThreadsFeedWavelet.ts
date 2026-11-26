import { ThreadsPostData } from './types';
import { BaseSocialWavelet } from './BaseSocialWavelet';
import { SelectorConfig } from '@chrome-extension-boilerplate/shared/lib/types/contentScript';

export class ThreadsFeedWavelet extends BaseSocialWavelet {
  protected readonly messageType = 'THREADS_POST';
  protected readonly label = '🧵[Threads]';

  constructor(config?: SelectorConfig) {
    super(config);
  }

  isSite(): boolean {
    if (this.selectorConfig?.hostname_patterns?.length) {
      return this.selectorConfig.hostname_patterns.some(p => window.location.hostname.includes(p));
    }
    return window.location.hostname.includes('threads.com') || window.location.hostname.includes('threads.net');
  }

  extractPost(postEl: HTMLElement): ThreadsPostData | null {
    try {
      // ── Permalink & Post ID ─────────────────────────────────────────
      const postLinkSel = this.sel(postEl, 'post_link', 'a[href*="/post/"]');
      const permalinkAnchor = postEl.querySelector<HTMLAnchorElement>(postLinkSel);
      let permalink = permalinkAnchor?.href ?? '';
      if (!permalink) {
        // Fallback: try to find any anchor with /@username/post/ pattern inside the element
        const authorLinkSel = this.sel(postEl, 'author_link', 'a[href^="/@"]');
        const anyAnchor = postEl.querySelector<HTMLAnchorElement>(authorLinkSel);
        if (anyAnchor?.href.includes('/post/')) {
          permalink = anyAnchor.href;
        }
      }
      if (!permalink) return null;

      const postIdMatch = permalink.match(/\/post\/([^/?#]+)/);
      const postId = postIdMatch ? postIdMatch[1] : permalink;
      if (!postId) return null;

      // ── Author handle ────────────────────────────────────────────────
      const userAnchor = postEl.querySelector<HTMLAnchorElement>(this.sel(postEl, 'author_link', 'a[href^="/@"]'));
      const authorHandle = userAnchor?.getAttribute('href')?.replace('/@', '') ?? '';

      // ── Author display name ────────────────────────────────────────
      let authorDisplayName = '';
      if (userAnchor) {
        // First non-empty text node or span inside the user anchor
        const nameSpan = userAnchor.querySelector('span');
        authorDisplayName = nameSpan?.textContent?.trim() ?? userAnchor.textContent?.trim() ?? authorHandle;
      }

      // ── Verified badge ─────────────────────────────────────────────
      const isVerified =
        postEl.querySelector(
          this.sel(postEl, 'verified_badge', 'svg[aria-label="Verified"], svg[aria-label="Verificado"]'),
        ) !== null;

      // ── Content text ───────────────────────────────────────────────
      // Threads content is typically in a div with multiple spans/paragraphs.
      // We gather all meaningful text nodes excluding the UFI section.
      const ufi = postEl.querySelector(
        this.sel(
          postEl,
          'ufi_group',
          '[role="group"], div[class*="ufi"], div[aria-label*="like"], div[aria-label*="repost"]',
        ),
      );
      let contentText = '';
      const textEls = postEl.querySelectorAll('span, p');
      for (const el of Array.from(textEls)) {
        if (ufi && ufi.contains(el)) continue; // skip UFI text
        const txt = el.textContent?.trim();
        if (txt && txt.length > contentText.length) {
          contentText = txt;
        }
      }
      // If no long span found, fall back to all direct text minus UFI
      if (!contentText) {
        contentText = Array.from(postEl.childNodes)
          .filter(n => n.nodeType === Node.TEXT_NODE)
          .map(n => n.textContent)
          .join(' ')
          .trim();
      }

      // ── Timestamp ────────────────────────────────────────────────────
      const timeEl = postEl.querySelector<HTMLTimeElement>(this.sel(postEl, 'timestamp', 'time[datetime]'));
      const postTimestamp = timeEl?.getAttribute('datetime') ?? undefined;

      // ── Engagement ─────────────────────────────────────────────────
      // Threads UFI buttons contain an SVG with aria-label="Like"/"Comment"/"Repost".
      // The numeric count lives in a child/sibling <span> inside the same button.
      let likes = 0;
      let comments = 0;
      let reposts = 0;
      let replies = 0;

      const svgs = postEl.querySelectorAll('svg[aria-label]');
      for (const svg of Array.from(svgs)) {
        const ariaLabel = (svg.getAttribute('aria-label') ?? '').toLowerCase();
        const button = svg.closest('div[role="button"], button');
        if (!button) continue;

        // The count is the first numeric text (supports "123", "16.9K", "1.2M", "2.3B").
        const raw = button.textContent ?? '';
        const countMatch = raw.match(/([\d.]+)\s*([KMBkmb])?(?!\d)/);
        let count = 0;
        if (countMatch) {
          const value = parseFloat(countMatch[1]);
          const suffix = (countMatch[2] ?? '').toUpperCase();
          const mult = suffix === 'K' ? 1_000 : suffix === 'M' ? 1_000_000 : suffix === 'B' ? 1_000_000_000 : 1;
          count = Math.round(value * mult);
        }

        if (ariaLabel.includes('like')) {
          likes = count;
        } else if (ariaLabel.includes('comment')) {
          comments = count;
        } else if (ariaLabel.includes('repost')) {
          reposts = count;
        } else if (ariaLabel.includes('reply')) {
          replies = count;
        }
      }

      // ── Ad detection ─────────────────────────────────────────────────
      const isAd = postEl.textContent?.toLowerCase().includes('sponsored') ?? false;

      return {
        id: postId,
        platform: 'threads' as const,
        signal_type: 'feed' as const,
        author_handle: authorHandle,
        author_display_name: authorDisplayName || authorHandle,
        is_verified: isVerified,
        content_text: contentText,
        permalink,
        likes,
        comments,
        reposts,
        replies,
        post_timestamp: postTimestamp,
        captured_at: new Date().toISOString(),
        page_url: window.location.href,
        domain_id: '',
        is_ad: isAd,
      };
    } catch (err) {
      console.error('[🧵Threads] extractPost — error:', err);
      return null;
    }
  }

  protected processAddedNode(el: HTMLElement): void {
    const postSel = this.sel(document.body, 'threads_post', '[data-pressable-container="true"]');
    const posts: HTMLElement[] = el.matches?.(postSel) ? [el] : Array.from(el.querySelectorAll<HTMLElement>(postSel));

    for (const post of posts) {
      // Extra guard: only process if it looks like a feed post (has time + user link)
      if (
        !post.querySelector(this.sel(post, 'timestamp', 'time[datetime]')) ||
        !post.querySelector(this.sel(post, 'author_link', 'a[href^="/@"]'))
      ) {
        continue;
      }
      const data = this.extractPost(post);
      if (!data) continue;
      if (this.capturedIds.has(data.id)) continue;
      this.capturedIds.add(data.id);
      this.sendData(data);
    }
  }
}
