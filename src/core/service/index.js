import { isAutoGLM } from '@/core/ai-model/auto-glm/util';
import { AIResponseParseError, AiExtractElementInfo, AiLocateElement, callAIWithObjectResponse, } from '@/core/ai-model/index';
import { AiLocateSection } from '@/core/ai-model/inspect';
import { elementDescriberInstruction } from '@/core/ai-model/prompt/describe';
import { expandSearchArea } from '@/core/common';
import { ServiceError } from '@/core/types';
import { compositeElementInfoImg, cropByRect } from '@/shared/img';
import { getDebug } from '@/shared/logger';
import { assert } from '@/shared/utils';
import { createServiceDump } from './utils';
const debug = getDebug('ai:service');
export default class Service {
    contextRetrieverFn;
    taskInfo;
    constructor(context, opt) {
        assert(context, 'context is required for Service');
        if (typeof context === 'function') {
            this.contextRetrieverFn = context;
        }
        else {
            this.contextRetrieverFn = () => Promise.resolve(context);
        }
        if (typeof opt?.taskInfo !== 'undefined') {
            this.taskInfo = opt.taskInfo;
        }
    }
    async locate(query, opt, modelConfig, abortSignal) {
        const queryPrompt = typeof query === 'string' ? query : query.prompt;
        assert(queryPrompt, 'query is required for locate');
        assert(typeof query === 'object', 'query should be an object for locate');
        let searchAreaPrompt;
        if (query.deepLocate) {
            searchAreaPrompt = query.prompt;
        }
        const { modelFamily } = modelConfig;
        if (searchAreaPrompt && !modelFamily) {
            console.warn('The "deepLocate" feature is not supported with multimodal LLM. Please config VL model for Midscene. https://midscenejs.com/model-config');
            searchAreaPrompt = undefined;
        }
        if (searchAreaPrompt && isAutoGLM(modelFamily)) {
            console.warn('The "deepLocate" feature is not supported with AutoGLM.');
            searchAreaPrompt = undefined;
        }
        const context = opt?.context || (await this.contextRetrieverFn());
        let searchArea = undefined;
        let searchAreaRawResponse = undefined;
        let searchAreaUsage = undefined;
        let searchAreaResponse = undefined;
        if (searchAreaPrompt) {
            searchAreaResponse = await AiLocateSection({
                context,
                sectionDescription: searchAreaPrompt,
                modelConfig,
                abortSignal,
            });
            assert(searchAreaResponse.rect, `cannot find search area for "${searchAreaPrompt}"${searchAreaResponse.error ? `: ${searchAreaResponse.error}` : ''}`);
            searchAreaRawResponse = searchAreaResponse.rawResponse;
            searchAreaUsage = searchAreaResponse.usage;
            searchArea = searchAreaResponse.rect;
        }
        const startTime = Date.now();
        const { parseResult, rect, rawResponse, usage, reasoning_content } = await AiLocateElement({
            context,
            targetElementDescription: queryPrompt,
            searchConfig: searchAreaResponse,
            modelConfig,
            abortSignal,
        });
        const timeCost = Date.now() - startTime;
        const taskInfo = {
            ...(this.taskInfo ? this.taskInfo : {}),
            durationMs: timeCost,
            rawResponse: JSON.stringify(rawResponse),
            formatResponse: JSON.stringify(parseResult),
            usage,
            searchArea,
            searchAreaRawResponse,
            searchAreaUsage,
            reasoning_content,
        };
        let errorLog;
        if (parseResult.errors?.length) {
            errorLog = `failed to locate element: \n${parseResult.errors.join('\n')}`;
        }
        const dumpData = {
            type: 'locate',
            userQuery: {
                element: queryPrompt,
            },
            matchedElement: [],
            matchedRect: rect,
            data: null,
            taskInfo,
            deepLocate: !!searchArea,
            error: errorLog,
        };
        const elements = parseResult.elements || [];
        const dump = createServiceDump({
            ...dumpData,
            matchedElement: elements,
        });
        if (errorLog) {
            throw new ServiceError(errorLog, dump);
        }
        if (elements.length > 1) {
            throw new ServiceError(`locate: multiple elements found, length = ${elements.length}`, dump);
        }
        if (elements.length === 1) {
            return {
                element: {
                    center: elements[0].center,
                    rect: elements[0].rect,
                    description: elements[0].description,
                },
                rect,
                dump,
            };
        }
        return {
            element: null,
            rect,
            dump,
        };
    }
    async extract(dataDemand, modelConfig, opt, pageDescription, multimodalPrompt, context) {
        assert(context, 'context is required for extract');
        assert(typeof dataDemand === 'object' || typeof dataDemand === 'string', `dataDemand should be object or string, but get ${typeof dataDemand}`);
        const startTime = Date.now();
        let parseResult;
        let rawResponse;
        let usage;
        let reasoning_content;
        try {
            const result = await AiExtractElementInfo({
                context,
                dataQuery: dataDemand,
                multimodalPrompt,
                extractOption: opt,
                modelConfig,
                pageDescription,
            });
            parseResult = result.parseResult;
            rawResponse = result.rawResponse;
            usage = result.usage;
            reasoning_content = result.reasoning_content;
        }
        catch (error) {
            if (error instanceof AIResponseParseError) {
                // Create dump with usage and rawResponse from the error
                const timeCost = Date.now() - startTime;
                const taskInfo = {
                    ...(this.taskInfo ? this.taskInfo : {}),
                    durationMs: timeCost,
                    rawResponse: error.rawResponse,
                    usage: error.usage,
                };
                const dump = createServiceDump({
                    type: 'extract',
                    userQuery: { dataDemand },
                    matchedElement: [],
                    data: null,
                    taskInfo,
                    error: error.message,
                });
                throw new ServiceError(error.message, dump);
            }
            throw error;
        }
        const timeCost = Date.now() - startTime;
        const taskInfo = {
            ...(this.taskInfo ? this.taskInfo : {}),
            durationMs: timeCost,
            rawResponse,
            formatResponse: JSON.stringify(parseResult),
            usage,
            reasoning_content,
        };
        let errorLog;
        if (parseResult.errors?.length) {
            errorLog = `AI response error: \n${parseResult.errors.join('\n')}`;
        }
        const dumpData = {
            type: 'extract',
            userQuery: {
                dataDemand,
            },
            matchedElement: [],
            data: null,
            taskInfo,
            error: errorLog,
        };
        const { data, thought } = parseResult || {};
        const dump = createServiceDump({
            ...dumpData,
            data,
        });
        if (errorLog && !data) {
            throw new ServiceError(errorLog, dump);
        }
        return {
            data,
            thought,
            usage,
            reasoning_content,
            dump,
        };
    }
    async describe(target, modelConfig, opt) {
        assert(target, 'target is required for service.describe');
        const context = await this.contextRetrieverFn();
        const { shotSize } = context;
        const screenshotBase64 = context.screenshot.base64;
        assert(screenshotBase64, 'screenshot is required for service.describe');
        // The result of the "describe" function will be used for positioning, so essentially it is a form of grounding.
        const { modelFamily } = modelConfig;
        const systemPrompt = elementDescriberInstruction();
        // Convert [x,y] center point to Rect if needed
        const defaultRectSize = 30;
        const targetRect = Array.isArray(target)
            ? {
                left: Math.floor(target[0] - defaultRectSize / 2),
                top: Math.floor(target[1] - defaultRectSize / 2),
                width: defaultRectSize,
                height: defaultRectSize,
            }
            : target;
        let imagePayload = await compositeElementInfoImg({
            inputImgBase64: screenshotBase64,
            size: shotSize,
            elementsPositionInfo: [
                {
                    rect: targetRect,
                },
            ],
            borderThickness: 3,
        });
        if (opt?.deepLocate) {
            const searchArea = expandSearchArea(targetRect, shotSize);
            // Always crop in describe mode. Unlike locate's deepLocate (where
            // cropping too small loses context for finding elements), describe's
            // deepLocate intentionally zooms in so the model produces a more
            // precise description from a focused view. expandSearchArea already
            // guarantees a minimum 400x400 area with surrounding context.
            debug('describe: cropping to searchArea', searchArea);
            const croppedResult = await cropByRect(imagePayload, searchArea, modelFamily === 'qwen2.5-vl');
            imagePayload = croppedResult.imageBase64;
        }
        const msgs = [
            { role: 'system', content: systemPrompt },
            {
                role: 'user',
                content: [
                    {
                        type: 'image_url',
                        image_url: {
                            url: imagePayload,
                            detail: 'high',
                        },
                    },
                ],
            },
        ];
        const res = await callAIWithObjectResponse(msgs, modelConfig);
        const { content } = res;
        assert(!content.error, `describe failed: ${content.error}`);
        assert(content.description, 'failed to describe the element');
        return content;
    }
}
