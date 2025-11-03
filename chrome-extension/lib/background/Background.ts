import { runtime } from 'webextension-polyfill';
import { AuthService, PrivateModeService } from '../services';
import { API_CONFIG } from '@chrome-extension-boilerplate/hmr/lib/constant';
import { MessageHandler } from '../messages/handlers/MessageHandler';
import { MessageResponse } from '../messages/interfaces';
import { ServiceContainer } from './types';

export class BackgroundServices {

    private static instance: ServiceContainer | null = null;

    private constructor() {}

    /**
     * Initialize all background services
     * @return Promise<ServiceContainer>
     */
    public static async initialize(): Promise<ServiceContainer> {
        if (!this.instance) {
            try {
                console.log('[background] Initializing services...');
                
                // Initialize core services
                const authService = new AuthService(API_CONFIG.STG_URL);
                const privateModeService = new PrivateModeService();
                await privateModeService.initialize();

                // Initialize message handler for wavelets and private mode
                const messageHandler = new MessageHandler(
                    authService,
                    privateModeService
                );

                this.instance = {
                    authService,
                    privateModeService,
                    messageHandler
                };

                // Set up message listener starting
                this.setupMessageListener();

                console.log('[background] Services initialized successfully');
            } catch (error) {
                console.error('[background] Service initialization failed:', error);
                throw error;
            }
        }

        return this.instance;
    }

    /**
     * Initialize and get the service container
     * @returns ServiceContainer
     */
    public static getServices(): ServiceContainer {
        if (!this.instance) {
            throw new Error('Services not initialized. Call initialize() first.');
        }
        return this.instance;
    }

    /**
     * Set up message listener
     * @return void
     */
    private static setupMessageListener(): void {
        if (!this.instance) return;

        runtime.onMessage.addListener(
            (
                message,
                sender,
                sendResponse: (response: MessageResponse) => void
            ) => {
                console.log('[background] onMessage', message);
                void this.instance?.messageHandler.handleMessage(
                    message,
                    sender,
                    sendResponse
                );
                return true;
            }
        );
    }

    /**
     * Handle authentication check
     */
    public static async checkAuthentication(): Promise<void> {
        if (!this.instance) {
            throw new Error('Services not initialized');
        }
        await this.instance.authService.checkAuthentication();
    }

    /**
     * Reset services (useful for testing or reinitialization)
     */
    public static reset(): void {
        this.instance = null;
    }
}