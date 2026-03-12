import assert from 'node:assert';
import { z } from '@/core';
import { AbstractInterface, defineAction, defineActionClearInput, defineActionCursorMove, defineActionDoubleClick, defineActionDragAndDrop, defineActionHover, defineActionInput, defineActionKeyboardPress, defineActionLongPress, defineActionRightClick, defineActionScroll, defineActionSwipe, defineActionTap, } from '@/core/device';
import { sleep } from '@/core/utils';
import { getDebug } from '@/shared/logger';
import { transformHotkeyInput } from '@/shared/us-keyboard-layout';
const debug = getDebug('web:page');
const navigateParamSchema = z.object({
    url: z
        .string()
        .describe('The URL to navigate to. Must start with https://, file://, or a similar protocol.'),
});
function normalizeKeyInputs(value) {
    const inputs = Array.isArray(value) ? value : [value];
    const result = [];
    for (const input of inputs) {
        if (typeof input !== 'string') {
            result.push(input);
            continue;
        }
        const trimmed = input.trim();
        if (!trimmed) {
            result.push(input);
            continue;
        }
        let normalized = trimmed;
        if (normalized.length > 1 && normalized.includes('+')) {
            normalized = normalized.replace(/\s*\+\s*/g, ' ');
        }
        if (/\s/.test(normalized)) {
            normalized = normalized.replace(/\s+/g, ' ');
        }
        const transformed = transformHotkeyInput(normalized);
        if (transformed.length === 1 && transformed[0] === '' && trimmed !== '') {
            result.push(input);
            continue;
        }
        if (transformed.length === 0) {
            result.push(input);
            continue;
        }
        result.push(...transformed);
    }
    return result;
}
export function getKeyCommands(value) {
    const keys = normalizeKeyInputs(value);
    return keys.reduce((acc, k) => {
        const includeMeta = keys.includes('Meta') || keys.includes('Control');
        if (includeMeta && (k === 'a' || k === 'A')) {
            return acc.concat([{ key: k, command: 'SelectAll' }]);
        }
        if (includeMeta && (k === 'c' || k === 'C')) {
            return acc.concat([{ key: k, command: 'Copy' }]);
        }
        if (includeMeta && (k === 'v' || k === 'V')) {
            return acc.concat([{ key: k, command: 'Paste' }]);
        }
        return acc.concat([{ key: k }]);
    }, []);
}
export class AbstractWebPage extends AbstractInterface {
    get mouse() {
        return {
            click: async (x, y, options) => { },
            wheel: async (deltaX, deltaY) => { },
            move: async (x, y) => { },
            drag: async (from, to) => { },
        };
    }
    get keyboard() {
        return {
            type: async (text) => { },
            press: async (action) => { },
        };
    }
    async clearInput(element) { }
}
export const commonWebActionsForWebPage = (page, includeTouchEvents = false) => [
    defineActionTap(async (param) => {
        const element = param.locate;
        assert(element, 'Element not found, cannot tap');
        // Pure tap action - file handling is done at Page layer via setFileChooserHandler
        await page.mouse.click(element.center[0], element.center[1], {
            button: 'left',
        });
    }),
    defineActionRightClick(async (param) => {
        const element = param.locate;
        assert(element, 'Element not found, cannot right click');
        await page.mouse.click(element.center[0], element.center[1], {
            button: 'right',
        });
    }),
    defineActionDoubleClick(async (param) => {
        const element = param.locate;
        assert(element, 'Element not found, cannot double click');
        await page.mouse.click(element.center[0], element.center[1], {
            button: 'left',
            count: 2,
        });
    }),
    defineActionHover(async (param) => {
        const element = param.locate;
        assert(element, 'Element not found, cannot hover');
        await page.mouse.move(element.center[0], element.center[1]);
    }),
    defineActionInput(async (param) => {
        const element = param.locate;
        if (element && param.mode !== 'typeOnly') {
            await page.clearInput(element);
        }
        else if (element && param.mode === 'typeOnly') {
            // typeOnly mode: click to focus and move cursor to end, but don't clear
            await page.mouse.click(element.center[0], element.center[1], {
                button: 'left',
            });
            await page.keyboard.press([{ key: 'End' }]);
        }
        if (param.mode === 'clear') {
            return;
        }
        if (!param || !param.value) {
            return;
        }
        // Note: there is another implementation in AndroidDevicePage, which is more complex
        await page.keyboard.type(param.value);
    }),
    defineActionKeyboardPress(async (param) => {
        const element = param.locate;
        if (element) {
            await page.mouse.click(element.center[0], element.center[1], {
                button: 'left',
            });
        }
        const keys = getKeyCommands(param.keyName);
        await page.keyboard.press(keys); // TODO: fix this type error
    }),
    defineActionCursorMove(async (param) => {
        const arrowKey = param.direction === 'left' ? 'ArrowLeft' : 'ArrowRight';
        const times = param.times ?? 1;
        for (let i = 0; i < times; i++) {
            await page.keyboard.press([{ key: arrowKey }]);
            await sleep(100);
        }
    }),
    defineActionScroll(async (param) => {
        const element = param.locate;
        const startingPoint = element
            ? {
                left: element.center[0],
                top: element.center[1],
            }
            : undefined;
        const scrollToEventName = param?.scrollType;
        if (scrollToEventName === 'scrollToTop') {
            await page.scrollUntilTop(startingPoint);
        }
        else if (scrollToEventName === 'scrollToBottom') {
            await page.scrollUntilBottom(startingPoint);
        }
        else if (scrollToEventName === 'scrollToRight') {
            await page.scrollUntilRight(startingPoint);
        }
        else if (scrollToEventName === 'scrollToLeft') {
            await page.scrollUntilLeft(startingPoint);
        }
        else if (scrollToEventName === 'singleAction' || !scrollToEventName) {
            if (param?.direction === 'down' || !param || !param.direction) {
                await page.scrollDown(param?.distance || undefined, startingPoint);
            }
            else if (param.direction === 'up') {
                await page.scrollUp(param.distance || undefined, startingPoint);
            }
            else if (param.direction === 'left') {
                await page.scrollLeft(param.distance || undefined, startingPoint);
            }
            else if (param.direction === 'right') {
                await page.scrollRight(param.distance || undefined, startingPoint);
            }
            else {
                throw new Error(`Unknown scroll direction: ${param.direction}`);
            }
            // until mouse event is done
            await sleep(500);
        }
        else {
            throw new Error(`Unknown scroll event type: ${scrollToEventName}, param: ${JSON.stringify(param)}`);
        }
    }),
    defineActionDragAndDrop(async (param) => {
        const from = param.from;
        const to = param.to;
        assert(from, 'missing "from" param for drag and drop');
        assert(to, 'missing "to" param for drag and drop');
        await page.mouse.drag({
            x: from.center[0],
            y: from.center[1],
        }, {
            x: to.center[0],
            y: to.center[1],
        });
    }),
    defineActionLongPress(async (param) => {
        const element = param.locate;
        assert(element, 'Element not found, cannot long press');
        const duration = param?.duration;
        await page.longPress(element.center[0], element.center[1], duration);
    }),
    ...(includeTouchEvents
        ? [
            defineActionSwipe(async (param) => {
                const { width, height } = await page.size();
                const { start, end } = param;
                const startPoint = start
                    ? {
                        x: start.center[0],
                        y: start.center[1],
                    }
                    : {
                        x: width / 2,
                        y: height / 2,
                    };
                let endPoint;
                if (end) {
                    endPoint = {
                        x: end.center[0],
                        y: end.center[1],
                    };
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
                // Ensure end coordinates are within bounds
                endPoint.x = Math.max(0, Math.min(endPoint.x, width));
                endPoint.y = Math.max(0, Math.min(endPoint.y, height));
                const duration = param.duration;
                debug(`swipe from ${startPoint.x}, ${startPoint.y} to ${endPoint.x}, ${endPoint.y} with duration ${duration}ms, repeat is set to ${param.repeat}`);
                let repeat = typeof param.repeat === 'number' ? param.repeat : 1;
                if (repeat === 0) {
                    repeat = 10; // 10 times is enough for infinite swipe
                }
                for (let i = 0; i < repeat; i++) {
                    await page.swipe(startPoint, endPoint, duration);
                }
            }),
        ]
        : []),
    defineActionClearInput(async (param) => {
        await page.clearInput(param.locate);
    }),
    defineAction({
        name: 'Navigate',
        description: 'Navigate the browser to a specified URL. Opens the URL in the current tab.',
        paramSchema: navigateParamSchema,
        sample: {
            url: 'https://www.example.com',
        },
        call: async (param) => {
            if (!page.navigate) {
                throw new Error('Navigate operation is not supported on this page type');
            }
            await page.navigate(param.url);
        },
    }),
    defineAction({
        name: 'Reload',
        description: 'Reload the current page',
        call: async () => {
            if (!page.reload) {
                throw new Error('Reload operation is not supported on this page type');
            }
            await page.reload();
        },
    }),
    defineAction({
        name: 'GoBack',
        description: 'Navigate back in browser history',
        call: async () => {
            if (!page.goBack) {
                throw new Error('GoBack operation is not supported on this page type');
            }
            await page.goBack();
        },
    }),
];
