import { openDB, IDBPDatabase } from 'idb';
import { DBGesisTypes, ItemTypes } from '../interfaces/types';
import { DB_CONFIG } from '../constants/dbConfig';


type StoreNames = 'winlives' | 'tabslives' | 'domainslives' | 'config' | 'winclose' ;

/**
 * Service for interacting with the IndexedDB database.
 */
class DatabaseService {
  private db: Promise<IDBPDatabase<DBGesisTypes>>;

  constructor() {
    this.db = this.initializeDB();
  }

  private initializeDB() : Promise<IDBPDatabase<DBGesisTypes>> {
    return openDB<DBGesisTypes>(DB_CONFIG.name, DB_CONFIG.version, {
      upgrade(db, oldVersion) {
        if (!db.objectStoreNames.contains('winlives')) {
          db.createObjectStore('winlives', { keyPath: 'window_session_id' });
          db.createObjectStore('tabslives', { keyPath: 'tab_session_id' });
          db.createObjectStore('domainslives', { keyPath: 'domain_session_id' });
          // db.createObjectStore('hostslives', { autoIncrement: true });
        } else if (oldVersion < 2) {
          db.deleteObjectStore('winlives');
          db.createObjectStore('winlives', { keyPath: 'window_session_id' });
          db.deleteObjectStore('tabslives');
          db.createObjectStore('tabslives', { keyPath: 'tab_session_id' });
          db.deleteObjectStore('domainslives');
          db.createObjectStore('domainslives', { keyPath: 'domain_session_id' });
        }
      },
    });
  }

  /**
   * Sets an item in the specified store.
   * @param storeName The name of the store to set the item in.
   * @param data The data to set in the store.
   * @returns The result of the set operation.
   * @throws An error if the set operation fails.
  */
  async setItem<K extends StoreNames>(
    storeName: K,
    data: DBGesisTypes[K]['value']
  ): Promise<IDBValidKey | Error> {
    try {
      const db = await this.db;
      return await db.put(storeName, data);
    } catch (error) {
      console.error(`Error setting item in ${storeName}`, error);
      throw error;
    }
  }

  /**
   * Gets an item from the specified store.
   * @param storeName The name of the store to get the item from.
   * @param key The id of the item to get that is in the path of the store.
   * @returns The item from the store.
   * @throws An error if the get operation fails.
   */
  async getItem(storeName: StoreNames, key: string): Promise<ItemTypes | Error | null> {
    console.log('Store Name:', storeName);
    console.log('Key:', key);
    try {
      const db = await this.db;
      const item = await db.get(storeName, key) as ItemTypes;
      console.log('Item:', item);
      if (!item) {
        console.warn(`Item with Id ${key} not found in ${storeName}`);
        return null;
      }
      return item;
    } catch (error) {
      console.error(`Error getting item from ${storeName}`, error);                  
      throw error;
    }
  }

  /**
   * Gets all items from the specified store.
   * @param storeName The name of the store to get the items from.
   * @returns All items from the store.
   * @throws An error if the get all operation fails.
   */
  async getAllItems(storeName: StoreNames): Promise<object[] | Error> {
    try{
      const db = await this.db;
      return await db.getAll(storeName);
    } catch (error) {
      console.error(`Error getting all items from ${storeName}`, error);
      return error as Error;
    }
  }

  /**
   * Deletes an item from the specified store.
   * @param storeName The name of the store to delete the item from.
   * @param key The id of the item to delete that is in the path of the store.
   * @returns The item that was deleted.
   * @throws An error if the delete operation fails.
   */
  async deleteItem(storeName: StoreNames, key: string): Promise<ItemTypes | Error | void | null> {
    console.log('Store Name:', storeName);
    console.log('Key:', key);
    console.log('Deleting item from store:', storeName, 'with key:', key);
    try{
      const db = await this.db;
      const item = await db.get(storeName, key) as ItemTypes;
      if (!item) {
        console.warn(`Item with windowSessionId ${key} not found in ${storeName}`);
        return null;
      }
      try {
        await db.delete(storeName, key);
        console.log(`Item with windowSessionId ${key} deleted from ${storeName}`);
        return item;
      } catch (error) {
        console.error(`Error deleting item from ${storeName}`, error);
        throw error;
      }
    } catch (error) {
      console.error(`Error getting item from ${storeName}`, error);
      return error as Error;
    }
  }
}

export default DatabaseService;