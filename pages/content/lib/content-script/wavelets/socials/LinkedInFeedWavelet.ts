import { LinkedInPostData } from './types';
import { BaseSocialWavelet } from './BaseSocialWavelet';
import { SelectorConfig } from '@chrome-extension-boilerplate/shared/lib/types/contentScript';

// ── Helper: derive stable post ID ───────────────────────────────────────────
function deriveLinkedInId(article: HTMLElement): string {
  const html = article.innerHTML;

  // Priority 1: literal colon form — activity:12345
  const colonMatch = html.match(/activity:(\d{10,})/i);
  if (colonMatch) return `linkedin_activity_${colonMatch[1]}`;

  // Priority 2: fully URL-encoded form — activity%3A12345
  const encodedMatch = html.match(/activity%3A(\d{10,})/i);
  if (encodedMatch) return `linkedin_activity_${encodedMatch[1]}`;

  // Priority 3: highlightedUpdateUrn query param
  const urnMatch = html.match(/highlightedUpdateUrn=urn%3Ali%3Aactivity%3A(\d+)/i);
  if (urnMatch) return `linkedin_activity_${urnMatch[1]}`;

  // Deterministic fallback: hash author handle + partial text so the same article
  // always gets the same ID even if the MutationObserver fires multiple times.
  const authorLink = article.querySelector<HTMLAnchorElement>('a[href*="/in/"], a[href*="/company/"]');
  const authorKey = authorLink?.href ?? '';
  const textKey = article.innerText?.slice(0, 120) ?? '';
  let hash = 0;
  for (const ch of authorKey + textKey) {
    hash = (Math.imul(31, hash) + ch.charCodeAt(0)) | 0;
  }
  return `linkedin_fallback_${Math.abs(hash).toString(36)}`;
}

// ── Helper: derive permalink ────────────────────────────────────────────────
function deriveLinkedInPermalink(article: HTMLElement): string {
  const links = Array.from(article.querySelectorAll('a[href]')) as HTMLAnchorElement[];
  const activityLink = links.find(
    a => a.href.includes('activity') || a.href.includes('highlightedUpdateUrn') || a.href.includes('/feed/update/'),
  );
  return activityLink?.href || window.location.href;
}

// ── Helper: parse relative LinkedIn timestamp → ISO ──────────────────────
function parseLinkedInRelativeTime(text: string): string | undefined {
  const match = text.match(/\b(\d+)\s*(m|h|d|w|mo|yr)\b/i);
  if (!match) return undefined;

  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const now = new Date();

  switch (unit) {
    case 'm':
      now.setMinutes(now.getMinutes() - value);
      break;
    case 'h':
      now.setHours(now.getHours() - value);
      break;
    case 'd':
      now.setDate(now.getDate() - value);
      break;
    case 'w':
      now.setDate(now.getDate() - value * 7);
      break;
    case 'mo':
      now.setMonth(now.getMonth() - value);
      break;
    case 'yr':
      now.setFullYear(now.getFullYear() - value);
      break;
    default:
      return undefined;
  }

  return now.toISOString();
}

// ── Classification logic ──────────────────────────────────────────────────
type LinkedInFeedContextType =
  | 'direct_post'
  | 'suggested_post'
  | 'promoted_post'
  | 'liked_by_connection'
  | 'reacted_by_connection'
  | 'group_post'
  | 'company_post'
  | 'person_post';

interface LinkedInContext {
  type: LinkedInFeedContextType;
  actor_name?: string;
  action?: string;
}

function classifyLinkedInPost(article: HTMLElement): LinkedInContext {
  const text = article.innerText || '';

  // EN: "X likes this", DE: "X gefällt das"
  const likedMatch = text.match(/^(.+?)\s+(?:likes this|gefällt das)\.?$/im);
  if (likedMatch) {
    return { type: 'liked_by_connection', actor_name: likedMatch[1].trim(), action: 'likes this' };
  }

  // EN: "X finds this funny", DE: "X findet das lustig"
  const funnyMatch = text.match(/^(.+?)\s+(?:finds this funny|findet das lustig)/i);
  if (funnyMatch) {
    return { type: 'reacted_by_connection', actor_name: funnyMatch[1].trim(), action: 'finds this funny' };
  }

  // EN: "X finds this", DE: "X findet das"
  const findsMatch = text.match(/^(.+?)\s+(?:finds this|findet das)/i);
  if (findsMatch) {
    return { type: 'reacted_by_connection', actor_name: findsMatch[1].trim(), action: 'finds this' };
  }

  // EN: "Promoted", DE: "Anzeige"
  if (text.includes('Promoted') || text.includes('Anzeige')) return { type: 'promoted_post' };
  // EN: "Suggested", DE: "Vorgeschlagen"
  if (text.includes('Suggested') || text.includes('Vorgeschlagen')) return { type: 'suggested_post' };
  if (article.querySelector('a[href*="/groups/"]')) return { type: 'group_post' };
  if (article.querySelector('a[href*="/company/"]')) return { type: 'company_post' };
  if (article.querySelector('a[href*="/in/"]')) return { type: 'person_post' };

  return { type: 'direct_post' };
}

