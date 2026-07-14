import { InstagramPostData } from './types';
import { BaseSocialWavelet } from './BaseSocialWavelet';
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

// ── Embedded-JSON extraction (primary source) ──────────────────────────────

/**
 * Recursively searches a JSON value for Instagram post objects.
 * A post is identified by having both `code` (shortcode) and `like_count`.
 */
function findPostsInJSON(obj: unknown): Array<Record<string, unknown>> {
  const posts: Array<Record<string, unknown>> = [];
  if (!obj || typeof obj !== 'object') return posts;

  if (Array.isArray(obj)) {
    for (const item of obj) posts.push(...findPostsInJSON(item));
    return posts;
  }

  const o = obj as Record<string, unknown>;
  if (typeof o.code === 'string' && typeof o.like_count === 'number') {
    posts.push(o);
  }

  for (const key in o) {
    if (Object.prototype.hasOwnProperty.call(o, key)) {
      posts.push(...findPostsInJSON(o[key]));
    }
  }
  return posts;
}

/**
 * Builds a post object from Instagram's embedded JSON payload.
 */
function buildPostFromJSON(o: Record<string, unknown>): InstagramPostData | null {
  const code = o.code as string;
  const user = (o.user || o.owner) as Record<string, unknown> | undefined;
  const captionObj = o.caption as Record<string, unknown> | null;
  const caption = (captionObj?.text as string) ?? '';

  if (!code || !user?.username) return null;

  const isPrivate = user.is_private === true;
  const isPublic = !isPrivate;

  const takenAt = o.taken_at ?? o.taken_at_timestamp;
  const timestamp = takenAt ? new Date((takenAt as number) * 1000).toISOString() : new Date().toISOString();

  const postType: 'image' | 'carousel' | 'video' = o.carousel_media ? 'carousel' : o.video_versions ? 'video' : 'image';

  return {
    id: code,
    platform: 'instagram',
    is_ad: false,
    shortcode: code,
    author_handle: isPublic ? (user.username as string) : '[private]',
    is_verified: !!user.is_verified,
    content_text: isPublic ? caption : '[private]',
    permalink: `https://www.instagram.com/p/${code}/`,
    post_timestamp: timestamp,
    likes: (o.like_count as number) ?? 0,
    comments: (o.comment_count as number) ?? 0,
    post_type: postType,
    captured_at: new Date().toISOString(),
    page_url: window.location.href,
    domain_id: '',
    is_public: isPublic,
  };
}

/**
 * Extracts all posts found in Instagram's server-rendered JSON <script> tags.
 */
function extractPostsFromEmbeddedJSON(): InstagramPostData[] {
  const results: InstagramPostData[] = [];
  const scripts = Array.from(document.querySelectorAll('script[type="application/json"]'));

  for (const script of scripts) {
    try {
      const data = JSON.parse(script.textContent || '');
      const rawPosts = findPostsInJSON(data);
      for (const raw of rawPosts) {
        const post = buildPostFromJSON(raw);
        if (post) results.push(post);
      }
    } catch {
      // ignore non-JSON or malformed scripts
    }
  }

  return results;
}

// ── Module-level cache for JSON-extracted posts ───────────────────────────
let _jsonPostsCache: InstagramPostData[] | null = null;

function getCachedJSONPosts(): InstagramPostData[] {
  if (_jsonPostsCache === null) {
    _jsonPostsCache = extractPostsFromEmbeddedJSON();
  }
  return _jsonPostsCache;
}

export function clearJSONPostsCache(): void {
  _jsonPostsCache = null;
}

export class InstagramWavelet extends BaseSocialWavelet {
  protected readonly messageType = 'INSTAGRAM_POST';
  protected readonly label = '📸[Instagram]';

  constructor(config?: SelectorConfig) {
    super(config);
  }

  isSite(): boolean {
    if (this.selectorConfig?.hostname_patterns?.length) {
      return this.selectorConfig.hostname_patterns.some(p => window.location.hostname.includes(p));
    }
    return window.location.hostname.includes('instagram.com');
  }

