// Define the types for HTML content scripts

export interface HTMLSnapshot {
    html_content: string;
    meta?: {
        title?: string;
        description?: string;
        favicon_url?: string;
    };
}

