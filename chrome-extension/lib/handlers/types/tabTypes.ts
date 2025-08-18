export interface DomainData {
    id: number;
    close_time: string;
    domain_fav_icon: string;
    domain_lastAccessed: string;
    domain_session_id: string;
    domain_title: string;
    domain_url: string;
    start_time: string;
}

export interface Payload {
    id?: number;
    start_time: string;
    close_time: string;
    window_num: string | number | TabData;
    tab_num: string | number | TabData;
    window: number;
    domains: DomainData[];
    tab_session_id?: string;
    user?: string;
}

export interface TabData {
    id: number;
    windowId: number;
    active: boolean;
    url: string;
    title: string;
    favIconUrl: string;
    status: string;
    lastAccessed: number;
    incognito: boolean;
    pinned: boolean;
}