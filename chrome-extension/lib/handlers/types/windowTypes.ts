// Types for window data and payload

export interface WindowDataTypes {
    alwaysOnTop: boolean;
    focused: boolean;
    height: number | undefined;
    id: number | undefined;
    incognito: boolean | undefined;
    left: number | undefined;
    state: string | undefined;
    top: number;
    type: string | undefined;
    width: number | undefined;
}
export interface PayloadTypes {
    id?: number;
    start_time: string;
    closing_time: string;
    window_num: string | number |WindowDataTypes | undefined;
    window_session_id: string | number | WindowDataTypes;
    global_session?: string | number | undefined;
}


export enum InfoType {
    OnCreated = 'onCreated',
    OnFocuseChanged = 'onFocusChanged',
    OnRemoved = 'onRemoved'
}