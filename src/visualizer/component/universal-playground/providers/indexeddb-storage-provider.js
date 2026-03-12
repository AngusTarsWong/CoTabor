import { IndexedDBManager, createCleanupFunction, withErrorHandling, } from '@/shared/baseDB';
// Database configuration
const DB_NAME = 'midscene_playground';
const DB_VERSION = 1;
const MESSAGES_STORE = 'playground_messages';
const RESULTS_STORE = 'playground_results';
// Maximum stored items to prevent storage bloat
const MAX_STORED_MESSAGES = 100;
const MAX_STORED_RESULTS = 50;
/**
 * IndexedDB Storage implementation for playground message persistence
 * Provides much larger storage capacity compared to localStorage
 */
export class IndexedDBStorageProvider {
    dbManager;
    namespace;
    messagesCleanup;
    resultsCleanup;
    constructor(namespace = 'playground') {
        this.namespace = namespace;
        // Create database manager with namespaced database name
        this.dbManager = new IndexedDBManager(`${DB_NAME}_${namespace}`, DB_VERSION, [
            { name: MESSAGES_STORE, keyPath: 'id' },
            { name: RESULTS_STORE, keyPath: 'id' },
        ]);
        // Create cleanup functions
        this.messagesCleanup = createCleanupFunction(this.dbManager, MESSAGES_STORE, MAX_STORED_MESSAGES);
        this.resultsCleanup = createCleanupFunction(this.dbManager, RESULTS_STORE, MAX_STORED_RESULTS);
    }
    /**
     * Save messages to IndexedDB
     */
    async saveMessages(messages) {
        await withErrorHandling(async () => {
            // Clear existing messages first
            await this.dbManager.clear(MESSAGES_STORE);
            // Limit messages to prevent storage bloat
            const messagesToSave = messages.slice(-MAX_STORED_MESSAGES);
            // Store each message (without heavy result data)
            await Promise.all(messagesToSave.map((msg, index) => {
                const lightMessage = {
                    ...msg,
                    result: msg.type === 'result' ? undefined : msg.result, // Remove heavy result data only for 'result' type
                };
                const data = {
                    id: msg.id || `msg-${index}`,
                    data: lightMessage,
                    timestamp: msg.timestamp
                        ? msg.timestamp.getTime()
                        : Date.now() + index,
                };
                return this.dbManager.put(MESSAGES_STORE, data);
            }));
        }, 'Failed to save messages to IndexedDB', undefined, this.messagesCleanup);
    }
    /**
     * Load messages from IndexedDB
     */
    async loadMessages() {
        const result = await withErrorHandling(async () => {
            const messages = await this.dbManager.getAll(MESSAGES_STORE, true);
            if (messages.length === 0) {
                return [];
            }
            // Restore messages with proper data handling
            return Promise.all(messages.map(async (msg) => {
                const item = msg.data;
                const restoredItem = {
                    ...item,
                    timestamp: new Date(item.timestamp),
                };
                // For result items, try to load the full result data
                if (item.type === 'result' && item.id) {
                    const fullResult = await this.loadResult(item.id);
                    if (fullResult) {
                        restoredItem.result = fullResult.result;
                        restoredItem.replayScriptsInfo = fullResult.replayScriptsInfo;
                        restoredItem.replayCounter = fullResult.replayCounter;
                        restoredItem.verticalMode = fullResult.verticalMode;
                    }
                }
                return restoredItem;
            }));
        }, 'Failed to load messages from IndexedDB', [], this.messagesCleanup);
        return result || [];
    }
    /**
     * Clear all messages from IndexedDB
     */
    async clearMessages() {
        await withErrorHandling(async () => {
            await Promise.all([
                this.dbManager.clear(MESSAGES_STORE),
                this.dbManager.clear(RESULTS_STORE),
            ]);
        }, 'Failed to clear messages from IndexedDB');
    }
    /**
     * Save a single result to IndexedDB with compression
     */
    async saveResult(id, result) {
        await withErrorHandling(async () => {
            // Compress result data for storage
            const compressedResult = this.compressResultForStorage(result);
            const data = {
                id,
                data: compressedResult,
                timestamp: Date.now(),
                size: JSON.stringify(compressedResult).length,
            };
            await this.dbManager.put(RESULTS_STORE, data);
        }, 'Failed to save result to IndexedDB', undefined, this.resultsCleanup);
    }
    /**
     * Load a single result from IndexedDB
     */
    async loadResult(id) {
        const result = await withErrorHandling(async () => {
            const data = await this.dbManager.get(RESULTS_STORE, id);
            return data?.data || null;
        }, 'Failed to load result from IndexedDB', null);
        return result || null;
    }
    /**
     * Compress result data for storage while preserving playback functionality
     */
    compressResultForStorage(result) {
        if (!result.result?.dump?.tasks) {
            return result;
        }
        // ExecutionDump now has tasks directly (not wrapped in executions array)
        const compressedTasks = result.result.dump.tasks.map((task) => ({
            ...task,
            // Compress screenshots if they're too large (>1MB)
            uiContext: task.uiContext
                ? {
                    ...task.uiContext,
                    screenshot: task.uiContext.screenshot,
                }
                : task.uiContext,
            // Compress recorder screenshots
            recorder: task.recorder?.map((record) => ({
                ...record,
                screenshot: record.screenshot,
            })),
        }));
        return {
            ...result,
            result: {
                ...result.result,
                dump: {
                    ...result.result.dump,
                    tasks: compressedTasks,
                },
            },
        };
    }
    /**
     * Compress screenshot if it exceeds size threshold
     */
    compressScreenshotIfNeeded(screenshot) {
        if (!screenshot)
            return screenshot;
        // If screenshot is larger than 1MB, replace with placeholder
        if (screenshot.length > 1024 * 1024) {
            const sizeKB = Math.round(screenshot.length / 1024);
            return `[COMPRESSED: ${sizeKB}KB screenshot removed for storage]`;
        }
        return screenshot;
    }
    /**
     * Get storage statistics
     */
    async getStorageStats() {
        const result = await withErrorHandling(async () => {
            const [messageCount, resultCount] = await Promise.all([
                this.dbManager.count(MESSAGES_STORE),
                this.dbManager.count(RESULTS_STORE),
            ]);
            return { messageCount, resultCount };
        }, 'Failed to get storage statistics', { messageCount: 0, resultCount: 0 });
        return result || { messageCount: 0, resultCount: 0 };
    }
    /**
     * Manually trigger cleanup
     */
    async cleanup() {
        await Promise.all([this.messagesCleanup(), this.resultsCleanup()]);
    }
}
/**
 * Memory-based storage provider for IndexedDB fallback
 */
export class MemoryStorageProvider {
    messages = [];
    results = new Map();
    async saveMessages(messages) {
        this.messages = [...messages];
    }
    async loadMessages() {
        return [...this.messages];
    }
    async clearMessages() {
        this.messages = [];
        this.results.clear();
    }
    async saveResult(id, result) {
        this.results.set(id, result);
    }
}
/**
 * No-op storage provider for disabled storage
 */
export class NoOpStorageProvider {
    async saveMessages(_messages) {
        // No-op
    }
    async loadMessages() {
        return [];
    }
    async clearMessages() {
        // No-op
    }
    async saveResult(_id, _result) {
        // No-op
    }
}
