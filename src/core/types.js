/* eslint-disable @typescript-eslint/no-explicit-any */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, } from 'node:fs';
import { join } from 'node:path';
import { restoreImageReferences } from './dump/image-restoration';
import { ScreenshotItem } from './screenshot-item';
export * from './yaml';
/**
 * context
 */
export class UIContext {
}
export class ServiceError extends Error {
    dump;
    constructor(message, dump) {
        super(message);
        this.name = 'ServiceError';
        this.dump = dump;
    }
}
/**
 * Replacer function for JSON serialization that handles Page, Browser objects and ScreenshotItem
 */
function replacerForDumpSerialization(_key, value) {
    if (value && value.constructor?.name === 'Page') {
        return '[Page object]';
    }
    if (value && value.constructor?.name === 'Browser') {
        return '[Browser object]';
    }
    // Handle ScreenshotItem serialization
    if (value && typeof value.toSerializable === 'function') {
        return value.toSerializable();
    }
    return value;
}
/**
 * Reviver function for JSON deserialization that handles ScreenshotItem formats.
 *
 * BEHAVIOR:
 * - For { $screenshot: "id" } format: Left as-is (plain object)
 *   Consumer must use imageMap to restore base64 data
 * - For { base64: "..." } format: Creates ScreenshotItem from base64 data
 *
 * @param key - JSON key being processed
 * @param value - JSON value being processed
 * @returns Restored value
 */
function reviverForDumpDeserialization(key, value) {
    // Only process screenshot fields
    if (key !== 'screenshot' || typeof value !== 'object' || value === null) {
        return value;
    }
    // Handle serialized format: { $screenshot: "id" }
    // Leave as plain object — consumer uses imageMap to restore
    if (ScreenshotItem.isSerialized(value)) {
        return value;
    }
    // Handle inline base64 format: { base64: "..." }
    if ('base64' in value && typeof value.base64 === 'string') {
        return value;
    }
    return value;
}
/**
 * ExecutionDump class for serializing and deserializing execution dumps
 */
export class ExecutionDump {
    logTime;
    name;
    description;
    tasks;
    aiActContext;
    constructor(data) {
        this.logTime = data.logTime;
        this.name = data.name;
        this.description = data.description;
        this.tasks = data.tasks;
        this.aiActContext = data.aiActContext;
    }
    /**
     * Serialize the ExecutionDump to a JSON string
     */
    serialize(indents) {
        return JSON.stringify(this.toJSON(), replacerForDumpSerialization, indents);
    }
    /**
     * Convert to a plain object for JSON serialization
     */
    toJSON() {
        return {
            logTime: this.logTime,
            name: this.name,
            description: this.description,
            tasks: this.tasks.map((task) => ({
                ...task,
                recorder: task.recorder || [],
            })),
            aiActContext: this.aiActContext,
        };
    }
    /**
     * Create an ExecutionDump instance from a serialized JSON string
     */
    static fromSerializedString(serialized) {
        const parsed = JSON.parse(serialized, reviverForDumpDeserialization);
        return new ExecutionDump(parsed);
    }
    /**
     * Create an ExecutionDump instance from a plain object
     */
    static fromJSON(data) {
        return new ExecutionDump(data);
    }
    /**
     * Collect all ScreenshotItem instances from tasks.
     * Scans through uiContext and recorder items to find screenshots.
     *
     * @returns Array of ScreenshotItem instances
     */
    collectScreenshots() {
        const screenshots = [];
        for (const task of this.tasks) {
            // Collect uiContext.screenshot if present
            if (task.uiContext?.screenshot instanceof ScreenshotItem) {
                screenshots.push(task.uiContext.screenshot);
            }
            // Collect recorder screenshots
            if (task.recorder) {
                for (const record of task.recorder) {
                    if (record.screenshot instanceof ScreenshotItem) {
                        screenshots.push(record.screenshot);
                    }
                }
            }
        }
        return screenshots;
    }
}
/**
 * GroupedActionDump class for serializing and deserializing grouped action dumps
 */
