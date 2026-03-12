import { sleep } from '@/core/utils';
import { DEFAULT_WAIT_FOR_NAVIGATION_TIMEOUT, DEFAULT_WAIT_FOR_NETWORK_IDLE_CONCURRENCY, DEFAULT_WAIT_FOR_NETWORK_IDLE_TIMEOUT, } from '@/shared/constants';
import { treeToList } from '@/shared/extractor';
import { createImgBase64ByFormat } from '@/shared/img';
import { getDebug } from '@/shared/logger';
import { getElementInfosScriptContent, getExtraReturnLogic, } from '@/shared/node';
import { assert } from '@/shared/utils';
import { buildRectFromElementInfo, judgeOrderSensitive, sanitizeXpaths, } from '../common/cache-helper';
import { commonWebActionsForWebPage, } from '../web-page';
export const debugPage = getDebug('web:page');
export class Page {
    underlyingPage;
    waitForNavigationTimeout;
    waitForNetworkIdleTimeout;
    viewportSize;
    onBeforeInvokeAction;
    onAfterInvokeAction;
    customActions;
    enableTouchEventsInActionSpace;
    puppeteerFileChooserSession;
    puppeteerFileChooserHandler;
    interfaceType;
    actionSpace() {
        const defaultActions = commonWebActionsForWebPage(this, this.enableTouchEventsInActionSpace);
        const customActions = this.customActions || [];
        return [...defaultActions, ...customActions];
    }
    async evaluate(pageFunction, arg) {
        let result;
        debugPage('evaluate function begin');
        if (this.interfaceType === 'puppeteer') {
            result = await this.underlyingPage.evaluate(pageFunction, arg);
        }
        else {
            result = await this.underlyingPage.evaluate(pageFunction, arg);
        }
        debugPage('evaluate function end');
        return result;
    }
    constructor(underlyingPage, interfaceType, opts) {
        this.underlyingPage = underlyingPage;
        this.interfaceType = interfaceType;
        this.waitForNavigationTimeout =
            opts?.waitForNavigationTimeout ?? DEFAULT_WAIT_FOR_NAVIGATION_TIMEOUT;
        this.waitForNetworkIdleTimeout =
            opts?.waitForNetworkIdleTimeout ?? DEFAULT_WAIT_FOR_NETWORK_IDLE_TIMEOUT;
        this.onBeforeInvokeAction = opts?.beforeInvokeAction;
        this.onAfterInvokeAction = opts?.afterInvokeAction;
        this.customActions = opts?.customActions;
        this.enableTouchEventsInActionSpace =
            opts?.enableTouchEventsInActionSpace ?? false;
    }
    async evaluateJavaScript(script) {
        return this.evaluate(script);
    }
    async waitForNavigation(moment, actionName) {
        if (this.waitForNavigationTimeout === 0) {
            debugPage('waitForNavigation timeout is 0, skip waiting');
            return;
        }
        // issue: https://github.com/puppeteer/puppeteer/issues/3323
        if (this.interfaceType === 'puppeteer' ||
            this.interfaceType === 'playwright') {
            debugPage(`waitForNavigation begin at moment ${moment} with timeout: ${this.waitForNavigationTimeout} and actionName: ${actionName}`);
            try {
                await this.underlyingPage.waitForSelector('html', {
                    timeout: this.waitForNavigationTimeout,
                });
            }
            catch (error) {
                // Ignore timeout error, continue execution
                console.warn('[midscene:warning] Waiting for the "navigation" has timed out, but Midscene will continue execution. Please check https://midscenejs.com/faq.html#customize-the-network-timeout for more information on customizing the network timeout');
            }
            debugPage('waitForNavigation end');
        }
    }
    async waitForNetworkIdle(moment, actionName) {
        if (this.interfaceType === 'puppeteer') {
            if (this.waitForNetworkIdleTimeout === 0) {
                debugPage('waitForNetworkIdle timeout is 0, skip waiting');
                return;
            }
            debugPage(`waitForNetworkIdle begin at moment ${moment} with timeout: ${this.waitForNetworkIdleTimeout} and concurrency: ${DEFAULT_WAIT_FOR_NETWORK_IDLE_CONCURRENCY} and actionName: ${actionName}`);
            try {
                await this.underlyingPage.waitForNetworkIdle({
                    idleTime: 200,
                    concurrency: DEFAULT_WAIT_FOR_NETWORK_IDLE_CONCURRENCY,
                    timeout: this.waitForNetworkIdleTimeout,
                });
            }
            catch (error) {
                // Ignore timeout error, continue execution
                console.warn('[midscene:warning] Waiting for the "network idle" has timed out, but Midscene will continue execution. Please check https://midscenejs.com/faq.html#customize-the-network-timeout for more information on customizing the network timeout');
            }
            debugPage('waitForNetworkIdle end');
        }
        else {
            // TODO: implement playwright waitForNetworkIdle
        }
    }
    // @deprecated
    async getElementsInfo() {
        // const scripts = await getExtraReturnLogic();
        // const captureElementSnapshot = await this.evaluate(scripts);
        // return captureElementSnapshot as ElementInfo[];
        await this.waitForNavigation('getElementsInfo');
        debugPage('getElementsInfo begin');
        const tree = await this.getElementsNodeTree();
        debugPage('getElementsInfo end');
        return treeToList(tree);
    }
    async getXpathsByPoint(point, isOrderSensitive) {
        const elementInfosScriptContent = getElementInfosScriptContent();
        return this.evaluateJavaScript(`${elementInfosScriptContent}midscene_element_inspector.getXpathsByPoint({left: ${point.left}, top: ${point.top}}, ${isOrderSensitive})`);
    }
    async getElementInfoByXpath(xpath) {
        const elementInfosScriptContent = getElementInfosScriptContent();
        return this.evaluateJavaScript(`${elementInfosScriptContent}midscene_element_inspector.getElementInfoByXpath(${JSON.stringify(xpath)})`);
    }
    async cacheFeatureForPoint(center, options) {
        const point = { left: center[0], top: center[1] };
        try {
            const isOrderSensitive = await judgeOrderSensitive(options, debugPage);
            const xpaths = await this.getXpathsByPoint(point, isOrderSensitive);
            const sanitized = sanitizeXpaths(xpaths);
            if (!sanitized.length) {
                debugPage('cacheFeatureForPoint: no xpath found at point %o', center);
            }
            return { xpaths: sanitized };
        }
        catch (error) {
            debugPage('cacheFeatureForPoint failed: %s', error);
            return { xpaths: [] };
        }
    }
    async rectMatchesCacheFeature(feature) {
        const xpaths = sanitizeXpaths(feature.xpaths);
        debugPage('rectMatchesCacheFeature: trying %d xpath(s)', xpaths.length);
        for (const xpath of xpaths) {
            try {
                debugPage('rectMatchesCacheFeature: evaluating xpath: %s', xpath);
                const elementInfo = await this.getElementInfoByXpath(xpath);
                if (elementInfo?.rect) {
                    debugPage('rectMatchesCacheFeature: found element, rect: %o', elementInfo.rect);
                    return buildRectFromElementInfo(elementInfo);
                }
                debugPage('rectMatchesCacheFeature: element found but no rect (elementInfo: %o)', elementInfo);
            }
            catch (error) {
                debugPage('rectMatchesCacheFeature failed for xpath %s: %s', xpath, error);
            }
        }
        throw new Error(`No matching element rect found for the provided cache feature (tried ${xpaths.length} xpath(s): ${xpaths.join(', ')})`);
    }
    async getElementsNodeTree() {
        // ref: packages/web-integration/src/playwright/ai-fixture.ts popup logic
        // During test execution, a new page might be opened through a connection, and the page remains confined to the same page instance.
        // The page may go through opening, closing, and reopening; if the page is closed, evaluate may return undefined, which can lead to errors.
        await this.waitForNavigation('getElementsNodeTree');
        const scripts = await getExtraReturnLogic(true);
        assert(scripts, 'scripts should be set before writing report in browser');
        const startTime = Date.now();
        const captureElementSnapshot = await this.evaluate(scripts);
        const endTime = Date.now();
        debugPage(`getElementsNodeTree end, cost: ${endTime - startTime}ms`);
        return captureElementSnapshot;
    }
    async size() {
        if (this.viewportSize)
            return this.viewportSize;
        const sizeInfo = await this.evaluate(() => {
            return {
                width: window.innerWidth,
                height: window.innerHeight,
            };
        });
        this.viewportSize = sizeInfo;
        return sizeInfo;
    }
    async screenshotBase64() {
        const imgType = 'jpeg';
        const quality = 90;
        const startTime = Date.now();
        debugPage('screenshotBase64 begin');
        let base64;
        if (this.interfaceType === 'puppeteer') {
            const result = await this.underlyingPage.screenshot({
                type: imgType,
                quality,
                encoding: 'base64',
            });
            base64 = createImgBase64ByFormat(imgType, result);
        }
        else if (this.interfaceType === 'playwright') {
            const buffer = await this.underlyingPage.screenshot({
                type: imgType,
                quality,
                timeout: 10 * 1000,
            });
            base64 = createImgBase64ByFormat(imgType, buffer.toString('base64'));
        }
        else {
            throw new Error('Unsupported page type for screenshot');
        }
        const endTime = Date.now();
        debugPage(`screenshotBase64 end, cost: ${endTime - startTime}ms`);
        return base64;
    }
    async url() {
        return this.underlyingPage.url();
    }
    describe() {
        const url = this.underlyingPage.url();
        return url || '';
    }
    get mouse() {
        return {
            click: async (x, y, options) => {
                await this.mouse.move(x, y);
                const { button = 'left', count = 1 } = options || {};
                debugPage(`mouse click ${x}, ${y}, ${button}, ${count}`);
                if (count === 2 && this.interfaceType === 'playwright') {
                    await this.underlyingPage.mouse.dblclick(x, y, {
                        button,
                    });
                }
                else if (this.interfaceType === 'puppeteer') {
                    const page = this.underlyingPage;
                    if (button === 'left' && count === 1) {
                        await page.mouse.click(x, y);
                    }
                    else {
                        await page.mouse.click(x, y, { button, count });
                    }
                }
                else if (this.interfaceType === 'playwright') {
                    await this.underlyingPage.mouse.click(x, y, {
                        button,
                        clickCount: count,
                    });
                }
            },
            wheel: async (deltaX, deltaY) => {
                debugPage(`mouse wheel ${deltaX}, ${deltaY}`);
                if (this.interfaceType === 'puppeteer') {
                    await this.underlyingPage.mouse.wheel({
                        deltaX,
                        deltaY,
                    });
                }
                else if (this.interfaceType === 'playwright') {
                    await this.underlyingPage.mouse.wheel(deltaX, deltaY);
                }
            },
            move: async (x, y) => {
                this.everMoved = true;
                debugPage(`mouse move to ${x}, ${y}`);
                return this.underlyingPage.mouse.move(x, y);
            },
            drag: async (from, to) => {
                debugPage(`begin mouse drag from ${from.x}, ${from.y} to ${to.x}, ${to.y}`);
                await this.underlyingPage.mouse.move(from.x, from.y);
                await sleep(200);
                await this.underlyingPage.mouse.down();
                await sleep(300);
                await this.underlyingPage.mouse.move(to.x, to.y, {
                    steps: 20,
                });
                await sleep(500);
                await this.underlyingPage.mouse.up();
                await sleep(200);
                debugPage(`end mouse drag from ${from.x}, ${from.y} to ${to.x}, ${to.y}`);
            },
        };
    }
    get keyboard() {
        return {
            type: async (text) => {
                debugPage(`keyboard type ${text}`);
                return this.underlyingPage.keyboard.type(text, { delay: 80 });
            },
            press: async (action) => {
                const keys = Array.isArray(action) ? action : [action];
                debugPage('keyboard press', keys);
                for (const k of keys) {
                    const commands = k.command ? [k.command] : [];
                    await this.underlyingPage.keyboard.down(k.key, { commands });
                }
                for (const k of [...keys].reverse()) {
                    await this.underlyingPage.keyboard.up(k.key);
                }
            },
            down: async (key) => {
                debugPage(`keyboard down ${key}`);
                return this.underlyingPage.keyboard.down(key);
            },
            up: async (key) => {
                debugPage(`keyboard up ${key}`);
                return this.underlyingPage.keyboard.up(key);
            },
        };
    }
    async clearInput(element) {
        const backspace = async () => {
            await sleep(100);
            await this.keyboard.press([{ key: 'Backspace' }]);
        };
        const isMac = process.platform === 'darwin';
        debugPage('clearInput begin');
        if (isMac) {
            if (this.interfaceType === 'puppeteer') {
                // https://github.com/segment-boneyard/nightmare/issues/810#issuecomment-452669866
                element &&
                    (await this.mouse.click(element.center[0], element.center[1], {
                        count: 3,
                    }));
                await backspace();
            }
            element && (await this.mouse.click(element.center[0], element.center[1]));
            await this.underlyingPage.keyboard.down('Meta');
            await this.underlyingPage.keyboard.press('a');
            await this.underlyingPage.keyboard.up('Meta');
            await backspace();
        }
        else {
            element && (await this.mouse.click(element.center[0], element.center[1]));
            await this.underlyingPage.keyboard.down('Control');
            await this.underlyingPage.keyboard.press('a');
            await this.underlyingPage.keyboard.up('Control');
            await backspace();
        }
        debugPage('clearInput end');
    }
    everMoved = false;
    async moveToPointBeforeScroll(point) {
        if (point) {
            await this.mouse.move(point.left, point.top);
        }
        else if (!this.everMoved) {
            // If the mouse has never moved, move it to the center of the page
            const size = await this.size();
            const targetX = Math.floor(size.width / 2);
            const targetY = Math.floor(size.height / 2);
            await this.mouse.move(targetX, targetY);
        }
    }
    async scrollUntilTop(startingPoint) {
        await this.moveToPointBeforeScroll(startingPoint);
        return this.mouse.wheel(0, -9999999);
    }
    async scrollUntilBottom(startingPoint) {
        await this.moveToPointBeforeScroll(startingPoint);
        return this.mouse.wheel(0, 9999999);
    }
    async scrollUntilLeft(startingPoint) {
        await this.moveToPointBeforeScroll(startingPoint);
        return this.mouse.wheel(-9999999, 0);
    }
    async scrollUntilRight(startingPoint) {
        await this.moveToPointBeforeScroll(startingPoint);
        return this.mouse.wheel(9999999, 0);
    }
    async scrollUp(distance, startingPoint) {
        const innerHeight = await this.evaluate(() => window.innerHeight);
        const scrollDistance = distance || innerHeight * 0.7;
        await this.moveToPointBeforeScroll(startingPoint);
        return this.mouse.wheel(0, -scrollDistance);
    }
    async scrollDown(distance, startingPoint) {
        const innerHeight = await this.evaluate(() => window.innerHeight);
        const scrollDistance = distance || innerHeight * 0.7;
        await this.moveToPointBeforeScroll(startingPoint);
        return this.mouse.wheel(0, scrollDistance);
    }
    async scrollLeft(distance, startingPoint) {
        const innerWidth = await this.evaluate(() => window.innerWidth);
        const scrollDistance = distance || innerWidth * 0.7;
        await this.moveToPointBeforeScroll(startingPoint);
        return this.mouse.wheel(-scrollDistance, 0);
    }
    async scrollRight(distance, startingPoint) {
        const innerWidth = await this.evaluate(() => window.innerWidth);
        const scrollDistance = distance || innerWidth * 0.7;
        await this.moveToPointBeforeScroll(startingPoint);
        return this.mouse.wheel(scrollDistance, 0);
    }
    async navigate(url) {
        debugPage(`navigate to ${url}`);
        if (this.interfaceType === 'puppeteer') {
            await this.underlyingPage.goto(url);
        }
        else if (this.interfaceType === 'playwright') {
            await this.underlyingPage.goto(url);
        }
        else {
            throw new Error('Unsupported page type for navigate');
        }
    }
    async reload() {
        debugPage('reload page');
        if (this.interfaceType === 'puppeteer') {
            await this.underlyingPage.reload();
        }
        else if (this.interfaceType === 'playwright') {
            await this.underlyingPage.reload();
        }
        else {
            throw new Error('Unsupported page type for reload');
        }
    }
    async goBack() {
        debugPage('go back');
        if (this.interfaceType === 'puppeteer') {
            await this.underlyingPage.goBack();
        }
        else if (this.interfaceType === 'playwright') {
            await this.underlyingPage.goBack();
        }
        else {
            throw new Error('Unsupported page type for go back');
        }
    }
    async beforeInvokeAction(name, param) {
        if (this.onBeforeInvokeAction) {
            await this.onBeforeInvokeAction(name, param);
        }
    }
    async afterInvokeAction(name, param) {
        await Promise.all([
            this.waitForNavigation('afterInvokeAction', name),
            this.waitForNetworkIdle('afterInvokeAction', name),
        ]);
        if (this.onAfterInvokeAction) {
            await this.onAfterInvokeAction(name, param);
        }
    }
    async destroy() { }
    async swipe(from, to, duration) {
        const LONG_PRESS_THRESHOLD = 500;
        const MIN_PRESS_THRESHOLD = 150;
        duration = duration || 100;
        if (duration < MIN_PRESS_THRESHOLD) {
            duration = MIN_PRESS_THRESHOLD;
        }
        if (duration > LONG_PRESS_THRESHOLD) {
            duration = LONG_PRESS_THRESHOLD;
        }
        debugPage(`mouse swipe from ${from.x}, ${from.y} to ${to.x}, ${to.y} with duration ${duration}ms`);
        if (this.interfaceType === 'puppeteer') {
            const page = this.underlyingPage;
            await page.mouse.move(from.x, from.y);
            await page.mouse.down({ button: 'left' });
            const steps = 30;
            const delay = duration / steps;
            for (let i = 1; i <= steps; i++) {
                const x = from.x + (to.x - from.x) * (i / steps);
                const y = from.y + (to.y - from.y) * (i / steps);
                await page.mouse.move(x, y);
                await new Promise((resolve) => setTimeout(resolve, delay));
            }
            await page.mouse.up({ button: 'left' });
        }
        else if (this.interfaceType === 'playwright') {
            const page = this.underlyingPage;
            await page.mouse.move(from.x, from.y);
            await page.mouse.down();
            const steps = 30;
            const delay = duration / steps;
            for (let i = 1; i <= steps; i++) {
                const x = from.x + (to.x - from.x) * (i / steps);
                const y = from.y + (to.y - from.y) * (i / steps);
                await page.mouse.move(x, y);
                await page.waitForTimeout(delay);
            }
            await page.mouse.up({ button: 'left' });
        }
    }
    async longPress(x, y, duration) {
        duration = duration || 500;
        const LONG_PRESS_THRESHOLD = 600;
        const MIN_PRESS_THRESHOLD = 300;
        if (duration > LONG_PRESS_THRESHOLD) {
            duration = LONG_PRESS_THRESHOLD;
        }
        if (duration < MIN_PRESS_THRESHOLD) {
            duration = MIN_PRESS_THRESHOLD;
        }
        debugPage(`mouse longPress at ${x}, ${y} for ${duration}ms`);
        if (this.interfaceType === 'puppeteer') {
            const page = this.underlyingPage;
            await page.mouse.move(x, y);
            await page.mouse.down({ button: 'left' });
            await new Promise((res) => setTimeout(res, duration));
            await page.mouse.up({ button: 'left' });
        }
        else if (this.interfaceType === 'playwright') {
            const page = this.underlyingPage;
            await page.mouse.move(x, y);
            await page.mouse.down({ button: 'left' });
            await page.waitForTimeout(duration);
            await page.mouse.up({ button: 'left' });
        }
    }
    async ensurePuppeteerFileChooserSession(page) {
        if (this.puppeteerFileChooserSession) {
            return this.puppeteerFileChooserSession;
        }
        const session = await page.target().createCDPSession();
        await session.send('Page.enable');
        await session.send('DOM.enable');
        await session.send('Page.setInterceptFileChooserDialog', { enabled: true });
        this.puppeteerFileChooserSession = session;
        return session;
    }
    async registerFileChooserListener(handler) {
        if (this.interfaceType !== 'puppeteer') {
            throw new Error('registerFileChooserListener is only supported in Puppeteer');
        }
        const page = this.underlyingPage;
        const session = await this.ensurePuppeteerFileChooserSession(page);
        if (this.puppeteerFileChooserHandler) {
            session.off('Page.fileChooserOpened', this.puppeteerFileChooserHandler);
        }
        let capturedError;
        this.puppeteerFileChooserHandler = async (event) => {
            if (event.backendNodeId === undefined) {
                debugPage('puppeteer file chooser opened without backendNodeId, skip');
                return;
            }
            try {
                await handler({
                    accept: async (files) => {
                        // Get node information to check attributes
                        const { node } = await session.send('DOM.describeNode', {
                            backendNodeId: event.backendNodeId,
                        });
                        // attributes is a flat array: ['attr1', 'value1', 'attr2', 'value2', ...]
                        // Check if input has webkitdirectory attribute (Puppeteer doesn't support directory upload)
                        const hasWebkitDirectory = node.attributes?.includes('webkitdirectory') ||
                            node.attributes?.includes('directory');
                        if (hasWebkitDirectory) {
                            throw new Error('Directory upload (webkitdirectory) is not supported in Puppeteer. Please use Playwright instead, which supports directory upload since version 1.45.');
                        }
                        // Check if input supports multiple files
                        if (files.length > 1) {
                            const hasMultiple = node.attributes?.includes('multiple');
                            if (!hasMultiple) {
                                throw new Error('Non-multiple file input can only accept single file');
                            }
                        }
                        await session.send('DOM.setFileInputFiles', {
                            files,
                            backendNodeId: event.backendNodeId,
                        });
                    },
                });
            }
            catch (error) {
                capturedError = error;
            }
        };
        session.on('Page.fileChooserOpened', this.puppeteerFileChooserHandler);
        return {
            dispose: () => {
                if (this.puppeteerFileChooserHandler) {
                    session.off('Page.fileChooserOpened', this.puppeteerFileChooserHandler);
                }
                void session.detach();
                this.puppeteerFileChooserHandler = undefined;
                if (this.puppeteerFileChooserSession === session) {
                    this.puppeteerFileChooserSession = undefined;
                }
            },
            getError: () => capturedError,
        };
    }
}
export function forceClosePopup(page, debugProfile) {
    page.on('popup', async (popup) => {
        if (!popup) {
            console.warn('got a popup event, but the popup is not ready yet, skip');
            return;
        }
        const url = await popup.url();
        console.log(`Popup opened: ${url}`);
        if (!popup.isClosed()) {
            try {
                await popup.close(); // Close the newly opened TAB
            }
            catch (error) {
                debugProfile(`failed to close popup ${url}, error: ${error}`);
            }
        }
        else {
            debugProfile(`popup is already closed, skip close ${url}`);
        }
        if (!page.isClosed()) {
            try {
                await page.goto(url);
            }
            catch (error) {
                debugProfile(`failed to goto ${url}, error: ${error}`);
            }
        }
        else {
            debugProfile(`page is already closed, skip goto ${url}`);
        }
    });
}
/**
 * Force Chrome to render select elements using base-select appearance instead of OS-native rendering.
 * This makes select elements visible in screenshots captured by Playwright/Puppeteer.
 *
 * Reference: https://developer.chrome.com/blog/a-customizable-select
 *
 * Adds a style tag with CSS rules to make all select elements use base-select appearance.
 */
export function forceChromeSelectRendering(page) {
    // Force Chrome to render select elements using base-select appearance
    // Reference: https://developer.chrome.com/blog/a-customizable-select
    const styleContent = `
/* Add by Midscene because of forceChromeSelectRendering is enabled*/
select {
  &, &::picker(select) {
    appearance: base-select !important;
  }
}`;
    const styleId = 'midscene-force-select-rendering';
    const injectStyle = async () => {
        try {
            await page.evaluate(({ id, content }) => {
                if (document.getElementById(id))
                    return;
                const style = document.createElement('style');
                style.id = id;
                style.textContent = content;
                document.head.appendChild(style);
            }, { id: styleId, content: styleContent });
            debugPage('Midscene - Added base-select appearance style for select elements because of forceChromeSelectRendering is enabled');
        }
        catch (err) {
            console.log('Midscene - Failed to add base-select appearance style:', err);
        }
    };
    // Inject immediately for the current document
    void injectStyle();
    // Ensure the style is reapplied on future navigations/new documents
    page.on('load', () => {
        void injectStyle();
    });
}