// ── Wavelet class ─────────────────────────────────────────────────────────
export class LinkedInFeedWavelet extends BaseSocialWavelet {
  protected readonly messageType = 'LINKEDIN_POST';
  protected readonly label = '💼[LinkedIn]';

  constructor(config?: SelectorConfig) {
    super(config);
  }

  isSite(): boolean {
    if (this.selectorConfig?.hostname_patterns?.length) {
      return this.selectorConfig.hostname_patterns.some(p => window.location.hostname.includes(p));
    }
    return window.location.hostname.includes('linkedin.com');
  }

  extractPost(article: HTMLElement): LinkedInPostData | null {
    try {
      const text = article.innerText || '';
      const context = classifyLinkedInPost(article);
      console.log('[💼LinkedIn] extractPost — context:', context.type, '| actor:', context.actor_name ?? 'none');

      // ── Content text ─────────────────────────────────────────────────
      const postText =
        article
          .querySelector(this.sel(article, 'post_text', '[data-testid="expandable-text-box"]'))
          ?.textContent?.trim() || '';

      // ── Links ──────────────────────────────────────────────────────────
      const profileLinks = Array.from(
        article.querySelectorAll<HTMLAnchorElement>(this.sel(article, 'profile_link', 'a[href*="/in/"]')),
      );
      const groupLinks = Array.from(
        article.querySelectorAll<HTMLAnchorElement>(this.sel(article, 'group_link', 'a[href*="/groups/"]')),
      );

      // ── Author ─────────────────────────────────────────────────────────
      // For group posts, the last profile link is usually the actual author.
      // Control menu button aria-label is used as fallback (language-aware DOM query).
      const fallbackProfile = profileLinks.at(-1);
      const controlMenuBtn = article.querySelector<HTMLElement>(
        this.sel(article, 'control_menu_btn', 'button[aria-label*="post by"], button[aria-label*="Beitrag von"]'),
      );
      const controlMenuAuthor = controlMenuBtn
        ?.getAttribute('aria-label')
        ?.match(/(?:post by|Beitrag von)\s+(.+?)(?:\s+(?:öffnen|$))/i)?.[1];
      const authorName = fallbackProfile?.textContent?.trim() || controlMenuAuthor || 'unknown';

      const authorHandle =
        fallbackProfile?.href?.split('/in/')[1]?.replace(/\/$/, '')?.split('?')[0] ||
        authorName.toLowerCase().replace(/\s+/g, '-');

      console.log(
        '[💼LinkedIn] extractPost — profileLinks found:',
        profileLinks.length,
        '| selected href:',
        fallbackProfile?.href?.substring(0, 80) ?? 'none',
        '| authorHandle:',
        authorHandle,
        '| authorName:',
        authorName,
      );

      // ── Group name ─────────────────────────────────────────────────────
      const groupName = groupLinks[0]?.textContent?.trim();

      // ── Media ──────────────────────────────────────────────────────────
      const images = article.querySelectorAll(
        this.sel(article, 'media_image', 'img[alt^="View image"], img[src*="feedshare"]'),
      );
      const hasExternalLink = !!article.querySelector(
        this.sel(article, 'external_link', 'a[target="_blank"][href^="http"]'),
      );
      const postType: 'image' | 'text' | 'external_link' =
        images.length > 0 ? 'image' : hasExternalLink ? 'external_link' : 'text';

      // ── Engagement ───────────────────────────────────────────────────
      // All counts live as bare numbers inside button spans (SVG has no text nodes).
      // innerText is unreliable — reaction count div is aria-labelledby (sr-only).
      // EN: "Reaction button state: …", DE: "Status des Reaktionsbuttons: …"
      const reactionBtn = article.querySelector<HTMLElement>(
        this.sel(
          article,
          'reaction_button',
          'button[aria-label*="Reaction button"], button[aria-label*="Reaktionsbuttons"]',
        ),
      );
      const likes = parseInt(reactionBtn?.textContent?.trim() ?? '0', 10) || 0;
      const commentBtn = article.querySelector<HTMLElement>(
        this.sel(article, 'comment_button', 'button[aria-label="Comment"], button[aria-label="Kommentieren"]'),
      );
      const comments = parseInt(commentBtn?.textContent?.trim() ?? '0', 10) || 0;

      const repostBtn = article.querySelector<HTMLElement>(
        this.sel(article, 'repost_button', 'button[aria-label="Repost"], button[aria-label="Reposten"]'),
      );
      const reposts = parseInt(repostBtn?.textContent?.trim() ?? '0', 10) || 0;

      // ── Visibility ────────────────────────────────────────────────────
      // svg#globe-americas-small is a stable HTML id across all UI languages.
      // aria-label is localized: EN "Visibility: Global", DE "Sichtbarkeit: Global".
      const visibilityEl = article.querySelector(this.sel(article, 'visibility_icon', 'svg#globe-americas-small'));
      const visAriaLabel = visibilityEl?.getAttribute('aria-label') ?? '';
      // Strip localized prefix ("Visibility: " / "Sichtbarkeit: ") → keep value after last colon.
      const visibility = visAriaLabel.includes(':')
        ? (visAriaLabel.split(':').pop()?.trim() ?? 'Unknown')
        : visAriaLabel || 'Unknown';
      const isPublic = visAriaLabel.endsWith('Global');
      console.log(
        '[💼LinkedIn] extractPost — visibility:',
        visibility,
        '| isPublic:',
        isPublic,
        '| visibilityEl found:',
        !!visibilityEl,
      );
      console.log('[💼LinkedIn] extractPost — engagement:', { likes, comments, reposts });

      // ── Flags ──────────────────────────────────────────────────────────
      // EN: "Promoted", DE: "Anzeige"
      const isPromoted = text.includes('Promoted') || text.includes('Anzeige');
      const isMarketing = context.type === 'promoted_post' || context.type === 'suggested_post';
      const shouldCaptureContent = isPublic || isMarketing;

      return {
        id: deriveLinkedInId(article),
        platform: 'linkedin' as const,
        signal_type: 'feed' as const,
        author_handle: shouldCaptureContent ? authorHandle : '[private]',
        author_display_name: shouldCaptureContent ? authorName : '[private]',
        content_text: shouldCaptureContent ? postText.substring(0, 5000) : '[private]',
        visibility,
        is_public: isPublic,
        permalink: deriveLinkedInPermalink(article),
        post_timestamp: parseLinkedInRelativeTime(text),
        likes,
        comments,
        reposts,
        post_type: postType,
        captured_at: new Date().toISOString(),
        page_url: window.location.href,
        domain_id: '',
        is_ad: isPromoted,
        feed_context_type: context.type,
        feed_context_actor: shouldCaptureContent ? context.actor_name : context.actor_name ? '[private]' : undefined,
        feed_context_action: context.action,
        group_name: groupName,
      };
    } catch (err) {
      console.error('[💼LinkedIn] extractPost — error:', err);
      return null;
    }
  }

