import { FacebookPostData } from './types';
import { BaseSocialWavelet } from './BaseSocialWavelet';
import { SelectorConfig } from '@chrome-extension-boilerplate/shared/lib/types/contentScript';

function parseEngagementCount(button: Element | null): number {
  if (!button) return 0;
  const countSpan = button.querySelector('span[dir="auto"]');
  const value = parseInt(countSpan?.textContent || '0', 10);
  return Number.isFinite(value) ? value : 0;
}

function extractPostIdFromUrl(url: string): string | null {
  // New format: /posts/pfbid...
  const pfbidMatch = url.match(/\/posts\/(pfbid\w+)/);
  if (pfbidMatch) return pfbidMatch[1];
  // Old format: /posts/12345
  const postMatch = url.match(/\/posts\/(\d+)/);
  if (postMatch) return postMatch[1];
  const videoMatch = url.match(/[?&]v=(\d+)/);
  if (videoMatch) return videoMatch[1];
  const storyMatch = url.match(/story_fbid=(\d+)/);
  if (storyMatch) return storyMatch[1];
  return null;
}

export class FacebookFeedWavelet extends BaseSocialWavelet {
  protected readonly messageType = 'FACEBOOK_POST';
  protected readonly label = '📘[Facebook]';

  constructor(config?: SelectorConfig) {
    super(config);
  }

  isSite(): boolean {
    if (this.selectorConfig?.hostname_patterns?.length) {
      return this.selectorConfig.hostname_patterns.some(p => window.location.hostname.includes(p));
    }
    return window.location.hostname.includes('facebook.com');
  }

  extractPost(article: HTMLElement): FacebookPostData | null {
    try {
      // ── Ad detection ───────────────────────────────────────────────────
      const adLink = article.querySelector<HTMLAnchorElement>(
        this.sel(article, 'ad_marker', 'a[aria-label="Publicidad"]'),
      );
      const isAd = !!adLink;

      // ── Author ─────────────────────────────────────────────────────────
      const profileLink = article.querySelector<HTMLAnchorElement>(
        this.sel(article, 'profile_link', '[data-ad-rendering-role="profile_name"] a'),
      );
      const profileUrl = profileLink?.href ?? '';
      const authorHandle = profileUrl.split('/').filter(Boolean).pop()?.split('?')[0] ?? '';
      const authorName = profileLink?.querySelector('span')?.textContent?.trim() ?? '';

      if (!authorHandle) return null;

      // ── Timestamp / Permalink ──────────────────────────────────────────
      const timeLink = article.querySelector<HTMLAnchorElement>(this.sel(article, 'time_link', 'a[href*="/posts/"]'));
      const permalink = timeLink?.href ?? '';
      const postId = extractPostIdFromUrl(permalink);
      if (!postId) return null;

      // ── Content ────────────────────────────────────────────────────────
      const storyEl = article.querySelector<HTMLElement>(
        this.sel(article, 'story_message', '[data-ad-rendering-role="story_message"]'),
      );
      const contentText = storyEl?.textContent?.trim() ?? '';

      // ── Post type ──────────────────────────────────────────────────────
      const hasVideo = !!article.querySelector('video');
      const hasImages = article.querySelectorAll('[data-ad-rendering-role^="image"]').length > 0;
      const postType: 'video' | 'image' | 'text' = hasVideo ? 'video' : hasImages ? 'image' : 'text';

      // ── Engagement ─────────────────────────────────────────────────────
      const likeBtn = article.querySelector(
        this.sel(article, 'like_button', 'div[aria-label="Me gusta"], div[aria-label="Like"]'),
      );
      const commentBtn = article.querySelector(
        this.sel(article, 'comment_button', 'div[aria-label="Dejar un comentario"], div[aria-label="Comment"]'),
      );
      const shareBtn = article.querySelector(
        this.sel(
          article,
          'share_button',
          'div[aria-label^="Envía"], div[aria-label^="Enviar"], div[aria-label^="Compartir"], div[aria-label^="Share"]',
        ),
      );

      return {
        id: postId,
        platform: 'facebook' as const,
        signal_type: 'feed' as const,
        is_ad: isAd,
        author_handle: authorHandle,
        author_display_name: authorName,
        content_text: contentText.substring(0, 5000),
        permalink,
        post_type: postType,
        likes: parseEngagementCount(likeBtn),
        comments: parseEngagementCount(commentBtn),
        shares: parseEngagementCount(shareBtn),
        captured_at: new Date().toISOString(),
        page_url: window.location.href,
        domain_id: '',
      };
    } catch (err) {
      console.error('[📘Facebook] extractPost — error:', err);
      return null;
    }
  }

  protected processAddedNode(el: HTMLElement): void {
    const articleSel = this.sel(document.body, 'article', 'div[role="article"]');
    const articles: HTMLElement[] = el.matches?.(articleSel)
      ? [el]
      : Array.from(el.querySelectorAll<HTMLElement>(articleSel));

    if (articles.length > 0) {
      console.log(`[📘Facebook] Processing ${articles.length} articles...`);
    }

    for (const article of articles) {
      const data = this.extractPost(article);
      if (!data) continue;
      if (this.capturedIds.has(data.id)) continue;
      this.capturedIds.add(data.id);
      this.sendData(data);
    }
  }
}
