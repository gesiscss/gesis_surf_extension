import { BasePayloadTypes } from "../shared";

export interface DomainResponseTypes {
    id: number;
    user: number;
    start_time: string;
    closing_time: string;
    domain_title: string;
    domain_fav_icon: string;
    domain_last_accessed: string;
    domain_session_id: string;
    domain_url: string;
}

export interface DomainPayloadTypes extends BasePayloadTypes{
    domain_fav_icon: string;
    domain_last_accessed?: string;
    domain_session_id?: string;
    domain_title: string;
    domain_url: string;
}
export interface DomainDataTypes {
    id: number;
    url: string;
    title: string;
    favIconUrl: string;
    lastAccessed: number;
    status: string;
    windowId: number;

}