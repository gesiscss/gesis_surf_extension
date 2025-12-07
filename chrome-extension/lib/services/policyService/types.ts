/**
 * @fileoverview Types for the policy service payload.
 * @implements {PolicyPayload}
 */

import { DomainPayloadTypes } from "@root/lib/handlers/types/domainTypes";

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