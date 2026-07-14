import { FacebookPostData } from './types';
import { BaseSocialWavelet } from './BaseSocialWavelet';
import { SelectorConfig } from '@chrome-extension-boilerplate/shared/lib/types/contentScript';

const SPONSORED_LABELS = ['sponsored', 'publicidad', 'patrocinado', 'gesponsert', 'sponsorisé'];

function parseEngagementCount(button: Element | null): number {
  if (!button) return 0;
  const countSpan = button.querySelector('span[dir="auto"]');
  return parseCountText(countSpan?.textContent?.trim() ?? '');
}

function parseCountText(text: string): number {
  if (!text) return 0;

  // Facebook shows counts like: "123", "1,2 mil", "2.3K", "3M", "1,2 millones"
  const match = text.match(/([\d.,]+)\s*(mil|miles|millones|millon|k|m|b)?/i);
  if (!match) return 0;

  const raw = match[1];
  const suffix = (match[2] || '').toLowerCase();
  const hasSuffix = !!match[2];

  let numeric: string;
  if (hasSuffix) {
    numeric = raw.replace(/,/g, '.'); // decimal comma → dot
  } else {
    numeric = raw.replace(/[,.]/g, ''); // thousand separators
  }

  const value = parseFloat(numeric);
  if (!Number.isFinite(value)) return 0;

  const multiplier =
    suffix === 'k' || suffix === 'mil' || suffix === 'miles'
      ? 1_000
      : suffix === 'm' || suffix === 'millones' || suffix === 'millon'
        ? 1_000_000
        : suffix === 'b'
          ? 1_000_000_000
          : 1;

  return Math.floor(value * multiplier);
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
  // Photo posts: /photo/?fbid=12345
  const fbidMatch = url.match(/[?&]fbid=(\d+)/);
  if (fbidMatch) return fbidMatch[1];
  return null;
}

