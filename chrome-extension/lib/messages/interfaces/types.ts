import { PrivateModeState } from '@root/lib/services/privateModeService/types';
// Message Response Interface
export interface MessageResponse {
    status: MessageStatus;
    message?: string;
    data?: PrivateModeState | number | boolean  | null; 
}

export type MessageStatus = 'success' | 'error';

// Base Message Interface
export interface BaseMessage {
    type: string;
}

// Auth Messages and Types
export interface AuthSuccessMessage extends BaseMessage {
    type: 'AUTH_SUCCESS';
    token: string;
}

export interface AuthFailureMessage extends BaseMessage {
    type: 'AUTH_FAILURE';
    error: string;
}

export type ExtensionMessage = AuthSuccessMessage
    | AuthFailureMessage
    | PrivateModeMessage;
// | ClickEventMessage
// | ScrollEventMessage;

// Private Mode Messages and Types
export type PrivateModeActionType = 'GET_STATE' | 'TOGGLE' | 'GET_TIME';

export interface PrivateModeMessage extends BaseMessage {
    type: 'PRIVATE_MODE';
    action: PrivateModeActionType;
    enable?: boolean;
}