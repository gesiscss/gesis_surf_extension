import { InstagramPostData } from './types';
import { BaseSocialWavelet, SocialPostData } from './BaseSocialWavelet';
import { SelectorConfig } from '@chrome-extension-boilerplate/shared/lib/types/contentScript';

/**
 * Parses an engagement count string (e.g. "90", "1.5K", "519.8K") to an integer.
 * Returns 0 for missing or unrecognised text.
 */
function parseEngagement(text: string): number {
    const t = text.trim().replace(/,/g, '');
    if (!t) return 0;
    const m = t.match(/^([\d.]+)([KMBkmb]?)$/);
    if (!m) return 0;
    const n = parseFloat(m[1]);
    const mult: Record<string, number> = { k: 1e3, m: 1e6, b: 1e9 };
    return Math.round(n * (mult[m[2].toLowerCase()] ?? 1));
}

/**
 * Finds the engagement count span that immediately follows the action button
 * containing the SVG with the given aria-label.
 *
 * Instagram renders:  [action-wrapper] [count-span.xe9ewy2] [action-wrapper] [count-span.xe9ewy2] …
 * inside a shared div (class x6s0dn4). The count span is the nextElementSibling
 * of the action wrapper at the x6s0dn4 level.
 */
function getCountAfterAction(section: Element, svgLabel: string): number {
    const svg = section.querySelector<SVGElement>(`svg[aria-label="${svgLabel}"]`);
    if (!svg) return 0;
    // Walk up from SVG until the parent is the shared actions div (.x6s0dn4) or <section>
    let el: Element = svg;
    while (el.parentElement && !el.parentElement.matches('.x6s0dn4, section')) {
        el = el.parentElement;
    }
    const sib = el.nextElementSibling;
    if (sib?.classList.contains('xe9ewy2')) {
        return parseEngagement(sib.textContent ?? '');
    }
    return 0;
}

export class InstagramWavelet extends BaseSocialWavelet {
    protected readonly messageType = 'INSTAGRAM_POST';
    protected readonly label = '📸[Instagram]';

    constructor(config?: SelectorConfig) { super(config); }

    isSite(): boolean {
        if (this.selectorConfig?.hostname_patterns?.length) {
            return this.selectorConfig.hostname_patterns.some(p => window.location.hostname.includes(p));
        }
        return window.location.hostname === 'www.instagram.com';
    }

    extractPost(article: HTMLElement): (InstagramPostData & SocialPostData) | null {
        try {
            // Skip sponsored / ad posts
            const adSpan = article.querySelector('span.x1fhwpqd.x132q4wb');
            if (adSpan?.textContent?.trim() === 'Ad') return null;

            // Post shortcode — lives in the /p/SHORTCODE/ link
            const postLink = article.querySelector<HTMLAnchorElement>(
                this.sel(article, 'post_link', 'a._a6hd[href^="/p/"]'),
            );
            const shortcode = postLink?.pathname.match(/\/p\/([^/]+)\//)?.[1] ?? null;
            if (!shortcode) return null;

            // Author handle — the span with class _aacw holds the username text
            const authorHandle = article.querySelector<HTMLElement>(
                this.sel(article, 'author_handle', 'span._ap3a._aacw'),
            )?.textContent?.trim() ?? '';
            if (!authorHandle) return null;

            // Post timestamp
            const timestamp = article.querySelector<HTMLTimeElement>(
                this.sel(article, 'timestamp', 'time[datetime]'),
            )?.getAttribute('datetime') ?? new Date().toISOString();

            // Caption — the outer span with _aacu wraps a div[style*="inline"] with the text
            const captionOuter = article.querySelector<HTMLElement>(
                this.sel(article, 'caption', 'span._ap3a._aacu._aad7'),
            );
            const caption = captionOuter?.querySelector('div')?.textContent?.trim()
                ?? captionOuter?.textContent?.trim()
                ?? '';

            // Engagement counts from the actions <section>
            const section = article.querySelector('section');
            const likes    = section ? getCountAfterAction(section, 'Like')    : 0;
            const comments = section ? getCountAfterAction(section, 'Comment') : 0;

            // Verified badge
            const isVerified = !!article.querySelector('svg[aria-label="Verified"]');

            // Post type — carousel has a <ul> inside the media container
            let postType: 'image' | 'carousel' | 'video' = 'image';
            if (article.querySelector('._aagu ul')) postType = 'carousel';
            else if (article.querySelector('video'))  postType = 'video';

            return {
                id: shortcode,
                shortcode,
                author_handle: authorHandle,
                is_verified: isVerified,
                caption,
                post_url: `https://www.instagram.com/p/${shortcode}/`,
                post_timestamp: timestamp,
                likes,
                comments,
                post_type: postType,
                captured_at: new Date().toISOString(),
                page_url: window.location.href,
                domain_id: '',
            };
        } catch {
            return null;
        }
    }

    protected processAddedNode(el: HTMLElement): void {
        const articleSel = this.sel(document.body, 'post_article', 'article');
        const articles: HTMLElement[] = el.matches?.(articleSel)
            ? [el]
            : Array.from(el.querySelectorAll<HTMLElement>(articleSel));

        for (const article of articles) {
            const data = this.extractPost(article);
            if (!data) continue;
            if (this.capturedIds.has(data.shortcode)) continue;
            this.capturedIds.add(data.shortcode);
            this.sendData(data);
        }
    }
}
