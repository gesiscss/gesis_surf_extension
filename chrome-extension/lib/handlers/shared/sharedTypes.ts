// Shared types for Handlers.

export type InfoType = 'onCreated' | 'onFocusChanged' | 'onRemoved';

/**
 * Base interface for all payload types.
 * Matches common fields across Window, Tab and Domain models.
 */
export type BasePayloadTypes = {
    id?: number;
    start_time?: string;
    closing_time: string;
};
