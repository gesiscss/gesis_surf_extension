/**
 * @fileoverview Types for the policy service payload.
 * @implements {PolicyPayload}
 */

import { DomainPayloadTypes } from '@root/lib/handlers/types/domainTypes';

/**
 * The structure of the policy payload sent to the backend.
 */
export interface PolicyPayload {
  start_time: Date;
  closing_time: Date;
  tab_num: number;
  window_num: number;
  domains: DomainPayloadTypes[];
}

/**
 * Classification types for policy decisions.
 */
export type PolicyClassification = 'full_allow' | 'only_host' | 'full_deny' | 'private' | 'default';

/**
 * Event kinds for content-level policy decisions.
 */
export type ContentEventKind = 'click' | 'scroll' | 'html';

/**
 * The structure of the content policy decision returned by the service.
 */
export interface ContentPolicyDecision {
  action: 'allow' | 'block' | 'mask';
  reason?: string;
  maskValue?: string;
}
