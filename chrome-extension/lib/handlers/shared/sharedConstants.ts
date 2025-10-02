// Handler constants

import { InfoType } from "./sharedTypes";
import { API_CONFIG } from "@chrome-extension-boilerplate/hmr/lib/constant";

// API base endpoint
export const apiUrl = API_CONFIG.STG_URL;

// InfoType values
export const InfoTypeValues = {
    OnCreated: 'onCreated' as InfoType,
    OnFocusChanged: 'onFocusChanged' as InfoType,
    OnBlurred: 'onBlurred' as InfoType,
    OnRemoved: 'onRemoved' as InfoType
} as const;
