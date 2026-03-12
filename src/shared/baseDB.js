// Generic database operations class
export class IndexedDBManager {
    dbPromise;
    dbName;
    version;
    storeConfigs;
    constructor(dbName, version, storeConfigs) {
        this.dbName = dbName;
        this.version = version;
        this.storeConfigs = storeConfigs;
        this.dbPromise = this.initDB();
    }
    initDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                // Create stores if they don't exist
                this.storeConfigs.forEach(({ name, keyPath }) => {
                    if (!db.objectStoreNames.contains(name)) {
                        const store = db.createObjectStore(name, { keyPath });
                        store.createIndex('timestamp', 'timestamp', { unique: false });
                    }
                });
            };
        });
    }
    async withTransaction(storeNames, mode, operation) {
        const db = await this.dbPromise;
        const transaction = db.transaction(storeNames, mode);
        const stores = Array.isArray(storeNames)
            ? storeNames.map((name) => transaction.objectStore(name))
            : transaction.objectStore(storeNames);
        return operation(stores);
    }
    promisifyRequest(request) {
        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
    async put(storeName, data) {
        await this.withTransaction(storeName, 'readwrite', async (store) => {
            await this.promisifyRequest(store.put(data));
        });
    }
    async get(storeName, key) {
        return this.withTransaction(storeName, 'readonly', async (store) => {
            return this.promisifyRequest(store.get(key));
        });
    }
    async getAll(storeName, sortByTimestamp = true) {
        return this.withTransaction(storeName, 'readonly', async (store) => {
            const objectStore = store;
            const results = sortByTimestamp
                ? await this.promisifyRequest(objectStore.index('timestamp').getAll())
                : await this.promisifyRequest(objectStore.getAll());
            return sortByTimestamp
                ? results.sort((a, b) => a.timestamp - b.timestamp)
                : results;
        });
    }
    async clear(storeName) {
        await this.withTransaction(storeName, 'readwrite', async (store) => {
            await this.promisifyRequest(store.clear());
        });
    }
    async delete(storeName, key) {
        await this.withTransaction(storeName, 'readwrite', async (store) => {
            await this.promisifyRequest(store.delete(key));
        });
    }
    async count(storeName) {
        return this.withTransaction(storeName, 'readonly', async (store) => {
            return this.promisifyRequest(store.count());
        });
    }
    getDBPromise() {
        return this.dbPromise;
    }
}
// Generic error handler wrapper
export const withErrorHandling = async (operation, errorMessage, defaultValue, onQuotaExceeded) => {
    try {
        return await operation();
    }
    catch (e) {
        console.error(errorMessage, e);
        if (e instanceof Error &&
            e.name === 'QuotaExceededError' &&
            onQuotaExceeded) {
            console.log('Storage quota exceeded, running cleanup...');
            await onQuotaExceeded();
        }
        return defaultValue;
    }
};
// Base cleanup function for managing storage space
export const createCleanupFunction = (dbManager, storeName, maxItems) => {
    return async () => {
        try {
            const results = await dbManager.getAll(storeName);
            if (results.length > maxItems) {
                const toDelete = results
                    .sort((a, b) => a.timestamp - b.timestamp)
                    .slice(0, results.length - maxItems);
                await Promise.all(toDelete.map((item) => dbManager.delete(storeName, item.id)));
            }
        }
        catch (e) {
            console.error(`Failed to cleanup ${storeName}:`, e);
        }
    };
};
