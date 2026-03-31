
export interface Wave {
    id: string;
    start_date: string;
    end_date: string;
    created_at: string;
    wave_status: string;
    wave_type: string;
    wave_number: string;
    client_id: string;
}

export interface Privacy {
    id: string;
    privacy_mode: boolean;
    privacy_start_time: string;
    privacy_end_time: string;
}

export interface Extension {
    id: string;
    extension_version: string;
    extension_installed_at: string;
    extension_updated_at: string;
    extension_browser: string;
    extension_data_collection: boolean;
    host_version: string;
}

export interface AuthResponse {
    user_id: string;
    waves: Wave[];
    privacy: Privacy | null;
    extension: Extension | null;
}

export class ApiError extends Error {
    constructor(
        public status: number,
        public statusText: string,
        message: string = 'API Error'
    ) {
        super(message);
        this.name = 'ApiError';
    }
}