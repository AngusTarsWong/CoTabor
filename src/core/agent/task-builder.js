import { findAllMidsceneLocatorField, parseActionParam } from '@/core/ai-model';
import { setTimingFieldOnce } from '@/core/task-timing';
import { ServiceError } from '@/core/types';
import { sleep } from '@/core/utils';
import { generateElementByRect } from '@/shared/extractor';
import { getDebug } from '@/shared/logger';
import { assert } from '@/shared/utils';
import { ifPlanLocateParamIsBbox, matchElementFromCache, matchElementFromPlan, transformLogicalElementToScreenshot, transformLogicalRectToScreenshotRect, } from './utils';
const debug = getDebug('agent:task-builder');
/**
 * Check if a cache object is non-empty
 */
function hasNonEmptyCache(cache) {
    return (cache !== null &&
        cache !== undefined &&
        typeof cache === 'object' &&
        Object.keys(cache).length > 0);
}
export function locatePlanForLocate(param) {
    const locate = typeof param === 'string' ? { prompt: param } : param;
    const locatePlan = {
        type: 'Locate',
        param: locate,
        thought: '',
    };
    return locatePlan;
}
export class TaskBuilder {
    interface;
    service;
    taskCache;
    actionSpace;
    waitAfterAction;
    constructor({ interfaceInstance, service, taskCache, actionSpace, waitAfterAction, }) {
        this.interface = interfaceInstance;
        this.service = service;
        this.taskCache = taskCache;
        this.actionSpace = actionSpace;
        this.waitAfterAction = waitAfterAction;
    }
    async build(plans, modelConfigForPlanning, modelConfigForDefaultIntent, options) {
        const tasks = [];
        const cacheable = options?.cacheable;
        const context = {
            tasks,
            modelConfigForPlanning,
            modelConfigForDefaultIntent,
            cacheable,
            deepLocate: options?.deepLocate,
            abortSignal: options?.abortSignal,
        };
        const planHandlers = new Map([
            [
                'Locate',
                (plan) => this.handleLocatePlan(plan, context),
            ],
            ['Finished', (plan) => this.handleFinishedPlan(plan, context)],
        ]);
        const defaultHandler = (plan) => this.handleActionPlan(plan, context);
        for (const plan of plans) {
            const handler = planHandlers.get(plan.type) ?? defaultHandler;
            await handler(plan);
        }
        return {
            tasks,
        };
    }
    handleFinishedPlan(plan, context) {
        const taskActionFinished = {
            type: 'Action Space',
            subType: 'Finished',
            param: null,
            thought: plan.thought,
            executor: async () => { },
        };
        context.tasks.push(taskActionFinished);
    }
    async handleLocatePlan(plan, context) {
        const taskLocate = this.createLocateTask(plan, plan.param, context);
        context.tasks.push(taskLocate);
    }
    async handleActionPlan(plan, context) {
        const planType = plan.type;
        const actionSpace = this.actionSpace;
        const action = actionSpace.find((item) => item.name === planType);
        const param = plan.param;
        if (!action) {
            throw new Error(`Action type '${planType}' not found`);
        }
        const locateFields = action
            ? findAllMidsceneLocatorField(action.paramSchema)
            : [];
        const requiredLocateFields = action
            ? findAllMidsceneLocatorField(action.paramSchema, true)
            : [];
        locateFields.forEach((field) => {
            if (param[field]) {
                // Always use createLocateTask for all locate params (including bbox)
                // This ensures cache writing happens even when bbox is available
                const locatePlan = locatePlanForLocate(param[field]);
                debug('will prepend locate param for field', `action.type=${planType}`, `param=${JSON.stringify(param[field])}`, `locatePlan=${JSON.stringify(locatePlan)}`, `hasBbox=${ifPlanLocateParamIsBbox(param[field])}`);
                const locateTask = this.createLocateTask(locatePlan, param[field], context, (result) => {
                    param[field] = result;
                });
                context.tasks.push(locateTask);
            }
            else {
                assert(!requiredLocateFields.includes(field), `Required locate field '${field}' is not provided for action ${planType}`);
                debug(`field '${field}' is not provided for action ${planType}`);
            }
        });
        const task = {
            type: 'Action Space',
            subType: planType,
            thought: plan.thought,
            param: plan.param,
            executor: async (param, taskContext) => {
                const timing = taskContext.task.timing;
                debug('executing action', planType, param, `taskContext.element.center: ${taskContext.element?.center}`);
                const uiContext = taskContext.uiContext;
                assert(uiContext, 'uiContext is required for Action task');
                requiredLocateFields.forEach((field) => {
                    assert(param[field], `field '${field}' is required for action ${planType} but not provided. Cannot execute action ${planType}.`);
                });
                setTimingFieldOnce(timing, 'beforeInvokeActionHookStart');
                try {
                    await Promise.all([
                        (async () => {
                            if (this.interface.beforeInvokeAction) {
                                debug(`will call "beforeInvokeAction" for interface with action name ${action.name}`);
                                await this.interface.beforeInvokeAction(action.name, param);
                                debug(`called "beforeInvokeAction" for interface with action name ${action.name}`);
                            }
                        })(),
                        sleep(200),
                    ]);
                }
                catch (originalError) {
                    const originalMessage = originalError?.message || String(originalError);
                    throw new Error(`error in running beforeInvokeAction for ${action.name}: ${originalMessage}`, { cause: originalError });
                }
                setTimingFieldOnce(timing, 'beforeInvokeActionHookEnd');
                const { shrunkShotToLogicalRatio } = uiContext;
                if (shrunkShotToLogicalRatio === undefined) {
                    throw new Error('shrunkShotToLogicalRatio is not defined in Action task');
                }
                if (action.paramSchema) {
                    try {
                        param = parseActionParam(param, action.paramSchema, {
                            shrunkShotToLogicalRatio,
                        });
                    }
                    catch (error) {
                        throw new Error(`Invalid parameters for action ${action.name}: ${error.message}\nParameters: ${JSON.stringify(param)}`, { cause: error });
                    }
                }
                setTimingFieldOnce(timing, 'callActionStart');
                debug('calling action', action.name);
                const actionFn = action.call.bind(this.interface);
                const actionResult = await actionFn(param, taskContext);
                setTimingFieldOnce(timing, 'callActionEnd');
                debug('called action', action.name, 'result:', actionResult);
                setTimingFieldOnce(timing, 'afterInvokeActionHookStart');
                const delayAfterRunner = action.delayAfterRunner ?? this.waitAfterAction ?? 300;
                if (delayAfterRunner > 0) {
                    await sleep(delayAfterRunner);
                }
                try {
                    if (this.interface.afterInvokeAction) {
                        debug(`will call "afterInvokeAction" for interface with action name ${action.name}`);
                        await this.interface.afterInvokeAction(action.name, param);
                        debug(`called "afterInvokeAction" for interface with action name ${action.name}`);
                    }
                }
                catch (originalError) {
                    const originalMessage = originalError?.message || String(originalError);
                    throw new Error(`error in running afterInvokeAction for ${action.name}: ${originalMessage}`, { cause: originalError });
                }
                setTimingFieldOnce(timing, 'afterInvokeActionHookEnd');
                return {
                    output: actionResult,
                };
            },
        };
        context.tasks.push(task);
    }
    createLocateTask(plan, detailedLocateParam, context, onResult) {
        const { cacheable, modelConfigForDefaultIntent, deepLocate, abortSignal } = context;
        let locateParam = detailedLocateParam;
        if (typeof locateParam === 'string') {
            locateParam = {
                prompt: locateParam,
            };
        }
        if (cacheable !== undefined) {
            locateParam = {
                ...locateParam,
                cacheable,
            };
        }
        if (deepLocate && !locateParam.deepLocate) {
            locateParam = {
                ...locateParam,
                deepLocate: true,
            };
        }
        const taskLocator = {
            type: 'Planning',
            subType: 'Locate',
            param: locateParam,
            thought: plan.thought,
            executor: async (param, taskContext) => {
                const { task } = taskContext;
                let { uiContext } = taskContext;
                assert(param?.prompt || param?.bbox, `No prompt or id or position or bbox to locate, param=${JSON.stringify(param)}`);
                if (!uiContext) {
                    uiContext = await this.service.contextRetrieverFn();
                }
                assert(uiContext, 'uiContext is required for Service task');
                const { shrunkShotToLogicalRatio } = uiContext;
                if (shrunkShotToLogicalRatio === undefined) {
                    throw new Error('shrunkShotToLogicalRatio is not defined in locate task');
                }
                let locateDump;
                let locateResult;
                const applyDump = (dump) => {
                    if (!dump) {
                        return;
                    }
                    locateDump = dump;
                    task.log = {
                        dump,
                        rawResponse: dump.taskInfo?.rawResponse,
                    };
                    task.usage = dump.taskInfo?.usage;
                    if (dump.taskInfo?.searchAreaUsage) {
                        task.searchAreaUsage = dump.taskInfo.searchAreaUsage;
                    }
                    if (dump.taskInfo?.reasoning_content) {
                        task.reasoning_content = dump.taskInfo.reasoning_content;
                    }
                };
                // from bbox (plan hit)
                const elementFromBbox = ifPlanLocateParamIsBbox(param)
                    ? matchElementFromPlan(param)
                    : undefined;
                const isPlanHit = !!elementFromBbox;
                // from xpath
                let rectFromXpath;
                if (!isPlanHit &&
                    param.xpath &&
                    this.interface.rectMatchesCacheFeature) {
                    try {
                        rectFromXpath = await this.interface.rectMatchesCacheFeature({
                            xpaths: [param.xpath],
                        });
                    }
                    catch {
                        // xpath locate failed, allow fallback to cache or AI locate
                    }
                }
                const elementFromXpath = rectFromXpath
                    ? generateElementByRect(
                    // rectFromXpath is in logical coordinates, which should be transformed to screenshot coordinates;
                    transformLogicalRectToScreenshotRect(rectFromXpath, shrunkShotToLogicalRatio), typeof param.prompt === 'string'
                        ? param.prompt
                        : param.prompt?.prompt || '')
                    : undefined;
                const isXpathHit = !!elementFromXpath;
                const cachePrompt = param.prompt;
                const locateCacheRecord = this.taskCache?.matchLocateCache(cachePrompt);
                const cacheEntry = locateCacheRecord?.cacheContent?.cache;
                const elementFromCacheResult = isPlanHit || isXpathHit
                    ? null
                    : await matchElementFromCache({
                        taskCache: this.taskCache,
                        interfaceInstance: this.interface,
                    }, cacheEntry, cachePrompt, param.cacheable);
                // elementFromCacheResult is in logical coordinates, which should be transformed to screenshot coordinates;
                const elementFromCache = elementFromCacheResult
                    ? transformLogicalElementToScreenshot(elementFromCacheResult, shrunkShotToLogicalRatio)
                    : undefined;
                const isCacheHit = !!elementFromCache;
                let elementFromAiLocate;
                const timing = taskContext.task.timing;
                if (!isXpathHit && !isCacheHit && !isPlanHit) {
                    try {
                        setTimingFieldOnce(timing, 'callAiStart');
                        locateResult = await this.service.locate(param, {
                            context: uiContext,
                        }, modelConfigForDefaultIntent, abortSignal);
                        applyDump(locateResult.dump);
                        elementFromAiLocate = locateResult.element;
                    }
                    catch (error) {
                        if (error instanceof ServiceError) {
                            applyDump(error.dump);
                        }
                        throw error;
                    }
                    finally {
                        setTimingFieldOnce(timing, 'callAiEnd');
                    }
                }
                const element = elementFromBbox ||
                    elementFromXpath ||
                    elementFromCache ||
                    elementFromAiLocate;
                // Check if locate cache already exists (for planHitFlag case)
                const locateCacheAlreadyExists = hasNonEmptyCache(locateCacheRecord?.cacheContent?.cache);
                let currentCacheEntry;
                // Write cache if:
                // 1. element found
                // 2. taskCache enabled
                // 3. not a cache hit (otherwise we'd be writing what we just read)
                // 4. not already cached for plan hit case (avoid redundant writes), OR allow update if cache validation failed
                // 5. cacheable is not explicitly false
                if (element &&
                    this.taskCache &&
                    !isCacheHit &&
                    (!isPlanHit || !locateCacheAlreadyExists) &&
                    param?.cacheable !== false) {
                    if (this.interface.cacheFeatureForPoint) {
                        try {
                            // Transform coordinates to logical space for cacheFeatureForPoint
                            // cacheFeatureForPoint needs logical coordinates to locate elements in DOM
                            let pointForCache = element.center;
                            if (shrunkShotToLogicalRatio !== 1) {
                                pointForCache = [
                                    Math.round(element.center[0] / shrunkShotToLogicalRatio),
                                    Math.round(element.center[1] / shrunkShotToLogicalRatio),
                                ];
                                debug('Transformed coordinates for cacheFeatureForPoint: %o -> %o', element.center, pointForCache);
                            }
                            const feature = await this.interface.cacheFeatureForPoint(pointForCache, {
                                targetDescription: typeof param.prompt === 'string'
                                    ? param.prompt
                                    : param.prompt?.prompt,
                                modelConfig: modelConfigForDefaultIntent,
                            });
                            if (hasNonEmptyCache(feature)) {
                                debug('update cache, prompt: %s, cache: %o', cachePrompt, feature);
                                currentCacheEntry = feature;
                                this.taskCache.updateOrAppendCacheRecord({
                                    type: 'locate',
                                    prompt: cachePrompt,
                                    cache: feature,
                                }, locateCacheRecord);
                            }
                            else {
                                debug('no cache data returned, skip cache update, prompt: %s', cachePrompt);
                            }
                        }
                        catch (error) {
                            debug('cacheFeatureForPoint failed: %s', error);
                        }
                    }
                    else {
                        debug('cacheFeatureForPoint is not supported, skip cache update');
                    }
                }
                if (!element) {
                    if (locateDump) {
                        throw new ServiceError(`Element not found : ${param.prompt}`, locateDump);
                    }
                    throw new Error(`Element not found: ${param.prompt}`);
                }
                let hitBy;
                if (isPlanHit) {
                    hitBy = {
                        from: 'Plan',
                        context: {
                            bbox: param.bbox,
                        },
                    };
                }
                else if (isXpathHit) {
                    hitBy = {
                        from: 'User expected path',
                        context: {
                            xpath: param.xpath,
                        },
                    };
                }
                else if (isCacheHit) {
                    hitBy = {
                        from: 'Cache',
                        context: {
                            cacheEntry,
                            cacheToSave: currentCacheEntry,
                        },
                    };
                }
                onResult?.(element);
                return {
                    output: {
                        element: {
                            ...element,
                            // backward compatibility for aiLocate, which return value needs a dpr field
                            dpr: uiContext.deprecatedDpr,
                        },
                    },
                    hitBy,
                };
            },
        };
        return taskLocator;
    }
}
