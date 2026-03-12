import { existsSync, mkdirSync, statSync, truncateSync, writeFileSync, } from 'node:fs';
import { dirname, join } from 'node:path';
import { getMidsceneRunSubDir } from '@/shared/common';
import { MIDSCENE_REPORT_QUIET, globalConfigManager, } from '@/shared/env';
import { ifInBrowser, logMsg } from '@/shared/utils';
import { generateDumpScriptTag, generateImageScriptTag, getBaseUrlFixScript, } from './dump/html-utils';
import { appendFileSync, getReportTpl } from './utils';
export const nullReportGenerator = {
    onDumpUpdate: () => { },
    flush: async () => { },
    finalize: async () => undefined,
    getReportPath: () => undefined,
};
export class ReportGenerator {
    reportPath;
    screenshotMode;
    autoPrint;
    writtenScreenshots = new Set();
    firstWriteDone = false;
    // inline mode state
    imageEndOffset = 0;
    initialized = false;
    // write queue for serial execution
    writeQueue = Promise.resolve();
    destroyed = false;
    constructor(options) {
        this.reportPath = options.reportPath;
        this.screenshotMode = options.screenshotMode;
        this.autoPrint = options.autoPrint ?? true;
        this.printReportPath('will be generated at');
    }
    static create(reportFileName, opts) {
        if (opts.generateReport === false)
            return nullReportGenerator;
        // In browser environment, file system is not available
        if (ifInBrowser)
            return nullReportGenerator;
        if (opts.outputFormat === 'html-and-external-assets') {
            const outputDir = join(getMidsceneRunSubDir('report'), reportFileName);
            return new ReportGenerator({
                reportPath: join(outputDir, 'index.html'),
                screenshotMode: 'directory',
                autoPrint: opts.autoPrintReportMsg,
            });
        }
        return new ReportGenerator({
            reportPath: join(getMidsceneRunSubDir('report'), `${reportFileName}.html`),
            screenshotMode: 'inline',
            autoPrint: opts.autoPrintReportMsg,
        });
    }
    onDumpUpdate(dump) {
        this.writeQueue = this.writeQueue.then(() => {
            if (this.destroyed)
                return;
            this.doWrite(dump);
        });
    }
    async flush() {
        await this.writeQueue;
    }
    async finalize(dump) {
        this.onDumpUpdate(dump);
        await this.flush();
        this.destroyed = true;
        this.printReportPath('finalized');
        return this.reportPath;
    }
    getReportPath() {
        return this.reportPath;
    }
    printReportPath(verb) {
        if (!this.autoPrint || !this.reportPath)
            return;
        if (globalConfigManager.getEnvConfigInBoolean(MIDSCENE_REPORT_QUIET))
            return;
        if (this.screenshotMode === 'directory') {
            logMsg(`Midscene - report ${verb}: npx serve ${dirname(this.reportPath)}`);
        }
        else {
            logMsg(`Midscene - report ${verb}: ${this.reportPath}`);
        }
    }
    doWrite(dump) {
        if (this.screenshotMode === 'inline') {
            this.writeInlineReport(dump);
        }
        else {
            this.writeDirectoryReport(dump);
        }
        if (!this.firstWriteDone) {
            this.firstWriteDone = true;
            this.printReportPath('generated');
        }
    }
    writeInlineReport(dump) {
        const dir = dirname(this.reportPath);
        if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
        }
        if (!this.initialized) {
            writeFileSync(this.reportPath, getReportTpl());
            this.imageEndOffset = statSync(this.reportPath).size;
            this.initialized = true;
        }
        // 1. truncate: remove old dump JSON, keep template + existing image tags
        truncateSync(this.reportPath, this.imageEndOffset);
        // 2. append new image tags and release memory immediately after writing
        // Screenshots can be recovered from HTML file via lazy loading
        const screenshots = dump.collectAllScreenshots();
        for (const screenshot of screenshots) {
            if (!this.writtenScreenshots.has(screenshot.id)) {
                appendFileSync(this.reportPath, `\n${generateImageScriptTag(screenshot.id, screenshot.base64)}`);
                this.writtenScreenshots.add(screenshot.id);
                // Release memory - screenshot can be recovered via extractImageByIdSync
                screenshot.markPersistedInline(this.reportPath);
            }
        }
        // 3. update image end offset
        this.imageEndOffset = statSync(this.reportPath).size;
        // 4. append new dump JSON (compact { $screenshot: id } format)
        const serialized = dump.serialize();
        appendFileSync(this.reportPath, `\n${generateDumpScriptTag(serialized)}`);
    }
    writeDirectoryReport(dump) {
        const dir = dirname(this.reportPath);
        if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
        }
        // create screenshots subdirectory
        const screenshotsDir = join(dir, 'screenshots');
        if (!existsSync(screenshotsDir)) {
            mkdirSync(screenshotsDir, { recursive: true });
        }
        // 1. write new screenshots and release memory immediately
        // Screenshots can be recovered from disk via lazy loading
        const screenshots = dump.collectAllScreenshots();
        for (const screenshot of screenshots) {
            if (!this.writtenScreenshots.has(screenshot.id)) {
                const ext = screenshot.extension;
                const absolutePath = join(screenshotsDir, `${screenshot.id}.${ext}`);
                const buffer = Buffer.from(screenshot.rawBase64, 'base64');
                writeFileSync(absolutePath, buffer);
                this.writtenScreenshots.add(screenshot.id);
                screenshot.markPersistedToPath(`./screenshots/${screenshot.id}.${ext}`, absolutePath);
            }
        }
        // 2. write HTML with dump JSON (toSerializable() returns { $screenshot: id } format)
        const serialized = dump.serialize();
        writeFileSync(this.reportPath, `${getReportTpl()}${getBaseUrlFixScript()}${generateDumpScriptTag(serialized)}`);
    }
}
