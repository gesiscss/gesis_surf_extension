
export type InfoType = 'onCreated' | 'onFocused' | 'onRemoved';

export interface DomainDataTypes {
    id: number;
    closing_time: string;
    domain_fav_icon: string;
    domain_lastAccessed: string;
    domain_session_id: string;
    domain_title: string;
    domain_url: string;
    start_time: string;
}

export interface TabDataTypes {
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
export interface PayloadTypes {
    id?: number;
    start_time: string;
    closing_time: string;
    window_num: string | number | TabDataTypes;
    tab_num: string | number | TabDataTypes;
    window: number;
    domains: DomainDataTypes[];
    tab_session_id?: string;
    user?: string;
}
