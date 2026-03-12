import { defineActionDragAndDrop, defineActionHover, defineActionInput, defineActionKeyboardPress, defineActionRightClick, defineActionScroll, defineActionSwipe, defineActionTap, } from '@/core/device';
import { ERROR_CODE_NOT_IMPLEMENTED_AS_DESIGNED } from '@/shared/common';
const ThrowNotImplemented = (methodName) => {
    throw new Error(`The method "${methodName}" is not implemented as designed since this is a static UI context. (${ERROR_CODE_NOT_IMPLEMENTED_AS_DESIGNED})`);
};
export default class StaticPage {
    interfaceType = 'static';
    uiContext;
    constructor(uiContext) {
        this.uiContext = uiContext;
    }
    actionSpace() {
        // Return available actions for static page - they will throw "not implemented" errors when executed
        // but need to be available for planning phase
        return [
            defineActionTap(async (param) => {
                ThrowNotImplemented('Tap');
            }),
            defineActionRightClick(async (param) => {
                ThrowNotImplemented('RightClick');
            }),
            defineActionHover(async (param) => {
                ThrowNotImplemented('Hover');
            }),
            defineActionInput(async (param) => {
                ThrowNotImplemented('Input');
            }),
            defineActionKeyboardPress(async (param) => {
                ThrowNotImplemented('KeyboardPress');
            }),
            defineActionScroll(async (param) => {
                ThrowNotImplemented('Scroll');
            }),
            defineActionDragAndDrop(async (param) => {
                ThrowNotImplemented('DragAndDrop');
            }),
            defineActionSwipe(async (param) => {
                ThrowNotImplemented('Swipe');
            }),
        ];
    }
    async evaluateJavaScript(script) {
        return ThrowNotImplemented('evaluateJavaScript');
    }
    // @deprecated
    async getElementsInfo() {
        return ThrowNotImplemented('getElementsInfo');
    }
    async getElementsNodeTree() {
        return ThrowNotImplemented('getElementsNodeTree');
    }
    async getXpathsByPoint(point) {
        return ThrowNotImplemented('getXpathsByPoint');
    }
    async getElementInfoByXpath(xpath) {
        return ThrowNotImplemented('getElementInfoByXpath');
    }
    async size() {
        return {
            ...this.uiContext.shotSize
        };
    }
    async screenshotBase64() {
        const screenshot = this.uiContext.screenshot;
        if (typeof screenshot === 'object' && 'base64' in screenshot) {
            return screenshot.base64;
        }
        return screenshot;
    }
    async url() {
        return Promise.resolve('https://static_page_without_url');
    }
    async scrollUntilTop(startingPoint) {
        return ThrowNotImplemented('scrollUntilTop');
    }
    async scrollUntilBottom(startingPoint) {
        return ThrowNotImplemented('scrollUntilBottom');
    }
    async scrollUntilLeft(startingPoint) {
        return ThrowNotImplemented('scrollUntilLeft');
    }
    async scrollUntilRight(startingPoint) {
        return ThrowNotImplemented('scrollUntilRight');
    }
    async scrollUp(distance, startingPoint) {
        return ThrowNotImplemented('scrollUp');
    }
    async scrollDown(distance, startingPoint) {
        return ThrowNotImplemented('scrollDown');
    }
    async scrollLeft(distance, startingPoint) {
        return ThrowNotImplemented('scrollLeft');
    }
    async scrollRight(distance, startingPoint) {
        return ThrowNotImplemented('scrollRight');
    }
    async clearInput() {
        return ThrowNotImplemented('clearInput');
    }
    mouse = {
        click: ThrowNotImplemented.bind(null, 'mouse.click'),
        wheel: ThrowNotImplemented.bind(null, 'mouse.wheel'),
        move: ThrowNotImplemented.bind(null, 'mouse.move'),
        drag: ThrowNotImplemented.bind(null, 'mouse.drag'),
    };
    keyboard = {
        type: ThrowNotImplemented.bind(null, 'keyboard.type'),
        press: ThrowNotImplemented.bind(null, 'keyboard.press'),
    };
    async destroy() {
        //
    }
    updateContext(newContext) {
        this.uiContext = newContext;
    }
}
