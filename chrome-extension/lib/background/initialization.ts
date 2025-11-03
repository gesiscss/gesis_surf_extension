import { Runtime } from 'webextension-polyfill';
import { BackgroundServices } from './Background';

/**
 * Handle startup tasks in the background script
 * @return Promise<void>
 */
export async function handleStartup(): Promise<void> {
    try {
        console.log('[background] Starting initialization...');
        await BackgroundServices.initialize();
        await BackgroundServices.checkAuthentication();
        console.log('[background] Initialization completed');
    } catch (error) {
        console.error('[background] Startup failed:', error);
        throw error;
    }
}

/**
 * Handle installation or update tasks in the background script
 * @param details Runtime.OnInstalledDetailsType - installation details
 * @return Promise<void>
 */
export async function handleInstallation(details: Runtime.OnInstalledDetailsType): Promise<void> {
    try {
        console.log('[background] Handling installation/update:', details.reason);
        await handleStartup();
    } catch (error) {
        console.error('[background] Installation handling failed:', error);
        throw error;
    }
}