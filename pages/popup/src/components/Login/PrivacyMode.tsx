/**
 * Service to handle Private Mode communication with background script
 */
import { runtime } from 'webextension-polyfill';

export interface PrivateModeToggleOptions {
    enabled: boolean;
    duration?: number; // Duration in milliseconds
}

/**
 * Toggle private mode and communicate with background script
 * @param enabled Whether to enable or disable private mode
 * @param duration Duration in milliseconds (default: 15 minutes)
 * @returns Promise<boolean> Success status
 */
export async function togglePrivateMode(
    enabled: boolean, 
    duration: number = 15 * 60 * 1000
): Promise<boolean> {
    try {
        console.log(`[PrivateMode] ${enabled ? 'Enabling' : 'Disabling'} private mode`);
        
        const response = await runtime.sendMessage({
            type: 'PRIVATE_MODE',
            action: 'TOGGLE',  // Fixed: Added action field
            enable: enabled     // Fixed: Changed from 'enabled' to 'enable'
        });

        console.log('[PrivateMode in Popup] Received response from background:', response);
        console.log('[PrivateMode in Popup] Response status:', response?.status);
        console.log('[PrivateMode in Popup] Response message:', response?.data);

        if (response?.status === 'success') {
            console.log(`[PrivateMode] Successfully ${enabled ? 'enabled' : 'disabled'}`);
            return true;
        } else {
            console.error('[PrivateMode] Background script returned error:', response?.message);
            return false;
        }
    } catch (error) {
        console.error('[PrivateMode] Error communicating with background:', error);
        return false;
    }
}

/**
 * Get current private mode status from background
 * @returns Promise<boolean> Whether private mode is currently enabled
 */
export async function getPrivateModeStatus(): Promise<boolean> {
    try {
        console.log('[PrivateMode] Getting current private mode status');
        const response = await runtime.sendMessage({
            type: 'PRIVATE_MODE',
            action: 'GET_STATE'
        });
        return response?.data?.mode || false;
    } catch (error) {
        console.error('[PrivateMode] Error getting status:', error);
        return false;
    }
}

export async function getRemainingTime(): Promise<number> {
    try {
        console.log('[PrivateMode] Getting remaining time for private mode');
        const response = await runtime.sendMessage({
            type: 'PRIVATE_MODE',
            action: 'GET_TIME'
        });
        return response?.data || 0;
    } catch (error) {
        console.error('[PrivateMode] Error getting remaining time:', error);
        return 0;
    }
}