  extractPost(article: HTMLElement): InstagramPostData | null {
    try {
      // ── 1. Get shortcode from the article link ─────────────────────────
      const postLink = article.querySelector<HTMLAnchorElement>(this.sel(article, 'post_link', 'a[href*="/p/"]'));
      const shortcode = postLink?.pathname.match(/\/p\/([^/]+)\//)?.[1] ?? null;
      console.log('[📸Instagram] extractPost — shortcode:', shortcode, '| href:', postLink?.href ?? 'none');
      if (!shortcode) return null;

      // ── 2. Try embedded JSON first (reliable likes/comments) ───────────
      const jsonPosts = getCachedJSONPosts();
      const jsonMatch = jsonPosts.find(p => p.shortcode === shortcode);
      if (jsonMatch) {
        console.log('[📸Instagram] extractPost — using embedded JSON for', shortcode);
        return jsonMatch;
      }

      // ── 3. Fallback to DOM scraping ────────────────────────────────────
      // Skip sponsored / ad posts
      const adSpan = article.querySelector(this.sel(article, 'ad_marker', 'span.x1fhwpqd.x132q4wb'));
      const isAd = adSpan?.textContent?.trim() === 'Ad';
      if (isAd) {
        console.log('[📸Instagram] extractPost — capturing ad post');
      }

      // Author handle
      const authorEl = article.querySelector<HTMLElement>(this.sel(article, 'author_handle', 'span._ap3a._aacw'));
      const authorHandle = authorEl?.textContent?.trim() ?? '';
      console.log('[📸Instagram] extractPost — author:', authorHandle || '(empty)');
      if (!authorHandle) return null;

      // Post timestamp
      const timestamp =
        article
          .querySelector<HTMLTimeElement>(this.sel(article, 'timestamp', 'time[datetime]'))
          ?.getAttribute('datetime') ?? new Date().toISOString();

      // Caption
      const captionOuter = article.querySelector<HTMLElement>(
        this.sel(article, 'caption', '[data-testid="caption"] span, span._ap3a._aacu._aad7'),
      );
      const caption =
        captionOuter?.querySelector('div')?.textContent?.trim() ?? captionOuter?.textContent?.trim() ?? '';

      // Engagement counts from the actions <section>
      const section = article.querySelector('section');
      const likes = section ? getCountAfterAction(section, 'Like') : 0;
      const comments = section ? getCountAfterAction(section, 'Comment') : 0;

      // Verified badge
      const isVerified = !!article.querySelector(this.sel(article, 'verified_badge', 'svg[aria-label="Verified"]'));

      // Post type
      let postType: 'image' | 'carousel' | 'video' = 'image';
      if (article.querySelector(this.sel(article, 'carousel_list', '._aagu ul'))) postType = 'carousel';
      else if (article.querySelector('video')) postType = 'video';

      const result = {
        id: shortcode,
        platform: 'instagram' as const,
        signal_type: 'feed' as const,
        is_ad: isAd,
        shortcode,
        author_handle: authorHandle,
        is_verified: isVerified,
        content_text: caption,
        permalink: `https://www.instagram.com/p/${shortcode}/`,
        post_timestamp: timestamp,
        likes,
        comments,
        post_type: postType,
        captured_at: new Date().toISOString(),
        page_url: window.location.href,
        domain_id: '',
        is_public: true, // DOM fallback: post is visible in feed, assume public
      };
      console.log('[📸Instagram] extractPost — DOM fallback result:', result);
      return result;
    } catch (err) {
      console.error('[📸Instagram] extractPost — error:', err);
      return null;
    }
  }

  initialize(): void {
    if (!this.isSite()) return;
    console.log('[📸Instagram] Initializing');
    super.initialize();

    // Instagram infinite scroll: rescan on scroll (debounced)
    let scrollTimer: ReturnType<typeof setTimeout>;
    window.addEventListener(
      'scroll',
      () => {
        clearTimeout(scrollTimer);
        scrollTimer = setTimeout(() => {
          clearJSONPostsCache();
          this.processAddedNode(document.body);
        }, 500);
      },
      { passive: true },
    );
  }

  protected processAddedNode(el: HTMLElement): void {
    // New nodes may mean new JSON payloads were injected (infinite scroll).
    // Clear the cache so the next extractPost call re-parses fresh data.
    clearJSONPostsCache();

    const articleSel = this.sel(document.body, 'post_article', 'article');
    const articles: HTMLElement[] = el.matches?.(articleSel)
      ? [el]
      : Array.from(el.querySelectorAll<HTMLElement>(articleSel));

    if (articles.length > 0) {
      console.log(`[📸Instagram] processAddedNode — found ${articles.length} article(s)`);
    }

    for (const article of articles) {
      const data = this.extractPost(article);
      if (!data) continue;
      if (this.capturedIds.has(data.id)) continue; // fixed: use data.id (was data.shortcode)
      this.capturedIds.add(data.id); // fixed: use data.id
      console.log('[📸Instagram] processAddedNode — sending:', data.id);
      this.sendData(data);
    }
  }
}
