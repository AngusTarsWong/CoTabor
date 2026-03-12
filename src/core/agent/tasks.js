import { AIResponseParseError, ConversationHistory, autoGLMPlanning, plan, uiTarsPlanning, } from '@/core/ai-model';
import { isAutoGLM, isUITars } from '@/core/ai-model/auto-glm/util';
import { getReadableTimeString, } from '@/core/common';
import { TaskExecutionError } from '@/core/task-runner';
import { ServiceError } from '@/core/types';
import { getCurrentTime } from '@/shared/env';
import { getDebug } from '@/shared/logger';
import { assert } from '@/shared/utils';
import { ExecutionSession } from './execution-session';
import { TaskBuilder } from './task-builder';
export { locatePlanForLocate } from './task-builder';
import { setTimingFieldOnce } from '@/core/task-timing';
import { descriptionOfTree } from '@/shared/extractor';
import { taskTitleStr } from './ui-utils';
import { parsePrompt } from './utils';
const debug = getDebug('device-task-executor');
const maxErrorCountAllowedInOnePlanningLoop = 5;
export { TaskExecutionError };
export class TaskExecutor {
    interface;
    service;
    taskCache;
    providedActionSpace;
    taskBuilder;
    conversationHistory;
    onTaskStartCallback;
    hooks;
    replanningCycleLimit;
    waitAfterAction;
    useDeviceTimestamp;
    // @deprecated use .interface instead
    get page() {
        return this.interface;
    }
    constructor(interfaceInstance, service, opts) {
        this.interface = interfaceInstance;
        this.service = service;
        this.taskCache = opts.taskCache;
        this.onTaskStartCallback = opts?.onTaskStart;
        this.replanningCycleLimit = opts.replanningCycleLimit;
        this.waitAfterAction = opts.waitAfterAction;
        this.useDeviceTimestamp = opts.useDeviceTimestamp;
        this.hooks = opts.hooks;
        this.conversationHistory = new ConversationHistory();
        this.providedActionSpace = opts.actionSpace;
        this.taskBuilder = new TaskBuilder({
            interfaceInstance,
            service,
            taskCache: opts.taskCache,
            actionSpace: this.getActionSpace(),
            waitAfterAction: opts.waitAfterAction,
        });
    }
    createExecutionSession(title, options) {
        return new ExecutionSession(title, () => Promise.resolve(this.service.contextRetrieverFn()), {
            onTaskStart: this.onTaskStartCallback,
            tasks: options?.tasks,
            onTaskUpdate: this.hooks?.onTaskUpdate,
        });
    }
    getActionSpace() {
        return this.providedActionSpace;
    }
    /**
     * Get a readable time string using device time when configured.
     * This method respects the useDeviceTimestamp configuration.
     * @param format - Optional format string
     * @returns A formatted time string
     */
    async getTimeString(format) {
        const timestamp = await getCurrentTime(this.interface, this.useDeviceTimestamp);
        return getReadableTimeString(format, timestamp);
    }
    async convertPlanToExecutable(plans, modelConfigForPlanning, modelConfigForDefaultIntent, options) {
        return this.taskBuilder.build(plans, modelConfigForPlanning, modelConfigForDefaultIntent, options);
    }
    async loadYamlFlowAsPlanning(userInstruction, yamlString) {
        const session = this.createExecutionSession(taskTitleStr('Act', userInstruction));
        const task = {
            type: 'Planning',
            subType: 'LoadYaml',
            param: {
                userInstruction,
            },
            executor: async (param, executorContext) => {
                const { uiContext } = executorContext;
                assert(uiContext, 'uiContext is required for Planning task');
                return {
                    output: {
                        actions: [],
                        shouldContinuePlanning: false,
                        log: '',
                        yamlString,
                    },
                    cache: {
                        hit: true,
                    },
                    hitBy: {
                        from: 'Cache',
                        context: {
                            yamlString,
                        },
                    },
                };
            },
        };
        const runner = session.getRunner();
        await session.appendAndRun(task);
        return {
            runner,
        };
    }
    async runPlans(title, plans, modelConfigForPlanning, modelConfigForDefaultIntent) {
        const session = this.createExecutionSession(title);
        const { tasks } = await this.convertPlanToExecutable(plans, modelConfigForPlanning, modelConfigForDefaultIntent);
        const runner = session.getRunner();
        const result = await session.appendAndRun(tasks);
        const { output } = result ?? {};
        return {
            output,
            runner,
        };
    }
    async action(userPrompt, modelConfigForPlanning, modelConfigForDefaultIntent, includeBboxInPlanning, aiActContext, cacheable, replanningCycleLimitOverride, imagesIncludeCount, deepThink, fileChooserAccept, deepLocate, abortSignal) {
        return withFileChooser(this.interface, fileChooserAccept, async () => {
            return this.runAction(userPrompt, modelConfigForPlanning, modelConfigForDefaultIntent, includeBboxInPlanning, aiActContext, cacheable, replanningCycleLimitOverride, imagesIncludeCount, deepThink, deepLocate, abortSignal);
        });
    }
    async runAction(userPrompt, modelConfigForPlanning, modelConfigForDefaultIntent, includeBboxInPlanning, aiActContext, cacheable, replanningCycleLimitOverride, imagesIncludeCount, deepThink, deepLocate, abortSignal) {
        this.conversationHistory.reset();
        const session = this.createExecutionSession(taskTitleStr('Act', userPrompt));
        const runner = session.getRunner();
        let replanCount = 0;
        const yamlFlow = [];
        const replanningCycleLimit = replanningCycleLimitOverride ?? this.replanningCycleLimit;
        assert(replanningCycleLimit !== undefined, 'replanningCycleLimit is required for TaskExecutor.action');
        let errorCountInOnePlanningLoop = 0; // count the number of errors in one planning loop
        let outputString;
        // Main planning loop - unified plan/replan logic
        while (true) {
            // Check abort signal before each planning cycle
            if (abortSignal?.aborted) {
                return session.appendErrorPlan(`Task aborted: ${abortSignal.reason || 'abort signal received'}`);
            }
            // Get sub-goal status text if available
            const subGoalStatus = this.conversationHistory.subGoalsToText() || undefined;
            // Get memories text if available
            const memoriesStatus = this.conversationHistory.memoriesToText() || undefined;
            const result = await session.appendAndRun({
                type: 'Planning',
                subType: 'Plan',
                param: {
                    userInstruction: userPrompt,
                    aiActContext,
                    imagesIncludeCount,
                    deepThink,
                    ...(subGoalStatus ? { subGoalStatus } : {}),
                    ...(memoriesStatus ? { memoriesStatus } : {}),
                },
                executor: async (param, executorContext) => {
                    const { uiContext } = executorContext;
                    assert(uiContext, 'uiContext is required for Planning task');
                    const { modelFamily } = modelConfigForPlanning;
                    const timing = executorContext.task.timing;
                    const actionSpace = this.getActionSpace();
                    debug('actionSpace for this interface is:', actionSpace.map((action) => action.name).join(', '));
                    assert(Array.isArray(actionSpace), 'actionSpace must be an array');
                    if (actionSpace.length === 0) {
                        console.warn(`ActionSpace for ${this.interface.interfaceType} is empty. This may lead to unexpected behavior.`);
                    }
                    const planImpl = isUITars(modelFamily)
                        ? uiTarsPlanning
                        : isAutoGLM(modelFamily)
                            ? autoGLMPlanning
                            : plan;
                    let planResult;
                    try {
                        setTimingFieldOnce(timing, 'callAiStart');
                        planResult = await planImpl(param.userInstruction, {
                            context: uiContext,
                            actionContext: param.aiActContext,
                            interfaceType: this.interface.interfaceType,
                            actionSpace,
                            modelConfig: modelConfigForPlanning,
                            conversationHistory: this.conversationHistory,
                            includeBbox: includeBboxInPlanning,
                            imagesIncludeCount,
                            deepThink,
                            abortSignal,
                        });
                    }
                    catch (planError) {
                        if (planError instanceof AIResponseParseError) {
                            // Record usage and rawResponse even when parsing fails
                            executorContext.task.usage = planError.usage;
                            executorContext.task.log = {
                                ...(executorContext.task.log || {}),
                                rawResponse: planError.rawResponse,
                            };
                        }
                        throw planError;
                    }
                    finally {
                        setTimingFieldOnce(timing, 'callAiEnd');
                    }
                    debug('planResult', JSON.stringify(planResult, null, 2));
                    const { actions, thought, log, memory, error, usage, rawResponse, reasoning_content, finalizeSuccess, finalizeMessage, updateSubGoals, markFinishedIndexes, } = planResult;
                    outputString = finalizeMessage;
                    executorContext.task.log = {
                        ...(executorContext.task.log || {}),
                        rawResponse,
                    };
                    executorContext.task.usage = usage;
                    executorContext.task.reasoning_content = reasoning_content;
                    executorContext.task.output = {
                        actions: actions || [],
                        log,
                        thought,
                        memory,
                        yamlFlow: planResult.yamlFlow,
                        output: finalizeMessage,
                        shouldContinuePlanning: planResult.shouldContinuePlanning,
                        updateSubGoals,
                        markFinishedIndexes,
                    };
                    executorContext.uiContext = uiContext;
                    assert(!error, `Failed to continue: ${error}\n${log || ''}`);
                    // Check if task was finalized with failure
                    if (finalizeSuccess === false) {
                        assert(false, `Task failed: ${finalizeMessage || 'No error message provided'}\n${log || ''}`);
                    }
                    return {
                        cache: {
                            hit: false,
                        },
                    };
                },
            }, {
                allowWhenError: true,
            });
            const planResult = result?.output;
            // Execute planned actions
            const plans = planResult?.actions || [];
            yamlFlow.push(...(planResult?.yamlFlow || []));
            let executables;
            try {
                executables = await this.convertPlanToExecutable(plans, modelConfigForPlanning, modelConfigForDefaultIntent, {
                    cacheable,
                    deepLocate,
                    abortSignal,
                });
            }
            catch (error) {
                return session.appendErrorPlan(`Error converting plans to executable tasks: ${error}, plans: ${JSON.stringify(plans)}`);
            }
            if (this.conversationHistory.pendingFeedbackMessage) {
                console.warn('unconsumed pending feedback message detected, this may lead to unexpected planning result:', this.conversationHistory.pendingFeedbackMessage);
            }
            // Set initial time context for the first planning call
            const initialTimeString = await this.getTimeString();
            this.conversationHistory.pendingFeedbackMessage += `Current time: ${initialTimeString}`;
            try {
                await session.appendAndRun(executables.tasks);
            }
            catch (error) {
                // errorFlag = true;
                errorCountInOnePlanningLoop++;
                const timeString = await this.getTimeString();
                this.conversationHistory.pendingFeedbackMessage = `Time: ${timeString}, Error executing running tasks: ${error?.message || String(error)}`;
                debug('error when executing running tasks, but continue to run if it is not too many errors:', error instanceof Error ? error.message : String(error), 'current error count in one planning loop:', errorCountInOnePlanningLoop);
            }
            if (errorCountInOnePlanningLoop > maxErrorCountAllowedInOnePlanningLoop) {
                return session.appendErrorPlan('Too many errors in one planning loop');
            }
            // Check abort signal after executing actions
            if (abortSignal?.aborted) {
                return session.appendErrorPlan(`Task aborted: ${abortSignal.reason || 'abort signal received'}`);
            }
            // // Check if task is complete
            if (!planResult?.shouldContinuePlanning) {
                break;
            }
            // Increment replan count for next iteration
            ++replanCount;
            if (replanCount > replanningCycleLimit) {
                const errorMsg = `Replanned ${replanningCycleLimit} times, exceeding the limit. Please configure a larger value for replanningCycleLimit (or use MIDSCENE_REPLANNING_CYCLE_LIMIT) to handle more complex tasks.`;
                return session.appendErrorPlan(errorMsg);
            }
            if (!this.conversationHistory.pendingFeedbackMessage) {
                const timeString = await this.getTimeString();
                this.conversationHistory.pendingFeedbackMessage = `Time: ${timeString}, I have finished the action previously planned.`;
            }
        }
        return {
            output: {
                yamlFlow,
                output: outputString,
            },
            runner,
        };
    }
    createTypeQueryTask(type, demand, modelConfig, opt, multimodalPrompt) {
        const queryTask = {
            type: 'Insight',
            subType: type,
            param: {
                dataDemand: multimodalPrompt
                    ? {
                        demand,
                        multimodalPrompt,
                    }
                    : demand, // for user param presentation in report right sidebar
            },
            executor: async (param, taskContext) => {
                const { task } = taskContext;
                let queryDump;
                const applyDump = (dump) => {
                    queryDump = dump;
                    task.log = {
                        dump,
                        rawResponse: dump.taskInfo?.rawResponse,
                    };
                    task.usage = dump.taskInfo?.usage;
                    if (dump.taskInfo?.reasoning_content) {
                        task.reasoning_content = dump.taskInfo.reasoning_content;
                    }
                };
                // Get context for query operations
                const uiContext = taskContext.uiContext;
                assert(uiContext, 'uiContext is required for Query task');
                const ifTypeRestricted = type !== 'Query';
                let demandInput = demand;
                let keyOfResult = 'result';
                if (ifTypeRestricted && (type === 'Assert' || type === 'WaitFor')) {
                    keyOfResult = 'StatementIsTruthy';
                    const booleanPrompt = type === 'Assert'
                        ? `Boolean, whether the following statement is true: ${demand}`
                        : `Boolean, the user wants to do some 'wait for' operation, please check whether the following statement is true: ${demand}`;
                    demandInput = {
                        [keyOfResult]: booleanPrompt,
                    };
                }
                else if (ifTypeRestricted) {
                    demandInput = {
                        [keyOfResult]: `${type}, ${demand}`,
                    };
                }
                let extractResult;
                let extraPageDescription = '';
                if (opt?.domIncluded && this.interface.getElementsNodeTree) {
                    debug('appending tree info for page');
                    const tree = await this.interface.getElementsNodeTree();
                    extraPageDescription = await descriptionOfTree(tree, 200, false, opt?.domIncluded === 'visible-only');
                }
                try {
                    extractResult = await this.service.extract(demandInput, modelConfig, opt, extraPageDescription, multimodalPrompt, uiContext);
                }
                catch (error) {
                    if (error instanceof ServiceError) {
                        applyDump(error.dump);
                    }
                    throw error;
                }
                const { data, thought, dump } = extractResult;
                applyDump(dump);
                let outputResult = data;
                if (ifTypeRestricted) {
                    // If AI returned a plain string instead of structured format, use it directly
                    if (typeof data === 'string') {
                        outputResult = data;
                    }
                    else if (type === 'WaitFor') {
                        if (data === null || data === undefined) {
                            outputResult = false;
                        }
                        else {
                            outputResult = data[keyOfResult];
                        }
                    }
                    else if (data === null || data === undefined) {
                        outputResult = null;
                    }
                    else {
                        assert(data?.[keyOfResult] !== undefined, 'No result in query data');
                        outputResult = data[keyOfResult];
                    }
                }
                if (type === 'Assert' && !outputResult) {
                    task.thought = thought;
                    throw new Error(`Assertion failed: ${thought}`);
                }
                return {
                    output: outputResult,
                    log: queryDump,
                    thought,
                };
            },
        };
        return queryTask;
    }
    async createTypeQueryExecution(type, demand, modelConfig, opt, multimodalPrompt) {
        const session = this.createExecutionSession(taskTitleStr(type, typeof demand === 'string' ? demand : JSON.stringify(demand)));
        const queryTask = await this.createTypeQueryTask(type, demand, modelConfig, opt, multimodalPrompt);
        const runner = session.getRunner();
        const result = await session.appendAndRun(queryTask);
        if (!result) {
            throw new Error('result of taskExecutor.flush() is undefined in function createTypeQueryTask');
        }
        const { output, thought } = result;
        return {
            output,
            thought,
            runner,
        };
    }
    async waitFor(assertion, opt, modelConfig) {
        const { textPrompt, multimodalPrompt } = parsePrompt(assertion);
        const description = `waitFor: ${textPrompt}`;
        const session = this.createExecutionSession(taskTitleStr('WaitFor', description));
        const runner = session.getRunner();
        const { timeoutMs, checkIntervalMs, domIncluded, screenshotIncluded, ...restOpt } = opt;
        const serviceExtractOpt = {
            domIncluded,
            screenshotIncluded,
            ...restOpt,
        };
        assert(assertion, 'No assertion for waitFor');
        assert(timeoutMs, 'No timeoutMs for waitFor');
        assert(checkIntervalMs, 'No checkIntervalMs for waitFor');
        assert(checkIntervalMs <= timeoutMs, `wrong config for waitFor: checkIntervalMs must be less than timeoutMs, config: {checkIntervalMs: ${checkIntervalMs}, timeoutMs: ${timeoutMs}}`);
        const overallStartTime = Date.now();
        let lastCheckStart = overallStartTime;
        let errorThought = '';
        // Continue checking as long as the previous iteration began within the timeout window.
        while (lastCheckStart - overallStartTime <= timeoutMs) {
            const currentCheckStart = Date.now();
            lastCheckStart = currentCheckStart;
            const queryTask = await this.createTypeQueryTask('WaitFor', textPrompt, modelConfig, serviceExtractOpt, multimodalPrompt);
            const result = (await session.appendAndRun(queryTask));
            if (result?.output) {
                return {
                    output: undefined,
                    runner,
                };
            }
            errorThought =
                result?.thought ||
                    (!result && `No result from assertion: ${textPrompt}`) ||
                    `unknown error when waiting for assertion: ${textPrompt}`;
            const now = Date.now();
            if (now - currentCheckStart < checkIntervalMs) {
                const elapsed = now - currentCheckStart;
                const timeRemaining = checkIntervalMs - elapsed;
                const thought = `Check interval is ${checkIntervalMs}ms, ${elapsed}ms elapsed since last check, sleeping for ${timeRemaining}ms`;
                const { tasks: sleepTasks } = await this.convertPlanToExecutable([{ type: 'Sleep', param: { timeMs: timeRemaining }, thought }], modelConfig, modelConfig);
                if (sleepTasks[0]) {
                    await session.appendAndRun(sleepTasks[0]);
                }
            }
        }
        return session.appendErrorPlan(`waitFor timeout: ${errorThought}`);
    }
}
export async function withFileChooser(interfaceInstance, fileChooserAccept, action) {
    if (!fileChooserAccept?.length) {
        return action();
    }
    if (!interfaceInstance.registerFileChooserListener) {
        throw new Error(`File upload is not supported on ${interfaceInstance.interfaceType}`);
    }
    const handler = async (chooser) => {
        await chooser.accept(fileChooserAccept);
    };
    const { dispose, getError } = await interfaceInstance.registerFileChooserListener(handler);
    try {
        const result = await action();
        // Check for errors that occurred during file chooser handling
        const error = getError();
        if (error) {
            throw error;
        }
        return result;
    }
    finally {
        dispose();
    }
}
