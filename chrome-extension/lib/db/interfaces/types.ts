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
}