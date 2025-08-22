import { BasePayloadTypes } from "../shared";

export interface DomainObjectDataTypes {
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
export interface TabPayloadTypes extends BasePayloadTypes {
    user?: string;
    window_num?: string | number | TabDataTypes;
    tab_num?: string | number | TabDataTypes;
    window: number;
    domains: DomainObjectDataTypes[];
    tab_session_id?: string;
}
