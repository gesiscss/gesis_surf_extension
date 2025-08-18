import { type DBSchema } from 'idb';

export interface Item {
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

export interface DomainItem {
  close_time: string;
    domain_fav_icon: string;
    domain_lastAccessed: string;
    domain_session_id: string;
    domain_title: string;
    domain_url: string;
    start_time: string;
}


export interface DBGesis extends DBSchema {
  winlives: {
    key: string;
    value: Item;
  };
  tabslives: {
    key: number;
    value: Item;
  };
  domainslives: {
    key: number;
    value: DomainItem;
  };
  config: {
    key: number;
    value: Item;
  };
  winclose: {
    key: number;
    value: Item;
  };
}