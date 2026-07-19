/**
 * @fileoverview This file defines the types for domain-related data structures used in the extension.
 * It includes types for domain responses, payloads, and data received from the browser API.
 * These types ensure consistent data handling across the DomainHandler and related services.
 */
import { BasePayloadTypes } from '../shared';

// Response from the backend API when querying/creating domains
export interface DomainResponseTypes {
  id: number;
  user: number;
  start_time: string;
  closing_time: string;
  domain_title: string;
  domain_fav_icon: string;
  domain_last_accessed: string;
  domain_session_id: string;
  domain_url: string;
}

// Payload sent to the backend API for domain create/update.
export interface DomainPayloadTypes extends BasePayloadTypes {
  domain_fav_icon: string;
  domain_last_accessed?: string;
  domain_session_id?: string;
  domain_title: string;
  domain_url: string;
  criteria_classification?: string;
}

// Raw domain data from the browser tab
export interface DomainDataTypes {
  id: number;
  url: string;
  title: string;
  favIconUrl: string;
  lastAccessed: number;
  status: string;
  windowId: number;
}
