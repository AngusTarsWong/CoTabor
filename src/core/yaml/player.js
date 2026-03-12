import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { assert, ifInBrowser, ifInWorker } from '@/shared/utils';
import { z } from 'zod';
import { getMidsceneRunSubDir } from '@/shared/common';
import { getDebug } from '@/shared/logger';
import { buildDetailedLocateParam, buildDetailedLocateParamAndRestParams, } from './utils';
const debug = getDebug('yaml-player');
const aiTaskHandlerMap = {
    aiQuery: 'aiQuery',
    aiNumber: 'aiNumber',
    aiString: 'aiString',
    aiBoolean: 'aiBoolean',
    aiAsk: 'aiAsk',
    aiLocate: 'aiLocate',
};
const isStringParamSchema = (schema) => {
    if (!schema) {
        return false;
    }
    const schemaDef = schema?._def;
    if (!schemaDef?.typeName) {
        return false;
    }
    switch (schemaDef.typeName) {
        case z.ZodFirstPartyTypeKind.ZodString:
        case z.ZodFirstPartyTypeKind.ZodEnum:
        case z.ZodFirstPartyTypeKind.ZodNativeEnum:
            return true;
        case z.ZodFirstPartyTypeKind.ZodLiteral:
            return typeof schemaDef.value === 'string';
        case z.ZodFirstPartyTypeKind.ZodOptional:
        case z.ZodFirstPartyTypeKind.ZodNullable:
        case z.ZodFirstPartyTypeKind.ZodDefault:
            return isStringParamSchema(schemaDef.innerType);
        case z.ZodFirstPartyTypeKind.ZodEffects:
            return isStringParamSchema(schemaDef.schema);
        case z.ZodFirstPartyTypeKind.ZodPipeline:
            return isStringParamSchema(schemaDef.out);
        case z.ZodFirstPartyTypeKind.ZodUnion: {
            const options = schemaDef.options;
            return Array.isArray(options)
                ? options.every((option) => isStringParamSchema(option))
                : false;
        }
        default:
            return false;
    }
};
export class ScriptPlayer {
    script;
    setupAgent;
    onTaskStatusChange;
    currentTaskIndex;
    taskStatusList = [];
    status = 'init';
    reportFile;
    result;
    unnamedResultIndex = 0;
    output;
    unstableLogContent;
    errorInSetup;
    interfaceAgent = null;
    agentStatusTip;
    target;
    actionSpace = [];
    scriptPath;
    constructor(script, setupAgent, onTaskStatusChange, scriptPath) {
        this.script = script;
        this.setupAgent = setupAgent;
        this.onTaskStatusChange = onTaskStatusChange;
        this.scriptPath = scriptPath;
        this.result = {};
        const resolvedAiActContext = script.agent?.aiActContext ?? script.agent?.aiActionContext;
        if (resolvedAiActContext !== undefined && script.agent) {
            if (script.agent.aiActContext === undefined &&
                script.agent.aiActionContext !== undefined) {
                console.warn('agent.aiActionContext is deprecated, please use agent.aiActContext instead. The legacy name is still accepted for backward compatibility.');
            }
            script.agent.aiActContext = resolvedAiActContext;
        }
        this.target =
            script.target ||
                script.web ||
                script.android ||
                script.ios ||
                script.computer ||
                script.config;
        if (ifInBrowser || ifInWorker) {
            this.output = undefined;
            debug('output is undefined in browser or worker');
        }
        else if (this.target?.output) {
            this.output = resolve(process.cwd(), this.target.output);
            debug('setting output by config.output', this.output);
        }
        else {
            const scriptName = this.scriptPath
                ? basename(this.scriptPath, '.yaml').replace(/\.(ya?ml)$/i, '')
                : 'script';
            this.output = join(getMidsceneRunSubDir('output'), `${scriptName}-${Date.now()}.json`);
            debug('setting output by script path', this.output);
        }
        if (ifInBrowser || ifInWorker) {
            this.unstableLogContent = undefined;
        }
        else if (typeof this.target?.unstableLogContent === 'string') {
            this.unstableLogContent = resolve(process.cwd(), this.target.unstableLogContent);
        }
        else if (this.target?.unstableLogContent === true) {
            this.unstableLogContent = join(getMidsceneRunSubDir('output'), 'unstableLogContent.json');
        }
        this.taskStatusList = (script.tasks || []).map((task, taskIndex) => ({
            ...task,
            index: taskIndex,
            status: 'init',
            totalSteps: task.flow?.length || 0,
        }));
    }
    setResult(key, value) {
        const keyToUse = key || this.unnamedResultIndex++;
        if (this.result[keyToUse]) {
            console.warn(`result key ${keyToUse} already exists, will overwrite`);
        }
        this.result[keyToUse] = value;
        return this.flushResult();
    }
    setPlayerStatus(status, error) {
        this.status = status;
        this.errorInSetup = error;
    }
    notifyCurrentTaskStatusChange(taskIndex) {
        const taskIndexToNotify = typeof taskIndex === 'number' ? taskIndex : this.currentTaskIndex;
        if (typeof taskIndexToNotify !== 'number') {
            return;
        }
        const taskStatus = this.taskStatusList[taskIndexToNotify];
        if (this.onTaskStatusChange) {
            this.onTaskStatusChange(taskStatus);
        }
    }
    async setTaskStatus(index, statusValue, error) {
        this.taskStatusList[index].status = statusValue;
        if (error) {
            this.taskStatusList[index].error = error;
        }
        this.notifyCurrentTaskStatusChange(index);
    }
    setTaskIndex(taskIndex) {
        this.currentTaskIndex = taskIndex;
    }
    flushResult() {
        if (this.output) {
            const output = resolve(process.cwd(), this.output);
            const outputDir = dirname(output);
            if (!existsSync(outputDir)) {
                mkdirSync(outputDir, { recursive: true });
            }
            writeFileSync(output, JSON.stringify(this.result || {}, undefined, 2));
        }
    }
    flushUnstableLogContent() {
        if (this.unstableLogContent) {
            const content = this.interfaceAgent?._unstableLogContent();
            const filePath = resolve(process.cwd(), this.unstableLogContent);
            const outputDir = dirname(filePath);
            if (!existsSync(outputDir)) {
                mkdirSync(outputDir, { recursive: true });
            }
            writeFileSync(filePath, JSON.stringify(content, null, 2));
        }
    }
    async playTask(taskStatus, agent) {
        const { flow } = taskStatus;
        assert(flow, 'missing flow in task');
        for (const flowItemIndex in flow) {
            const currentStep = Number.parseInt(flowItemIndex, 10);
            taskStatus.currentStep = currentStep;
            const flowItem = flow[flowItemIndex];
            // Skip Finalize action from cache - it's a planning-only marker
            if ('Finalize' in flowItem) {
                continue;
            }
            debug(`playing step ${flowItemIndex}, flowItem=${JSON.stringify(flowItem)}`);
            const simpleAIKey = Object.keys(aiTaskHandlerMap).find((key) => Object.prototype.hasOwnProperty.call(flowItem, key));
            if ('aiAct' in flowItem ||
                'aiAction' in flowItem ||
                'ai' in flowItem) {
                const actionTask = flowItem;
                const { aiAct, aiAction, ai, ...actionOptions } = actionTask;
                const prompt = aiAct || aiAction || ai;
                assert(prompt, 'missing prompt for ai (aiAct)');
                await agent.aiAct(prompt, actionOptions);
            }
            else if ('aiAssert' in flowItem) {
                const assertTask = flowItem;
                const { aiAssert: prompt, errorMessage: msg, name, ...restOpts } = assertTask;
                assert(prompt, 'missing prompt for aiAssert');
                const { pass, thought, message } = (await agent.aiAssert(prompt, msg, {
                    ...restOpts,
                    keepRawResponse: true,
                })) || {};
                this.setResult(name, {
                    pass,
                    thought,
                    message,
                });
                if (!pass) {
                    throw new Error(message);
                }
            }
            else if (simpleAIKey) {
                const { [simpleAIKey]: prompt, name, ...options } = flowItem;
                assert(prompt, `missing prompt for ${simpleAIKey}`);
                const agentMethod = agent[aiTaskHandlerMap[simpleAIKey]];
                assert(typeof agentMethod === 'function', `missing agent method for ${simpleAIKey}`);
                const aiResult = await agentMethod.call(agent, prompt, options);
                this.setResult(name, aiResult);
            }
            else if ('aiWaitFor' in flowItem) {
                const waitForTask = flowItem;
                const { aiWaitFor, timeout, ...restWaitForOpts } = waitForTask;
                const prompt = aiWaitFor;
                assert(prompt, 'missing prompt for aiWaitFor');
                const waitForOptions = {
                    ...restWaitForOpts,
                    ...(timeout !== undefined ? { timeout, timeoutMs: timeout } : {}),
                };
                await agent.aiWaitFor(prompt, waitForOptions);
            }
            else if ('sleep' in flowItem) {
                const sleepTask = flowItem;
                const ms = sleepTask.sleep;
                let msNumber = ms;
                if (typeof ms === 'string') {
                    msNumber = Number.parseInt(ms, 10);
                }
                assert(msNumber && msNumber > 0, `ms for sleep must be greater than 0, but got ${ms}`);
                await new Promise((resolve) => setTimeout(resolve, msNumber));
            }
            else if ('javascript' in flowItem) {
                const evaluateJavaScriptTask = flowItem;
                const result = await agent.evaluateJavaScript(evaluateJavaScriptTask.javascript);
                this.setResult(evaluateJavaScriptTask.name, result);
            }
            else if ('logScreenshot' in flowItem ||
                'recordToReport' in flowItem) {
                const recordTask = flowItem;
                const title = recordTask.recordToReport ?? recordTask.logScreenshot ?? 'untitled';
                const content = recordTask.content || '';
                await agent.recordToReport(title, { content });
            }
            else if ('aiInput' in flowItem) {
                // may be input empty string ''
                const { aiInput, value: rawValue, ...inputTask } = flowItem;
                // Compatibility with previous version:
                // Old format: { aiInput: string (value), locate: TUserPrompt }
                // New format - 1: { aiInput: TUserPrompt, value: string | number }
                // New format - 2: { aiInput: undefined, locate: TUserPrompt, value: string | number }
                let locatePrompt;
                let value;
                if (inputTask.locate) {
                    // Old format - aiInput is the value, locate is the prompt
                    // Keep backward compatibility: empty string is treated as no value
                    value = aiInput || rawValue;
                    locatePrompt = inputTask.locate;
                }
                else {
                    // New format - aiInput is the prompt, value is the value
                    locatePrompt = aiInput || '';
                    value = rawValue;
                }
                // Convert value to string for Input action
                await agent.callActionInActionSpace('Input', {
                    ...inputTask,
                    ...(value !== undefined ? { value: String(value) } : {}),
                    ...(locatePrompt
                        ? { locate: buildDetailedLocateParam(locatePrompt, inputTask) }
                        : {}),
                });
            }
            else if ('aiKeyboardPress' in flowItem) {
                const { aiKeyboardPress, ...keyboardPressTask } = flowItem;
                // Compatibility with previous version:
                // Old format: { aiKeyboardPress: string (key), locate?: TUserPrompt }
                // New format - 1: { aiKeyboardPress: TUserPrompt, keyName: string }
                // New format - 2: { aiKeyboardPress: , locate?: TUserPrompt, keyName: string }
                let locatePrompt;
                let keyName;
                if (keyboardPressTask.locate) {
                    // Old format - aiKeyboardPress is the key, locate is the prompt
                    keyName = aiKeyboardPress;
                    locatePrompt = keyboardPressTask.locate;
                }
                else if (keyboardPressTask.keyName) {
                    // New format - aiKeyboardPress is the prompt, key is the key
                    keyName = keyboardPressTask.keyName;
                    locatePrompt = aiKeyboardPress;
                }
                else {
                    keyName = aiKeyboardPress;
                }
                await agent.callActionInActionSpace('KeyboardPress', {
                    ...keyboardPressTask,
                    ...(keyName ? { keyName } : {}),
                    ...(locatePrompt
                        ? {
                            locate: buildDetailedLocateParam(locatePrompt, keyboardPressTask),
                        }
                        : {}),
                });
            }
            else if ('aiScroll' in flowItem) {
                const { aiScroll, ...scrollTask } = flowItem;
                // Compatibility with previous version:
                // Old format: { aiScroll: null, locate?: TUserPrompt, direction, scrollType, distance? }
                // New format - 1: { aiScroll: TUserPrompt, direction, scrollType, distance? }
                // New format - 2: { aiScroll: undefined, locate: TUserPrompt, direction, scrollType, distance? }
                const { locate, ...scrollOptions } = scrollTask;
                const locatePrompt = locate ?? aiScroll;
                await agent.aiScroll(locatePrompt, scrollOptions);
            }
            else if ('aiTap' in flowItem) {
                const { aiTap, prompt, locate, ...tapOptions } = flowItem;
                let locatePrompt;
                let opts = tapOptions;
                // Support both formats:
                // 1. { aiTap: null, locate: { prompt, images, ... } }  (locate as sibling key)
                // 2. { aiTap: { locate: { prompt, images, ... } } }    (locate nested in aiTap)
                const locateObj = locate ??
                    (typeof aiTap === 'object' && aiTap !== null
                        ? aiTap.locate
                        : undefined);
                if (typeof aiTap === 'string' && aiTap) {
                    // User YAML: aiTap: 'search input box'
                    locatePrompt = aiTap;
                }
                else if (typeof locateObj === 'object' && locateObj?.prompt) {
                    // buildYamlFlowFromPlans: { aiTap: '', locate: { prompt, deepLocate, cacheable } }
                    const { prompt: lp, ...locateOpts } = locateObj;
                    locatePrompt = lp;
                    opts = { ...locateOpts, ...tapOptions };
                }
                else {
                    // User YAML: aiTap: { prompt: '...' } or aiTap: null + prompt: '...'
                    locatePrompt = aiTap?.prompt || prompt || locateObj;
                }
                assert(locatePrompt, 'missing prompt for aiTap');
                await agent.aiTap(locatePrompt, opts);
            }
            else {
                // generic action, find the action in actionSpace
                /* for aiRightClick, the parameters are a flattened data for the 'locate', these are all valid data
        
                - aiRightClick: 'search input box'
                - aiRightClick: 'search input box'
                  deepLocate: true
                  cacheable: false
                - aiRightClick:
                  prompt: 'search input box'
                - aiRightClick:
                  prompt: 'search input box'
                  deepLocate: true
                  cacheable: false
                */
                const actionSpace = this.actionSpace;
                let locatePromptShortcut;
                let actionParamForMatchedAction;
                const matchedAction = actionSpace.find((action) => {
                    const actionInterfaceAlias = action.interfaceAlias;
                    if (actionInterfaceAlias &&
                        Object.prototype.hasOwnProperty.call(flowItem, actionInterfaceAlias)) {
                        actionParamForMatchedAction =
                            flowItem[actionInterfaceAlias];
                        if (typeof actionParamForMatchedAction === 'string') {
                            locatePromptShortcut = actionParamForMatchedAction;
                        }
                        return true;
                    }
                    const keyOfActionInActionSpace = action.name;
                    if (Object.prototype.hasOwnProperty.call(flowItem, keyOfActionInActionSpace)) {
                        actionParamForMatchedAction =
                            flowItem[keyOfActionInActionSpace];
                        if (typeof actionParamForMatchedAction === 'string') {
                            locatePromptShortcut = actionParamForMatchedAction;
                        }
                        return true;
                    }
                    return false;
                });
                assert(matchedAction, `unknown flowItem in yaml: ${JSON.stringify(flowItem)}`);
                const schemaIsStringParam = isStringParamSchema(matchedAction.paramSchema);
                let stringParamToCall;
                if (typeof actionParamForMatchedAction === 'string' &&
                    schemaIsStringParam) {
                    if (matchedAction.paramSchema) {
                        const parseResult = matchedAction.paramSchema.safeParse(actionParamForMatchedAction);
                        if (parseResult.success && typeof parseResult.data === 'string') {
                            stringParamToCall = parseResult.data;
                        }
                        else if (!parseResult.success) {
                            debug(`parse failed for action ${matchedAction.name} with string param`, parseResult.error);
                            stringParamToCall = actionParamForMatchedAction;
                        }
                    }
                    else {
                        stringParamToCall = actionParamForMatchedAction;
                    }
                }
                if (stringParamToCall !== undefined) {
                    debug(`matchedAction: ${matchedAction.name}`, `flowParams: ${JSON.stringify(stringParamToCall)}`);
                    const result = await agent.callActionInActionSpace(matchedAction.name, stringParamToCall);
                    // Store result if there's a name property in flowItem
                    const resultName = flowItem.name;
                    if (result !== undefined) {
                        this.setResult(resultName, result);
                    }
                }
                else if (typeof actionParamForMatchedAction === 'string' &&
                    (matchedAction.name === 'Launch' ||
                        matchedAction.interfaceAlias === 'launch') &&
                    typeof agent.launch === 'function') {
                    // Call agent.launch directly for Launch action with string param
                    debug(`Calling agent.launch with: ${actionParamForMatchedAction}`);
                    const result = await agent.launch(actionParamForMatchedAction);
                    const resultName = flowItem.name;
                    if (result !== undefined) {
                        this.setResult(resultName, result);
                    }
                }
                else if (typeof actionParamForMatchedAction === 'string' &&
                    (matchedAction.name === 'RunAdbShell' ||
                        matchedAction.interfaceAlias === 'runAdbShell') &&
                    typeof agent.runAdbShell === 'function') {
                    // Call agent.runAdbShell directly for RunAdbShell action with string param
                    debug(`Calling agent.runAdbShell with: ${actionParamForMatchedAction}`);
                    const result = await agent.runAdbShell(actionParamForMatchedAction);
                    const resultName = flowItem.name;
                    if (result !== undefined) {
                        this.setResult(resultName, result);
                    }
                }
                else {
                    // Determine the source for parameter extraction:
                    // - If we have a locatePromptShortcut, use the flowItem (for actions like aiTap with prompt)
                    // - Otherwise, use actionParamForMatchedAction (for actions like runWdaRequest with structured params)
                    const sourceForParams = locatePromptShortcut &&
                        typeof actionParamForMatchedAction === 'string'
                        ? { ...flowItem, prompt: locatePromptShortcut }
                        : typeof actionParamForMatchedAction === 'object' &&
                            actionParamForMatchedAction !== null
                            ? actionParamForMatchedAction
                            : flowItem;
                    const { locateParam, restParams } = buildDetailedLocateParamAndRestParams(locatePromptShortcut || '', sourceForParams, [
                        matchedAction.name,
                        matchedAction.interfaceAlias || '_never_mind_',
                    ]);
                    const flowParams = {
                        ...restParams,
                        locate: locateParam,
                    };
                    debug(`matchedAction: ${matchedAction.name}`, `flowParams: ${JSON.stringify(flowParams, null, 2)}`);
                    const result = await agent.callActionInActionSpace(matchedAction.name, flowParams);
                    // Store result if there's a name property in flowItem
                    const resultName = flowItem.name;
                    if (result !== undefined) {
                        this.setResult(resultName, result);
                    }
                }
            }
        }
        this.reportFile = agent.reportFile;
        await this.flushUnstableLogContent();
    }
    async run() {
        const { target, web, android, ios, computer, tasks } = this.script;
        const webEnv = web || target;
        const androidEnv = android;
        const iosEnv = ios;
        const computerEnv = computer;
        const platform = webEnv || androidEnv || iosEnv || computerEnv;
        this.setPlayerStatus('running');
        let agent = null;
        let freeFn = [];
        try {
            const { agent: newAgent, freeFn: newFreeFn } = await this.setupAgent(platform);
            this.actionSpace = await newAgent.getActionSpace();
            agent = newAgent;
            const originalOnTaskStartTip = agent.onTaskStartTip;
            agent.onTaskStartTip = (tip) => {
                if (this.status === 'running') {
                    this.agentStatusTip = tip;
                }
                originalOnTaskStartTip?.(tip);
            };
            freeFn = [
                ...(newFreeFn || []),
                {
                    name: 'restore-agent-onTaskStartTip',
                    fn: () => {
                        if (agent) {
                            agent.onTaskStartTip = originalOnTaskStartTip;
                        }
                    },
                },
            ];
        }
        catch (e) {
            this.setPlayerStatus('error', e);
            return;
        }
        this.interfaceAgent = agent;
        let taskIndex = 0;
        this.setPlayerStatus('running');
        let errorFlag = false;
        while (taskIndex < tasks.length) {
            const taskStatus = this.taskStatusList[taskIndex];
            this.setTaskStatus(taskIndex, 'running');
            this.setTaskIndex(taskIndex);
            try {
                await this.playTask(taskStatus, this.interfaceAgent);
                this.setTaskStatus(taskIndex, 'done');
            }
            catch (e) {
                this.setTaskStatus(taskIndex, 'error', e);
                if (taskStatus.continueOnError) {
                    // nothing more to do
                }
                else {
                    this.reportFile = agent.reportFile;
                    errorFlag = true;
                    break;
                }
            }
            this.reportFile = agent?.reportFile;
            taskIndex++;
        }
        if (errorFlag) {
            this.setPlayerStatus('error');
        }
        else {
            this.setPlayerStatus('done');
        }
        this.agentStatusTip = '';
        // free the resources
        for (const fn of freeFn) {
            try {
                // console.log('freeing', fn.name);
                await fn.fn();
                // console.log('freed', fn.name);
            }
            catch (e) {
                // console.error('error freeing', fn.name, e);
            }
        }
    }
}
