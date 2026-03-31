import { alarms, runtime, storage } from "webextension-polyfill";
import { PrivateModeState } from "./types";

export class PrivateModeService {
    private static readonly ALARM_NAME = 'privatemode';
    private static readonly STORAGE_KEY = 'private';
    private static readonly DURATION_MINUTES = 1;
    private initialized: boolean = false;

    constructor() {
    }

    /**
    * Initialize private mode service
    */
    public async initialize(): Promise<void> {
        if (this.initialized) return;
        console.log('[PrivateModeService] Initializing service');

        // await this.clearPrivateMode();
        this.initializeAlarmListener();
        this.initialized = true;
    }

    private validateState(state: PrivateModeState): boolean {
        return (
            typeof state.mode === 'boolean' && 
            (state.alarm === '' || typeof state.alarm === 'string') &&
            typeof state.remainingTime === 'number'
        );
    }

    /**
    * Initialize alarm listener for private mode expiration
    */
    private initializeAlarmListener(): void {
        console.log('[PrivateModeService] Initializing alarm listener');
        alarms.onAlarm.addListener(async (alarm) => {
            try {
                if (alarm.name === PrivateModeService.ALARM_NAME) {
                    await this.handlePrivateModeExpiration();
                }
            } catch (error) {
                console.error('Error handling alarm:', error);
            }
        });
    }

    /**
    * Handle private mode expiration
    * @returns void
    */
    private async handlePrivateModeExpiration(): Promise<void> {
        try {
            console.log('[PrivateModeService] Private mode expired, disabling private mode');
            await this.clearPrivateMode();

            try {
                await runtime.sendMessage({ type: 'PRIVATE_MODE_EXPIRED' });
                console.log('[PrivateModeService] Sent PRIVATE_MODE_EXPIRED message to other components');
            } catch (messageError) {
                console.log('[PrivateModeService] Error sending PRIVATE_MODE_EXPIRED message:', messageError);
            }
        } catch (error) {
            console.log('[PrivateModeService] Error during private mode expiration handling:', error);
        }
    }

    /**
    * Toggle private mode state
    * @param enable true to enable, false to disable
    * @returns the updated private mode state
    */
    public async togglePrivateMode(enable: boolean): Promise<PrivateModeState> {
        if (!this.initialized) {
            throw new Error('PrivateModeService not initialized');
        }

        return enable ? this.enablePrivateMode() : await this.clearPrivateMode();
    }

    /**
    * Enable private mode with timer for 15 minutes.
    * Sets an alarm to disable private mode after the duration.
    * @return the updated private mode state
    */
    private async enablePrivateMode(): Promise<PrivateModeState> {
        
        try {
            await this.clearPrivateMode();

            const expirationTime = new Date();
            console.log('[PrivateModeService] Current time:', expirationTime);
            expirationTime.setMinutes(expirationTime.getMinutes() + PrivateModeService.DURATION_MINUTES);

            const state: PrivateModeState = {
                mode: true,
                alarm: expirationTime.toISOString(),
                remainingTime: PrivateModeService.DURATION_MINUTES * 60
            };

            console.log('[PrivateModeService] Enabling private mode with state:', state);

            if(!this.validateState(state)) {
                throw new Error('Invalid private mode state');
            }

            await storage.local.set({ [PrivateModeService.STORAGE_KEY]: state });
            await alarms.create(PrivateModeService.ALARM_NAME, {
                delayInMinutes: PrivateModeService.DURATION_MINUTES
            });

            return state;
        } catch (error) {
            console.error('Error enabling private mode:', error);
            throw error;
        }

    }

    /**
    * Clear private mode state and alarms
    */
    private async clearPrivateMode(): Promise<PrivateModeState> {
        try {
        
            const state: PrivateModeState = {
                mode: false,
                alarm: '',
                remainingTime: 0
            };

            if(!this.validateState(state)) {
                throw new Error('Invalid private mode state');
            }

            await storage.local.set({ [PrivateModeService.STORAGE_KEY]: state });
            await alarms.clear(PrivateModeService.ALARM_NAME);

            return state;
        } catch (error) {
            console.error('Error clearing private mode:', error);
            throw error;
        }
    }

    /**
    * Get current private mode state
    */
    public async getPrivateModeState(): Promise<PrivateModeState> {
        try {

            if (!this.initialized) {
                throw new Error('PrivateModeService not initialized');
            }
            
            const defaultState: PrivateModeState = {
                mode: false,
                alarm: '',
                remainingTime: 0
            };

            const result = await storage.local.get(PrivateModeService.STORAGE_KEY);
            const storageDate = result[PrivateModeService.STORAGE_KEY] as PrivateModeState | undefined;

            console.log('[PrivateModeService] Retrieved private mode state from storage:', storageDate);
            console.log('[PrivateModeService] Default private mode state:', defaultState);

            if (!storageDate) {
                return defaultState;
            }

            if(!this.validateState(storageDate)) {
                console.warn('Invalid private mode state found in storage, resetting to default.');
                await this.clearPrivateMode();
                return defaultState;
            }

            return storageDate;
        } catch (error) {
            console.error('Error getting private mode state:', error);
            throw error;
        }

    }

    /**
    * Get remaining time in seconds
    */
    public async getRemainingTime(): Promise<number> {

        try {

            if (!this.initialized) {
                throw new Error('PrivateModeService not initialized');
            }
            
            const state = await this.getPrivateModeState();
            
            if (!state.mode || !state.alarm) {
                return 0;
            }

            const expirationTime = new Date(state.alarm);

            if (!(expirationTime instanceof Date) || isNaN(expirationTime.valueOf())) {
                console.warn('Invalid alarm time format, returning 0 remaining time.');
                await this.clearPrivateMode();
                return 0;
            }

            const currentTime = new Date().getTime();
            const remainingMs = expirationTime.valueOf() - currentTime.valueOf();

            if(remainingMs <= 0) {
                await this.handlePrivateModeExpiration();
                return 0;
            }
    
            return Math.max(0, Math.floor(remainingMs / 1000));
        } catch (error) {
            console.error('Error getting remaining time:', error);
            return 0;
        }
    }
}