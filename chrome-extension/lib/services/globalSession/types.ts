// Global session types.
export interface GlobalSessionTypes {
    id?: number;
    global_session_id: string;
    start_time: string;
    closing_time?: string;
}

// Session types.
export type SessionType = 'window' | 'tab' | 'domain';