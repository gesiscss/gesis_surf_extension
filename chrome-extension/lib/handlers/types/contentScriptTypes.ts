/**
 * @fileoverview Type definitions for content script event payloads and related structures
 * @implements {ClickPayload, ScrollPayload, HTMLPayload, DomainInfo, ContentEventType}
 */

import { ScrollMetrics } from '@chrome-extension-boilerplate/shared/lib/types/contentScript/sharedContentScriptTypes';

// Payload for click events
export interface ClickPayload {
  click_time: Date;
  click_type: string;
  click_target_element: string;
  click_target_tag: string;
  click_target_class: string;
  click_page_x: number;
  click_page_y: number;
  click_referrer: string;
  domain_id: string;
  domain_session_id: string;
  click_target_id?: string;
}

// Payload for scroll events
export interface ScrollPayload {
  scroll_time: string;
  scroll_x: number;
  scroll_y: number;
  page_x_offset: number;
  page_y_offset: number;
  scroll_metrics?: ScrollMetrics;
  domain_id: string;
  domain_session_id: string;
  is_final?: boolean;
}

// Metadata structure for HTML captures
interface MetaData {
  description?: string;
  fav_icon?: string;
  title?: string;
}

// Payload for HTML capture events
export interface HTMLPayload {
  snapshot_html: string;
  meta?: MetaData;
}

// Domain information structure
export interface DomainInfo {
  id: string;
  domain: string;
  domain_url?: string;
  created_at: string;
  updated_at?: string;
  is_active?: boolean;
}

// Content event types
export enum ContentEventType {
  CLICK = 'CLICK_EVENT',
  SCROLL = 'SCROLL_EVENT',
  SCROLL_FINAL = 'SCROLL_FINAL',
  HTML_CAPTURE = 'HTML_CAPTURE',
}