export class GroupedActionDump {
    sdkVersion;
    groupName;
    groupDescription;
    modelBriefs;
    executions;
    deviceType;
    constructor(data) {
        this.sdkVersion = data.sdkVersion;
        this.groupName = data.groupName;
        this.groupDescription = data.groupDescription;
        this.modelBriefs = data.modelBriefs;
        this.executions = data.executions.map((exec) => exec instanceof ExecutionDump ? exec : ExecutionDump.fromJSON(exec));
        this.deviceType = data.deviceType;
    }
    /**
     * Serialize the GroupedActionDump to a JSON string
     * Uses compact { $screenshot: id } format
     */
    serialize(indents) {
        return JSON.stringify(this.toJSON(), replacerForDumpSerialization, indents);
    }
    /**
     * Serialize the GroupedActionDump with inline screenshots to a JSON string.
     * Each ScreenshotItem is replaced with { base64: "...", capturedAt }.
     */
    serializeWithInlineScreenshots(indents) {
        const processValue = (obj) => {
            if (obj instanceof ScreenshotItem) {
                return { base64: obj.base64, capturedAt: obj.capturedAt };
            }
            if (Array.isArray(obj)) {
                return obj.map(processValue);
            }
            if (obj && typeof obj === 'object') {
                const entries = Object.entries(obj).map(([key, value]) => [
                    key,
                    processValue(value),
                ]);
                return Object.fromEntries(entries);
            }
            return obj;
        };
        const data = processValue(this.toJSON());
        return JSON.stringify(data, null, indents);
    }
    /**
     * Convert to a plain object for JSON serialization
     */
    toJSON() {
        return {
            sdkVersion: this.sdkVersion,
            groupName: this.groupName,
            groupDescription: this.groupDescription,
            modelBriefs: this.modelBriefs,
            executions: this.executions.map((exec) => exec.toJSON()),
            deviceType: this.deviceType,
        };
    }
    /**
     * Create a GroupedActionDump instance from a serialized JSON string
     */
    static fromSerializedString(serialized) {
        const parsed = JSON.parse(serialized, reviverForDumpDeserialization);
        return new GroupedActionDump(parsed);
    }
    /**
     * Create a GroupedActionDump instance from a plain object
     */
    static fromJSON(data) {
        return new GroupedActionDump(data);
    }
    /**
     * Collect all ScreenshotItem instances from all executions.
     *
     * @returns Array of all ScreenshotItem instances across all executions
     */
    collectAllScreenshots() {
        const screenshots = [];
        for (const execution of this.executions) {
            screenshots.push(...execution.collectScreenshots());
        }
        return screenshots;
    }
    /**
     * Serialize the dump to files with screenshots as separate PNG files.
     * Creates:
     * - {basePath} - dump JSON with { $screenshot: id } references
     * - {basePath}.screenshots/ - PNG files
     * - {basePath}.screenshots.json - ID to path mapping
     *
     * @param basePath - Base path for the dump file
     */
    serializeToFiles(basePath) {
        const screenshotsDir = `${basePath}.screenshots`;
        if (!existsSync(screenshotsDir)) {
            mkdirSync(screenshotsDir, { recursive: true });
        }
        // Write screenshots to separate files
        const screenshotMap = {};
        const screenshots = this.collectAllScreenshots();
        for (const screenshot of screenshots) {
            if (screenshot.hasBase64()) {
                const imagePath = join(screenshotsDir, `${screenshot.id}.${screenshot.extension}`);
                const rawBase64 = screenshot.rawBase64;
                writeFileSync(imagePath, Buffer.from(rawBase64, 'base64'));
                screenshotMap[screenshot.id] = imagePath;
            }
        }
        // Write screenshot map file
        writeFileSync(`${basePath}.screenshots.json`, JSON.stringify(screenshotMap), 'utf-8');
        // Write dump JSON with references
        writeFileSync(basePath, this.serialize(), 'utf-8');
    }
    /**
     * Read dump from files and return JSON string with inline screenshots.
     * Reads the dump JSON and screenshot files, then inlines the base64 data.
     *
     * @param basePath - Base path for the dump file
     * @returns JSON string with inline screenshots ({ base64: "..." } format)
     */
    static fromFilesAsInlineJson(basePath) {
        const dumpString = readFileSync(basePath, 'utf-8');
        const screenshotsMapPath = `${basePath}.screenshots.json`;
        if (!existsSync(screenshotsMapPath)) {
            return dumpString;
        }
        // Read screenshot map and build imageMap from files
        const screenshotMap = JSON.parse(readFileSync(screenshotsMapPath, 'utf-8'));
        const imageMap = {};
        for (const [id, filePath] of Object.entries(screenshotMap)) {
            if (existsSync(filePath)) {
                const data = readFileSync(filePath);
                const mime = filePath.endsWith('.jpeg') || filePath.endsWith('.jpg')
                    ? 'jpeg'
                    : 'png';
                imageMap[id] = `data:image/${mime};base64,${data.toString('base64')}`;
            }
        }
        // Restore image references
        const dumpData = JSON.parse(dumpString);
        const processedData = restoreImageReferences(dumpData, (id) => imageMap[id] ?? '');
        return JSON.stringify(processedData);
    }
    /**
     * Clean up all files associated with a serialized dump.
     *
     * @param basePath - Base path for the dump file
     */
    static cleanupFiles(basePath) {
        const filesToClean = [
            basePath,
            `${basePath}.screenshots.json`,
            `${basePath}.screenshots`,
        ];
        for (const filePath of filesToClean) {
            try {
                rmSync(filePath, { force: true, recursive: true });
            }
            catch {
                // Ignore errors - file may already be deleted
            }
        }
    }
    /**
     * Get all file paths associated with a serialized dump.
     *
     * @param basePath - Base path for the dump file
     * @returns Array of all associated file paths
     */
    static getFilePaths(basePath) {
        return [
            basePath,
            `${basePath}.screenshots.json`,
            `${basePath}.screenshots`,
        ];
    }
}
