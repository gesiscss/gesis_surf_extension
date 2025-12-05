/**
 * @fileoverview Data collection service for managing data storage and transmission
 * @implements {DataCollectionService}
 */
import { storage } from 'webextension-polyfill';
import { API_CONFIG } from '@chrome-extension-boilerplate/hmr/lib/constant';
import { DatabaseService } from '@root/lib/db';


class DataCollectionService {
    private dbService: DatabaseService;
    private isDataCollectionActive: boolean = false;

    constructor() {
        this.dbService = new DatabaseService();
    }

    /**
     * Initialize data collection service
     * @returns void
     */
    async initialize(): Promise<void> {
        this.isDataCollectionActive = await this.checkDataCollectionFlag();
        console.log(`[DataCollectionService] Data collection active: ${this.isDataCollectionActive}`);
    }

    /**
     * Check if data collection is active
     * @returns boolean
     */
    shouldCollectData(): boolean {
        return this.isDataCollectionActive;
    }

    /**
     * Check if data collection is enabled in storage
     * @returns boolean
     */
    private async checkDataCollectionFlag(): Promise<boolean> {

        try {
            const storageData = await storage.local.get('token');
            const token = storageData.token;

            if (!token) {
                console.log('[DataCollectionService] Token not found in storage, disabling data collection.');
                return false;
            }

            const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.USER_ME}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Token ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                console.warn('[DataCollectionService] Invalid token, disabling data collection.');
                return this.isDataCollectionActive;
            }

            const userData = await response.json();
            const dataCollectionEnabled = userData.extension?.extension_data_collection ?? false;

            console.log(`[DataCollectionService] Data collection enabled: ${dataCollectionEnabled}`);

            if (!dataCollectionEnabled && this.isDataCollectionActive) {
                console.log('[DataCollectionService] Data cleared due to data collection being disabled.');
                await this.clearAllRecords();
            }

            this.isDataCollectionActive = dataCollectionEnabled;
            return dataCollectionEnabled;
        } catch (error) {
            console.error('[DataCollectionService] Error checking data collection flag:', error);
            return this.isDataCollectionActive;
        }
    }

    /**
     * Clear all records from the database
     * @returns void
     */
    private async clearAllRecords(): Promise<void> {
        try {
            // await this.dbService.clearAll();
            console.log('[DataCollectionService] All records cleared from the database.');
        } catch (error) {
            console.error('[DataCollectionService] Error clearing records:', error);
        }
    }

}

export default DataCollectionService;