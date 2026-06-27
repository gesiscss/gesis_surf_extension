import { LinkedInPostData } from './types';
import { BaseSocialWavelet } from './BaseSocialWavelet';
import { SelectorConfig } from '@chrome-extension-boilerplate/shared/lib/types/contentScript';

// ── Helper: parse count from text ──────────────────────────────────────────
function parseCountFromText(text: string, regex: RegExp): number {
  const match = text.match(regex);
  if (!match) return 0;
  const raw = match[1].replace(/,/g, '').replace(/\./g, '');
  const value = Number(raw);
  return Number.isFinite(value) ? value : 0;
}

// ── Helper: find a count element inside an article by keyword ─────────────
function findCountByLabel(article: HTMLElement, label: string): number {
  const reTest = new RegExp(`\\d+\\s*${label}`, 'i');
  const reParse = new RegExp(`([\\d,.]+)\\s*([KMB]?)\\s*${label}`, 'i');
  const elements = Array.from(article.querySelectorAll('*'));
  for (const el of elements) {
    const text = el.textContent || '';
    if (!reTest.test(text)) continue;
    const match = text.match(reParse);
    if (!match) continue;
    const raw = match[1].replace(/,/g, '');
    const value = Number(raw);
    if (!Number.isFinite(value)) continue;
    const suffix = match[2].toUpperCase();
    const multiplier = suffix === 'K' ? 1_000 : suffix === 'M' ? 1_000_000 : suffix === 'B' ? 1_000_000_000 : 1;
    return Math.floor(value * multiplier);
  }
  return 0;
}

// ── Helper: parse LinkedIn reaction count ─────────────────────────────────
function parseLinkedInReactionCount(text: string): number {
  const direct = text.match(/([\d,.]+)\s+reactions?/i);
  if (direct) return parseCountFromText(text, /([\d,.]+)\s+reactions?/i);

  const others = text.match(/and\s+([\d,.]+)\s+others\s+reacted/i);
  if (others) {
    const n = Number(others[1].replace(/,/g, '').replace(/\./g, ''));
    return Number.isFinite(n) ? n + 1 : 0;
  }

  return 0;
}

// ── Helper: derive stable post ID ───────────────────────────────────────────
function deriveLinkedInId(article: HTMLElement): string {
  const html = article.innerHTML;

  const activityMatch = html.match(/activity[:%3A](\d+)/i);
  if (activityMatch) return `linkedin_activity_${activityMatch[1]}`;

  const urnMatch = html.match(/highlightedUpdateUrn=urn%3Ali%3Aactivity%3A(\d+)/i);
  if (urnMatch) return `linkedin_activity_${urnMatch[1]}`;

  return `linkedin_${crypto.randomUUID()}`;
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

  const likedMatch = text.match(/^(.+?)\s+likes this/i);
  if (likedMatch) {
    return { type: 'liked_by_connection', actor_name: likedMatch[1].trim(), action: 'likes this' };
  }

  const funnyMatch = text.match(/^(.+?)\s+finds this funny/i);
  if (funnyMatch) {
    return { type: 'reacted_by_connection', actor_name: funnyMatch[1].trim(), action: 'finds this funny' };
  }

  const findsMatch = text.match(/^(.+?)\s+finds this/i);
  if (findsMatch) {
    return { type: 'reacted_by_connection', actor_name: findsMatch[1].trim(), action: 'finds this' };
  }

  if (text.includes('Promoted')) return { type: 'promoted_post' };
  if (text.includes('Suggested')) return { type: 'suggested_post' };
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

      // ── Content text ─────────────────────────────────────────────────
      const postText =
        article
          .querySelector(this.sel(article, 'post_text', '[data-testid="expandable-text-box"]'))
          ?.textContent?.trim() || '';

      // ── Links ──────────────────────────────────────────────────────────
      const links = Array.from(article.querySelectorAll('a[href]')) as HTMLAnchorElement[];
      const profileLinks = links.filter(a => a.href.includes('/in/'));
      const groupLinks = links.filter(a => a.href.includes('/groups/'));

      // ── Author ─────────────────────────────────────────────────────────
      // For group posts, the last profile link is usually the actual author
      const fallbackProfile = profileLinks.at(-1);
      const authorName =
        fallbackProfile?.textContent?.trim() || text.match(/Open control menu for post by\s+(.+?)"/i)?.[1] || 'unknown';

      const authorHandle =
        fallbackProfile?.href?.split('/in/')[1]?.replace(/\/$/, '')?.split('?')[0] ||
        authorName.toLowerCase().replace(/\s+/g, '-');

      // ── Group name ─────────────────────────────────────────────────────
      const groupName = groupLinks[0]?.textContent?.trim();

      // ── Media ──────────────────────────────────────────────────────────
      const images = article.querySelectorAll('img[alt^="View image"], img[src*="feedshare"]');
      const hasExternalLink = !!article.querySelector('a[target="_blank"][href^="http"]');
      const postType: 'image' | 'text' | 'external_link' =
        images.length > 0 ? 'image' : hasExternalLink ? 'external_link' : 'text';

      // ── Engagement ───────────────────────────────────────────────────
      const likes = parseLinkedInReactionCount(text);
      const comments = parseCountFromText(text, /([\d,.]+)\s+comments?/i) || findCountByLabel(article, 'comments?');
      const reposts = parseCountFromText(text, /([\d,.]+)\s+reposts?/i) || findCountByLabel(article, 'reposts?');

      // ── Visibility ────────────────────────────────────────────────────
      const visibilityEl = article.querySelector(
        this.sel(article, 'visibility_icon', 'svg[aria-label^="Visibility:"]'),
      );
      const visibility = visibilityEl?.getAttribute('aria-label')?.replace('Visibility: ', '') ?? 'Unknown';
      const isPublic = visibility === 'Global';

      // ── Flags ──────────────────────────────────────────────────────────
      const isPromoted = text.includes('Promoted');
      const isMarketing = context.type === 'promoted_post' || context.type === 'suggested_post';
      const shouldCaptureContent = isPublic || isMarketing;

      return {
        id: deriveLinkedInId(article),
        platform: 'linkedin' as const,
        signal_type: 'feed' as const,
        author_handle: authorHandle,
        author_display_name: authorName,
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
        feed_context_actor: context.actor_name,
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

    for (const article of articles) {
      // Filter: must contain a feed post marker
      if (!article.innerText.includes('Feed post')) continue;

      const data = this.extractPost(article);
      if (!data) continue;
      if (this.capturedIds.has(data.id)) continue;
      this.capturedIds.add(data.id);
      this.sendData(data);
    }
  }
}