function simpleHash(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function generateAdPostId(authorHandle: string, contentText: string): string {
  // Deterministic fallback for sponsored posts that do not expose a pfbid permalink.
  return `ad_${simpleHash(authorHandle)}_${simpleHash(contentText.slice(0, 120))}`;
}

function extractHandleFromFacebookUrl(url: string): string {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    // profile.php?id=123 -> use the id parameter as handle
    if (parsed.pathname.includes('/profile.php')) {
      const id = parsed.searchParams.get('id');
      if (id) return id;
    }
    // Normal page/user path: /SomePage/ or /SomePage?foo=bar
    return parsed.pathname.split('/').filter(Boolean).pop() ?? '';
  } catch {
    return '';
  }
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

  /**
   * Detects sponsored posts. Uses remote-configurable selectors for the ad marker and
   * the ads-about link, with hardcoded fallbacks. Also scans visible header text for
   * known sponsored labels across languages.
   */
  private isSponsoredPost(article: HTMLElement): boolean {
    // 1. Explicit ad marker link (remote-configurable selector)
    const sponsoredMarkerSelector = this.sel(
      article,
      'sponsored_marker',
      'a[aria-label="Publicidad"], a[aria-label="Sponsored"], a[aria-label="Patrocinado"], a[aria-label="Gesponsert"], a[aria-label="Sponsorisé"]',
    );
    if (article.querySelector(sponsoredMarkerSelector)) return true;

    // 2. Visible text that exactly matches a sponsored label anywhere in the header area
    const headerLike = article.querySelector('[data-ad-rendering-role="profile_name"], [role="banner"]');
    const searchRoot = headerLike ?? article;
    const text = searchRoot.textContent?.toLowerCase().trim() ?? '';
    if (SPONSORED_LABELS.some(l => text.includes(l))) {
      const words = new Set(text.split(/\s+/));
      if (SPONSORED_LABELS.some(l => words.has(l))) return true;
    }

    // 3. Ad destination link (remote-configurable selector)
    const adsLinkSelector = this.sel(article, 'ads_link', 'a[href*="/ads/"]');
    if (article.querySelector(adsLinkSelector)) return true;

    // 4. Sponsored posts: Facebook adds a call-to-action button (data-ad-rendering-role="cta-")
    // that organic posts never have. Other roles like "meta", "title", "description" appear
    // on ANY link preview card (including organic photo carousels), so they must NOT be used.
    const adRoleMarkerSel = this.sel(article, 'ad_role_marker', '[data-ad-rendering-role="cta-"]');
    if (article.querySelector(adRoleMarkerSel)) return true;

    return false;
  }

  extractPost(article: HTMLElement): FacebookPostData | null {
    try {
      // ── Ad detection ───────────────────────────────────────────────────
      const isAd = this.isSponsoredPost(article);

      // ── Author ─────────────────────────────────────────────────────────
      const profileLink = article.querySelector<HTMLAnchorElement>(
        this.sel(article, 'profile_link', '[data-ad-rendering-role="profile_name"] a'),
      );
      const profileUrl = profileLink?.href ?? '';
      let authorHandle = extractHandleFromFacebookUrl(profileUrl);
      let authorName = profileLink?.textContent?.trim() ?? '';

      console.log(
        '[📘Facebook] extractPost — profileLink found:',
        !!profileLink,
        '| href:',
        profileUrl || 'none',
        '| handle:',
        authorHandle || '(empty)',
      );

      // Ads may not have a normal profile link; try to extract a page handle from any
      // facebook.com link inside the article, otherwise keep a generic handle so the ad
      // is still captured.
      const fallbackLink = article.querySelector<HTMLAnchorElement>('a[href*="facebook.com/"]');
      if (!authorHandle) {
        authorHandle = extractHandleFromFacebookUrl(fallbackLink?.href ?? '');
        authorName = fallbackLink?.textContent?.trim() ?? 'Sponsored';
        console.log(
          '[📘Facebook] extractPost — fallback link:',
          fallbackLink?.href ?? 'none',
          '| handle:',
          authorHandle || '(empty)',
        );
      }

      if (!authorHandle) {
        console.log('[📘Facebook] extractPost — ❌ no authorHandle, returning null');
        return null;
      }

      // ── Content ────────────────────────────────────────────────────────
      const storyEl = article.querySelector<HTMLElement>(
        this.sel(article, 'story_message', '[data-ad-rendering-role="story_message"]'),
      );
      const contentText = storyEl?.textContent?.trim() ?? '';

      // ── Timestamp / Permalink ──────────────────────────────────────────
      const timeLink = article.querySelector<HTMLAnchorElement>(
        this.sel(article, 'time_link', 'a[href*="/posts/"], a[href*="/watch/"], a[href*="?v="], a[href*="/photo/"]'),
      );
      let permalink = timeLink?.href ?? '';

      // Sponsored posts often do not expose a /posts/pfbid... permalink. Fall back to the
      // advertiser page URL so the backend validation does not reject the payload.
      if (!permalink && isAd) {
        permalink = profileUrl || fallbackLink?.href || window.location.href;
      }

      // For any post still without a permalink (e.g. news article shares that only have
      // external redirect links), fall back to the Page profile URL so the field is never
      // empty — the backend requires a non-empty string.
      if (!permalink) {
        permalink = profileUrl || window.location.href;
      }

      let postId = extractPostIdFromUrl(permalink);

      // If there is still no pfbid, use a deterministic fallback ID derived from the
      // author + content so the post is still captured.
      // This covers organic Page posts with link preview cards that don't expose
      // a /posts/pfbid... permalink (e.g. DIE ZEIT, BÜNDNIS 90/DIE GRÜNEN).
      if (!postId && (isAd || contentText)) {
        postId = generateAdPostId(authorHandle, contentText);
      }

      if (!postId) return null;

      // ── Post type ──────────────────────────────────────────────────────
      const hasVideo = !!article.querySelector('video') || !!article.querySelector('[data-ad-rendering-role="video"]');
      const hasImages =
        article.querySelectorAll('[data-ad-rendering-role="image"], [data-ad-rendering-role="image_container"], img')
          .length > 0;
      const postType: 'video' | 'image' | 'text' = hasVideo ? 'video' : hasImages ? 'image' : 'text';

      // ── Engagement ─────────────────────────────────────────────────────
      // Prefer language-independent data-ad-rendering-role attributes; fall back to
      // Spanish/English aria-labels for organic posts that do not use the ad roles.
      const likeBtn = article.querySelector(
        this.sel(
          article,
          'like_button',
          '[data-ad-rendering-role="like_button"], div[aria-label="Me gusta"], div[aria-label="Like"]',
        ),
      );
      const commentBtn = article.querySelector(
        this.sel(
          article,
          'comment_button',
          '[data-ad-rendering-role="comment_button"], div[aria-label="Dejar un comentario"], div[aria-label="Comment"]',
        ),
      );
      const shareBtn = article.querySelector(
        this.sel(
          article,
          'share_button',
          '[data-ad-rendering-role="share_button"], div[aria-label^="Envía"], div[aria-label^="Enviar"], div[aria-label^="Compartir"], div[aria-label^="Share"]',
        ),
      );

      // ── Visibility detection ───────────────────────────────────────────────
      // Globe SVG has a localized title attribute: "Shared with: Public" / "Compartido con: Público" etc.
      const publicIndicatorSel = this.sel(
        article,
        'public_indicator',
        'svg[title*="Público"], svg[title*="Public"], svg[title*="Öffentlich"], svg[title*="Publiek"]',
      );
      const isPublic = !!article.querySelector(publicIndicatorSel) || isAd;

      return {
        id: postId,
        platform: 'facebook' as const,
        signal_type: 'feed' as const,
        is_ad: isAd,
        author_handle: isPublic ? authorHandle : '[private]',
        author_display_name: isPublic ? authorName : '[private]',
        content_text: isPublic ? contentText.substring(0, 5000) : '[private]',
        permalink,
        post_type: postType,
        likes: parseEngagementCount(likeBtn),
        comments: parseEngagementCount(commentBtn),
        shares: parseEngagementCount(shareBtn),
        captured_at: new Date().toISOString(),
        page_url: window.location.href,
        domain_id: '',
        is_public: isPublic,
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

    // Also find posts that are NOT inside div[role="article"] — Facebook uses a
    // different feed layout for accounts without friends where posts are not wrapped
    // in div[role="article"]. Find them by profile_name and walk up to the post container.
    // Uses sel() with key 'profile_name' so the backend can remotely update the selector.
    const profileNameSel = this.sel(el, 'profile_name', '[data-ad-rendering-role="profile_name"]');
    const profileNames = el.matches?.(profileNameSel)
      ? [el]
      : Array.from(el.querySelectorAll<HTMLElement>(profileNameSel));
    for (const pn of profileNames) {
      const article = pn.closest<HTMLElement>('div[role="article"]');
      if (!article) {
        // Walk up from profile_name until we find an ancestor that also contains
        // story_message or like_button — that's the post container.
        // This is stable because data-ad-rendering-role attributes are Facebook's
        // internal naming, not obfuscated CSS classes.
        let container: HTMLElement | null = pn.parentElement;
        while (container && container !== document.body) {
          if (
            container.querySelector('[data-ad-rendering-role="story_message"]') ||
            container.querySelector('[data-ad-rendering-role="like_button"]')
          ) {
            if (!articles.includes(container)) {
              articles.push(container);
            }
            break;
          }
          container = container.parentElement;
        }
      }
    }

    if (articles.length > 0) {
      console.log(`[📘Facebook] Processing ${articles.length} articles...`);
    }

    for (const article of articles) {
      // Skip loading placeholders — Facebook uses div[role="article"] for loading spinners
      if (
        article.querySelector('[data-visualcompletion="loading-state"]') ||
        article.getAttribute('aria-label')?.toLowerCase().includes('wird geladen') ||
        article.getAttribute('aria-label')?.toLowerCase().includes('loading')
      ) {
        continue;
      }

      // Debug: log what kind of article this is
      const ariaLabel = article.getAttribute('aria-label') ?? '';
      const hasProfileName = !!article.querySelector('[data-ad-rendering-role="profile_name"]');
      const hasStoryMessage = !!article.querySelector('[data-ad-rendering-role="story_message"]');
      const hasTimeLink = !!article.querySelector('a[href*="/posts/"]');
      const hasReelLink = !!article.querySelector('a[href*="/reel/"]');
      const firstLink = article.querySelector('a');
      console.log('[📘Facebook] Article debug:', {
        ariaLabel: ariaLabel.substring(0, 60),
        hasProfileName,
        hasStoryMessage,
        hasTimeLink,
        hasReelLink,
        firstLinkHref: firstLink?.href?.substring(0, 80) ?? 'none',
        childCount: article.children.length,
        innerHTMLPreview: article.innerHTML.substring(0, 200),
      });

      const data = this.extractPost(article);
      if (!data) {
        console.log(`[📘Facebook] extractPost returned null — skipping article`);
        continue;
      }
      if (this.capturedIds.has(data.id)) {
        console.log(`[📘Facebook] Already captured — skipping id: ${data.id}`);
        continue;
      }
      this.capturedIds.add(data.id);
      console.log(`[📘Facebook] ✅ Captured:`, {
        id: data.id,
        author_handle: data.author_handle,
        author_display_name: data.author_display_name,
        is_ad: data.is_ad,
        is_public: data.is_public,
        post_type: data.post_type,
        likes: data.likes,
        comments: data.comments,
        shares: data.shares,
        content_text: data.content_text.substring(0, 80),
        permalink: data.permalink,
      });
      this.sendData(data);
    }
  }
}
