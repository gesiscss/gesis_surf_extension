import {alarms, storage} from 'webextension-polyfill';

export class HeartbeatService {
    private heartbeatIntervalId?: NodeJS.Timeout;
    private alarmIntervalId?: NodeJS.Timeout;

    /**
     * Creates a new HeartbeatService instance.
     */
    constructor() {}

    /**
     * Updates the 'last-heartbeat'timestamps in local storage.
     */
    public async runHeartbeat(): Promise<void> {
        await storage.local.set({ 'last-heartbeat': Date.now() });
    }

    /**
     * Starts the heartbeat by running it immediatly and every 10 seconds.
     */
    public async startHeartbeat(): Promise<void> {
        await this.runHeartbeat();
        this.heartbeatIntervalId = setInterval(async () => {
            await this.runHeartbeat();
        }, 10000);
    }

    /**
     * Stops the heartbeat.
     */
    public stopHeartbeat(): void {
        if (this.heartbeatIntervalId !== undefined) {
            clearInterval(this.heartbeatIntervalId);
            this.heartbeatIntervalId = undefined;
        }
    }

    /**
     * Retrieves the last heartbeat timestamp from local storage.
     */
    public async getLastHeartbeat(): Promise<number | undefined> {
        const data = await storage.local.get('last-heartbeat');
        return data['last-heartbeat'] as number | undefined;
    }

    /**
     * Schedules an alarm 'heartBeat' to trigger after 1 minute.
     */
    public async runAlarmAll(): Promise<void> {
        alarms.create('heartBeat', { delayInMinutes: 1 });
    }

    /**
     * Starts the alarm scheduling by running it immediatly and every 10 seconds.
     */
    public async startAlarmAll(): Promise<void> {
        await this.runAlarmAll();
        this.alarmIntervalId = setInterval(async () => {
            await this.runAlarmAll();
        }, 10000);
    }

    /**
     * Stops the alarm internval.
     */
    public stopAlarmAll(): void {
        if (this.alarmIntervalId !== undefined) {
            clearInterval(this.alarmIntervalId);
            this.alarmIntervalId = undefined;
        }
    }
}


