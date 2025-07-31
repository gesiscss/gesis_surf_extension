async function openDatabase(dbName: string, storeName: string) {
    return new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(dbName);
  
      request.onupgradeneeded = function() {
        const db = request.result;
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName, {autoIncrement: true});
        }
      };
  
      request.onsuccess = function() {
        resolve(request.result);
      };
  
      request.onerror = function() {
        reject("Error opening database.");
      };
    });
  }
  
  async function startTransaction(db: IDBDatabase, storeName: string) {
    const transaction = db.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);
    return store;
  }
  
  export async function runDB(dbName:string, storeName:string, data:any) {
    try {
      const db = await openDatabase(dbName, storeName);
      const store = await startTransaction(db, storeName);
      store.add(data);
      db.close();
    } catch (error) {
      console.error("Error", error);
    }
  }
  
  export async function openDatabases(dbName: string, storeName: string) {
    return new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(dbName);
  
      request.onupgradeneeded = function() {
        const db = request.result;
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName, {autoIncrement: true});
        }
      };
  
      request.onsuccess = function() {
        resolve(request.result);
      };
  
      request.onerror = function() {
        reject("Error opening database.");
      };
    });
  }
  
  export async function findIdInStore(dbName: string, storeName: string, keys:string, id:string ) {
    return new Promise<any>((resolve, reject) => {
      const request = indexedDB.open(dbName);
  
      request.onsuccess = function() {
        const db = request.result;
        const transaction = db.transaction(storeName, "readonly");
        const store = transaction.objectStore(storeName);
        const cursorRequest = store.openCursor();
  
        cursorRequest.onsuccess = function() {
          const cursor = cursorRequest.result;
          if (cursor) {
            const value = cursor.value;
                      
            if (value.tab[keys]===id.toString()) {
              resolve(value);
            }
            cursor.continue();
          } else {
            resolve(false);
          }
        };
  
        cursorRequest.onerror = function() {
          reject("Error opening cursor.");
        };
      };
  
      request.onerror = function() {
        reject("Error opening database.");
      };
    });
  }