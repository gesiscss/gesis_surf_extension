// Types for Window data and Payload extension.

import { BasePayloadTypes } from '../shared';

// Window Data Types

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

export interface WindowPayloadTypes extends BasePayloadTypes {
    window_num: string | number | WindowDataTypes | undefined;
    window_session_id: string | number | WindowDataTypes;
    global_session?: string | number | undefined;
}
