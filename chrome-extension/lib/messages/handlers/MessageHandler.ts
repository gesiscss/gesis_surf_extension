import { Runtime } from 'webextension-polyfill';
import { readToken } from '@chrome-extension-boilerplate/shared/lib/storages/tokenStorage';
import { PrivateModeService, AuthService } from '@root/lib/services';
import { ContentEventHandler } from './handlers/clients/contentEventHandler';
import { apiUrl } from '@root/lib/handlers/shared';

import { 
    MessageResponse,
    PrivateModeMessage,
    ExtensionMessage,
    // AuthSuccessMessage,
    // AuthFailureMessage
} from '../interfaces/types';

export class MessageHandler {
    
    constructor(
        protected readonly authService: AuthService,
        protected readonly privateModeService: PrivateModeService,
    ) {
        this.contentEventHandler = new ContentEventHandler(apiUrl);
    }
    
    /**
     * Handle authentication success messages
     * @param message The incoming message
     * @param sendResponse Function to send response back
     * @returns Promise<boolean>
     */
    public async handleAuthSuccess(
        message: unknown,
        sendResponse: (response: MessageResponse) => void
    ): Promise<boolean> {
        try {
            await readToken();
            await this.authService.checkAuthentication();
            sendResponse({ status: 'success', message: 'Authentication successful.' });
        } catch (error) {
            console.error('[background] Authentication process failed:', error);
            sendResponse({ 
                status: 'error', 
                message: error instanceof Error ? error.message : 'Authentication failed'
            });
        }
        return true;
    }

    /** Handle private mode messages
     * @param message The incoming message
     * @param sendResponse Function to send response back
     * @returns Promise<boolean>
     */
    private async handlePrivateMode(
        message: PrivateModeMessage,
        sendResponse: (response: MessageResponse) => void
    ): Promise<boolean> {
        try {
            switch (message.action) {
                case 'GET_STATE': {   
                    const state = await this.privateModeService.getPrivateModeState();
                    sendResponse({ status: 'success', data: state });
                    break;
                }
                case 'TOGGLE': {
                    if (typeof message.enable !== 'boolean') {
                        throw new Error('Enable parameter is required for TOGGLE action');
                    }
                    const newState = await this.privateModeService.togglePrivateMode(message.enable);
                    sendResponse({ status: 'success', data: newState });
                    break;
                    
                }
                case 'GET_TIME': {
                    const timeState = await this.privateModeService.getRemainingTime();
                    sendResponse({ status: 'success', data: timeState });
                    break;
                }
                default:
                    sendResponse({ status: 'error', message: 'Unknown PRIVATE_MODE action' });
            }
        } catch (error) {
            console.error('[background] Error handling PRIVATE_MODE message:', error);
            sendResponse({ 
                status: 'error', 
                message: error instanceof Error ? error.message : 'Failed to handle PRIVATE_MODE message'
            });
        }
        return true;
    }

    /**
     * Hanlde content event messages (click, scroll, html capture)
     * @param message The incoming message
     * @param sender The message sender
     * @param sendResponse Function to send response back
     * @returns Promise<boolean>
     */
    private async handleContentEvent(
        message: ExtensionMessage,
        sender: Runtime.MessageSender,
        sendResponse: (response: MessageResponse) => void
    ): Promise<boolean> {
        try {
            let eventType: ContentEventType;

            switch (message.type) {
                case 'CLICK_EVENT':
                    eventType = contentEventType.CLICK;
                    break;
                case 'SCROLL_EVENT':
                    eventType = contentEventType.SCROLL;
                    break;
                case 'SCROLL_FINAL':
                    eventType = contentEventType.SCROLL_FINAL;
                    break;
                case 'HTML_CAPTURE':
                    eventType = contentEventType.HTML_CAPTURE;
                    break;
                default:
                    throw new Error('Unknown content event type');
            }

            const eventData = 'data' in message ? message.data : undefined;

            if(!eventData) {
                throw new Error('Event data is missing');
            }

            const result = await this.contentEventHandler.handleContentEvent(
                eventType,
                eventData,
                sender
            );

            sendResponse({
                status: result.status,
                message: result.message
            });
        } catch (error) {
            console.error('[background] Error handling content event message:', error);
            sendResponse({ 
                status: 'error', 
                message: error instanceof Error ? error.message : 'Failed to handle content event message'
            });
        }
        return true;
    }

    /**
     * Handle content event messages
     * @param message The incoming message
     * @param sender The message sender
     * @param sendResponse Function to send response back
     * @returns Promise<boolean>
     */
    public async handleMessage(
        message: unknown,
        sender: Runtime.MessageSender,
        sendResponse: (response: MessageResponse) => void
    ): Promise<boolean> {
        console.log('[background] Received message:', message);

        if (!this.isValidMessage(message)) {
            console.warn('[background] Received invalid message format');
            sendResponse({ status: 'error', message: 'Invalid message format' });
            return false;
        }

        const typedMessage = message as ExtensionMessage;

        try {
            switch (typedMessage.type) {
                case 'PRIVATE_MODE':
                    return this.handlePrivateMode(typedMessage as PrivateModeMessage, sendResponse);
                
                case 'AUTH_SUCCESS':
                    return this.handleAuthSuccess(typedMessage, sendResponse);

                case 'CLICK_EVENT':
                case 'SCROLL_EVENT':
                case 'SCROLL_FINAL':
                case 'HTML_CAPTURE':
                    return this.handleContentEvent(typedMessage, sender, sendResponse);

                default:
                    console.warn('[background] Unknown message type:', typedMessage.type);
                    sendResponse({ status: 'error', message: 'Unknown message type' });
                    return false;
            }
        } catch (error) {
            console.error('[background] Error handling message:', error);
            sendResponse({ 
                status: 'error', 
                message: error instanceof Error ? error.message : 'Failed to handle message'
            });
            return false;
        }
    }

    /**
     * Flush pending content events
     * @returns Promise<void>
     */
    public async flushPendingEvents(): Promise<void> {
        console.log('[`MessageHandler`] Flushing pending content events');
        await this.contentEventHandler.flushPendingEvents();
        console.log('[`MessageHandler`] Finished flushing pending content events');
    }

    /**
     * Returns whether the message is a valid ExtensionMessage
     * @param message The incoming message
     * @returns boolean indicating if the message is a valid ExtensionMessage
     */
    private isValidMessage(message: unknown): message is ExtensionMessage {
        return (
            typeof message === 'object' &&
            message !== null &&
            'type' in message &&
            typeof (message as ExtensionMessage).type === 'string'
        );
    }
}