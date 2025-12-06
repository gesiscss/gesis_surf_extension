import { type DBSchema } from 'idb';

/**
 * Represent the window or tab item from google API calls
 * @interface ItemTypes
 */
export interface ItemTypes {
    id: number ;
    start_time: string;
    close_time: string;
    created_at: string;
    window_num: number;
    user: string;
    window_session_id: string;
    tab_num: number;
    window: number;
    global_session?: string;
    tab_session_id?: string;
}

/**
 * Represent the domain entry in the browser with GESIS logic.
 * @interface DomainItemTypes
 */
export interface DomainItemTypes {
    domain_title: string;
    snapshot_html: string;
    domain_status: string;
    domain_fav_icon: string;
    domain_session_id: string;
    start_time: string;
    closing_time: string;
    domain_url: string;
    domain_last_accessed: string;
    category_number: number;
    criteria_classification: string;

}

/**
 * Represents the criteria for a host category.
 */
export interface HostCriteria {
    id: string;
    criteria_classification: string;
    criteria_window: boolean;
    criteria_tab: boolean;
    criteria_domain: boolean;
    criteria_click: boolean;
    criteria_scroll: boolean;
    snapshot_html: boolean;
}

/**
 * Represents a category associated with a host.
 */
export interface HostCategory {
    id: string;
    category_score: number;
    category_parent: string;
    category_label: string;
    category_confidence: number;
    created_at: string;
    criteria: HostCriteria;
}

/**
 * Represents a host entry with its rules and categories.
 * @interface HostItemTypes
 */
export interface HostItemTypes {
    id: string;
    hostname: string;
    created_at: string;
    categories: HostCategory[];
    hosts_version: string;
}

/**
 * Database schema for the GESIS browser extension.
 * Extends IndexedDB schema with custom stores.
 * @interface DBGesisTypes
 */
export interface DBGesisTypes extends DBSchema {
    
    /** Store for active windows */
    winlives: {
        key: string;
        value: ItemTypes;
    };

    /** Store for active tabs */
    tabslives: {
    key: number;
    value: ItemTypes;
    };

    /** Store for domain entries */
    domainslives: {
        key: number;
        value: DomainItemTypes;
    };

    /** Store for configuration settings */
    config: {
        key: number;
        value: ItemTypes;
    };

    /** Store for closed windows */
    winclose: {
        key: number;
        value: ItemTypes;
    };

    /** Store for host live data */
    hostslives: {
        key: string;
        value: HostItemTypes;
    };
}