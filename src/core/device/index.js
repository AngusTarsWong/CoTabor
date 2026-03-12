import { getMidsceneLocationSchema } from '@/core/common';
import { getDebug } from '@/shared/logger';
import { z } from 'zod';
export class AbstractInterface {
    /** URL of native MJPEG stream for real-time screen preview (e.g. WDA MJPEG server) */
    mjpegStreamUrl;
}
// Generic function to define actions with proper type inference
// TRuntime allows specifying a different type for the runtime parameter (after location resolution)
// TReturn allows specifying the return type of the action
export const defineAction = (config) => {
    return config; // Type assertion needed because schema validation type differs from runtime type
};
// Tap
export const actionTapParamSchema = z.object({
    locate: getMidsceneLocationSchema().describe('The element to be tapped'),
});
export const defineActionTap = (call) => {
    return defineAction({
        name: 'Tap',
        description: 'Tap the element',
        interfaceAlias: 'aiTap',
        paramSchema: actionTapParamSchema,
        sample: {
            locate: { prompt: 'the "Submit" button' },
        },
        call,
    });
};
// RightClick
export const actionRightClickParamSchema = z.object({
    locate: getMidsceneLocationSchema().describe('The element to be right clicked'),
});
export const defineActionRightClick = (call) => {
    return defineAction({
        name: 'RightClick',
        description: 'Right click the element',
        interfaceAlias: 'aiRightClick',
        paramSchema: actionRightClickParamSchema,
        sample: {
            locate: { prompt: 'the file icon on the desktop' },
        },
        call,
    });
};
// DoubleClick
export const actionDoubleClickParamSchema = z.object({
    locate: getMidsceneLocationSchema().describe('The element to be double clicked'),
});
export const defineActionDoubleClick = (call) => {
    return defineAction({
        name: 'DoubleClick',
        description: 'Double click the element',
        interfaceAlias: 'aiDoubleClick',
        paramSchema: actionDoubleClickParamSchema,
        sample: {
            locate: { prompt: 'the folder icon' },
        },
        call,
    });
};
// Hover
export const actionHoverParamSchema = z.object({
    locate: getMidsceneLocationSchema().describe('The element to be hovered'),
});
export const defineActionHover = (call) => {
    return defineAction({
        name: 'Hover',
        description: 'Move the mouse to the element',
        interfaceAlias: 'aiHover',
        paramSchema: actionHoverParamSchema,
        sample: {
            locate: { prompt: 'the navigation menu item "Products"' },
        },
        call,
    });
};
// Input
const inputLocateDescription = 'the position of the placeholder or text content in the target input field. If there is no content, locate the center of the input field.';
export const actionInputParamSchema = z.object({
    value: z
        .union([z.string(), z.number()])
        .transform((val) => String(val))
        .describe('The text to input. Provide the final content for replace/append modes, or an empty string when using clear mode to remove existing text.'),
    locate: getMidsceneLocationSchema()
        .describe(inputLocateDescription)
        .optional(),
    mode: z
        .enum(['replace', 'clear', 'typeOnly'])
        .default('replace')
        .describe('Input mode: "replace" (default) - clear the field and input the value; "typeOnly" - type the value directly without clearing the field first; "clear" - clear the field without inputting new text.'),
});
export const defineActionInput = (call) => {
    return defineAction({
        name: 'Input',
        description: 'Input the value into the element',
        interfaceAlias: 'aiInput',
        paramSchema: actionInputParamSchema,
        sample: {
            value: 'test@example.com',
            locate: { prompt: 'the email input field' },
        },
        call: (param) => {
            // backward compat: convert deprecated 'append' to 'typeOnly'
            if (param.mode === 'append') {
                param.mode = 'typeOnly';
            }
            return call(param);
        },
    });
};
// KeyboardPress
export const actionKeyboardPressParamSchema = z.object({
    locate: getMidsceneLocationSchema()
        .describe('The element to be clicked before pressing the key')
        .optional(),
    keyName: z
        .string()
        .describe("The key to be pressed. Use '+' for key combinations, e.g., 'Control+A', 'Shift+Enter'"),
});
export const defineActionKeyboardPress = (call) => {
    return defineAction({
        name: 'KeyboardPress',
        description: 'Press a key or key combination, like "Enter", "Tab", "Escape", or "Control+A", "Shift+Enter". Do not use this to type text.',
        interfaceAlias: 'aiKeyboardPress',
        paramSchema: actionKeyboardPressParamSchema,
        sample: {
            keyName: 'Enter',
        },
        call,
    });
};
// Scroll
export const actionScrollParamSchema = z.object({
    scrollType: z
        .enum([
        'singleAction',
        'scrollToBottom',
        'scrollToTop',
        'scrollToRight',
        'scrollToLeft',
    ])
        .default('singleAction')
        .describe('The scroll behavior: "singleAction" for a single scroll action, "scrollToBottom" for scrolling all the way to the bottom by rapidly scrolling 5-10 times (skipping intermediate content until reaching the bottom), "scrollToTop" for scrolling all the way to the top by rapidly scrolling 5-10 times (skipping intermediate content until reaching the top), "scrollToRight" for scrolling all the way to the right by rapidly scrolling multiple times, "scrollToLeft" for scrolling all the way to the left by rapidly scrolling multiple times'),
    direction: z
        .enum(['down', 'up', 'right', 'left'])
        .default('down')
        .describe('The direction to scroll. Only effective when scrollType is "singleAction".'),
    distance: z
        .number()
        .nullable()
        .optional()
        .describe('The distance in pixels to scroll'),
    locate: getMidsceneLocationSchema()
        .optional()
        .describe('Describe the target element to be scrolled on, like "the table" or "the list" or "the content area" or "the scrollable area". Do NOT provide a general intent like "scroll to find some element"'),
});
export const defineActionScroll = (call) => {
    return defineAction({
        name: 'Scroll',
        description: 'Scroll the page or a scrollable element to browse content. This is the preferred way to scroll on all platforms, including mobile. Supports scrollToBottom/scrollToTop for boundary navigation. Default: direction `down`, scrollType `singleAction`, distance `null`.',
        interfaceAlias: 'aiScroll',
        paramSchema: actionScrollParamSchema,
        sample: {
            direction: 'down',
            scrollType: 'singleAction',
            locate: { prompt: 'the center of the product list area' },
        },
        call,
    });
};
// DragAndDrop
export const actionDragAndDropParamSchema = z.object({
    from: getMidsceneLocationSchema().describe('The position to be dragged'),
    to: getMidsceneLocationSchema().describe('The position to be dropped'),
});
export const defineActionDragAndDrop = (call) => {
    return defineAction({
        name: 'DragAndDrop',
        description: 'Pick up a specific UI element and move it to a new position (e.g., reorder a card, move a file into a folder, sort list items). The element itself moves with your finger/mouse.',
        interfaceAlias: 'aiDragAndDrop',
        paramSchema: actionDragAndDropParamSchema,
        sample: {
            from: { prompt: 'the "report.pdf" file icon' },
            to: { prompt: 'the upload drop zone' },
        },
        call,
    });
};
export const ActionLongPressParamSchema = z.object({
    locate: getMidsceneLocationSchema().describe('The element to be long pressed'),
    duration: z
        .number()
        .default(500)
        .optional()
        .describe('Long press duration in milliseconds'),
});
export const defineActionLongPress = (call) => {
    return defineAction({
        name: 'LongPress',
        description: 'Long press the element',
        paramSchema: ActionLongPressParamSchema,
        sample: {
            locate: { prompt: 'the message bubble' },
        },
        call,
    });
};
export const ActionSwipeParamSchema = z.object({
    start: getMidsceneLocationSchema()
        .optional()
        .describe('Starting point of the swipe gesture, if not specified, the center of the page will be used'),
    direction: z
        .enum(['up', 'down', 'left', 'right'])
        .optional()
        .describe('The direction to swipe (required when using distance). The direction means the direction of the finger swipe.'),
    distance: z
        .number()
        .optional()
        .describe('The distance in pixels to swipe (mutually exclusive with end)'),
    end: getMidsceneLocationSchema()
        .optional()
        .describe('Ending point of the swipe gesture (mutually exclusive with distance)'),
    duration: z
        .number()
        .default(300)
        .describe('Duration of the swipe gesture in milliseconds'),
    repeat: z
        .number()
        .optional()
        .describe('The number of times to repeat the swipe gesture. 1 for default, 0 for infinite (e.g. endless swipe until the end of the page)'),
});
export function normalizeMobileSwipeParam(param, screenSize) {
    const { width, height } = screenSize;
    const { start, end } = param;
    const startPoint = start
        ? { x: start.center[0], y: start.center[1] }
        : { x: width / 2, y: height / 2 };
    let endPoint;
    if (end) {
        endPoint = { x: end.center[0], y: end.center[1] };
    }
    else if (param.distance) {
        const direction = param.direction;
        if (!direction) {
            throw new Error('direction is required for swipe gesture');
        }
        endPoint = {
            x: startPoint.x +
                (direction === 'right'
                    ? param.distance
                    : direction === 'left'
                        ? -param.distance
                        : 0),
            y: startPoint.y +
                (direction === 'down'
                    ? param.distance
                    : direction === 'up'
                        ? -param.distance
                        : 0),
        };
    }
    else {
        throw new Error('Either end or distance must be specified for swipe gesture');
    }
    endPoint.x = Math.max(0, Math.min(endPoint.x, width));
    endPoint.y = Math.max(0, Math.min(endPoint.y, height));
    const duration = param.duration ?? 300;
    let repeatCount = typeof param.repeat === 'number' ? param.repeat : 1;
    if (repeatCount === 0) {
        repeatCount = 10;
    }
    return { startPoint, endPoint, duration, repeatCount };
}
export const defineActionSwipe = (call) => {
    return defineAction({
        name: 'Swipe',
        description: 'Perform a touch gesture for interactions beyond regular scrolling (e.g., flip pages in a carousel, dismiss a notification, swipe-to-delete a list item). For regular content scrolling, use Scroll instead. Use "distance" + "direction" for relative movement, or "end" for precise endpoint.',
        paramSchema: ActionSwipeParamSchema,
        sample: {
            start: { prompt: 'center of the notification' },
            end: { prompt: 'upper edge of the screen' },
        },
        call,
    });
};
// ClearInput
export const actionClearInputParamSchema = z.object({
    locate: getMidsceneLocationSchema()
        .describe('The input field to be cleared')
        .optional(),
});
export const defineActionClearInput = (call) => {
    return defineAction({
        name: 'ClearInput',
        description: inputLocateDescription,
        interfaceAlias: 'aiClearInput',
        paramSchema: actionClearInputParamSchema,
        sample: {
            locate: { prompt: 'the search input field' },
        },
        call,
    });
};
// CursorMove
export const actionCursorMoveParamSchema = z.object({
    direction: z
        .enum(['left', 'right'])
        .describe('The direction to move the cursor'),
    times: z
        .number()
        .int()
        .min(1)
        .default(1)
        .describe('The number of times to move the cursor in the specified direction'),
});
export const defineActionCursorMove = (call) => {
    return defineAction({
        name: 'CursorMove',
        description: 'Move the text cursor (caret) left or right within an input field or text area. Use this to reposition the cursor without selecting text.',
        paramSchema: actionCursorMoveParamSchema,
        sample: {
            direction: 'left',
            times: 3,
        },
        call,
    });
};
// Sleep
export const ActionSleepParamSchema = z.object({
    timeMs: z
        .number()
        .default(1000)
        .optional()
        .describe('Sleep duration in milliseconds, defaults to 1000ms (1 second)'),
});
export const defineActionSleep = () => {
    return defineAction({
        name: 'Sleep',
        description: 'Wait for a specified duration before continuing. Defaults to 1 second (1000ms) if not specified.',
        paramSchema: ActionSleepParamSchema,
        sample: {
            timeMs: 2000,
        },
        call: async (param) => {
            const duration = param?.timeMs ?? 1000;
            getDebug('device:common-action')(`Sleeping for ${duration}ms`);
            await new Promise((resolve) => setTimeout(resolve, duration));
        },
    });
};
