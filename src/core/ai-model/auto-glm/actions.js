import { adaptBbox, pointToBbox } from '@/core/common';
import { getDebug } from '@/shared/logger';
const debug = getDebug('auto-glm-actions');
/**
 * Auto-GLM coordinate system range: [0, AUTO_GLM_COORDINATE_MAX]
 */
const AUTO_GLM_COORDINATE_MAX = 1000;
/**
 * Convert auto-glm coordinate [0,1000] to bbox in pixel coordinates
 */
function autoGLMCoordinateToBbox(x, y, width, height) {
    const bbox = pointToBbox(x, y, 10);
    return adaptBbox(bbox, width, height, 'auto-glm');
}
export function transformAutoGLMAction(action, size) {
    try {
        switch (action._metadata) {
            case 'finish': {
                const finishAction = action;
                debug('Transform finish action:', finishAction);
                return [
                    {
                        type: 'Finished',
                        param: {},
                        thought: finishAction.message,
                    },
                ];
            }
            case 'do': {
                const doAction = action;
                switch (doAction.action) {
                    case 'Tap': {
                        const tapAction = doAction;
                        debug('Transform Tap action:', tapAction);
                        const [x1, y1, x2, y2] = autoGLMCoordinateToBbox(tapAction.element[0], tapAction.element[1], size.width, size.height);
                        const locate = {
                            prompt: '',
                            bbox: [x1, y1, x2, y2],
                        };
                        return [
                            {
                                type: 'Tap',
                                param: {
                                    locate,
                                },
                            },
                        ];
                    }
                    case 'Double Tap': {
                        const doubleTapAction = doAction;
                        debug('Transform Double Tap action:', doubleTapAction);
                        const [x1, y1, x2, y2] = autoGLMCoordinateToBbox(doubleTapAction.element[0], doubleTapAction.element[1], size.width, size.height);
                        const locate = {
                            prompt: '',
                            bbox: [x1, y1, x2, y2],
                        };
                        return [
                            {
                                type: 'DoubleClick',
                                param: {
                                    locate,
                                },
                            },
                        ];
                    }
                    case 'Type': {
                        const typeAction = doAction;
                        debug('Transform Type action:', typeAction);
                        return [
                            {
                                type: 'Input',
                                param: {
                                    value: typeAction.text,
                                },
                            },
                        ];
                    }
                    case 'Swipe': {
                        const swipeAction = doAction;
                        debug('Transform Swipe action:', swipeAction);
                        // Calculate locate using start coordinate
                        const [x1, y1, x2, y2] = autoGLMCoordinateToBbox(swipeAction.start[0], swipeAction.start[1], size.width, size.height);
                        const locate = {
                            prompt: '',
                            bbox: [x1, y1, x2, y2],
                        };
                        // Calculate horizontal and vertical delta in [0,AUTO_GLM_COORDINATE_MAX] coordinate system
                        const deltaX = swipeAction.end[0] - swipeAction.start[0];
                        const deltaY = swipeAction.end[1] - swipeAction.start[1];
                        // Determine direction and distance
                        let direction;
                        let distance;
                        const absDeltaX = Math.abs(deltaX);
                        const absDeltaY = Math.abs(deltaY);
                        if (absDeltaY > absDeltaX) {
                            // Vertical scroll
                            distance = Math.round((absDeltaY * size.height) / AUTO_GLM_COORDINATE_MAX);
                            direction = deltaY > 0 ? 'up' : 'down';
                        }
                        else {
                            // Horizontal scroll
                            distance = Math.round((absDeltaX * size.width) / AUTO_GLM_COORDINATE_MAX);
                            direction = deltaX > 0 ? 'left' : 'right';
                        }
                        debug(`Calculate swipe direction: ${direction}, distance: ${distance}`);
                        return [
                            {
                                type: 'Scroll',
                                param: {
                                    locate,
                                    // The scrolling direction here all refers to which direction of the page's content will appear on the screen.
                                    distance,
                                    direction,
                                },
                                thought: swipeAction.think || '',
                            },
                        ];
                    }
                    case 'Long Press': {
                        const longPressAction = doAction;
                        debug('Transform Long Press action:', longPressAction);
                        const [x1, y1, x2, y2] = autoGLMCoordinateToBbox(longPressAction.element[0], longPressAction.element[1], size.width, size.height);
                        const locate = {
                            prompt: '',
                            bbox: [x1, y1, x2, y2],
                        };
                        return [
                            {
                                type: 'LongPress',
                                param: {
                                    locate,
                                },
                                thought: longPressAction.think || '',
                            },
                        ];
                    }
                    case 'Back': {
                        const backAction = doAction;
                        debug('Transform Back action:', backAction);
                        return [
                            {
                                type: 'AndroidBackButton',
                                param: {},
                                thought: backAction.think || '',
                            },
                        ];
                    }
                    case 'Home': {
                        const homeAction = doAction;
                        debug('Transform Home action:', homeAction);
                        return [
                            {
                                type: 'AndroidHomeButton',
                                param: {},
                                thought: homeAction.think || '',
                            },
                        ];
                    }
                    case 'Wait': {
                        const waitAction = doAction;
                        debug('Transform Wait action:', waitAction);
                        return [
                            {
                                type: 'Sleep',
                                param: {
                                    timeMs: waitAction.durationMs,
                                },
                                thought: waitAction.think || '',
                            },
                        ];
                    }
                    case 'Launch': {
                        const launchAction = doAction;
                        debug('Transform Launch action:', launchAction);
                        return [
                            {
                                type: 'Launch',
                                param: launchAction.app,
                                thought: launchAction.think || '',
                            },
                        ];
                    }
                    case 'Interact': {
                        throw new Error(`Action "Interact" from auto-glm is not supported in the current implementation.`);
                    }
                    case 'Call_API': {
                        throw new Error(`Action "Call_API" from auto-glm is not supported in the current implementation.`);
                    }
                    case 'Take_over': {
                        throw new Error(`Action "Take_over" from auto-glm is not supported in the current implementation.`);
                    }
                    case 'Note': {
                        throw new Error(`Action "Note" from auto-glm is not supported in the current implementation.`);
                    }
                    default:
                        throw new Error(`Unknown do() action type: ${doAction.action}`);
                }
            }
            default:
                throw new Error(`Unknown action metadata: ${action._metadata}`);
        }
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        debug('Transform error:', errorMessage);
        throw new Error(`Failed to transform action: ${errorMessage}`);
    }
}
