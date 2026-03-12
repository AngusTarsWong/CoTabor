import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Button } from 'antd';
import Blackboard from '../blackboard';
import { iconForStatus } from '../misc';
import DemoData from '../playground/playground-demo-ui-context.json';
export const ContextPreview = ({ uiContextPreview, setUiContextPreview, showContextPreview, }) => {
    if (!showContextPreview) {
        return null;
    }
    return (_jsxs("div", { className: "form-part context-panel", children: [_jsx("h3", { children: "UI Context" }), uiContextPreview ? (_jsx(Blackboard, { uiContext: uiContextPreview, hideController: true })) : (_jsxs("div", { children: [iconForStatus('failed'), " No UI context", _jsx(Button, { type: "link", onClick: (e) => {
                            e.preventDefault();
                            setUiContextPreview(DemoData);
                        }, children: "Load Demo" }), _jsx("div", { children: "To load the UI context, you can either use the demo data above, or click the 'Send to Playground' in the report page." })] }))] }));
};
