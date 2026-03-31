export interface PrivateModeState {
    mode: boolean;
    alarm: string;
    remainingTime: number;
}

export interface PrivateModeStorage {
    private: PrivateModeState;
}