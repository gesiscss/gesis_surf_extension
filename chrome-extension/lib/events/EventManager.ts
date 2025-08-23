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
      this.windowEventManager
    );
    
    console.log('[EventManager] Services initilized successfully (listeners inactive)');
  }

  public async startListeners(){
    this.tabEventManager.registerTabListeners();
    this.windowEventManager.registerWindowListeners();
    console.log('[EventManager] Starting listeners');
  }
}

export default EventManager;