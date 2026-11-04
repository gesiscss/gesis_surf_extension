/**
 * @fileoverview WindowEventManager handles browser window events (creation, removal, focus changes)
 * and maintains state about the current active window. It tracks window focus changes
 * including browser focus loss events.
 *
 * Key features:
 * - Tracks creation and removal of browser windows
 * - Manages window focus transitions between windows
 * - Handles browser focus loss and restoration
 * - Debounces brief focus losses so they do not split a focus period
 * - Processes window events one at a time so a focus period is always closed
 *   before the next one is opened
 *
 * Each focus period of a window is one backend row: the row is closed when the window
 * loses focus and a new row, with the same window_session_id, is created on return.
 *
 * This manager interacts with the WindowHandler to send window state updates to
 * the backend system.
 */

import { windows, Windows } from 'webextension-polyfill';
import { WindowHandler, WindowDataTypes } from '@root/lib/handlers';
import { InfoTypeValues } from '@root/lib/handlers/shared';

type FocusLostHandler = (windowId: number | null) => Promise<void> | void;
type FocusGainedHandler = (windowId: number) => Promise<void> | void;
export default class WindowEventManager {
  private readonly serviceName = 'WindowEventManager';
  private isInitializing = true;
  private currentActiveWindowId: number | null = null;
  private readonly windowDebounceTime = 1000;
  private startupCompleted: boolean = false;
  private focusLossTimer: ReturnType<typeof setTimeout> | null = null;
  // Incremented on every focus event so a pending focus loss can detect it is outdated.
  private focusEventGeneration = 0;
  private eventQueue: Promise<void> = Promise.resolve();
  private listenersRegistered: boolean = false;
  private focusLostHandlers: Set<FocusLostHandler> = new Set();
  private focusGainedHandlers: Set<FocusGainedHandler> = new Set();

  constructor(private windowManager: WindowHandler) {}

  /**
   * Registers a handler for focus lost events.
   * @param handler The function to call when focus is lost.
   * @returns A function to unregister the handler.
   */
  public onFocusLost(handler: FocusLostHandler): () => void {
    this.focusLostHandlers.add(handler);
    return () => this.focusLostHandlers.delete(handler);
  }

  /**
   * Registers a handler for focus gained events.
   * @param handler The function to call when focus is gained.
   * @returns A function to unregister the handler.
   */
  public onFocusGained(handler: FocusGainedHandler): () => void {
    this.focusGainedHandlers.add(handler);
    return () => this.focusGainedHandlers.delete(handler);
  }

  /**
   * Notifies all registered focus lost handlers.
   * @param windowId The ID of the window that lost focus, or null if none.
   */
  private async notifyFocusLost(windowId: number | null): Promise<void> {
    for (const handler of this.focusLostHandlers) {
      try {
        await handler(windowId);
      } catch (error) {
        console.error(`[${this.serviceName}] Error in focus lost handler:`, error);
      }
    }
  }

  /**
   * Notifies all registered focus gained handlers.
   * @param windowId The ID of the window that gained focus.
   */
  private async notifyFocusGained(windowId: number): Promise<void> {
    for (const handler of this.focusGainedHandlers) {
      try {
        await handler(windowId);
      } catch (error) {
        console.error(`[${this.serviceName}] Error in focus gained handler:`, error);
      }
    }
  }

  /**
   * Runs window event processing one task at a time, in arrival order.
   * Window requests time out (see WindowHandler), so a failed request cannot block the queue.
   * @param task The processing to run.
   * @returns A promise that settles with the task.
   */
  private enqueue(task: () => Promise<void>): Promise<void> {
    const result = this.eventQueue.then(task);
    this.eventQueue = result.catch(() => undefined);
    return result;
  }

  /** Registers event listeners for window events.
   * Ensures that the global session is initialized before handling events.
   */
  public async registerWindowListeners(): Promise<void> {
    if (this.listenersRegistered) {
      return;
    }

    this.listenersRegistered = true;
    windows.onCreated.addListener((win: Windows.Window) => void this.handleWindowCreation(win));
    windows.onRemoved.addListener((winId: number) => void this.handleWindowRemoval(winId));
    windows.onFocusChanged.addListener((newWindowId: number) => this.handleWindowFocusChange(newWindowId));

    try {
      await this.enqueue(() => this.handleStartupWindow());
      this.startupCompleted = true;
    } finally {
      this.isInitializing = false;
    }
  }

