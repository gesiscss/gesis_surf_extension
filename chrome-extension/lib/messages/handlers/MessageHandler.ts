// import { Runtime } from 'webextension-polyfill';
import { AuthService} from '../../services/authService';
import { readToken } from '@chrome-extension-boilerplate/shared/lib/storages/tokenStorage';
// import ClickEventManager from './click';
// import ScrollEventManager from './scrolls';
import { 
    MessageResponse,
    // AuthSuccessMessage,
    // ExtensionMessage,
    // AuthFailureMessage
} from '../interfaces/types';

export class MessageHandler {
    constructor(
        protected readonly authService: AuthService,
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

    // public async handleMessage(
    //     message: unknown,
    //     sender: Runtime.MessageSender,
    //     sendResponse: (response: MessageResponse) => void
    // ): Promise<boolean> {
    //     console.log('[background] Received message:', message);

    //     if (!this.isValidMessage(message)) {
    //         console.warn('[background] Received invalid message format');
    //         sendResponse({ status: 'error', message: 'Invalid message format' });
    //         return false;
    //     }

    //     const typedMessage = message as ExtensionMessage;

    //     switch (typedMessage.type) {
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

    // private isValidMessage(message: unknown): message is ExtensionMessage {
    //     return (
    //         typeof message === 'object' &&
    //         message !== null &&
    //         'type' in message &&
    //         typeof (message as ExtensionMessage).type === 'string'
    //     );
    // }
}