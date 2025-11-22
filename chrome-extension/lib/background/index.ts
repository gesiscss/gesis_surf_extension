import { runtime, Runtime } from 'webextension-polyfill';
import { AuthService} from '../services';
import { API_CONFIG } from '@chrome-extension-boilerplate/hmr/lib/constant';
import { MessageResponse } from '../messages/interfaces';

console.log('[background] Background script loaded');

//  Starting Services
const authService = new AuthService(API_CONFIG.STG_URL);
const messageHandler = authService.getMessageHandler();


//  Listen for startup events
runtime.onStartup.addListener(async() => {
    console.log('[background] onStartup');
    await authService.checkAuthentication();
});

//  Listen for Installation or Update events
runtime.onInstalled.addListener(async(details: Runtime.OnInstalledDetailsType) =>{
    console.log('[background] onInstalled or onUpdated', details);
    await authService.checkAuthentication();
});

// Listen for incoming messages
runtime.onMessage.addListener((
    message: unknown,
    sender: Runtime.MessageSender,
    sendResponse: (response: MessageResponse) => void
    ): true => {
        messageHandler.handleMessage(message, sender, sendResponse);
        return true;
    });

// Flush pending messages before unloading
runtime.onSuspend.addListener(() => {
    console.log('[background] onSuspend - flushing pending messages if any');
    messageHandler.flushPendingEvents().catch((error) => {
        console.error('[background] Error flushing pending events on suspend:', error);
    });
});

// Flush on unload
if (typeof self !== 'undefined') {
    self.addEventListener('unload', () => {
        console.log('[background] unload event - flushing pending messages if any');
        messageHandler.flushPendingEvents().catch((error) => {
            console.error('[background] Error flushing pending events on unload:', error);
        });
    });
}
console.log('[background] Background script initialization complete');