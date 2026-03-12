import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { ArrowRightOutlined, CheckOutlined, ClockCircleOutlined, CloseOutlined, LogoutOutlined, MinusOutlined, WarningOutlined, } from '@ant-design/icons';
import { Alert } from 'antd';
import ShinyText from '../shiny-text';
export function timeCostStrElement(timeCost) {
    let str;
    if (typeof timeCost !== 'number') {
        str = '-';
    }
    else {
        str = `${(timeCost / 1000).toFixed(2)}s`;
    }
    return (_jsx("span", { style: {
            fontVariantNumeric: 'tabular-nums',
            fontFeatureSettings: 'tnum',
        }, children: str }));
}
export const iconForStatus = (status) => {
    switch (status) {
        case 'finished':
        case 'passed':
        case 'success':
        case 'connected':
            return (_jsx("span", { style: { color: '#00AD4B' }, children: _jsx(CheckOutlined, {}) }));
        case 'finishedWithWarning':
            return (_jsx("span", { style: { color: '#f7bb05' }, children: _jsx(WarningOutlined, {}) }));
        case 'failed':
        case 'closed':
        case 'timedOut':
        case 'interrupted':
            return (_jsx("span", { style: { color: '#FF0A0A' }, children: _jsx(CloseOutlined, {}) }));
        case 'pending':
            return _jsx(ClockCircleOutlined, {});
        case 'cancelled':
        case 'skipped':
            return _jsx(LogoutOutlined, {});
        case 'running':
            return _jsx(ArrowRightOutlined, {});
        default:
            return _jsx(MinusOutlined, {});
    }
};
// server not ready error message
export const errorMessageServerNotReady = (_jsxs("span", { children: ["Don't worry, just one more step to launch the playground server.", _jsx("br", {}), "Please run one of the commands under the midscene project directory:", _jsx("br", {}), "a. ", _jsx("strong", { children: "npx midscene-playground" }), _jsx("br", {}), "b. ", _jsx("strong", { children: "npx --yes @/web" })] }));
// server launch tip
export const serverLaunchTip = (notReadyMessage = errorMessageServerNotReady) => (_jsx("div", { className: "server-tip", children: _jsx(Alert, { message: "Playground Server Not Ready", description: notReadyMessage, type: "warning" }) }));
// empty result tip
export const emptyResultTip = (_jsx("div", { className: "result-empty-tip", style: { textAlign: 'center' }, children: _jsx(ShinyText, { disabled: true, text: "The result will be shown here" }) }));
