import { parseBase64 } from '@/shared/img';
import { z } from 'zod';
import { getZodDescription, getZodTypeName } from '../zod-schema-utils';
/**
 * Extract error message from unknown error type
 */
function getErrorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
/**
 * Generate MCP tool description from ActionSpaceItem
 * Format: "actionName action, description. Parameters: param1 (type) - desc; param2 (type) - desc"
 */
function describeActionForMCP(action) {
    const actionDesc = action.description || `Execute ${action.name} action`;
    if (!action.paramSchema) {
        return `${action.name} action, ${actionDesc}`;
    }
    const schema = action.paramSchema;
    const isZodObjectType = schema._def?.typeName === 'ZodObject';
    if (!isZodObjectType || !schema.shape) {
        // Simple type schema
        const typeName = getZodTypeName(schema);
        const description = getZodDescription(schema);
        const paramDesc = description ? `${typeName} - ${description}` : typeName;
        return `${action.name} action, ${actionDesc}. Parameter: ${paramDesc}`;
    }
    // Object schema with multiple fields
    const paramDescriptions = [];
    for (const [key, field] of Object.entries(schema.shape)) {
        if (field && typeof field === 'object') {
            const isFieldOptional = typeof field.isOptional ===
                'function' && field.isOptional();
            const typeName = getZodTypeName(field);
            const description = getZodDescription(field);
            let paramStr = `${key}${isFieldOptional ? '?' : ''} (${typeName})`;
            if (description) {
                paramStr += ` - ${description}`;
            }
            paramDescriptions.push(paramStr);
        }
    }
    if (paramDescriptions.length === 0) {
        return `${action.name} action, ${actionDesc}`;
    }
    return `${action.name} action, ${actionDesc}. Parameters: ${paramDescriptions.join('; ')}`;
}
/**
 * Type guard: check if a Zod type is ZodOptional
 */
function isZodOptional(value) {
    return '_def' in value && value._def?.typeName === 'ZodOptional';
}
/**
 * Type guard: check if a Zod type is ZodObject
 */
function isZodObject(value) {
    return ('_def' in value && value._def?.typeName === 'ZodObject' && 'shape' in value);
}
/**
 * Unwrap ZodOptional to get inner type
 */
function unwrapOptional(value) {
    if (isZodOptional(value)) {
        return { innerValue: value._def.innerType, isOptional: true };
    }
    return { innerValue: value, isOptional: false };
}
/**
 * Check if a Zod object schema contains a 'prompt' field (locate field pattern)
 */
function isLocateField(value) {
    if (!isZodObject(value)) {
        return false;
    }
    return 'prompt' in value.shape;
}
/**
 * Transform a locate field schema to make its 'prompt' field optional
 */
function makePromptOptional(value, wrapInOptional) {
    const newShape = { ...value.shape };
    newShape.prompt = value.shape.prompt.optional();
    let newSchema = z.object(newShape).passthrough();
    if (wrapInOptional) {
        newSchema = newSchema.optional();
    }
    return newSchema;
}
/**
 * Transform schema field to make locate.prompt optional if applicable
 */
function transformSchemaField(key, value) {
    const { innerValue, isOptional } = unwrapOptional(value);
    if (isZodObject(innerValue) && isLocateField(innerValue)) {
        return [key, makePromptOptional(innerValue, isOptional)];
    }
    return [key, value];
}
/**
 * Extract and transform schema from action's paramSchema
 */
function extractActionSchema(paramSchema) {
    if (!paramSchema) {
        return {};
    }
    const schema = paramSchema;
    if (!isZodObject(schema)) {
        return schema;
    }
    return Object.fromEntries(Object.entries(schema.shape).map(([key, value]) => transformSchemaField(key, value)));
}
/**
 * Serialize args to human-readable description for AI action
 */
function serializeArgsToDescription(args) {
    try {
        return Object.entries(args)
            .map(([key, value]) => {
            if (typeof value === 'object' && value !== null) {
                try {
                    return `${key}: ${JSON.stringify(value)}`;
                }
                catch {
                    // Circular reference or non-serializable object
                    return `${key}: [object]`;
                }
            }
            return `${key}: "${value}"`;
        })
            .join(', ');
    }
    catch (error) {
        const errorMessage = getErrorMessage(error);
        console.error('Error serializing args:', errorMessage);
        return `[args serialization failed: ${errorMessage}]`;
    }
}
/**
 * Build action instruction as natural language for better AI planning flexibility.
 * Natural language instructions allow the planner to adjust strategies on replanning,
 * unlike rigid structured instructions that cause repeated identical failures.
 */
function buildActionInstruction(actionName, args) {
    const locatePrompt = args.locate && typeof args.locate === 'object'
        ? args.locate.prompt
        : undefined;
    switch (actionName) {
        case 'Tap':
            return locatePrompt ? `Tap on "${locatePrompt}"` : 'Tap';
        case 'Input': {
            const value = args.value ?? args.content ?? '';
            return locatePrompt
                ? `Input "${value}" into "${locatePrompt}"`
                : `Input "${value}"`;
        }
        case 'Scroll': {
            const direction = args.direction ?? 'down';
            return locatePrompt
                ? `Scroll ${direction} on "${locatePrompt}"`
                : `Scroll ${direction}`;
        }
        case 'Hover':
            return locatePrompt ? `Hover over "${locatePrompt}"` : 'Hover';
        case 'KeyboardPress': {
            const key = args.value ?? args.key ?? '';
            return `Press key "${key}"`;
        }
        default: {
            const argsDescription = serializeArgsToDescription(args);
            return argsDescription ? `${actionName}: ${argsDescription}` : actionName;
        }
    }
}
/**
 * Capture screenshot and return as tool result
 */
