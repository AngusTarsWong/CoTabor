import { generateHashId } from '../utils';
import { extractTextWithPosition } from './web-extractor';
const MAX_VALUE_LENGTH = 300;
let debugMode = false;
export function setDebugMode(mode) {
    debugMode = mode;
}
export function getDebugMode() {
    return debugMode;
}
export function logger(..._msg) {
    if (!debugMode) {
        return;
    }
    console.log(..._msg);
}
export function isElementPartiallyInViewport(rect, currentWindow, currentDocument, visibleAreaRatio = 2 / 3) {
    const elementHeight = rect.height;
    const elementWidth = rect.width;
    const viewportRect = {
        left: 0,
        top: 0,
        width: currentWindow.innerWidth || currentDocument.documentElement.clientWidth,
        height: currentWindow.innerHeight || currentDocument.documentElement.clientHeight,
        right: currentWindow.innerWidth || currentDocument.documentElement.clientWidth,
        bottom: currentWindow.innerHeight || currentDocument.documentElement.clientHeight,
        x: 0,
        y: 0,
        zoom: 1,
    };
    const overlapRect = overlappedRect(rect, viewportRect);
    if (!overlapRect) {
        return false;
    }
    const visibleArea = overlapRect.width * overlapRect.height;
    const totalArea = elementHeight * elementWidth;
    // return visibleArea > 30 * 30 || visibleArea / totalArea >= 2 / 3;
    return visibleArea / totalArea >= visibleAreaRatio;
}
export function getPseudoElementContent(element, currentWindow) {
    if (!(element instanceof currentWindow.HTMLElement)) {
        return { before: '', after: '' };
    }
    const beforeContent = currentWindow
        .getComputedStyle(element, '::before')
        .getPropertyValue('content');
    const afterContent = currentWindow
        .getComputedStyle(element, '::after')
        .getPropertyValue('content');
    return {
        before: beforeContent === 'none' ? '' : beforeContent.replace(/"/g, ''),
        after: afterContent === 'none' ? '' : afterContent.replace(/"/g, ''),
    };
}
export function hasOverflowY(element, currentWindow) {
    const style = currentWindow.getComputedStyle(element);
    return (style.overflowY === 'scroll' ||
        style.overflowY === 'auto' ||
        style.overflowY === 'hidden');
}
// tell if two rects are overlapped, return the overlapped rect. If not, return null
export function overlappedRect(rect1, rect2) {
    const left = Math.max(rect1.left, rect2.left);
    const top = Math.max(rect1.top, rect2.top);
    const right = Math.min(rect1.right, rect2.right);
    const bottom = Math.min(rect1.bottom, rect2.bottom);
    if (left < right && top < bottom) {
        return {
            left,
            top,
            right,
            bottom,
            width: right - left,
            height: bottom - top,
            x: left,
            y: top,
            zoom: 1,
        };
    }
    return null;
}
export function getRect(el, baseZoom, // base zoom
currentWindow) {
    let originalRect;
    let newZoom = 1;
    // Check if node is an Element (HTMLElement and SVGElement both have getBoundingClientRect)
    const hasGetBoundingClientRect = el instanceof Element;
    if (!hasGetBoundingClientRect) {
        // For text nodes and other nodes without getBoundingClientRect, use Range API
        const range = currentWindow.document.createRange();
        range.selectNodeContents(el);
        originalRect = range.getBoundingClientRect();
    }
    else {
        // For HTMLElement and SVGElement, use getBoundingClientRect directly
        originalRect = el.getBoundingClientRect();
        // from Chrome v128, the API would return differently https://docs.google.com/document/d/1AcnDShjT-kEuRaMchZPm5uaIgNZ4OiYtM4JI9qiV8Po/edit
        if (el instanceof currentWindow.HTMLElement && !('currentCSSZoom' in el)) {
            newZoom =
                Number.parseFloat(currentWindow.getComputedStyle(el).zoom) ||
                    1;
        }
    }
    const zoom = newZoom * baseZoom;
    return {
        width: originalRect.width * zoom,
        height: originalRect.height * zoom,
        left: originalRect.left * zoom,
        top: originalRect.top * zoom,
        right: originalRect.right * zoom,
        bottom: originalRect.bottom * zoom,
        x: originalRect.x * zoom,
        y: originalRect.y * zoom,
        zoom,
    };
}
const isElementCovered = (el, rect, currentWindow) => {
    // Gets the center coordinates of the element
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    // Gets the element above that point
    const topElement = currentWindow.document.elementFromPoint(x, y);
    if (!topElement) {
        return false; // usually because it's outside the screen
    }
    if (topElement === el) {
        return false;
    }
    if (el?.contains(topElement)) {
        return false;
    }
    if (topElement?.contains(el)) {
        return false;
    }
    const rectOfTopElement = getRect(topElement, 1, currentWindow);
    // get the remaining area of the base element
    const overlapRect = overlappedRect(rect, rectOfTopElement);
    if (!overlapRect) {
        return false;
    }
    // Todo: we should modify the 'box-select' as well to make the indicator more accurate
    // const remainingArea =
    //   rect.width * rect.height - overlapRect.width * overlapRect.height;
    // if (remainingArea > 100) {
    //   return false;
    // }
    logger(el, 'Element is covered by another element', {
        topElement,
        el,
        rect,
        x,
        y,
    });
    return true;
    // Determines if the returned element is the target element itself
    // return el.contains(topElement) || (topElement as HTMLElement).contains(el);
    // return topElement !== el && !el.contains(topElement);
};
export function elementRect(el, currentWindow, currentDocument, baseZoom = 1) {
    if (!el) {
        logger(el, 'Element is not in the DOM hierarchy');
        return false;
    }
    if (!(el instanceof currentWindow.HTMLElement) &&
        el.nodeType !== Node.TEXT_NODE &&
        el.nodeName.toLowerCase() !== 'svg') {
        logger(el, 'Element is not in the DOM hierarchy');
        return false;
    }
    if (el instanceof currentWindow.HTMLElement) {
        const style = currentWindow.getComputedStyle(el);
        if (style.display === 'none' ||
            style.visibility === 'hidden' ||
            (style.opacity === '0' && el.tagName !== 'INPUT')) {
            logger(el, 'Element is hidden');
            return false;
        }
    }
    const rect = getRect(el, baseZoom, currentWindow);
    if (rect.width === 0 && rect.height === 0) {
        logger(el, 'Element has no size');
        return false;
    }
    // check if the element is covered by another element
    // if the element is zoomed, the coverage check should be done with the original zoom
    if (baseZoom === 1 && isElementCovered(el, rect, currentWindow)) {
        return false;
    }
    const isVisible = isElementPartiallyInViewport(rect, currentWindow, currentDocument);
    // check if the element is hidden by an ancestor
    let parent = el;
    const parentUntilNonStatic = (currentNode) => {
        // find a parent element that is not static
        let parent = currentNode?.parentElement;
        while (parent) {
            const style = currentWindow.getComputedStyle(parent);
            if (style.position !== 'static') {
                return parent;
            }
            parent = parent.parentElement;
        }
        return null;
    };
    while (parent && parent !== currentDocument.body) {
        if (!(parent instanceof currentWindow.HTMLElement)) {
            parent = parent.parentElement;
            continue;
        }
        const parentStyle = currentWindow.getComputedStyle(parent);
        if (parentStyle.overflow === 'hidden') {
            const parentRect = getRect(parent, 1, currentWindow);
            const tolerance = 10;
            if (rect.right < parentRect.left - tolerance ||
                rect.left > parentRect.right + tolerance ||
                rect.bottom < parentRect.top - tolerance ||
                rect.top > parentRect.bottom + tolerance) {
                logger(el, 'element is partially or totally hidden by an ancestor', {
                    rect,
                    parentRect,
                });
                return false;
            }
        }
        // if the parent is a fixed element, stop the search
        if (parentStyle.position === 'fixed' || parentStyle.position === 'sticky') {
            break;
        }
        if (parentStyle.position === 'absolute') {
            parent = parentUntilNonStatic(parent);
        }
        else {
            parent = parent.parentElement;
        }
    }
    return {
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        zoom: rect.zoom,
        isVisible,
    };
}
export function validTextNodeContent(node) {
    if (!node) {
        return false;
    }
    if (node.nodeType !== Node.ELEMENT_NODE &&
        node.nodeType !== Node.TEXT_NODE &&
        node.nodeName !== '#text') {
        return false;
    }
    const content = node.textContent || node.innerText;
    if (content && !/^\s*$/.test(content)) {
        return content.trim();
    }
    return false;
}
export function getNodeAttributes(node, currentWindow) {
    if (!node ||
        !(node instanceof currentWindow.HTMLElement) ||
        !node.attributes) {
        return {};
    }
    const attributesList = Array.from(node.attributes).map((attr) => {
        if (attr.name === 'class') {
            return [attr.name, `.${attr.value.split(' ').join('.')}`];
        }
        let value = attr.value;
        if (value.startsWith('data:image')) {
            value = 'image';
        }
        if (value.length > MAX_VALUE_LENGTH) {
            value = `${value.slice(0, MAX_VALUE_LENGTH)}...`;
        }
        return [attr.name, value];
    });
    return Object.fromEntries(attributesList);
}
/** Maximum number of cached node entries to prevent memory leaks */
const NODE_CACHE_MAX_SIZE = 2000;
/**
 * Reset the node hash cache. Call at the beginning of each extraction cycle
 * to prevent stale DOM references from accumulating.
 */
export function setNodeHashCacheListOnWindow() {
    if (typeof window !== 'undefined') {
        window.midsceneNodeHashCache = new Map();
    }
}
function getNodeCacheMap() {
    if (typeof window === 'undefined')
        return undefined;
    return window.midsceneNodeHashCache;
}
export function setNodeToCacheList(node, id) {
    const cache = getNodeCacheMap();
    if (!cache)
        return;
    if (cache.has(id))
        return;
    if (cache.size >= NODE_CACHE_MAX_SIZE) {
        const firstKey = cache.keys().next().value;
        if (firstKey !== undefined)
            cache.delete(firstKey);
    }
    cache.set(id, node);
}
export function getNodeFromCacheList(id) {
    return getNodeCacheMap()?.get(id);
}
export function midsceneGenerateHash(node, content, rect) {
    const slicedHash = generateHashId(rect, content);
    if (node) {
        if (typeof window !== 'undefined' && !getNodeCacheMap()) {
            setNodeHashCacheListOnWindow();
        }
        setNodeToCacheList(node, slicedHash);
    }
    return slicedHash;
}
export function generateId(numberId) {
    //   const letters = 'ABCDEFGHIJKLMNPRSTUVXYZ';
    //   const numbers = '0123456789';
    //   const randomLetter = letters.charAt(Math.floor(Math.random() * letters.length)).toUpperCase();
    // const randomNumber = numbers.charAt(Math.floor(Math.random() * numbers.length));
    // return randomLetter + numberId;
    return `${numberId}`;
}
export function setGenerateHashOnWindow() {
    if (typeof window !== 'undefined') {
        window.midsceneGenerateHash = midsceneGenerateHash;
    }
}
export function setMidsceneVisibleRectOnWindow() {
    if (typeof window !== 'undefined') {
        window.midsceneVisibleRect = elementRect;
    }
}
export function setExtractTextWithPositionOnWindow() {
    if (typeof window !== 'undefined') {
        window.extractTextWithPosition = extractTextWithPosition;
    }
}
export function getTopDocument() {
    const container = document.body || document;
    return container;
}
