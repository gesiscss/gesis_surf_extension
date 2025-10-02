/**
 * WindowEventManager handles browser window events (creation, removal, focus changes)
 * and maintains state about the current active window. It tracks window focus changes
 * including browser focus loss events.
 * 
 * Key features:
 * - Tracks creation and removal of browser windows
 * - Manages window focus transitions between windows
 * - Handles browser focus loss and restoration
 * - Prevents duplicate processing using a debounce mechanism
 * 
 * This manager interacts with the WindowHandler to send window state updates to
 * the backend system.
 * 
 * @example
 * const windowManager = new WindowHandler(...);
 * const windowEventManager = new WindowEventManager(windowManager);
 * windowEventManager.registerWindowListeners();
 */

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

  /** Registers event listeners for window events.
   * Ensures that the global session is initialized before handling events.
   */
  public registerWindowListeners(): void {

    this.handleStartupWindow().then(() => {
      this.isInitializing = false;
      // Register event listeners
      windows.onCreated.addListener((win: Windows.Window) => void this.handleWindowCreation(win));
      windows.onRemoved.addListener((winId: number) => void this.handleWindowRemoval(winId));
      windows.onFocusChanged.addListener((newWindowId: number) => void this.handleWindowFocusChange(newWindowId));
    
    });
  }

  /**
   * Handles changes in window focus.
   * @param newWindowId The ID of the newly focused window, or -1 if focus is lost.
   */
  private async handleWindowFocusChange(newWindowId: number): Promise<void> {
    try {
      if (newWindowId === -1) {
        await this.handleBrowserFocusLost();
      } else {
        await this.handleBrowserFocusGained(newWindowId);
      }
    } catch (error) {
      console.error('Error handling window focus change', error);
    }
  }

  /**
   * Handles the case when browser loses focus (Window ID = -1).
   */
  private async handleBrowserFocusLost(): Promise<void> {
    try {
      await this.processWindowTransition(this.currentActiveWindowId, -1);
      this.currentActiveWindowId = null;
      console.warn('Browser focus lost, current active window set to null');
    } catch (error) {
      console.error('Error handling browser focus lost', error);
    }
  }

  /**
   * Handles window transition when focus changes.
   * @param newWindowId The ID of the newly focused window.
   */
  private async handleWindowTransition(newWindowId: number): Promise<void> {
    if (this.currentActiveWindowId !== newWindowId) {
        await this.processWindowTransition(this.currentActiveWindowId, newWindowId);
      }
      this.currentActiveWindowId = newWindowId;
    }

  /**
   * Processes window creation if the window is valid and not recently created.
   * @param windowId The ID of the newly created window.
   */
  private async processWindowIfValid(windowId: number): Promise<void> {
    if (!this.recentWindowCreation.has(windowId)) {
      this.trackNewWindow(windowId);
      await this.processWindowCreation(windowId);
    } else {
      console.warn('Skipping creation event for recently created window:', windowId);
    }
  }

  /**
   * Handles the case when browser gains focus (Window ID != -1).
   * @param newWindowId The ID of the newly focused window.
   */
  private async handleBrowserFocusGained(newWindowId: number): Promise<void> {
    try {

      this.validateWindow({ id: newWindowId } as Windows.Window);
      await this.handleWindowTransition(newWindowId);
      await this.processWindowIfValid(newWindowId);

      console.warn('Browser focus gained, current active window set to:', newWindowId);
    
    } catch (error) {
      console.error('Error handling browser focus gained', error);
    }
  }

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

    if (initialSession) {
      this.lastKnownSessionId = initialSession.global_session_id;
      console.warn('Current Global session being closed:', initialSession.global_session_id);
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
   * Tracks a newly created window, preventing immediate transition handling.
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
        previousId !== null &&
        previousId !== newId ) {
          const transitionsStatus = newId === -1
          ? InfoTypeValues.OnBlurred
          : InfoTypeValues.OnFocusChanged;
          await this.windowManager.updateWindow(previousId, transitionsStatus, 'PATCH');
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

  /**
   * Gets the global session ID for a given window ID.
   * @param windowId The ID of the window.
   * @returns A promise that resolves to the global session ID.
   */
  public async getGlobalSessionId(windowId: number): Promise<string> {
    return this.windowManager.globalSessionId(windowId);
  }

  /**
   * Handles the window creation event.
   * @param window The created window object.
   */
  public async handleWindowCreation(window: Windows.Window): Promise<void> {
    try {

      if (window.id === undefined) {
        console.error('Window ID is undefined in onCreated event');
        return;
      }

      this.validateWindow(window);
      this.trackNewWindow(window.id);
      await this.processWindowTransition(this.currentActiveWindowId, window.id);
      await this.processWindowCreation(window.id);
    
    } catch (error) {

      if (error instanceof Error){
        this.handleWindowError(error, 'onWindowCreated', window.id ?? -1);
      } else {
        this.handleWindowError(new Error(String(error)), 'onWindowCreated', window.id ?? -1);
      }
    }
  }

}
