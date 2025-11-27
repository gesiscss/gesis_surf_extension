/**
 * @fileoverview This file contains shared TypeScript type definitions for content script data structures.
 * These types are used to ensure consistent data handling between content scripts and background scripts.
 */

// Payload for click events
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
    status: 'success' | 'error';
    message?: string;
}
