import { EventManager } from "@root/lib/events";
import { GlobalSessionService } from "../globalSession";
import { API_CONFIG } from "@chrome-extension-boilerplate/hmr/lib/constant";
import { HeartbeatService } from "../heartBeatService";
import { PrivateModeService } from "../privateModeService";
import { MessageHandler } from "@root/lib/messages";
/**
 * Class to manage the authentication service.
 * Handles the authentication of the user.
 */
export class AuthService {
    isAuthenticated: boolean;
    apiEndpoint: string;
    globalSessionService: GlobalSessionService;
    eventManager: EventManager;
    heartbeatService: HeartbeatService;
    privateModeService: PrivateModeService;
    messageHandler: MessageHandler;

    constructor(apiEndpoint: string) {
        this.isAuthenticated = false;
        this.apiEndpoint = apiEndpoint;
        this.globalSessionService = new GlobalSessionService(apiEndpoint);
        this.eventManager = new EventManager();
        this.heartbeatService = new HeartbeatService();
        this.privateModeService = new PrivateModeService();
        this.messageHandler = new MessageHandler(this, this.privateModeService);
    }

    /**
     * Getter for MessageHandler instance.
     * @returns MessageHandler instance
     */
    getMessageHandler(): MessageHandler {
        return this.messageHandler;
    }

    /**
     * Function to initialize services.
     * Initializes the services required for the extension.
     */
    async initializeServices() {
        console.log('[background] Initializing services');
        try{

            await this.globalSessionService.createGlobalSession();
            await this.eventManager.startListeners();

            await Promise.all([
                this.heartbeatService.startHeartbeat(),
                this.privateModeService.initialize()
            ]);

            await this.heartbeatService.startAlarmAll();

            console.log('[background] Services initialized successfully');

        } catch (error) {
            console.error('[background] Error initializing services:', error);
        }
    }

    /**
     * 
     * @param token The token to retrive user information
     * @returns The boolean value of the user authentication status
     */
    async validateToken(token: string): Promise<boolean> {
        try {
            const response = await fetch(`${API_CONFIG.STG_URL}${API_CONFIG.ENDPOINTS.USER_ME}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Token ${token}`,
                },
            });
            console.log('Token validation response:', response);
            if (response.ok) {
                return true;
            } else {
                console.warn('Token invalid:', response.status, response.statusText);
                return false;
            }
        } catch (error) {
            console.error('Error validating token:', error);
            return false;
        }
    }

    /**
     * Function to check if the user is authenticated.
     * Checks if the user is authenticated by checking the token.
     */
    async checkAuthentication() {

        try {
            const token = (await chrome.storage.local.get('token')).token;

            if (token) {
                const isValid = await this.validateToken(token);
                if (isValid) {
                    console.log('[background AuthService] User is authenticated');
                    this.isAuthenticated = true;
                    await this.initializeServices();
                } else {
                    console.log('[background AuthService] User is not authenticated');
                    await chrome.storage.local.remove('token');
                    this.isAuthenticated = false;

                }
            } else {
                console.log('[background AuthService] User is not authenticated');
                this.isAuthenticated = false;
            }
        } catch (error) {
            console.error('[background AuthService] Error checking authentication:', error);
            this.isAuthenticated = false;
        }
    }
}