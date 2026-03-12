import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { GithubOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import { Typography } from 'antd';
import { EnvConfig } from '../env-config';
import './style.less';
export function NavActions({ showEnvConfig = true, showTooltipWhenEmpty = false, showModelName = false, githubUrl = 'https://github.com/web-infra-dev/midscene', helpUrl = 'https://midscenejs.com/quick-experience.html', className = '', }) {
    return (_jsxs("div", { className: `nav-actions ${className}`, children: [_jsx(Typography.Link, { href: githubUrl, target: "_blank", children: _jsx(GithubOutlined, { className: "nav-icon" }) }), _jsx(Typography.Link, { href: helpUrl, target: "_blank", children: _jsx(QuestionCircleOutlined, { className: "nav-icon" }) }), showEnvConfig && (_jsx(EnvConfig, { showTooltipWhenEmpty: showTooltipWhenEmpty, showModelName: showModelName }))] }));
}
