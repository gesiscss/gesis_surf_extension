/**
 * @fileoverview Service for interacting with the IndexedDB database.
 * Provides methods to perform CRUD operations on various object stores.
 * @implements {DatabaseService}
 */
import { openDB } from 'idb';
import type { IDBPDatabase, StoreNames as DatabaseStoreNames } from 'idb';
import { DBGesisTypes, ItemTypes } from '../interfaces/types';
import { DB_CONFIG } from '../constants/dbConfig';
import { stableKeyOf } from '../../utils/domainVisitIdentity';

type StoreNames = DatabaseStoreNames<DBGesisTypes>;

/**
 * Service for interacting with the IndexedDB database.
 */
class DatabaseService {
  private db: Promise<IDBPDatabase<DBGesisTypes>>;

  constructor() {
    this.db = this.initializeDB();
  }

  private initializeDB(): Promise<IDBPDatabase<DBGesisTypes>> {
    return openDB<DBGesisTypes>(DB_CONFIG.name, DB_CONFIG.version, {
      upgrade(db, _oldVersion, _newVersion, transaction) {
        const stores = ['winlives', 'tabslives', 'hostslives', 'domainvisits', 'selectors', 'domainslives'] as const;
        for (const store of stores) {
          if (!db.objectStoreNames.contains(store)) {
            db.createObjectStore(store, { keyPath: DB_CONFIG.stores[store] });
          }
        }

        const oldStore = transaction.objectStore('domainslives');
        if (oldStore.keyPath !== DB_CONFIG.stores.domainslives) {
          // Legacy schemas keyed domainslives by domain_session_id, which the wire hint
          // (key#visitStart) made unusable as a stable local key. Re-key to
          // an explicit local_key, preserving every existing record: they
          // hold backend UUIDs needed to close open visits.
          void transaction.done.catch(error => {
            console.error('Domain identity migration transaction aborted', error);
          });
          void oldStore
            .getAll()
            .then(async records => {
              const keys = new Set<string>();
              const migrated = records.map(record => {
                const storedId = record.domain_session_id;
                if (!storedId) throw new Error('Cannot migrate a Domain without a session identity');
                const localKey = stableKeyOf(storedId);
                if (keys.has(localKey)) throw new Error(`Conflicting active Domain records for ${localKey}`);
                keys.add(localKey);
                return { ...record, local_key: localKey };
              });
              db.deleteObjectStore('domainslives');
              const newStore = db.createObjectStore('domainslives', { keyPath: DB_CONFIG.stores.domainslives });
              for (const record of migrated) {
                await newStore.add(record);
              }
            })
            .catch(error => {
              console.error('Failed to migrate domain identities', error);
              if (!transaction.error) transaction.abort();
            });
        }
      },
    });
  }

  /**
   * Counts the number of items in the specified store.
   * @param storeName The name of the store to count items in.
   * @returns The number of items in the store.
   * @throws An error if the count operation fails.
   */
  async count(storeName: StoreNames): Promise<number | Error> {
    try {
      const db = await this.db;
      return await db.count(storeName);
    } catch (error) {
      console.error(`Error counting items in ${storeName}`, error);
      return error as Error;
    }
  }

  /**
   * Sets an item in the specified store.
   * @param storeName The name of the store to set the item in.
   * @param data The data to set in the store.
   * @returns The result of the set operation.
   * @throws An error if the set operation fails.
   */
  async setItem<K extends StoreNames>(storeName: K, data: DBGesisTypes[K]['value']): Promise<IDBValidKey | Error> {
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
  async getItem<K extends StoreNames>(storeName: K, key: string): Promise<DBGesisTypes[K]['value'] | null> {
    console.log('Store Name:', storeName);
    console.log('Key:', key);
    try {
      const db = await this.db;
      const item = await db.get(storeName, key);
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
  async getAllItems<K extends StoreNames>(storeName: K): Promise<DBGesisTypes[K]['value'][] | Error> {
    try {
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
    try {
      const db = await this.db;
      const item = (await db.get(storeName, key)) as ItemTypes;
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
