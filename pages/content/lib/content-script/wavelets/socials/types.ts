export interface XPostData {
    id: string;
    tweet_id: string;
    author_handle: string;
    author_display_name: string;
    tweet_text: string;
    tweet_url: string;
    tweet_timestamp: string;    // from <time datetime="">
    captured_at: string;        // when extractor fired
    replies: number;
    reposts: number;
    likes: number;
    bookmarks: number;
    views: number;
    page_url: string;
    domain_session_id: string;
}

export interface TikTokPostData {
    id: string;
    video_id: string;
    feed_position: number;  // 1-based insertion order within the session
    author_handle: string;
    author_display_name: string;
    is_verified: boolean;
    caption: string;
    video_url: string;
    music_id: string;
    music_name: string;
    likes: number;
    comments: number;
    shares: number;
    favorites: number;
    captured_at: string;
    page_url: string;
    domain_session_id: string;
}

export interface YouTubeShortsData {
    id: string;
    video_id: string;
    channel_handle: string;
    title: string;
    likes: number;
    comments: number;
    video_url: string;
    captured_at: string;
    page_url: string;
    domain_session_id: string;
}