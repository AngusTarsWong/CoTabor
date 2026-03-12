import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { PlaygroundSDK } from '@/playground-lib';
import { Button, Tooltip, message } from 'antd';
import { useEffect } from 'react';
import { safeOverrideAIConfig } from '../../hooks/useSafeOverrideAIConfig';
import { useServerValid } from '../../hooks/useServerValid';
import { useEnvConfig } from '../../store/store';
import { EnvConfig } from '../env-config';
import { iconForStatus } from '../misc';
// Centralized text constants
const TITLE_TEXT = {
    Server: 'Server Status',
    'In-Browser': 'In-Browser',
};
const SWITCH_BUTTON_TEXT = {
    Server: 'Switch to In-Browser Mode',
    'In-Browser': 'Switch to Server Mode',
};
export const ServiceModeControl = ({ serviceMode, }) => {
    const { setServiceMode, config } = useEnvConfig();
    const serverValid = useServerValid(serviceMode === 'Server');
    // Render server tip based on connection status
    const renderServerTip = () => {
        if (serverValid) {
            return (_jsx(Tooltip, { title: "Connected", children: _jsx("div", { className: "server-tip", children: iconForStatus('connected') }) }));
        }
        return (_jsx(Tooltip, { title: "Connection failed", children: _jsx("div", { className: "server-tip", children: iconForStatus('failed') }) }));
    };
    // Render switch button if not in extension mode
    const renderSwitchButton = () => {
        const nextMode = serviceMode === 'Server' ? 'In-Browser' : 'Server';
        const buttonText = SWITCH_BUTTON_TEXT[serviceMode];
        return (_jsx(Tooltip, { title: _jsxs("span", { children: ["Server Mode: send the request through the server ", _jsx("br", {}), "In-Browser Mode: send the request through the browser fetch API (The AI service should support CORS in this case)"] }), children: _jsx(Button, { type: "link", onClick: (e) => {
                    e.preventDefault();
                    setServiceMode(nextMode);
                }, children: buttonText }) }));
    };
    useEffect(() => {
        safeOverrideAIConfig(config, false, false); // Don't show error message in this component
        if (serviceMode === 'Server') {
            const playgroundSDK = new PlaygroundSDK({
                type: 'remote-execution',
            });
            playgroundSDK.overrideConfig(config).catch((error) => {
                const errorMsg = error instanceof Error ? error.message : String(error);
                message.error(`Failed to apply AI configuration: ${errorMsg}`);
            });
        }
    }, [config, serviceMode, serverValid]);
    // Determine content based on service mode
    const statusContent = serviceMode === 'Server' && renderServerTip();
    const title = TITLE_TEXT[serviceMode];
    return (_jsxs(_Fragment, { children: [_jsxs("div", { style: {
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '10px',
                }, children: [_jsx("h3", { style: {
                            whiteSpace: 'nowrap',
                            margin: 0,
                            flexShrink: 0,
                        }, children: title }), statusContent, _jsx(EnvConfig, { showTooltipWhenEmpty: serviceMode !== 'Server' })] }), _jsx("div", { className: "switch-btn-wrapper", children: renderSwitchButton() })] }));
};
