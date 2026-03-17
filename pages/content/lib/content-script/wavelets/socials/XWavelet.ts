import { XPostData } from './types';
import { BaseSocialWavelet, SocialPostData } from './BaseSocialWavelet';
import { SelectorConfig } from '@chrome-extension-boilerplate/shared/lib/types/contentScript';

function parseMetric(label: string, keyword: string): number {
    const match = label.match(new RegExp('([\\d,]+)\\s+' + keyword, 'i'));
    return match ? parseInt(match[1].replace(/,/g, ''), 10) : 0;
}

export class XWavelet extends BaseSocialWavelet {
    protected readonly messageType = 'X_POST';
    protected readonly label = '🐦[X]';

    private static readonly EXCLUDED_PATHS = ['/messages', '/i/settings', '/i/sessions', '/i/display', '/i/accessibility'];

    constructor(config?: SelectorConfig) { super(config); }

    isSite(): boolean {
        if (this.selectorConfig?.hostname_patterns?.length) {
            return this.selectorConfig.hostname_patterns.some(p => window.location.hostname.includes(p)) &&
                !XWavelet.EXCLUDED_PATHS.some(p => window.location.pathname.startsWith(p));
        }
        const h = window.location.hostname;
        if (!h.includes('x.com') && !h.includes('twitter.com')) return false;
        return !XWavelet.EXCLUDED_PATHS.some(p => window.location.pathname.startsWith(p));
    }

    extractPost(article: HTMLElement): (XPostData & SocialPostData) | null {
        try {
            const statusLink = article.querySelector<HTMLAnchorElement>(this.sel(article, 'status_link', 'a[href*="/status/"]'));
            if (!statusLink) return null;

            const parts = statusLink.pathname.split('/').filter(Boolean);
            // parts: ["handle", "status", "tweetId"]
            const authorHandle = parts[0];
            const tweetId = parts[2];
            if (!authorHandle || !tweetId) return null;

            const tweetText = article.querySelector(this.sel(article, 'tweet_text', '[data-testid="tweetText"]'))?.textContent?.trim() ?? '';
            if (!tweetText) return null;

            const displayName = article.querySelector(this.sel(article, 'display_name', '[data-testid="User-Name"] span'))?.textContent?.trim() ?? authorHandle;
            const tweetTimestamp = article.querySelector(this.sel(article, 'timestamp', 'time'))?.getAttribute('datetime') ?? new Date().toISOString();
            const ariaLabel = article.querySelector(this.sel(article, 'metrics_group', '[role="group"]'))?.getAttribute('aria-label') ?? '';

            return {
                id: tweetId,
                tweet_id: tweetId,
                author_handle: `@${authorHandle}`,
                author_display_name: displayName,
                tweet_text: tweetText.substring(0, 5000),
                tweet_url: `https://x.com/${authorHandle}/status/${tweetId}`,
                tweet_timestamp: tweetTimestamp,
                captured_at: new Date().toISOString(),
                replies:   parseMetric(ariaLabel, 'repl'),
                reposts:   parseMetric(ariaLabel, 'repost'),
                likes:     parseMetric(ariaLabel, 'like'),
                bookmarks: parseMetric(ariaLabel, 'bookmark'),
                views:     parseMetric(ariaLabel, 'view'),
                page_url:  window.location.href,
                domain_session_id: '',
            };
        } catch {
            return null;
        }
    }

    protected processAddedNode(el: HTMLElement): void {
        if (XWavelet.EXCLUDED_PATHS.some(p => window.location.pathname.startsWith(p))) return;

        const articleSel = this.sel(document.body, 'tweet_article', 'article[data-testid="tweet"]');
        const articles: HTMLElement[] = el.matches?.(articleSel)
            ? [el]
            : Array.from(el.querySelectorAll<HTMLElement>(articleSel));

        for (const article of articles) {
            const data = this.extractPost(article);
            if (!data) continue;
            if (this.capturedIds.has(data.tweet_id)) continue;
            this.capturedIds.add(data.tweet_id);
            this.sendData(data);
        }
    }
}