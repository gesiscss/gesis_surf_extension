import { XPostData } from './types';
import { BaseSocialWavelet, SocialPostData } from './BaseSocialWavelet';

function parseMetric(label: string, keyword: string): number {
    const match = label.match(new RegExp('([\\d,]+)\\s+' + keyword, 'i'));
    return match ? parseInt(match[1].replace(/,/g, ''), 10) : 0;
}

export class XWavelet extends BaseSocialWavelet {
    protected readonly messageType = 'X_POST';
    protected readonly label = '🐦[X]';

    private static readonly EXCLUDED_PATHS = ['/messages', '/i/settings', '/i/sessions', '/i/display', '/i/accessibility'];

    isSite(): boolean {
        const h = window.location.hostname;
        if (!h.includes('x.com') && !h.includes('twitter.com')) return false;
        return !XWavelet.EXCLUDED_PATHS.some(p => window.location.pathname.startsWith(p));
    }

    extractPost(article: HTMLElement): (XPostData & SocialPostData) | null {
        try {
            const statusLink = article.querySelector<HTMLAnchorElement>('a[href*="/status/"]');
            if (!statusLink) return null;

            const parts = statusLink.pathname.split('/').filter(Boolean);
            // parts: ["handle", "status", "tweetId"]
            const authorHandle = parts[0];
            const tweetId = parts[2];
            if (!authorHandle || !tweetId) return null;

            const tweetText = article.querySelector('[data-testid="tweetText"]')?.textContent?.trim() ?? '';
            if (!tweetText) return null;

            const displayName = article.querySelector('[data-testid="User-Name"] span')?.textContent?.trim() ?? authorHandle;
            const tweetTimestamp = article.querySelector('time')?.getAttribute('datetime') ?? new Date().toISOString();
            const ariaLabel = article.querySelector('[role="group"]')?.getAttribute('aria-label') ?? '';

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

        const articles: HTMLElement[] = el.getAttribute('data-testid') === 'tweet'
            ? [el]
            : Array.from(el.querySelectorAll<HTMLElement>('article[data-testid="tweet"]'));

        for (const article of articles) {
            const data = this.extractPost(article);
            if (!data) continue;
            if (this.capturedIds.has(data.tweet_id)) continue;
            this.capturedIds.add(data.tweet_id);
            this.sendData(data);
        }
    }
}