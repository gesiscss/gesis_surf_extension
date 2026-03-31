// Handler constants

import { InfoType } from "./sharedTypes";
import { API_CONFIG } from "@chrome-extension-boilerplate/hmr/lib/constant";

// API base endpoint
export const apiUrl = import.meta.env?.VITE_API_URL || API_CONFIG.BASE_URL;

// Current environment
export const currentEnvironment = import.meta.env?.VITE_ENVIRONMENT || 'staging';

if (import.meta.env?.DEV) {
    console.log(`[API Config] API URL: ${apiUrl}, Environment: ${currentEnvironment}`);
}

// InfoType values
export const InfoTypeValues = {
    OnCreated: 'onCreated' as InfoType,
    OnFocusChanged: 'onFocusChanged' as InfoType,
    OnBlurred: 'onBlurred' as InfoType,
    OnRemoved: 'onRemoved' as InfoType
} as const;
