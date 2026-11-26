import { RedditPostData } from './types';
import { BaseSocialWavelet } from './BaseSocialWavelet';
import { SelectorConfig } from '@chrome-extension-boilerplate/shared/lib/types/contentScript';

export class RedditFeedWavelet extends BaseSocialWavelet {
  protected readonly messageType = 'REDDIT_POST';
  protected readonly label = '🔺[Reddit]';

  constructor(config?: SelectorConfig) {
    super(config);
  }

  isSite(): boolean {
    if (this.selectorConfig?.hostname_patterns?.length) {
      return this.selectorConfig.hostname_patterns.some(p => window.location.hostname.includes(p));
    }
    return window.location.hostname.includes('reddit.com');
  }

  extractPost(shredditPost: HTMLElement): RedditPostData | null {
    try {
      // ── Post ID ──────────────────────────────────────────────────────
      const postId =
        shredditPost.getAttribute('id') ||
        shredditPost.getAttribute('data-post-id') ||
        shredditPost.getAttribute('post-id');
      if (!postId) return null;

      // ── Author ────────────────────────────────────────────────────────
      const authorHandle = shredditPost.getAttribute('author') ?? '';

      // ── Title ────────────────────────────────────────────────────────
      const title = shredditPost.getAttribute('post-title') ?? '';

      // ── Permalink ────────────────────────────────────────────────────
      const permalink = shredditPost.getAttribute('permalink') ?? '';

      // ── Subreddit ────────────────────────────────────────────────────
      const subreddit = shredditPost.getAttribute('subreddit-name') ?? '';

      // ── Post type ────────────────────────────────────────────────────
      const postType =
        (shredditPost.getAttribute('post-type') as 'image' | 'video' | 'text' | 'external_link') ?? 'text';

      // ── Engagement ───────────────────────────────────────────────────
      const score = parseInt(shredditPost.getAttribute('score') ?? '0', 10);
      const commentCount = parseInt(shredditPost.getAttribute('comment-count') ?? '0', 10);
      const awardCount = parseInt(shredditPost.getAttribute('award-count') ?? '0', 10);

      // ── Timestamp ────────────────────────────────────────────────────
      const createdTimestamp = shredditPost.getAttribute('created-timestamp') ?? undefined;

      // ── Ad detection ─────────────────────────────────────────────────
      const isAd = shredditPost.hasAttribute('is-sponsored') || shredditPost.hasAttribute('promoted');

      return {
        id: postId,
        platform: 'reddit' as const,
        signal_type: 'feed' as const,
        author_handle: authorHandle,
        // Reddit usernames are the display name, so author_handle and author_display_name are the same
        author_display_name: authorHandle,
        content_text: title,
        permalink: permalink.startsWith('http') ? permalink : `https://www.reddit.com${permalink}`,
        post_type: postType,
        likes: score,
        comments: commentCount,
        awards: awardCount,
        post_timestamp: createdTimestamp,
        captured_at: new Date().toISOString(),
        page_url: window.location.href,
        domain_id: '',
        subreddit,
        is_ad: isAd,
      };
    } catch (err) {
      console.error('[🔺Reddit] extractPost — error:', err);
      return null;
    }
  }

  protected processAddedNode(el: HTMLElement): void {
    const postSel = this.sel(document.body, 'shreddit_post', 'shreddit-post');
    const posts: HTMLElement[] = el.matches?.(postSel) ? [el] : Array.from(el.querySelectorAll<HTMLElement>(postSel));

    for (const post of posts) {
      const data = this.extractPost(post);
      if (!data) continue;
      if (this.capturedIds.has(data.id)) continue;
      this.capturedIds.add(data.id);
      this.sendData(data);
    }
  }
}
