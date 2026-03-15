import { storage } from 'webextension-polyfill';
import { API_CONFIG } from '@chrome-extension-boilerplate/hmr/lib/constant';
import { readToken } from '@chrome-extension-boilerplate/shared/lib/storages/tokenStorage';
import { SelectorConfig } from '@chrome-extension-boilerplate/shared/lib/types/contentScript';
import DatabaseService from '@root/lib/db/services/DatabaseService';

const SELECTOR_VERSION_KEY = 'selector_version';
const SELECTOR_STORAGE_KEY = 'selectors';

export class SelectorService {
    constructor(
        private readonly dbService = new DatabaseService()
    ) {}

    async checkAndSyncVersion(): Promise<boolean> {
        const remoteVersion = await this.fetchRemoteVersion();
        if (!remoteVersion) return false;

        const local = (await storage.local.get(SELECTOR_VERSION_KEY))?.[SELECTOR_VERSION_KEY] as string | undefined;
        const countResult = await this.dbService.count('selectors');
        const hasConfigs = typeof countResult === 'number' && countResult > 0;

        if (!hasConfigs || local !== remoteVersion) {
            const configs = await this.fetchSelectorsFromApi();
            if (configs.length) {
                await this.syncSelectors(configs);
                await this.writeToStorage(configs);
                await storage.local.set({ [SELECTOR_VERSION_KEY]: remoteVersion });
            }
            return true;
        }
        return false;
    }

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
            return data.extension?.selector_version ?? null;
        } catch {
            return null;
        }
    }

    private async fetchSelectorsFromApi(): Promise<SelectorConfig[]> {
        const token = await readToken();
        if (!token) return [];
        try {
            const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.SELECTORS}`, {
                method: 'GET',
                headers: {
                    Authorization: `Token ${token}`,
                    'Content-Type': 'application/json',
                },
            });
            if (!response.ok) return [];
            return (await response.json()) as SelectorConfig[];
        } catch {
            return [];
        }
    }

    private async syncSelectors(configs: SelectorConfig[]): Promise<void> {
        const existing = await this.dbService.getAllItems('selectors');
        const existingSafe = existing instanceof Error ? [] : (existing as SelectorConfig[]);
        const incomingProviders = new Set(configs.map(c => c.provider));
        for (const config of configs) {
            await this.dbService.setItem('selectors', config);
        }
        for (const item of existingSafe) {
            if (!incomingProviders.has(item.provider)) {
                await this.dbService.deleteItem('selectors', item.provider);
            }
        }
    }

    private async writeToStorage(configs: SelectorConfig[]): Promise<void> {
        const configMap: Record<string, SelectorConfig> = {};
        configs.forEach(c => { configMap[c.provider] = c; });
        await storage.local.set({ [SELECTOR_STORAGE_KEY]: configMap });
    }
}