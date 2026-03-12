import { rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PlaywrightAgent } from '@/web/playwright/index';
import { processCacheConfig } from '@/core/utils';
import { DEFAULT_WAIT_FOR_NAVIGATION_TIMEOUT, DEFAULT_WAIT_FOR_NETWORK_IDLE_TIMEOUT, } from '@/shared/constants';
import { getDebug } from '@/shared/logger';
import { uuid } from '@/shared/utils';
import { replaceIllegalPathCharsAndSpace } from '@/shared/utils';
import { test } from '@playwright/test';
const debugPage = getDebug('web:playwright:ai-fixture');
const groupAndCaseForTest = (testInfo) => {
    let taskFile;
    let taskTitle;
    const titlePath = [...testInfo.titlePath];
    if (titlePath.length > 1) {
        taskFile = titlePath.shift() || 'unnamed';
        taskTitle = titlePath.join('__');
    }
    else if (titlePath.length === 1) {
        taskTitle = titlePath[0];
        taskFile = `${taskTitle}`;
    }
    else {
        taskTitle = 'unnamed';
        taskFile = 'unnamed';
    }
    const taskTitleWithRetry = `${taskTitle}${testInfo.retry ? `(retry #${testInfo.retry})` : ''}`;
    return {
        file: taskFile,
        id: replaceIllegalPathCharsAndSpace(`${taskFile}(${taskTitle})`),
        title: replaceIllegalPathCharsAndSpace(taskTitleWithRetry),
    };
};
const midsceneAgentKeyId = '_midsceneAgentId';
export const midsceneDumpAnnotationId = 'MIDSCENE_DUMP_ANNOTATION';
// Track temporary dump files per page for cleanup
const pageTempFiles = new Map();
export const PlaywrightAiFixture = (options) => {
    const { forceSameTabNavigation = true, waitForNetworkIdleTimeout = DEFAULT_WAIT_FOR_NETWORK_IDLE_TIMEOUT, waitForNavigationTimeout = DEFAULT_WAIT_FOR_NAVIGATION_TIMEOUT, cache, } = options ?? {};
    // Helper function to process cache configuration and auto-generate ID from test info
    const processTestCacheConfig = (testInfo) => {
        // Generate ID from test info
        const { id } = groupAndCaseForTest(testInfo);
        // Use shared processCacheConfig with generated ID as fallback
        return processCacheConfig(cache, id);
    };
    const pageAgentMap = {};
    const createOrReuseAgentForPage = (page, testInfo, // { testId: string; taskFile: string; taskTitle: string },
    opts) => {
        let idForPage = page[midsceneAgentKeyId];
        if (!idForPage) {
            idForPage = uuid();
            page[midsceneAgentKeyId] = idForPage;
            const { testId } = testInfo;
            const { file, title } = groupAndCaseForTest(testInfo);
            const cacheConfig = processTestCacheConfig(testInfo);
            pageAgentMap[idForPage] = new PlaywrightAgent(page, {
                testId: `playwright-${testId}-${idForPage}`,
                forceSameTabNavigation,
                cache: cacheConfig,
                groupName: title,
                groupDescription: file,
                generateReport: false, // we will generate it in the reporter
                ...opts,
            });
            pageAgentMap[idForPage].onDumpUpdate = (dump) => {
                updateDumpAnnotation(testInfo, dump, idForPage);
            };
            page.on('close', () => {
                debugPage('page closed');
                // Clean up agent and temp file tracking
                // Note: serializeToFiles is already called in updateDumpAnnotation,
                // so we don't need to write files again here
                pageTempFiles.delete(idForPage);
                pageAgentMap[idForPage]?.destroy();
                delete pageAgentMap[idForPage];
            });
        }
        return pageAgentMap[idForPage];
    };
    async function generateAiFunction(options) {
        const { page, testInfo, use, aiActionType } = options;
        const agent = createOrReuseAgentForPage(page, testInfo, {
            waitForNavigationTimeout,
            waitForNetworkIdleTimeout,
        });
        await use(async (taskPrompt, ...args) => {
            return new Promise((resolve, reject) => {
                test.step(`ai-${aiActionType} - ${JSON.stringify(taskPrompt)}`, async () => {
                    try {
                        debugPage(`waitForNetworkIdle timeout: ${waitForNetworkIdleTimeout}`);
                        await agent.waitForNetworkIdle(waitForNetworkIdleTimeout);
                    }
                    catch (error) {
                        console.warn('[midscene:warning] Waiting for network idle has timed out, but Midscene will continue execution. Please check https://midscenejs.com/faq.html#customize-the-network-timeout for more information on customizing the network timeout');
                    }
                    try {
                        const result = await agent[aiActionType].bind(agent)(taskPrompt, ...args);
                        resolve(result);
                    }
                    catch (error) {
                        reject(error);
                    }
                });
            });
        });
    }
    const updateDumpAnnotation = (test, dump, pageId) => {
        // 1. First, clean up the old temp files if they exist
        const oldTempFilePath = pageTempFiles.get(pageId);
        if (oldTempFilePath) {
            try {
                rmSync(oldTempFilePath, { force: true });
                rmSync(`${oldTempFilePath}.screenshots`, {
                    force: true,
                    recursive: true,
                });
                rmSync(`${oldTempFilePath}.screenshots.json`, { force: true });
            }
            catch (error) {
                // Silently ignore if old files are already cleaned up
            }
        }
        // 2. Create new temp file with predictable name using pageId
        const tempFileName = `midscene-dump-${test.testId || uuid()}-${pageId}.json`;
        const tempFilePath = join(tmpdir(), tempFileName);
        // 3. Serialize dump with screenshots as separate files
        // This ensures Reporter can copy screenshots when outputFormat is 'html-and-external-assets'
        try {
            const agent = pageAgentMap[pageId];
            if (agent) {
                agent.dump.serializeToFiles(tempFilePath);
                debugPage(`Dump with screenshots serialized to: ${tempFilePath}`);
            }
            else {
                // Fallback: write dump string directly if agent not available
                writeFileSync(tempFilePath, dump, 'utf-8');
                debugPage(`Dump written to temp file: ${tempFilePath}`);
            }
            // 4. Track the new temp file (only if write succeeded)
            pageTempFiles.set(pageId, tempFilePath);
            // Store only the file path in annotation (only if write succeeded)
            const currentAnnotation = test.annotations.find((item) => {
                return item.type === midsceneDumpAnnotationId;
            });
            if (currentAnnotation) {
                // Store file path instead of dump content
                currentAnnotation.description = tempFilePath;
            }
            else {
                test.annotations.push({
                    type: midsceneDumpAnnotationId,
                    description: tempFilePath,
                });
            }
        }
        catch (error) {
            // If write fails (e.g., disk full), don't track the file or add annotation
            // This prevents reporter from trying to read a non-existent file
            debugPage(`Failed to write temp file: ${tempFilePath}. Skipping annotation.`, error);
        }
    };
    return {
        agentForPage: async ({ page }, use, testInfo) => {
            await use(async (propsPage, opts) => {
                const cacheConfig = processTestCacheConfig(testInfo);
                // Handle cache configuration priority:
                // 1. If user provides cache in opts, use it (but auto-generate ID if missing)
                // 2. Otherwise use fixture's cache config
                let finalCacheConfig = cacheConfig;
                if (opts?.cache !== undefined) {
                    const userCache = opts.cache;
                    if (userCache === false) {
                        finalCacheConfig = false;
                    }
                    else if (userCache === true) {
                        // Auto-generate ID for user's cache: true
                        const { id } = groupAndCaseForTest(testInfo);
                        finalCacheConfig = { id };
                    }
                    else if (typeof userCache === 'object') {
                        if (!userCache.id) {
                            // Auto-generate ID for user's cache object without ID
                            const { id } = groupAndCaseForTest(testInfo);
                            finalCacheConfig = { ...userCache, id };
                        }
                        else {
                            finalCacheConfig = userCache;
                        }
                    }
                }
                const agent = createOrReuseAgentForPage(propsPage || page, testInfo, {
                    waitForNavigationTimeout,
                    waitForNetworkIdleTimeout,
                    cache: finalCacheConfig,
                    ...opts,
                });
                return agent;
            });
        },
        ai: async ({ page }, use, testInfo) => {
            await generateAiFunction({
                page,
                testInfo,
                use,
                aiActionType: 'ai',
            });
        },
        aiAct: async ({ page }, use, testInfo) => {
            await generateAiFunction({
                page,
                testInfo,
                use,
                aiActionType: 'aiAct',
            });
        },
        /**
         * @deprecated Use {@link PlaywrightAiFixture.aiAct} instead.
         */
        aiAction: async ({ page }, use, testInfo) => {
            await generateAiFunction({
                page,
                testInfo,
                use,
                aiActionType: 'aiAction',
            });
        },
        aiTap: async ({ page }, use, testInfo) => {
            await generateAiFunction({
                page,
                testInfo,
                use,
                aiActionType: 'aiTap',
            });
        },
        aiRightClick: async ({ page }, use, testInfo) => {
            await generateAiFunction({
                page,
                testInfo,
                use,
                aiActionType: 'aiRightClick',
            });
        },
        aiDoubleClick: async ({ page }, use, testInfo) => {
            await generateAiFunction({
                page,
                testInfo,
                use,
                aiActionType: 'aiDoubleClick',
            });
        },
        aiHover: async ({ page }, use, testInfo) => {
            await generateAiFunction({
                page,
                testInfo,
                use,
                aiActionType: 'aiHover',
            });
        },
        aiInput: async ({ page }, use, testInfo) => {
            await generateAiFunction({
                page,
                testInfo,
                use,
                aiActionType: 'aiInput',
            });
        },
        aiKeyboardPress: async ({ page }, use, testInfo) => {
            await generateAiFunction({
                page,
                testInfo,
                use,
                aiActionType: 'aiKeyboardPress',
            });
        },
        aiScroll: async ({ page }, use, testInfo) => {
            await generateAiFunction({
                page,
                testInfo,
                use,
                aiActionType: 'aiScroll',
            });
        },
        aiQuery: async ({ page }, use, testInfo) => {
            await generateAiFunction({
                page,
                testInfo,
                use,
                aiActionType: 'aiQuery',
            });
        },
        aiAssert: async ({ page }, use, testInfo) => {
            await generateAiFunction({
                page,
                testInfo,
                use,
                aiActionType: 'aiAssert',
            });
        },
        aiWaitFor: async ({ page }, use, testInfo) => {
            await generateAiFunction({
                page,
                testInfo,
                use,
                aiActionType: 'aiWaitFor',
            });
        },
        aiLocate: async ({ page }, use, testInfo) => {
            await generateAiFunction({
                page,
                testInfo,
                use,
                aiActionType: 'aiLocate',
            });
        },
        aiNumber: async ({ page }, use, testInfo) => {
            await generateAiFunction({
                page,
                testInfo,
                use,
                aiActionType: 'aiNumber',
            });
        },
        aiString: async ({ page }, use, testInfo) => {
            await generateAiFunction({
                page,
                testInfo,
                use,
                aiActionType: 'aiString',
            });
        },
        aiBoolean: async ({ page }, use, testInfo) => {
            await generateAiFunction({
                page,
                testInfo,
                use,
                aiActionType: 'aiBoolean',
            });
        },
        aiAsk: async ({ page }, use, testInfo) => {
            await generateAiFunction({
                page,
                testInfo,
                use,
                aiActionType: 'aiAsk',
            });
        },
        runYaml: async ({ page }, use, testInfo) => {
            await generateAiFunction({
                page,
                testInfo,
                use,
                aiActionType: 'runYaml',
            });
        },
        setAIActionContext: async ({ page }, use, testInfo) => {
            await generateAiFunction({
                page,
                testInfo,
                use,
                aiActionType: 'setAIActionContext',
            });
        },
        evaluateJavaScript: async ({ page }, use, testInfo) => {
            await generateAiFunction({
                page,
                testInfo,
                use,
                aiActionType: 'evaluateJavaScript',
            });
        },
        recordToReport: async ({ page }, use, testInfo) => {
            await generateAiFunction({
                page,
                testInfo,
                use,
                aiActionType: 'recordToReport',
            });
        },
        logScreenshot: async ({ page }, use, testInfo) => {
            await generateAiFunction({
                page,
                testInfo,
                use,
                aiActionType: 'logScreenshot',
            });
        },
        freezePageContext: async ({ page }, use, testInfo) => {
            await generateAiFunction({
                page,
                testInfo,
                use,
                aiActionType: 'freezePageContext',
            });
        },
        unfreezePageContext: async ({ page }, use, testInfo) => {
            await generateAiFunction({
                page,
                testInfo,
                use,
                aiActionType: 'unfreezePageContext',
            });
        },
    };
};
