/**
 * @fileoverview This file contains shared TypeScript type definitions for content script data structures.
 * These types are used to ensure consistent data handling between content scripts and background scripts.
 */

// Payload for scroll metrics
export interface ScrollMetrics {
  scroll_depth_percentage: number;
  max_scroll_depth: number;
  total_scroll_distance: number;
  scroll_events: number;
  document_height: number;
  document_width: number;
  window_height: number;
  window_width: number;
  has_horizontal_scroll: boolean;
  reached_bottom: boolean;
  reading_zone: 'header' | 'upper_content' | 'lower_content' | 'footer';
  engagement?: 'minimal' | 'low' | 'medium' | 'high';
}

// Payload for scroll events
export interface ScrollData {
  scrollTime: Date;
  scrollX: number;
  scrollY: number;
  pageXOffset: number;
  pageYOffset: number;
  scroll_metrics?: ScrollMetrics;
}

// Payload for HTML snapshot
export interface HTMLSnapshot {
  html_content: string;
  meta?: {
    title?: string;
    description?: string;
    favicon_url?: string;
  };
}

// Payload for click events
export interface ClickData {
  click_time: Date;
  click_type: string;
  click_target_element: string;
  click_target_tag: string;
  click_target_class: string;
  click_page_x: number;
  click_page_y: number;
  click_referrer: string;
  click_target_id?: string;
  domain_session_id?: string;
}

// Generic message response structure
export interface MessageResponse {
  status: 'success' | 'error';
  message?: string;
  data?: string;
}

// Generic event result structure
export interface EventResult {
  status: 'success' | 'error' | 'blocked';
  message?: string;
}

// Payload for LLM wavelet events
export interface LLMData {
  llm_provider: 'chatgpt' | 'claude' | 'deepseek' | 'gemini';
  message_type: 'user_question' | 'ai_response';
  message_content: string;
  message_id: string;
  timestamp: string;
  chat_session_id: string;
  url: string;
  page_title: string;
  domain_id: string;
  turn_index: number; // 1-based index of the message in the conversation
}

// ── Unified base interface for all social post events ──────────────────────
// Phase 1: introduced as a common foundation. Existing per-platform interfaces
// extend this so wavelets can gradually migrate to the unified contract.
export interface SocialPostData {
  // Core identity
  id: string;
  platform:
    | 'x'
    | 'tiktok'
    | 'youtube_shorts'
    | 'youtube'
    | 'instagram'
    | 'facebook'
    | 'linkedin'
    | 'reddit'
    | 'twitch'
    | 'threads';
  signal_type?: 'feed' | 'played';

  // Author
  author_handle: string;
  author_display_name?: string;
  is_verified?: boolean;

  // Content (unified vocabulary)
  content_text: string;

  // Engagement
  likes: number;
  comments: number;
  shares?: number;
  favorites?: number;
  bookmarks?: number;
  views?: number;
  reposts?: number;
  replies?: number;

  // Media metadata
  post_type?: 'image' | 'carousel' | 'video' | 'text' | 'external_link';
  video_id?: string;
  shortcode?: string;
  music_id?: string;
  music_name?: string;
  channel_handle?: string;

  // URLs
  permalink: string;

  // Timestamps
  post_timestamp?: string;
  captured_at: string;

  // Context
  page_url: string;
  domain_id: string;
  feed_position?: number;

  // Ad / sponsored content flag
  is_ad?: boolean;

  // LinkedIn feed context (actor who triggered the feed item vs actual author)
  feed_context_type?: string;
  feed_context_actor?: string;
  feed_context_action?: string;

  // LinkedIn group name
  group_name?: string;
}

// Payload for X (Twitter) post events
export interface XPostData extends SocialPostData {
  is_public: boolean;
  is_protected: boolean;
}

// Payload for TikTok post events
export interface TikTokPostData extends SocialPostData {
  feed_position: number;
  music_id: string;
  music_name: string;
  shares: number;
  favorites: number;
  signal_type: 'feed';
}

// Payload for TikTok played events — same shape but different signal
export interface TikTokPlayedData extends SocialPostData {
  feed_position: number;
  music_id: string;
  music_name: string;
  shares: number;
  favorites: number;
  signal_type: 'played';
}

// Payload for YouTube Shorts events
export interface YouTubeShortsData extends SocialPostData {
  channel_handle: string;
}

// Payload for Instagram post events
export interface InstagramPostData extends SocialPostData {
  shortcode: string;
  post_timestamp: string;
  post_type: 'image' | 'carousel' | 'video';
}

// Payload for Reddit post events
export interface RedditPostData extends SocialPostData {
  subreddit: string;
  awards: number;
}

// Payload for Twitch feed events (directory exposure)
export interface TwitchFeedData extends SocialPostData {
  viewer_count: number;
  is_live: boolean;
  game_name: string;
  tags: string[];
  is_verified: boolean;
}

// Payload for Twitch stream events (user entered stream)
export interface TwitchStreamData extends SocialPostData {
  viewer_count: number;
  is_live: boolean;
  game_name: string;
  tags: string[];
  stream_duration?: string;
  is_verified: boolean;
}

// Payload for Threads feed events
export interface ThreadsPostData extends SocialPostData {
  reposts: number;
  replies: number;
}

// Payload for YouTube feed card events
export interface YouTubePostData extends SocialPostData {
  video_id: string;
  channel_handle: string;
}

// Payload for YouTube watch page events
export interface YouTubeWatchData extends SocialPostData {
  video_id: string;
  channel_handle: string;
  signal_type: 'played';
}

// Payload for Facebook feed events
export interface FacebookPostData extends SocialPostData {}

// Payload for LinkedIn feed events
export interface LinkedInPostData extends SocialPostData {
  feed_context_type: string;
  visibility: string;
  is_public: boolean;
}

// Union type for all social post data
export type SocialData =
  | XPostData
  | TikTokPostData
  | TikTokPlayedData
  | YouTubeShortsData
  | YouTubePostData
  | YouTubeWatchData
  | InstagramPostData
  | FacebookPostData
  | LinkedInPostData
  | RedditPostData
  | TwitchFeedData
  | TwitchStreamData
  | ThreadsPostData;

// Social message type identifiers
export type SocialMessageType =
  | 'X_POST'
  | 'TIKTOK_POST'
  | 'TIKTOK_PLAYED'
  | 'YOUTUBE_SHORT'
  | 'YOUTUBE_POST'
  | 'YOUTUBE_WATCH'
  | 'INSTAGRAM_POST'
  | 'FACEBOOK_POST'
  | 'LINKEDIN_POST'
  | 'REDDIT_POST'
  | 'TWITCH_FEED'
  | 'TWITCH_STREAM'
  | 'THREADS_POST';

// Configuration for a remote update wavelet selector, used to determine which DOM elements to observe for changes.
export interface SelectorConfig {
  family: 'llm' | 'social';
  provider: string;
  version: string;
  hostname_patterns: string[];
  selectors: Record<string, string[]>; // key -> fallback list, newest first
  is_active: boolean;
}
