import { jsx as _jsx } from "react/jsx-runtime";
import { useTheme } from '../../hooks/useTheme';
import './index.less';
export const LogoUrl = 'https://lf3-static.bytednsdoc.com/obj/eden-cn/vhaeh7vhabf/Midscene.png';
const LogoUrlLight = 'https://lf3-static.bytednsdoc.com/obj/eden-cn/nupipfups/Midscene/midscene_with_text_light.png';
const LogoUrlDark = 'https://lf3-static.bytednsdoc.com/obj/eden-cn/nupipfups/Midscene/midscene_with_text_dark.png';
export const Logo = ({ hideLogo = false }) => {
    const { isDarkMode } = useTheme();
    if (hideLogo) {
        return null;
    }
    const logoSrc = isDarkMode ? LogoUrlDark : LogoUrlLight;
    return (_jsx("div", { className: "logo", children: _jsx("a", { href: "https://midscenejs.com/", target: "_blank", rel: "noreferrer", children: _jsx("img", { alt: "Midscene_logo", src: logoSrc }) }) }));
};
