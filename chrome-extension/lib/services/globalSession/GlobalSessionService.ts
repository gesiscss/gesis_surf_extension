import { DatabaseService } from '../../db';
import { v4 as uuidv4 } from 'uuid';
import { GlobalSessionTypes, SessionType } from './types';
import { readToken } from '@chrome-extension-boilerplate/shared/lib/storages/tokenStorage';
// import { apiUrl } from '@root/lib/handlers/shared';


class GlobalSessionService {
    dbService: DatabaseService;
    private apiUrl: string;
    private lastCreatedSessionId: string | null = null;
    private sessionBeingClosed: string | null = null;

    /**
     * Creates a new GlobalSessionService instance.
     * @param apiUrl The URL of the API.
    */
    constructor( apiUrl: string) {
        this.dbService = new DatabaseService();
        this.apiUrl = apiUrl;
    }

    /**
     * Build the global session + id
     * @param id_session either window, tab or domain session id
     * @return the global session id plus the id session
    */
    public async getGlobalSessionId(id_session: number, type: SessionType): Promise<string> {
        const global_session = await this.getFromLocalStorage();

        if (!global_session?.global_session_id) {
            throw new Error('Global session is undefined');
        }

        const suffixMap: Record<SessionType, string> = {
            window: 'windowId',
            tab: 'tabId',
            domain: 'domainId'
        };

        const suffix = suffixMap[type];

        return `${global_session.global_session_id}-${suffix}-${id_session}`;
    }

    /**
     * Static method that generates a unique identifier for a global session.
     * @returns A unique identifier for a global session.
    */
    static generateGlobalSessionId(): string {
        return `global-session-${uuidv4()}`;
    }

    /**
     * Static method that generates payload for a global session.
     * @param global_session_id The unique identifier for the global session.
     * @param start_time The time the global session was started.
     * @param closing_time The time the global session was closed (optional).
     * @returns The payload for the global session.
     * */
    static buildGlobalSessionPayload(
        global_session_id: string,
        start_time: string,
        closing_time?: string
    ): GlobalSessionTypes {
        return {
            global_session_id,
            start_time,
            closing_time
        };
    }

    /**
     * Save session to local storage
     * @param globalSession The global session to save.
     * @returns The global session saved.
     */
    private saveToLocalStorage(globalSession: GlobalSessionTypes): Promise<void> {
        return new Promise((resolve) => {
            chrome.storage.local.set({ globalSession: globalSession }, resolve);
        });
    }

    /**
     * Get session from local storage
     * @returns The global session saved.
     */
    public getFromLocalStorage(): Promise<GlobalSessionTypes | null> {
        return new Promise((resolve) => {
            chrome.storage.local.get('globalSession', (result) => {
                resolve(result.globalSession || null);
            });
        });
    }

    /**
    * Closes a global session.
    * @param global_session The unique identifier for the global session.
    * @returns The global session closed.
    */
    public async closeGlobalSession(
        global_session: GlobalSessionTypes
    ): Promise<GlobalSessionTypes> {
        try {
            // Follow the session being closed
            this.sessionBeingClosed = global_session.global_session_id;

            const token = await readToken();
            const response = await fetch(`${this.apiUrl}/globalsession/global-session/${global_session.id}/`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Token ${token}`
                },
                body: JSON.stringify({ close_time: new Date().toISOString() }),
            });

            if (response.status === 404) {
                console.warn('Global session not found:', global_session);
                return global_session;
            }

            if (!response.ok) {
                throw new Error(`Failed to close global session: ${response.statusText}`);
            }

            const updatedSession: GlobalSessionTypes = await response.json();
            console.log('Closed global session:', updatedSession);
            await this.saveToLocalStorage(updatedSession);

            return updatedSession;

        } catch (error) {
            console.error('Failed to close global session:', error);
            return global_session;
        } finally {
            // Clear the session being closed
            this.sessionBeingClosed = null;
        }
    }

    /**
     * Creates a new Global Session.
     * @returns The global session created.
     */
    public async createGlobalSession(
    ): Promise<GlobalSessionTypes> {
        try {

            const newSessionId = GlobalSessionService.generateGlobalSessionId();
            console.log('New global session ID generated:', newSessionId);
            this.lastCreatedSessionId = newSessionId;

            // Close existing global session
            const existingSession = await this.getFromLocalStorage();

            if (existingSession && !existingSession.closing_time) {
                await this.closeGlobalSession(existingSession);
            }

            // Build new global session
            const startTime = new Date().toISOString();
            const payload = GlobalSessionService.buildGlobalSessionPayload(
                newSessionId,
                startTime
            );

            // Create Token
            const token = await readToken();
            console.log('Creating new global session with ID:', newSessionId);
            console.log('Using API URL:', this.apiUrl);
            console.log('Using Token:', token);

            const response = await fetch(`${this.apiUrl}/globalsession/global-session/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Token ${token}`
                },
                body: JSON.stringify(payload),
            });

            console.log('Global Session Response status creation:', response.status);
            // console.log('Response body:', await response.json());

            if (!response.ok) {
                throw new Error(`Failed to create global session: ${response.statusText}`);
            }

            const createdSession: GlobalSessionTypes = await response.json();
            console.log('Created global session:', createdSession);
            await this.saveToLocalStorage(createdSession);
            return createdSession;

        } catch (error) {
            console.error('Failed to create global session:', error);
            throw error;
        }
    }
    
    public async getLatestActiveSession(): Promise<GlobalSessionTypes | null> {
        const session = await this.getFromLocalStorage();

        // Check if the session is currently being closed
        const isSessionBeingClosed = session &&
                                    this.sessionBeingClosed &&
                                    session.global_session_id === this.sessionBeingClosed;
        
        // Check if the session is active and not being closed
        if (session && !session.closing_time && !isSessionBeingClosed && 
            (!this.lastCreatedSessionId || session.global_session_id === this.lastCreatedSessionId)) {
            return session;
        }
        return null;
    }
}

export default GlobalSessionService;