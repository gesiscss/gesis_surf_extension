import { storage } from 'webextension-polyfill';
import { API_CONFIG } from '@chrome-extension-boilerplate/hmr/lib/constant';
import { SelectorConfig } from '@chrome-extension-boilerplate/shared/lib/types/contentScript';
import DatabaseService from '@root/lib/db/services/DatabaseService';
import { apiRequestWithDevice } from '../apiClientWithDevice';
import { logger } from '../logger';

const SELECTOR_VERSION_KEY = 'selector_version';
const SELECTOR_STORAGE_KEY = 'selectors';
const MAX_ATTEMPTS = 8;
const MAX_DELAY = 30000;

export class SelectorService {
  constructor(private readonly dbService = new DatabaseService()) {}

  async checkAndSyncVersion(): Promise<boolean> {
    const remoteVersion = await this.fetchRemoteVersion();
    if (!remoteVersion) return false;

    const local = (await storage.local.get(SELECTOR_VERSION_KEY))?.[SELECTOR_VERSION_KEY] as string | undefined;
    const countResult = await this.dbService.count('selectors');
    const hasConfigs = typeof countResult === 'number' && countResult > 0;

    console.log(`[SelectorService] Local selector version: ${local}, Remote selector version: ${remoteVersion}`);
    console.log(`[SelectorService] Number of local selectors: ${countResult}`);
    console.log(`[SelectorService] Has any local selectors: ${hasConfigs}`);

    if (!hasConfigs || local !== remoteVersion) {
      console.log('[SelectorService] Syncing selectors from remote API...');
      const configs = await this.fetchSelectorsFromApi();
      if (!configs.length) {
        console.error('[SelectorService] Fetch returned empty list — aborting sync.');
        return false;
      }
      await this.syncSelectors(configs);
      try {
        await this.writeToStorage(configs);
      } catch (error) {
        console.error('[SelectorService] writeToStorage failed — storage.local may be stale:', error);
      }
      await storage.local.set({ [SELECTOR_VERSION_KEY]: remoteVersion });
      return true;
    }
    return false;
  }

  private async fetchRemoteVersion(): Promise<string | null> {
    try {
      const response = await apiRequestWithDevice(
        `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.USER_ME}`,
        { method: 'GET' },
        { method: 'GET', logToElasticsearch: true, logger },
      );
      if (!response.ok) return null;
      const data = await response.json();
      return data.extension?.selector_version ?? null;
    } catch (error) {
      console.error('[SelectorService] Error fetching version:', error);
      return null;
    }
  }

  private async fetchSelectorsFromApi(): Promise<SelectorConfig[]> {
    try {
      const response = await apiRequestWithDevice(
        `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.SELECTORS}`,
        { method: 'GET' },
        { method: 'GET', logToElasticsearch: true, logger },
      );
      if (!response.ok) return [];

      const initial = await response.json();

      if (Array.isArray(initial)) return initial as SelectorConfig[];
      if (!initial?.task_id) return [];

      return await this.pollTaskResult(initial.task_id);
    } catch (error) {
      console.error('[SelectorService] Error fetching selectors:', error);
      return [];
    }
  }

  private async pollTaskResult(taskId: string): Promise<SelectorConfig[]> {
    let delay = 1000;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, delay));

      try {
        const response = await apiRequestWithDevice(
          `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.SELECTORS_TASK}${taskId}/`,
          { method: 'GET' },
          { method: 'GET', logToElasticsearch: true, logger },
        );

        if (!response.ok) {
          delay = Math.min(delay * 2, MAX_DELAY);
          continue;
        }

        const result = (await response.json()) as unknown;

        const status =
          typeof result === 'object' && result !== null ? (result as { status?: string }).status : undefined;

        if (status === 'PENDING' || status === 'STARTED') {
          delay = Math.min(delay * 2, MAX_DELAY);
          continue;
        }

        if (Array.isArray(result)) return result as SelectorConfig[];

        if (typeof result === 'object' && result !== null) {
          const { result: nested, selectors } = result as { result?: unknown; selectors?: unknown };
          if (Array.isArray(nested)) return nested as SelectorConfig[];
          if (Array.isArray(selectors)) return selectors as SelectorConfig[];
        }

        return [];
      } catch (error) {
        console.error('[SelectorService] Error polling task result:', error);
        return [];
      }
    }

    console.warn(`[SelectorService] Task ${taskId} polling reached max attempts`);
    return [];
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
    configs.forEach(c => {
      configMap[c.provider] = c;
    });
    await storage.local.set({ [SELECTOR_STORAGE_KEY]: configMap });
  }
}
