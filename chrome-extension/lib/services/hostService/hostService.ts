/**
 * @fileoverview Service for managing host data synchronization with remote API for blocklist/allowlist.
 * Handles version checking, data fetching, and local database updates.
 * @implements {HostService}
 */
import { storage } from 'webextension-polyfill';
import { API_CONFIG } from '@chrome-extension-boilerplate/hmr/lib/constant';
import { readToken } from '@chrome-extension-boilerplate/shared/lib/storages/tokenStorage';
import { DatabaseService, HostItemTypes } from '@root/lib/db';

const HOST_VERSION_KEY = 'host_version';
const MAX_ATTEMPTS = 8;
const MAX_DELAY = 30000;

// Service to manage host data synchronization
export class HostService {
    constructor(    
        private readonly dbService = new DatabaseService()
    ) {}

    /**
     *  Check remote host version and sync local database if needed
     * @returns Promise<boolean> True if sync occurred, false otherwise
     */
    async checkAndSyncVersion(): Promise<boolean> {
        const remoteVersion = await this.fetchRemoteVersion();
        if (!remoteVersion) return false;

        const local = (await storage.local.get(HOST_VERSION_KEY))?.[HOST_VERSION_KEY] as string | undefined;
        const hasHosts = await this.dbService.count('hostslives');
        const hasAnyHosts = typeof hasHosts === 'number' && hasHosts > 0;
        

        if (!hasAnyHosts || local !== remoteVersion) {
            const hosts = await this.fetchHostsFromApi();
            if (hosts.length) {
                await this.syncHosts(hosts);
                await storage.local.set({ [HOST_VERSION_KEY]: remoteVersion });
            }
            return true;
        }
        return false;
    }

    /** Fetch the remote host version from the API
     * @returns Promise<string | null> The remote version or null if fetch fails
     */
    private async fetchRemoteVersion(): Promise<string | null> {
        const token = await readToken();
        if (!token) return null;

        try {
            const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.USER_ME}`, {
                method: 'GET',
                headers: {
                    Authorization: `Token ${token}`,
                    'Content-Type': 'application/json',
                },
            });
            
            if (!response.ok) return null;
            const data = await response.json();
            return data.extension?.host_version ?? null;
        } catch (error) {
            console.error('[HostService] Error fetching version:', error);
            return null;
        }
    }

    /** Fetch the remote hosts from the API
     * @returns Promise<HostItemTypes[]> The list of hosts or empty array if fetch fails
     */
    private async fetchHostsFromApi(): Promise<HostItemTypes[]> {
        const token = await readToken();
        if (!token) return [];
        try {
            const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.HOST}async_hosts/`, {
                method: 'GET',
                headers: {
                    'Authorization': `Token ${token}`,
                    'Content-Type': 'application/json',
            },
        });

        if (!response.ok) return [];

        const initial = await response.json();
        
        if (Array.isArray(initial)) return initial as HostItemTypes[];
        if (!initial?.task_id) return [];

        return await this.pollTaskResult(initial.task_id, token);
    } catch (error) {
        console.error('[HostService] Error fetching hosts:', error);
        return [];
        }
    }

    /** Sync the fetched hosts with the local database
     * @param hosts The list of hosts to sync
     */
    private async syncHosts(hosts: HostItemTypes[]): Promise<void> {
        const existing = await this.dbService.getAllItems('hostslives');
        const existingSafe = existing instanceof Error ? [] : (existing as HostItemTypes[]);
        const incomingIds = new Set(hosts.map((host) => host.id));

        for (const host of hosts) {
            await this.dbService.setItem('hostslives', host);
        }

        for (const item of existingSafe) {
            if (!incomingIds.has(item.id)) {
                await this.dbService.deleteItem('hostslives', item.id);
            }
        }
    }

    /** Poll the task result until completion or max attempts
     * @param taskId The task ID to poll
     * @param token The authentication token
     * @returns Promise<HostItemTypes[]> The list of hosts or empty array if polling fails
     */
    private async pollTaskResult(taskId: string, token: string): Promise<HostItemTypes[]> {
        let delay = 1000;

        for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
            await new Promise((resolve) => setTimeout(resolve, delay));

            try {
                const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.HOST_TASK}${taskId}/`, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Token ${token}`,
                        'Content-Type': 'application/json',
                    },
                });

                if (!response.ok) {
                    delay = Math.min(delay * 2, MAX_DELAY);
                    continue;
                }

                const result = (await response.json()) as unknown;

                const status =
                    typeof result === 'object' && result !== null
                    ? (result as { status?: string }).status
                    : undefined;

                if (status === 'PENDING' || status === 'STARTED') {
                    delay = Math.min(delay * 2, MAX_DELAY);
                    continue;
                } 

                if (Array.isArray(result)) {
                    return result as HostItemTypes[];
                }

                if (typeof result === 'object' && result !== null) {
                    const { result: nested, hosts } = result as { result?: unknown; hosts?: unknown };
                    if (Array.isArray(nested)) return nested as HostItemTypes[];
                    if (Array.isArray(hosts)) return hosts as HostItemTypes[];
                }

                return []

            } catch (error) {
                console.error('[HostService] Error polling task result:', error);
                return [];
            }
        }

        console.warn(`[HostService] Task ${taskId} polling reached max attempts`);
        return [];
    }
}