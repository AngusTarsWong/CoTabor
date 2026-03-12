import { jsx as _jsx } from "react/jsx-runtime";
import './index.less';
const ShinyText = ({ text, disabled = false, speed = 5, className = '', colorTheme = 'blue', }) => {
    const style = {
        '--animation-duration': `${speed}s`,
    };
    const themeClass = `theme-${colorTheme}`;
    return (_jsx("div", { className: `shiny-text ${themeClass} ${disabled ? 'disabled' : ''} ${className}`, style: style, children: text }));
};
export default ShinyText;
