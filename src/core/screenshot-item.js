import { readFileSync } from 'node:fs';
import { uuid } from '@/shared/utils';
import { extractImageByIdSync } from './dump/html-utils';
/**
 * Detect image format from base64 data URI prefix.
 */
function detectFormat(base64) {
    if (base64.startsWith('data:image/jpeg'))
        return 'jpeg';
    if (base64.startsWith('data:image/jpg'))
        return 'jpeg';
    return 'png';
}
/**
 * ScreenshotItem encapsulates screenshot data.
 *
 * Supports lazy loading after memory release:
 * - inline mode: reads from HTML file using streaming (extractImageByIdSync)
 * - directory mode: reads from file on disk
 *
 * After persistence, memory is released but the screenshot can be recovered
 * on-demand from disk, making it safe to release memory at any time.
 */
export class ScreenshotItem {
    _id;
    _base64;
    _format;
    _capturedAt;
    _persistedAs = null;
    _persistedPath = null;
    _persistedHtmlPath = null;
    constructor(id, base64, capturedAt) {
        this._id = id;
        this._base64 = base64;
        this._format = detectFormat(base64);
        this._capturedAt = capturedAt;
    }
    /** Create a new ScreenshotItem from base64 data */
    static create(base64, capturedAt) {
        return new ScreenshotItem(uuid(), base64, capturedAt);
    }
    get id() {
        return this._id;
    }
    /** Get the image format (png or jpeg) */
    get format() {
        return this._format;
    }
    /** Get the file extension for this screenshot */
    get extension() {
        return this._format === 'jpeg' ? 'jpeg' : 'png';
    }
    /** Get screenshot capture timestamp in milliseconds */
    get capturedAt() {
        return this._capturedAt;
    }
    get base64() {
        // If data is in memory, return it directly
        if (this._base64 !== null) {
            return this._base64;
        }
        // Directory mode: recover from file
        if (this._persistedPath !== null) {
            const buffer = readFileSync(this._persistedPath);
            return `data:image/${this._format};base64,${buffer.toString('base64')}`;
        }
        // Inline mode: recover from HTML file using streaming
        if (this._persistedHtmlPath !== null) {
            const data = extractImageByIdSync(this._persistedHtmlPath, this._id);
            if (data) {
                return data;
            }
            throw new Error(`Screenshot ${this._id}: cannot recover from HTML (id not found in ${this._persistedHtmlPath})`);
        }
        throw new Error(`Screenshot ${this._id}: base64 data released without recovery path`);
    }
    /** Check if base64 data is still available in memory (not yet released) */
    hasBase64() {
        return this._base64 !== null;
    }
    /**
     * Mark as persisted to HTML (inline mode).
     * Releases base64 memory, but keeps HTML path for lazy loading recovery.
     * @param htmlPath - absolute path to the HTML file containing the image
     */
    markPersistedInline(htmlPath) {
        this._persistedAs = {
            $screenshot: this._id,
            capturedAt: this._capturedAt,
        };
        this._persistedHtmlPath = htmlPath;
        this._base64 = null;
    }
    /**
     * Mark as persisted to file (directory mode).
     * Releases base64 memory, but keeps file path for lazy loading recovery.
     * @param relativePath - relative path for serialization (e.g., "./screenshots/id.jpeg")
     * @param absolutePath - absolute path for lazy loading recovery
     */
    markPersistedToPath(relativePath, absolutePath) {
        this._persistedAs = {
            base64: relativePath,
            capturedAt: this._capturedAt,
        };
        this._persistedPath = absolutePath;
        this._base64 = null;
    }
    /** Serialize for JSON - format depends on persistence state */
    toSerializable() {
        return (this._persistedAs ?? {
            $screenshot: this._id,
            capturedAt: this._capturedAt,
        });
    }
    /** Check if a value is a serialized ScreenshotItem reference (inline or directory mode) */
    static isSerialized(value) {
        if (typeof value !== 'object' || value === null)
            return false;
        const record = value;
        // Check for inline mode: { $screenshot: string }
        if ('$screenshot' in record && typeof record.$screenshot === 'string') {
            if (!('capturedAt' in record) || typeof record.capturedAt !== 'number') {
                return false;
            }
            return true;
        }
        // Check for directory mode: { base64: string } where base64 is a path
        if ('base64' in record && typeof record.base64 === 'string') {
            if (!('capturedAt' in record) || typeof record.capturedAt !== 'number') {
                return false;
            }
            return true;
        }
        return false;
    }
    /**
     * Get base64 data without the data URI prefix.
     * Useful for writing raw binary data to files.
     */
    get rawBase64() {
        return this.base64.replace(/^data:image\/(png|jpeg|jpg);base64,/, '');
    }
}
