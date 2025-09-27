import { Runtime } from 'webextension-polyfill';

export interface MessageResponse {
    status: string;
    message: string;
}

export interface BaseMessage {
    type: string;
}

export interface AuthSuccessMessage extends BaseMessage {
    type: 'AUTH_SUCCESS';
    token: string;
}

export interface AuthFailureMessage extends BaseMessage {
    type: 'AUTH_FAILURE';
    error: string;
}

export type ExtensionMessage = AuthSuccessMessage | AuthFailureMessage;
// | ClickEventMessage
// | ScrollEventMessage;