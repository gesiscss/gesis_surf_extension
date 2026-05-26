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
      const permalinkAnchor = postEl.querySelector<HTMLAnchorElement>('a[href*="/post/"]');
      let permalink = permalinkAnchor?.href ?? '';
      if (!permalink) {
        // Fallback: try to find any anchor with /@username/post/ pattern inside the element
        const anyAnchor = postEl.querySelector<HTMLAnchorElement>('a[href^="/@"]');
        if (anyAnchor?.href.includes('/post/')) {
          permalink = anyAnchor.href;
        }
      }
      if (!permalink) return null;

      const postIdMatch = permalink.match(/\/post\/([^/?#]+)/);
      const postId = postIdMatch ? postIdMatch[1] : permalink;
      if (!postId) return null;

      // ── Author handle ────────────────────────────────────────────────
      const userAnchor = postEl.querySelector<HTMLAnchorElement>('a[href^="/@"]');
      const authorHandle = userAnchor?.getAttribute('href')?.replace('/@', '') ?? '';

      // ── Author display name ────────────────────────────────────────
      let authorDisplayName = '';
      if (userAnchor) {
        // First non-empty text node or span inside the user anchor
        const nameSpan = userAnchor.querySelector('span');
        authorDisplayName = nameSpan?.textContent?.trim() ?? userAnchor.textContent?.trim() ?? authorHandle;
      }

      // ── Verified badge ─────────────────────────────────────────────
      const isVerified = postEl.querySelector('svg[aria-label="Verified"], svg[aria-label="Verificado"]') !== null;

      // ── Content text ───────────────────────────────────────────────
      // Threads content is typically in a div with multiple spans/paragraphs.
      // We gather all meaningful text nodes excluding the UFI section.
      const ufi = postEl.querySelector(
        '[role="group"], div[class*="ufi"], div[aria-label*="like"], div[aria-label*="repost"]',
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
      const timeEl = postEl.querySelector<HTMLTimeElement>('time[datetime]');
      const postTimestamp = timeEl?.getAttribute('datetime') ?? undefined;

      // ── Engagement ─────────────────────────────────────────────────
      // Threads UFI buttons have aria-labels like "1 like", "2 comments", "3 reposts"
      let likes = 0;
      let comments = 0;
      let reposts = 0;
      let replies = 0;

      const buttons = postEl.querySelectorAll('div[role="button"], button');
      for (const btn of Array.from(buttons)) {
        const ariaLabel = btn.getAttribute('aria-label') ?? '';
        const likeMatch = ariaLabel.match(/(\d+)\s+like/i);
        const commentMatch = ariaLabel.match(/(\d+)\s+comment/i);
        const repostMatch = ariaLabel.match(/(\d+)\s+repost/i);
        const replyMatch = ariaLabel.match(/(\d+)\s+repl/i);
        if (likeMatch) likes = parseInt(likeMatch[1], 10);
        if (commentMatch) comments = parseInt(commentMatch[1], 10);
        if (repostMatch) reposts = parseInt(repostMatch[1], 10);
        if (replyMatch) replies = parseInt(replyMatch[1], 10);
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
      if (!post.querySelector('time[datetime]') || !post.querySelector('a[href^="/@"]')) {
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