  /**
   * Handles changes in window focus.
   * @param newWindowId The ID of the newly focused window, or -1 if focus is lost.
   */
  private handleWindowFocusChange(newWindowId: number): void {
    this.focusEventGeneration++;
    this.cancelPendingFocusLoss();

    if (newWindowId === -1) {
      this.scheduleFocusLoss(this.focusEventGeneration);
    } else {
      void this.enqueue(() => this.handleBrowserFocusGained(newWindowId));
    }
  }

  private cancelPendingFocusLoss(): void {
    if (this.focusLossTimer) {
      clearTimeout(this.focusLossTimer);
      this.focusLossTimer = null;
    }
  }

  /**
   * Handles the case when browser loses focus (Window ID = -1).
   * The loss is only processed if no other focus event arrives within the debounce time.
   * @param generation The focus event generation that scheduled this loss.
   */
  private scheduleFocusLoss(generation: number): void {
    this.focusLossTimer = setTimeout(() => {
      this.focusLossTimer = null;
      void this.enqueue(() => this.handleBrowserFocusLost(generation));
    }, this.windowDebounceTime);
  }

  /**
   * Closes the focus period of the active window and its active tab.
   * @param generation The focus event generation that scheduled this loss.
   */
  private async handleBrowserFocusLost(generation: number): Promise<void> {
    try {
      if (generation !== this.focusEventGeneration) {
        console.log(`[${this.serviceName}] Focus changed again before focus loss was processed - skipping`);
        return;
      }

      const lastFocused = await windows.getLastFocused();
      if (lastFocused.focused) {
        console.log(`[${this.serviceName}] Focus returned during debounce - cancelling focus loss`);
        return;
      }

      const previousId = this.currentActiveWindowId;
      if (previousId === null) {
        return;
      }

      await this.processWindowTransition(previousId, -1);
      await this.notifyFocusLost(previousId);
      this.currentActiveWindowId = null;
      console.log(`[${this.serviceName}] Browser focus lost, current active window set to null`);
    } catch (error) {
      console.error(`[${this.serviceName}] Error handling browser focus lost`, error);
    }
  }

  /**
   * Handles the case when browser gains focus (Window ID != -1).
   * Closes the previous window's focus period and ensures the focused window has a record,
   * so tabs opened or activated in it can always be attached.
   * @param newWindowId The ID of the newly focused window.
   */
  private async handleBrowserFocusGained(newWindowId: number): Promise<void> {
    try {
      this.validateWindow({ id: newWindowId } as Windows.Window);
      const previousId = this.currentActiveWindowId;

      if (previousId !== null && previousId !== newWindowId) {
        await this.processWindowTransition(previousId, newWindowId);
        await this.notifyFocusLost(previousId);
      }

      this.currentActiveWindowId = newWindowId;
      const created = await this.ensureWindowRecord(newWindowId);

      if (previousId !== newWindowId || created) {
        await this.notifyFocusGained(newWindowId);
      }

      console.log(`[${this.serviceName}] Browser focus gained, current active window set to:`, newWindowId);
    } catch (error) {
      console.error(`[${this.serviceName}] Error handling browser focus gained`, error);
    }
  }

  /**
   * Creates a window record unless one is already open for this window.
   * @param windowId The ID of the window.
   * @returns True if a new record was created.
   */
  private async ensureWindowRecord(windowId: number): Promise<boolean> {
    if (await this.windowManager.hasWindowRecord(windowId)) {
      return false;
    }
    return this.processWindowCreation(windowId);
  }

  /**
   * Validates the given window object.
   * @param window The window object to validate.
   */
  private validateWindow(window: Windows.Window): void {
    if (window.id === undefined) {
      throw new Error(`[${this.serviceName}] Window ID is undefined`);
    }
  }

