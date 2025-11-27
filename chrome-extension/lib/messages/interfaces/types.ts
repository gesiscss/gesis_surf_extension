/**
 * Message Interfaces and Types for Chrome Extension
 * Handles communication between content scripts and background scripts
 */
import { PrivateModeState } from '@root/lib/services/privateModeService/types';
import { ClickData, ScrollData, HTMLSnapshot } from '@chrome-extension-boilerplate/shared/lib/types/contentScript';

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
    | PrivateModeMessage
    | ClickEventMessage
    | ScrollEventMessage
    | ScrollFinalEventMessage
    | HTMLCaptureMessage;

// Private Mode Messages and Types
export type PrivateModeActionType = 'GET_STATE' | 'TOGGLE' | 'GET_TIME';

export interface PrivateModeMessage extends BaseMessage {
    type: 'PRIVATE_MODE';
    action: PrivateModeActionType;
    enable?: boolean;
}

export interface ClickEventMessage extends BaseMessage {
    type: 'CLICK_EVENT';
    data: ClickData;
}

export interface ScrollEventMessage extends BaseMessage {
    type: 'SCROLL_EVENT';
    data: ScrollData;
}

export interface ScrollFinalEventMessage extends BaseMessage {
    type: 'SCROLL_FINAL';
    data: ScrollData;
}

export interface HTMLCaptureMessage extends BaseMessage {
    type: 'HTML_CAPTURE';
    data: HTMLSnapshot;
}

