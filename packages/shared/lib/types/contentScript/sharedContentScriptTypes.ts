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

// Payload for X (Twitter) post events
export interface XPostData {
  id: string;
  tweet_id: string;
  author_handle: string;
  author_display_name: string;
  tweet_text: string;
  tweet_url: string;
  tweet_timestamp: string; // from <time datetime="">
  captured_at: string; // when extractor fired
  replies: number;
  reposts: number;
  likes: number;
  bookmarks: number;
  views: number;
  page_url: string;
  domain_id: string;
}

// Payload for TikTok post events
export interface TikTokPostData {
  id: string;
  video_id: string;
  feed_position: number; // 1-based insertion order within the session
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
  domain_id: string;
  signal_type: 'feed'; // discriminator: video appeared in the feed (DOM insertion)
}

// Payload for TikTok played events — same shape but different signal
export interface TikTokPlayedData {
  id: string;
  video_id: string;
  feed_position: number; // 1-based play order within the session
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
  domain_id: string;
  signal_type: 'played'; // discriminator: video was actually played by the user
}

// Payload for YouTube Shorts events
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
  domain_id: string;
}

// Payload for Instagram post events
export interface InstagramPostData {
  id: string; // post shortcode (e.g. 'DX9zCRllgmV')
  shortcode: string;
  author_handle: string;
  is_verified: boolean;
  caption: string;
  post_url: string;
  post_timestamp: string; // from <time datetime="">
  likes: number;
  comments: number;
  post_type: 'image' | 'carousel' | 'video';
  captured_at: string;
  page_url: string;
  domain_id: string;
}

// Union type for all social post data
export type SocialData = XPostData | TikTokPostData | TikTokPlayedData | YouTubeShortsData | InstagramPostData;

// Social message type identifiers
export type SocialMessageType = 'X_POST' | 'TIKTOK_POST' | 'TIKTOK_PLAYED' | 'YOUTUBE_SHORT' | 'INSTAGRAM_POST';

// Configuration for a remote update wavelet selector, used to determine which DOM elements to observe for changes.
export interface SelectorConfig {
  family: 'llm' | 'social';
  provider: string;
  version: string;
  hostname_patterns: string[];
  selectors: Record<string, string[]>; // key -> fallback list, newest first
  is_active: boolean;
}