  /**
   * Handles the startup window event.
   * Records every open window and remembers which one is focused.
   * @returns A promise that resolves when the startup window handling is complete.
   */
  private async handleStartupWindow(): Promise<void> {
    console.log(`[${this.serviceName}] Handling startup windows...`);

    try {
      const windowsList = await windows.getAll();
      console.log(`[${this.serviceName}] Startup windows detected:`, windowsList.length);

      for (const win of windowsList) {
        if (win.id !== undefined) {
          await this.ensureWindowRecord(win.id);
        }
      }

      const focusedWindow = windowsList.find(win => win.focused);
      this.currentActiveWindowId = focusedWindow?.id ?? null;
      console.log(`[${this.serviceName}] Startup active window:`, this.currentActiveWindowId);
    } catch (error) {
      console.error(`[${this.serviceName}] Error during startup window handling`, error);
      throw error;
    }
  }

  /**
   * Processes a window transition event.
   * @param previousId The ID of the previously active window.
   * @param newId The ID of the newly active window.
   */
  private async processWindowTransition(previousId: number | null, newId: number): Promise<void> {
    try {
      if (previousId !== null && previousId !== newId) {
        const transitionsStatus = newId === -1 ? InfoTypeValues.OnBlurred : InfoTypeValues.OnFocusChanged;
        await this.windowManager.updateWindow(previousId, transitionsStatus, 'PATCH');
      }
    } catch (error) {
      console.error(`[${this.serviceName}] Error processing window transition`, error);
    }
  }

  /**
   * Processes a window creation event.
   * @param newId The ID of the newly created window.
   * @returns True if the window record was created.
   */
  private async processWindowCreation(newId: number): Promise<boolean> {
    try {
      const startTime = new Date().toISOString();
      const window = await windows.get(newId);

      if (window) {
        const windowData = this.toWindowData(window);
        await this.windowManager.sendWindow(windowData, InfoTypeValues.OnCreated, 'POST', startTime);
        return true;
      }
    } catch (error) {
      console.error(`[${this.serviceName}] Error processing window creation`, error);
    }
    return false;
  }

  /**
   * Handles errors related to window events.
   * @param error The error object.
   * @param event The name of the window event.
   * @param windowId The ID of the window associated with the error.
   */
  private handleWindowError(error: Error, event: string, windowId: number): void {
    const errorMessage = `Error in ${event} for window ${windowId}: ${error.message}`;
    console.error(`[${this.serviceName}] ${errorMessage}`);
  }

  /**
   * Handle window removal event
   * @param windowId The ID of the closed window
   */
  private handleWindowRemoval(windowId: number): Promise<void> {
    return this.enqueue(async () => {
      try {
        console.log(`[${this.serviceName}] Window closed:`, windowId);

        if (this.currentActiveWindowId === windowId) {
          this.currentActiveWindowId = null;
        }

        // A window that is not focused may have no open record; there is nothing to close then.
        if (!(await this.windowManager.hasWindowRecord(windowId))) {
          return;
        }

        await this.windowManager.updateWindow(windowId, InfoTypeValues.OnRemoved, 'PATCH');
      } catch (error) {
        if (error instanceof Error) {
          this.handleWindowError(error, 'onWindowRemoved', windowId);
        } else {
          this.handleWindowError(new Error(String(error)), 'onWindowRemoved', windowId);
        }
      }
    });
  }

  /**
   * Converts a Windows.Window object to a WindowDataTypes object.
   * @param win The Windows.Window object.
   * @returns The corresponding WindowDataTypes object.
   */
  private toWindowData(win: Windows.Window): WindowDataTypes {
    if (win.top === undefined) {
      throw new Error(`[${this.serviceName}] Window top position is undefined`);
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
   * Records the new window; closing the previous window is left to the focus change
   * that follows, so the previous window is closed exactly once.
   * @param window The created window object.
   */
  public handleWindowCreation(window: Windows.Window): Promise<void> {
    return this.enqueue(async () => {
      try {
        if (window.id === undefined) {
          console.error(`[${this.serviceName}] Window ID is undefined in onCreated event`);
          return;
        }

        await this.ensureWindowRecord(window.id);
      } catch (error) {
        if (error instanceof Error) {
          this.handleWindowError(error, 'onWindowCreated', window.id ?? -1);
        } else {
          this.handleWindowError(new Error(String(error)), 'onWindowCreated', window.id ?? -1);
        }
      }
    });
  }
}
