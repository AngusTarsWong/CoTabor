import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { ExclamationCircleFilled } from '@ant-design/icons';
import { useEnvConfig } from '../../store/store';
import { EnvConfig } from '../env-config';
import './index.less';
export const EnvConfigReminder = ({ className = '', }) => {
    const { config } = useEnvConfig();
    const configAlreadySet = Object.keys(config || {}).length >= 1;
    if (configAlreadySet) {
        return null;
    }
    return (_jsxs("div", { className: `env-config-reminder ${className}`, children: [_jsx(ExclamationCircleFilled, { className: "reminder-icon" }), _jsx("span", { className: "reminder-text", children: "Please set up your environment variables before using." }), _jsx(EnvConfig, { mode: "text", showTooltipWhenEmpty: false })] }));
};
