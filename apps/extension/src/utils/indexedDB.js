const DB_NAME = 'cotabor-db';
const DB_VERSION = 1;
const SESSIONS_STORE = 'recording-sessions';
const CONFIG_STORE = 'config';
// Key for current session ID in config store
const CURRENT_SESSION_ID_KEY = 'current-session-id';
class IndexedDBManager {
    db = null;
    initPromise = null;
    isInitialized = false;
    async init() {
        if (this.isInitialized)
            return;
        if (this.initPromise)
            return this.initPromise;
        this.initPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onerror = () => {
                console.error('IndexedDB open error:', request.error);
                reject(request.error);
            };
            request.onsuccess = () => {
                this.db = request.result;
                this.isInitialized = true;
                resolve();
            };
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(SESSIONS_STORE)) {
                    const store = db.createObjectStore(SESSIONS_STORE, { keyPath: 'id' });
                    store.createIndex('createdAt', 'createdAt', { unique: false });
                }
                if (!db.objectStoreNames.contains(CONFIG_STORE)) {
                    db.createObjectStore(CONFIG_STORE, { keyPath: 'key' });
                }
            };
        });
        return this.initPromise;
    }
    async ensureDB() {
        await this.init();
        if (!this.db)
            throw new Error('Database not initialized');
        return this.db;
    }
    // Session operations
    async getAllSessions() {
        const db = await this.ensureDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([SESSIONS_STORE], 'readonly');
            const store = transaction.objectStore(SESSIONS_STORE);
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
    async getSession(id) {
        const db = await this.ensureDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([SESSIONS_STORE], 'readonly');
            const store = transaction.objectStore(SESSIONS_STORE);
            const request = store.get(id);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
    async saveSession(session) {
        const db = await this.ensureDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([SESSIONS_STORE], 'readwrite');
            const store = transaction.objectStore(SESSIONS_STORE);
            const request = store.put(session);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }
    async deleteSession(id) {
        const db = await this.ensureDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([SESSIONS_STORE], 'readwrite');
            const store = transaction.objectStore(SESSIONS_STORE);
            const request = store.delete(id);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }
    // Config operations (e.g., current session ID)
    async getCurrentSessionId() {
        const db = await this.ensureDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([CONFIG_STORE], 'readonly');
            const store = transaction.objectStore(CONFIG_STORE);
            const request = store.get(CURRENT_SESSION_ID_KEY);
            request.onsuccess = () => resolve(request.result?.value || null);
            request.onerror = () => reject(request.error);
        });
    }
    async setCurrentSessionId(id) {
        const db = await this.ensureDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([CONFIG_STORE], 'readwrite');
            const store = transaction.objectStore(CONFIG_STORE);
            const request = store.put({ key: CURRENT_SESSION_ID_KEY, value: id });
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }
}
export const dbManager = new IndexedDBManager();
