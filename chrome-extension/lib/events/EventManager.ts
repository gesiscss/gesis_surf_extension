// eventManager.ts

import { WindowHandler, TabHandler, DomainHandler } from "../handlers";
import { DatabaseService } from "../db";
import { WindowEventManager, TabEventManager } from "./managers";

class EventManager {

  private windowManager: WindowHandler;
  private tabManager: TabHandler;
  private domainManager: DomainHandler;
  private dbService: DatabaseService;
  private tabEventManager: TabEventManager;
  private windowEventManager: WindowEventManager;
  private focusLostUnsubscribe: (() => void) | null = null;
  private focusGainedUnsubscribe: (() => void) | null = null;
  
  constructor() {
    // Core Services
    this.windowManager = new WindowHandler();
    this.tabManager = new TabHandler();
    this.dbService = new DatabaseService();
    this.domainManager = new DomainHandler();

    // Event Managers
    this.windowEventManager = new WindowEventManager(
      this.windowManager
    );

    this.tabEventManager = new TabEventManager(
      this.tabManager,
      this.dbService,
      this.domainManager,
    );
    
    console.log('[EventManager] Services initilized successfully (listeners inactive)');
  }

  public async startListeners(){
    await this.windowEventManager.registerWindowListeners();

    this.focusLostUnsubscribe = this.windowEventManager.onFocusLost((windowId) => {
      this.tabEventManager.handleActiveTabBlur(windowId);
    });

    this.focusGainedUnsubscribe = this.windowEventManager.onFocusGained((windowId) => {
      this.tabEventManager.handleActiveTabFocus(windowId);
    });

    this.tabEventManager.registerTabListeners();
    console.log('[EventManager] Starting listeners');
  }

  public cleanup(): void {

    if (this.focusLostUnsubscribe) {
      this.focusLostUnsubscribe();
      this.focusLostUnsubscribe = null;
    }

    if (this.focusGainedUnsubscribe) {
      this.focusGainedUnsubscribe();
      this.focusGainedUnsubscribe = null;
    }
    console.log('[EventManager] Cleaned up listeners');
  }
}

export default EventManager;