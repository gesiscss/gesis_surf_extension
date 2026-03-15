import { YouTubeShortsData } from './types';
import { BaseSocialWavelet, SocialPostData } from './BaseSocialWavelet';

function parseLikesFromAriaLabel(label: string): number {
    // "46,278 likes" or "46k likes"
    const match = label.match(/([\d,]+)\s+likes/i);
    return match ? parseInt(match[1].replace(/,/g, ''), 10) : 0;
}

function parseCommentsFromAriaLabel(label: string): number {
    // "View 1,950 comments"
    const match = label.match(/([\d,]+)\s+comments/i);
    return match ? parseInt(match[1].replace(/,/g, ''), 10) : 0;
}

export class YouTubeShortsWavelet extends BaseSocialWavelet {
    protected readonly messageType = 'YOUTUBE_SHORT';
    protected readonly label = '▶[YTShorts]';

    isSite(): boolean {
        // Covers any youtube.com page — path check is done in extractCurrent()
        return window.location.hostname.includes('youtube.com');
    }

    extractPost(overlay: HTMLElement): (YouTubeShortsData & SocialPostData) | null {
        try {
            // Video ID comes from the URL (accurate after yt-navigate-finish)
            const videoId = window.location.pathname.split('/shorts/')[1]?.split('/')[0];
            if (!videoId) return null;

            // Channel handle from the channel link inside the overlay
            // href format: "/@handle/shorts"
            const handleLink = overlay.querySelector<HTMLAnchorElement>(
                'yt-reel-channel-bar-view-model .yt-core-attributed-string a'
            );
            const handleHref = handleLink?.getAttribute('href') ?? '';
            const channelHandle = handleHref.split('/').filter(Boolean)[0] ?? ''; // "@handle"

            // Title / caption from the shorts title element
            const title = overlay.querySelector('yt-shorts-video-title-view-model h2')
                ?.textContent?.trim().substring(0, 500) ?? '';

            // Likes: aria-label = "46,278 likes"
            const likeLabel = overlay
                .querySelector('like-button-view-model button[aria-label]')
                ?.getAttribute('aria-label') ?? '';

            // Comments: aria-label = "View 1,950 comments"
            const commentLabel = overlay
                .querySelector('button[aria-label*="comment" i]')
                ?.getAttribute('aria-label') ?? '';

            return {
                id: videoId,
                video_id: videoId,
                channel_handle: channelHandle,
                title,
                likes: parseLikesFromAriaLabel(likeLabel),
                comments: parseCommentsFromAriaLabel(commentLabel),
                video_url: `https://www.youtube.com/shorts/${videoId}`,
                captured_at: new Date().toISOString(),
                page_url: window.location.href,
                domain_session_id: '',
            };
        } catch {
            return null;
        }
    }

    // Not used — YouTube Shorts uses yt-navigate-finish instead of MutationObserver
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    protected processAddedNode(): void {}

    private extractCurrent(): void {
        if (!window.location.pathname.startsWith('/shorts/')) return;

        const videoId = window.location.pathname.split('/shorts/')[1]?.split('/')[0];
        if (!videoId || this.capturedIds.has(videoId)) return;

        // Small delay to let YouTube update the active overlay's DOM after navigation
        setTimeout(() => {
            const overlay = document.querySelector<HTMLElement>('ytd-reel-player-overlay-renderer');
            if (!overlay) return;

            const data = this.extractPost(overlay);
            if (!data) return;
            if (this.capturedIds.has(data.video_id)) return;
            this.capturedIds.add(data.video_id);
            this.sendData(data);
        }, 400);
    }

    // Override base initialize() — uses yt-navigate-finish instead of MutationObserver
    initialize(): void {
        if (!this.isSite()) return;
        console.log(`[${this.label}] Initializing`);

        // yt-navigate-finish fires on every SPA navigation (swipe to next short, or any YT nav)
        window.addEventListener('yt-navigate-finish', () => this.extractCurrent());

        // Handle direct landing on a /shorts/ URL
        if (window.location.pathname.startsWith('/shorts/')) {
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => this.extractCurrent());
            } else {
                this.extractCurrent();
            }
        }
    }
}
