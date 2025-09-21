// Window event manager.

import { windows, Windows } from 'webextension-polyfill';
import { WindowHandler, WindowDataTypes } from '@root/lib/handlers';
import { InfoTypeValues } from '@root/lib/handlers/shared';

export default class WindowEventManager {
  private isInitializing = true;
  private recentWindowCreation = new Set<number>();
  private currentActiveWindowId: number | null = null;
  private readonly windowDebounceTime = 1000;
  private lastKnownSessionId: string | null = null;


  constructor(
    private windowManager: WindowHandler
  ) {}

  /**
   * Validates the given window object.
   * @param window The window object to validate.
   */
  private validateWindow(window: Windows.Window): void {
    if (window.id === undefined) {
      throw new Error('Window ID is undefined');
    }
  }

  /**
   * Waits for the global session to be initialized.
   * @returns A promise that resolves when the global session is ready.
   */
  private async waitForGlobalSession(): Promise<void> {
    let attempts = 0;
    const maxAttempts = 10;
    const interval = 1000;

    // Check for existing global session
    const initialSession = await this.windowManager.globalSessionService.getLatestActiveSession();
    console.log('Initial Global session check:', initialSession);

    //  Close session if it exists
    if (initialSession) {
      this.lastKnownSessionId = initialSession.global_session_id;
      console.log('Current Global session being closed:', initialSession.global_session_id);
    }


    while (this.isInitializing && attempts < maxAttempts) {
      attempts++;
    
      const session = await this.windowManager.globalSessionService.getLatestActiveSession();
      console.log('Checked for global session:', session);

      if (session && (!this.lastKnownSessionId || session.global_session_id !== this.lastKnownSessionId)) {
        console.log('New Global session found:', session.global_session_id);
        this.isInitializing = false;
        return;
      }

      console.log('Waiting for global session... Attempt:', attempts);
      await new Promise(resolve => setTimeout(resolve, interval));
  }
  throw new Error('Global session not found after maximum attempts');
  }

  /**
   * Handles the startup window event.
   * @returns A promise that resolves when the startup window handling is complete.
   */
  private async handleStartupWindow(): Promise<void> {
    console.log('Handling startup windows...');

    try {
      await this.waitForGlobalSession();

      const windowsList = await windows.getAll();
      console.log('Startup windows detected:', windowsList.length);

      for (const win of windowsList){
        if (win.id) {
          await this.handleWindowCreation(win);
        }
      }
    } catch (error) {
        console.error('Error during startup window handling', error);
        throw error;
      }
    }

  /**
   * Tracks a newly created window.
   * @param windowId The ID of the newly created window.
   */
  private trackNewWindow(windowId: number): void {
    this.recentWindowCreation.add(windowId);
    setTimeout(
      () => this.recentWindowCreation.delete(windowId),
      this.windowDebounceTime
    );
  }

  /**
   * Processes a window transition event.
   * @param previousId The ID of the previously active window.
   * @param newId The ID of the newly active window.
   */
  private async processWindowTransition(
    previousId: number | null,
    newId: number
  ): Promise<void> {
    try {
      if (
        previousId &&
        previousId !== newId &&
        !this.recentWindowCreation.has(newId)
      ) {
        await this.windowManager.updateWindow(previousId, InfoTypeValues.OnRemoved, 'PATCH');
      }
    } catch (error) {
      console.error('Error processing window transition', error);
    }
  }

  public async processWindowCreation(newId: number): Promise<void> {
    try {
      const startTime = new Date().toISOString();
      const window = await windows.get(newId);
      if (window) {
        const windowData = this.toWindowData(window);
        await this.windowManager.sendWindow(windowData, InfoTypeValues.OnCreated, 'POST', startTime);
      }
    } catch (error) {
      console.error('Error processing window creation', error);
    }
  }

  private handleWindowError(error: Error, event: string, windowId: number): void {
    const errorMessage = `Error in ${event} for window ${windowId}: ${error.message}`;
    console.error(errorMessage);
  }

  /**
   * Handle window removal event
   * @param windowId The ID of the closed window
   */
  private async handleWindowRemoval(windowId: number): Promise<void> {
    try {
      console.log('Window closed:', windowId);
      
      // Remove window from tracking (if needed)
      this.recentWindowCreation.delete(windowId);

      // Update window state in the database/backend
      await this.windowManager.updateWindow(windowId, InfoTypeValues.OnRemoved, 'PATCH');
    } catch (error) {
      if (error instanceof Error){
        this.handleWindowError(error, 'onWindowRemoved', windowId);
      } else {
      this.handleWindowError(new Error(String(error)), 'onWindowRemoved', windowId);
      }
    }
  }

  private toWindowData(win: Windows.Window): WindowDataTypes {

    if (win.top === undefined) {
      throw new Error('Window top position is undefined');
    }

    return {
      id: win.id,
      state: win.state,
      top: win.top,
      focused: win.focused,
      incognito: win.incognito,
      alwaysOnTop: win.alwaysOnTop,
      width: win.width,
      height: win.height,
      left: win.left,
      type: win.type,
    };
  }

  public async getGlobalSessionId(windowId: number): Promise<string> {
    return this.windowManager.globalSessionId(windowId);
  }

  public handleWindowCreation(window: Windows.Window): void {
    try {
      console.log('ONCREATED Window', window);

      if (window.id === undefined) {
        throw new Error('Window ID is undefined');
      }

      this.validateWindow(window);
      this.trackNewWindow(window.id);
      this.processWindowTransition(this.currentActiveWindowId, window.id);
      this.processWindowCreation(window.id);
    } catch (error) {
      if (window.id === undefined) {
        throw new Error('Window ID is undefined');
      }
      if (error instanceof Error){
        this.handleWindowError(error, 'onWindowCreated', window.id);
      } else {
        this.handleWindowError(new Error(String(error)), 'onWindowCreated', window.id);
      }
    }
  }

  public registerWindowListeners(): void {
    this.handleStartupWindow().then(() => {
      this.isInitializing = false;

      // Register event listeners
      windows.onCreated.addListener((win: Windows.Window) => this.handleWindowCreation(win));
      windows.onRemoved.addListener((winId: number) => this.handleWindowRemoval(winId));
    });
  }
}