  protected processAddedNode(el: HTMLElement): void {
    const listItemSel = this.sel(document.body, 'listitem', 'div[role="listitem"]');
    const articles: HTMLElement[] = el.matches?.(listItemSel)
      ? [el]
      : Array.from(el.querySelectorAll<HTMLElement>(listItemSel));

    if (articles.length > 0) {
      console.log(`[💼LinkedIn] Processing ${articles.length} list items...`);
    }

    for (const article of articles) {
      const textPreview = article.innerText?.substring(0, 120) ?? '';
      const html = article.innerHTML;
      // Language-independent structural checks (activity URN or author link)
      const hasActivityUrn = /activity[:%3A]\d+/i.test(html) || /highlightedUpdateUrn/i.test(html);
      const hasAuthorLink = !!article.querySelector(
        this.sel(article, 'author_link', 'a[href*="/in/"], a[href*="/company/"], a[href*="/groups/"]'),
      );
      const isFeedPost = hasActivityUrn || hasAuthorLink;
      console.log('[💼LinkedIn] Article check:', { isFeedPost, hasActivityUrn, hasAuthorLink, textPreview });

      // Filter: must look like a real feed post (language-independent)
      if (!isFeedPost) {
        console.log('[💼LinkedIn] Skipped — no activity URN or author link found');
        continue;
      }

      // Skip "Suggested to follow" widgets — they're not posts, just people
      // recommendation cards showing 3 profiles to follow. They pass the
      // isFeedPost filter because they contain /in/ links, but they have no
      // activity URN, no post text, no reactions, and no visibility icon.
      // EN: "Suggested to follow", DE: "Vorgeschlagene Personen", also "Who to follow"
      const fullText = article.innerText || '';
      const isSuggestedToFollow = /suggested\s+to\s+follow|vorgeschlagene\s+personen|who\s+to\s+follow/i.test(fullText);
      if (isSuggestedToFollow) {
        console.log('[💼LinkedIn] Skipped — Suggested to follow widget (not a post)');
        continue;
      }

      const data = this.extractPost(article);
      if (!data) {
        console.log('[💼LinkedIn] extractPost returned null — skipping article');
        continue;
      }
      if (this.capturedIds.has(data.id)) {
        console.log(`[💼LinkedIn] Already captured — skipping id: ${data.id}`);
        continue;
      }
      this.capturedIds.add(data.id);
      console.log('[💼LinkedIn] ✅ Captured:', {
        id: data.id,
        author_handle: data.author_handle,
        author_display_name: data.author_display_name,
        is_ad: data.is_ad,
        is_public: data.is_public,
        feed_context_type: data.feed_context_type,
        visibility: data.visibility,
        likes: data.likes,
        comments: data.comments,
        reposts: data.reposts,
        content_text: data.content_text.substring(0, 80),
        permalink: data.permalink,
      });
      this.sendData(data);
    }
  }
}
