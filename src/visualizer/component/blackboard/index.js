'use client';
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo } from 'react';
import './index.less';
export const Blackboard = (props) => {
    const highlightElements = props.highlightElements || [];
    const highlightRect = props.highlightRect;
    if (!props.uiContext?.shotSize) {
        return (_jsx("div", { className: "blackboard", children: _jsx("div", { className: "blackboard-main-content", style: { padding: '20px' }, children: "No UI context available" }) }));
    }
    const context = props.uiContext;
    const { shotSize, screenshot } = context;
    const screenWidth = shotSize.width;
    const screenHeight = shotSize.height;
    const screenshotBase64 = useMemo(() => {
        if (!screenshot)
            return '';
        if (typeof screenshot === 'object' && 'base64' in screenshot) {
            return screenshot.base64;
        }
        if (typeof screenshot === 'string')
            return screenshot;
        return '';
    }, [screenshot]);
    const highlightElementRects = highlightElements.map((e) => e.rect);
    let bottomTipA = null;
    if (highlightElementRects.length === 1) {
        bottomTipA = (_jsx("div", { className: "bottom-tip", children: _jsxs("div", { className: "bottom-tip-item", children: ["Element: ", JSON.stringify(highlightElementRects[0])] }) }));
    }
    else if (highlightElementRects.length > 1) {
        bottomTipA = (_jsx("div", { className: "bottom-tip", children: _jsxs("div", { className: "bottom-tip-item", children: ["Element: ", JSON.stringify(highlightElementRects)] }) }));
    }
    return (_jsxs("div", { className: "blackboard", children: [_jsxs("div", { className: "blackboard-main-content", style: {
                    width: '100%',
                    position: 'relative',
                }, children: [screenshotBase64 && (_jsx("img", { src: screenshotBase64, alt: "screenshot", className: "blackboard-screenshot", draggable: false })), _jsxs("div", { className: "blackboard-overlay", style: {
                            aspectRatio: `${screenWidth}/${screenHeight}`,
                            '--ui-scale': Math.max(1, Math.sqrt(screenWidth / 1920)),
                        }, children: [highlightRect && (_jsx("div", { className: "blackboard-rect blackboard-rect-search", style: {
                                    left: `${(highlightRect.left / screenWidth) * 100}%`,
                                    top: `${(highlightRect.top / screenHeight) * 100}%`,
                                    width: `${(highlightRect.width / screenWidth) * 100}%`,
                                    height: `${(highlightRect.height / screenHeight) * 100}%`,
                                }, children: _jsx("span", { className: "blackboard-rect-label", children: "Search Area" }) })), highlightElements.map((el, idx) => (_jsx("div", { className: "blackboard-rect blackboard-rect-highlight", style: {
                                    left: `${(el.rect.left / screenWidth) * 100}%`,
                                    top: `${(el.rect.top / screenHeight) * 100}%`,
                                    width: `${(el.rect.width / screenWidth) * 100}%`,
                                    height: `${(el.rect.height / screenHeight) * 100}%`,
                                }, children: el.content && (_jsx("span", { className: "blackboard-rect-label", children: el.content })) }, el.id || idx)))] })] }), _jsx("div", { className: "bottom-tip", style: { display: props.hideController ? 'none' : 'block' }, children: bottomTipA })] }));
};
export default Blackboard;
