// Handler constants

import { InfoType } from "./sharedTypes";

// API base endpoint
export const apiUrl = import.meta.env.VITE_API_BASE_ENDPOINT;

// InfoType values
export const InfoTypeValues = {
    OnCreated: 'onCreated' as InfoType,
    OnFocusChanged: 'onFocusChanged' as InfoType,
    OnRemoved: 'onRemoved' as InfoType
} as const;
