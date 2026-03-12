import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { LoadingOutlined } from '@ant-design/icons';
import { noReplayAPIs } from '@/playground-lib';
import { Spin } from 'antd';
import { emptyResultTip, serverLaunchTip } from '../misc';
import { Player } from '../player';
import ShinyText from '../shiny-text';
import './index.less';
export const PlaygroundResultView = ({ result, loading, serverValid, serviceMode, replayScriptsInfo, replayCounter, loadingProgressText, verticalMode = false, notReadyMessage, fitMode, autoZoom, actionType, canDownloadReport, }) => {
    let resultWrapperClassName = 'result-wrapper';
    if (verticalMode) {
        resultWrapperClassName += ' vertical-mode-result';
    }
    if (replayScriptsInfo && verticalMode) {
        resultWrapperClassName += ' result-wrapper-compact';
    }
    let resultDataToShow = emptyResultTip;
    // Determine if this is a data extraction API that should prioritize result output
    const shouldPrioritizeResult = actionType && noReplayAPIs.includes(actionType);
    if (!serverValid && serviceMode === 'Server') {
        resultDataToShow = serverLaunchTip(notReadyMessage);
    }
    else if (loading) {
        resultDataToShow = (_jsxs("div", { className: "loading-container", children: [_jsx(Spin, { spinning: loading, indicator: _jsx(LoadingOutlined, { spin: true }) }), _jsx("div", { className: "loading-progress-text loading-progress-text-progress", children: _jsx(ShinyText, { text: loadingProgressText, speed: 3 }) })] }));
    }
    else if (result?.error) {
        // Show errors first
        const errorNode = (_jsx("pre", { style: { color: '#ff4d4f', whiteSpace: 'pre-wrap' }, children: result?.error }));
        if (result.reportHTML || replayScriptsInfo) {
            resultDataToShow = (_jsxs("div", { style: {
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '16px',
                    height: '100%',
                }, children: [_jsxs("div", { style: { flex: '0 0 auto', maxHeight: '40%', overflow: 'auto' }, children: [_jsx("div", { style: { fontWeight: 'bold', marginBottom: '8px' }, children: "Error:" }), errorNode] }), _jsxs("div", { style: { flex: '1 1 auto', minHeight: 0 }, children: [_jsx("div", { style: { fontWeight: 'bold', marginBottom: '8px' }, children: "Report:" }), _jsx(Player, { replayScripts: replayScriptsInfo?.scripts, imageWidth: replayScriptsInfo?.width, imageHeight: replayScriptsInfo?.height, reportFileContent: result.reportHTML || null, fitMode: fitMode, autoZoom: autoZoom, canDownloadReport: canDownloadReport ?? serviceMode !== 'In-Browser' }, replayCounter)] })] }));
        }
        else {
            resultDataToShow = errorNode;
        }
    }
    else if (shouldPrioritizeResult &&
        result?.result !== undefined &&
        replayScriptsInfo) {
        // For data extraction APIs: show both result output and replay/report
        const resultOutput = typeof result?.result === 'string' ? (_jsx("pre", { children: result?.result })) : (_jsx("pre", { children: JSON.stringify(result?.result, null, 2) }));
        const reportContent = result?.reportHTML || null;
        resultDataToShow = (_jsxs("div", { style: {
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
                height: '100%',
            }, children: [_jsxs("div", { style: { flex: '0 0 auto' }, children: [_jsx("div", { style: { fontWeight: 'bold', marginBottom: '8px' }, children: "Output:" }), resultOutput] }), _jsxs("div", { style: { flex: '1 1 auto', minHeight: 0 }, children: [_jsx("div", { style: { fontWeight: 'bold', marginBottom: '8px' }, children: "Report:" }), _jsx(Player, { replayScripts: replayScriptsInfo.scripts, imageWidth: replayScriptsInfo.width, imageHeight: replayScriptsInfo.height, reportFileContent: reportContent, fitMode: fitMode, autoZoom: autoZoom, canDownloadReport: canDownloadReport ?? serviceMode !== 'In-Browser' }, replayCounter)] })] }));
    }
    else if (replayScriptsInfo) {
        // Has replay scripts (non-noReplayAPI) - show Player with replay and report
        const reportContent = result?.reportHTML || null;
        resultDataToShow = (_jsx(Player, { replayScripts: replayScriptsInfo.scripts, imageWidth: replayScriptsInfo.width, imageHeight: replayScriptsInfo.height, reportFileContent: reportContent, fitMode: fitMode, autoZoom: autoZoom, canDownloadReport: canDownloadReport ?? serviceMode !== 'In-Browser' }, replayCounter));
    }
    else if (shouldPrioritizeResult &&
        result?.result !== undefined &&
        result?.reportHTML) {
        // For data extraction APIs: show both result output and reportHTML
        const resultOutput = typeof result?.result === 'string' ? (_jsx("pre", { children: result?.result })) : (_jsx("pre", { children: JSON.stringify(result?.result, null, 2) }));
        resultDataToShow = (_jsxs("div", { style: {
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
                height: '100%',
            }, children: [_jsxs("div", { style: { flex: '0 0 auto' }, children: [_jsx("div", { style: { fontWeight: 'bold', marginBottom: '8px' }, children: "Output:" }), resultOutput] }), _jsxs("div", { style: { flex: '1 1 auto', minHeight: 0 }, children: [_jsx("div", { style: { fontWeight: 'bold', marginBottom: '8px' }, children: "Report:" }), _jsx(Player, { reportFileContent: result.reportHTML, fitMode: fitMode, autoZoom: autoZoom, canDownloadReport: canDownloadReport ?? serviceMode !== 'In-Browser' }, replayCounter)] })] }));
    }
    else if (shouldPrioritizeResult && result?.result !== undefined) {
        // For data extraction APIs without reportHTML: show result output only
        resultDataToShow =
            typeof result?.result === 'string' ? (_jsx("pre", { children: result?.result })) : (_jsx("pre", { children: JSON.stringify(result?.result, null, 2) }));
    }
    else if (result?.reportHTML) {
        // No replay scripts but has report - show Player with report only
        resultDataToShow = (_jsx(Player, { reportFileContent: result.reportHTML, fitMode: fitMode, autoZoom: autoZoom, canDownloadReport: canDownloadReport ?? serviceMode !== 'In-Browser' }, replayCounter));
    }
    else if (result?.result !== undefined) {
        // Fallback: show result output
        resultDataToShow =
            typeof result?.result === 'string' ? (_jsx("pre", { children: result?.result })) : (_jsx("pre", { children: JSON.stringify(result?.result, null, 2) }));
    }
    return (_jsx("div", { className: resultWrapperClassName, style: {
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            flex: '1 1 auto',
            justifyContent: 'center',
        }, children: resultDataToShow }));
};
