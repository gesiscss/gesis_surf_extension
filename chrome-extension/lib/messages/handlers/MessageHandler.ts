import { Runtime } from 'webextension-polyfill';
import { AuthService} from '../../services/authService';
import { readToken } from '@chrome-extension-boilerplate/shared/lib/storages/tokenStorage';
import { PrivateModeService } from '@root/lib/services';
// import ClickEventManager from './click';
// import ScrollEventManager from './scrolls';
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
        // private clickEventManager: ClickEventManager,
        // private scrollEventManager: ScrollEventManager
    ) {}

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

    // private async handleClickEvent(
    //     message: ClickEventMessage,
    //     sender: Runtime.MessageSender,
    //     sendResponse: (response: MessageResponse) => void
    // ): Promise<boolean> {
    //     try {
    //         await this.clickEventManager.handleClickEvent(message.data, sender);
    //         sendResponse({ status: 'success', message: 'Click event processed.' });
    //     } catch (error) {
    //         console.error('[background] Error processing click event:', error);
    //         sendResponse({ 
    //             status: 'error', 
    //             message: error instanceof Error ? error.message : 'Failed to process click event'
    //         });
    //     }
    //     return true;
    // }

    // private async handleScrollEvent(
    //     message: ScrollEventMessage,
    //     sender: Runtime.MessageSender,
    //     sendResponse: (response: MessageResponse) => void
    // ): Promise<boolean> {
    //     try {
    //         await this.scrollEventManager.handleScrollEvent(message.data, sender);
    //         sendResponse({ status: 'success', message: 'Scroll event processed.' });
    //     } catch (error) {
    //         console.error('[background] Error processing scroll event:', error);
    //         sendResponse({ 
    //             status: 'error', 
    //             message: error instanceof Error ? error.message : 'Failed to process scroll event'
    //         });
    //     }
    //     return true;
    // }

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
    //         case 'AUTH_SUCCESS':
    //             return this.handleAuthSuccess(typedMessage, sendResponse);
    //         case 'CLICK_EVENT':
    //             return this.handleClickEvent(typedMessage, sender, sendResponse);
    //         case 'SCROLL_EVENT':
    //             return this.handleScrollEvent(typedMessage, sender, sendResponse);
    //         default:
    //             console.warn('[background] Unknown message type:', typedMessage.type);
    //             sendResponse({ status: 'error', message: 'Unknown message type' });
    //             return false;
    //     }
    // }

    private isValidMessage(message: unknown): message is ExtensionMessage {
        return (
            typeof message === 'object' &&
            message !== null &&
            'type' in message &&
            typeof (message as ExtensionMessage).type === 'string'
        );
    }
}