async function captureScreenshotResult(agent, actionName) {
    try {
        const screenshot = await agent.page?.screenshotBase64();
        if (!screenshot) {
            return {
                content: [{ type: 'text', text: `Action "${actionName}" completed.` }],
            };
        }
        const { mimeType, body } = parseBase64(screenshot);
        return {
            content: [
                { type: 'text', text: `Action "${actionName}" completed.` },
                { type: 'image', data: body, mimeType },
            ],
        };
    }
    catch (error) {
        const errorMessage = getErrorMessage(error);
        console.error('Error capturing screenshot:', errorMessage);
        return {
            content: [
                {
                    type: 'text',
                    text: `Action "${actionName}" completed (screenshot unavailable: ${errorMessage})`,
                },
            ],
        };
    }
}
/**
 * Create error result for tool handler
 */
function createErrorResult(message) {
    return {
        content: [{ type: 'text', text: message }],
        isError: true,
    };
}
/**
 * Capture screenshot and return as a non-error result with warning message.
 * Used when an action fails but we want the AI agent to see the current state
 * and decide how to recover, rather than treating it as a hard error (exit code 1).
 */
async function captureFailureResult(agent, actionName, errorMessage) {
    const warningText = `Warning: Action "${actionName}" failed: ${errorMessage}. Check the screenshot below for the current page state and decide how to proceed.`;
    try {
        const screenshot = await agent.page?.screenshotBase64();
        if (!screenshot) {
            return {
                content: [{ type: 'text', text: warningText }],
            };
        }
        const { mimeType, body } = parseBase64(screenshot);
        return {
            content: [
                { type: 'text', text: warningText },
                { type: 'image', data: body, mimeType },
            ],
        };
    }
    catch {
        return {
            content: [{ type: 'text', text: warningText }],
        };
    }
}
/**
 * Converts DeviceAction from actionSpace into MCP ToolDefinition
 * This is the core logic that removes need for hardcoded tool definitions
 */
export function generateToolsFromActionSpace(actionSpace, getAgent) {
    return actionSpace.map((action) => {
        const schema = extractActionSchema(action.paramSchema);
        return {
            name: action.name,
            description: describeActionForMCP(action),
            schema,
            handler: async (args) => {
                try {
                    const agent = await getAgent();
                    if (agent.aiAction) {
                        const instruction = buildActionInstruction(action.name, args);
                        try {
                            await agent.aiAction(instruction);
                        }
                        catch (error) {
                            const errorMessage = getErrorMessage(error);
                            console.error(`Error executing action "${action.name}":`, errorMessage);
                            // Return screenshot + warning instead of hard error,
                            // so the AI agent can see current state and decide to retry or adjust strategy
                            return await captureFailureResult(agent, action.name, errorMessage);
                        }
                    }
                    return await captureScreenshotResult(agent, action.name);
                }
                catch (error) {
                    // Connection/agent errors are still hard errors
                    const errorMessage = getErrorMessage(error);
                    console.error(`Error in handler for "${action.name}":`, errorMessage);
                    return createErrorResult(`Failed to get agent or execute action "${action.name}": ${errorMessage}`);
                }
            },
        };
    });
}
/**
 * Generate common tools (screenshot, act)
 */
export function generateCommonTools(getAgent) {
    return [
        {
            name: 'take_screenshot',
            description: 'Capture screenshot of current page/screen',
            schema: {},
            handler: async () => {
                try {
                    const agent = await getAgent();
                    const screenshot = await agent.page?.screenshotBase64();
                    if (!screenshot) {
                        return createErrorResult('Screenshot not available');
                    }
                    const { mimeType, body } = parseBase64(screenshot);
                    return {
                        content: [{ type: 'image', data: body, mimeType }],
                    };
                }
                catch (error) {
                    const errorMessage = getErrorMessage(error);
                    console.error('Error taking screenshot:', errorMessage);
                    return createErrorResult(`Failed to capture screenshot: ${errorMessage}`);
                }
            },
        },
        {
            name: 'act',
            description: 'Execute a natural language action. The AI will plan and perform multi-step operations in a single invocation, useful for transient UI interactions (e.g., Spotlight, dropdown menus) that disappear between separate commands.',
            schema: {
                prompt: z
                    .string()
                    .describe('Natural language description of the action to perform, e.g. "press Command+Space, type Safari, press Enter"'),
            },
            handler: async (args) => {
                const prompt = args.prompt;
                try {
                    const agent = await getAgent();
                    if (!agent.aiAction) {
                        return createErrorResult('act is not supported by this agent');
                    }
                    const result = await agent.aiAction(prompt, { deepThink: false });
                    const screenshotResult = await captureScreenshotResult(agent, 'act');
                    if (result) {
                        const message = typeof result === 'string' ? result : JSON.stringify(result);
                        screenshotResult.content.unshift({
                            type: 'text',
                            text: `Task finished, message: ${message}`,
                        });
                    }
                    return screenshotResult;
                }
                catch (error) {
                    const errorMessage = getErrorMessage(error);
                    console.error('Error executing act:', errorMessage);
                    return createErrorResult(`Failed to execute act: ${errorMessage}`);
                }
            },
        },
    ];
}
