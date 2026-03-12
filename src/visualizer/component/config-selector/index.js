import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Checkbox, Dropdown, Radio } from 'antd';
import SettingOutlined from '../../icons/setting.svg';
import { useEnvConfig } from '../../store/store';
import { alwaysRefreshScreenInfoTip, autoDismissKeyboardTip, deepLocateTip, deepThinkTip, domIncludedTip, imeStrategyTip, keyboardDismissStrategyTip, screenshotIncludedTip, trackingTip, } from '../../utils/constants';
export const ConfigSelector = ({ showDeepLocateOption = false, showDeepThinkOption = false, enableTracking = false, showDataExtractionOptions = false, hideDomAndScreenshotOptions = false, deviceType, }) => {
    const forceSameTabNavigation = useEnvConfig((state) => state.forceSameTabNavigation);
    const setForceSameTabNavigation = useEnvConfig((state) => state.setForceSameTabNavigation);
    const deepLocate = useEnvConfig((state) => state.deepLocate);
    const setDeepLocate = useEnvConfig((state) => state.setDeepLocate);
    const deepThink = useEnvConfig((state) => state.deepThink);
    const setDeepThink = useEnvConfig((state) => state.setDeepThink);
    const screenshotIncluded = useEnvConfig((state) => state.screenshotIncluded);
    const setScreenshotIncluded = useEnvConfig((state) => state.setScreenshotIncluded);
    const domIncluded = useEnvConfig((state) => state.domIncluded);
    const setDomIncluded = useEnvConfig((state) => state.setDomIncluded);
    // Device-specific configuration
    const imeStrategy = useEnvConfig((state) => state.imeStrategy);
    const setImeStrategy = useEnvConfig((state) => state.setImeStrategy);
    const autoDismissKeyboard = useEnvConfig((state) => state.autoDismissKeyboard);
    const setAutoDismissKeyboard = useEnvConfig((state) => state.setAutoDismissKeyboard);
    const keyboardDismissStrategy = useEnvConfig((state) => state.keyboardDismissStrategy);
    const setKeyboardDismissStrategy = useEnvConfig((state) => state.setKeyboardDismissStrategy);
    const alwaysRefreshScreenInfo = useEnvConfig((state) => state.alwaysRefreshScreenInfo);
    const setAlwaysRefreshScreenInfo = useEnvConfig((state) => state.setAlwaysRefreshScreenInfo);
    const hasDeviceOptions = deviceType === 'android' || deviceType === 'ios';
    if (!enableTracking &&
        !showDeepLocateOption &&
        !showDeepThinkOption &&
        !showDataExtractionOptions &&
        !hasDeviceOptions) {
        return null;
    }
    const configItems = buildConfigItems();
    return (_jsx("div", { className: "selector-trigger", children: _jsx(Dropdown, { menu: { items: configItems }, trigger: ['click'], children: _jsx(SettingOutlined, { width: 24, height: 24 }) }) }));
    function buildConfigItems() {
        const items = [];
        if (enableTracking) {
            items.push({
                label: (_jsx(Checkbox, { onChange: (e) => setForceSameTabNavigation(e.target.checked), checked: forceSameTabNavigation, children: trackingTip })),
                key: 'track-config',
            });
        }
        if (showDeepLocateOption) {
            items.push({
                label: (_jsx(Checkbox, { onChange: (e) => {
                        setDeepLocate(e.target.checked);
                    }, checked: deepLocate, children: deepLocateTip })),
                key: 'deep-locate-config',
            });
        }
        if (showDeepThinkOption) {
            items.push({
                label: (_jsx(Checkbox, { onChange: (e) => {
                        setDeepThink(e.target.checked);
                    }, checked: deepThink, children: deepThinkTip })),
                key: 'deep-think-config',
            });
        }
        if (showDataExtractionOptions && !hideDomAndScreenshotOptions) {
            items.push({
                label: (_jsx(Checkbox, { onChange: (e) => {
                        setScreenshotIncluded(e.target.checked);
                    }, checked: screenshotIncluded, children: screenshotIncludedTip })),
                key: 'screenshot-included-config',
            });
            items.push({
                label: (_jsxs("div", { style: { padding: '4px 0' }, children: [_jsx("div", { style: { marginBottom: '4px', fontSize: '14px' }, children: domIncludedTip }), _jsxs(Radio.Group, { size: "small", value: domIncluded, onChange: (e) => setDomIncluded(e.target.value), children: [_jsx(Radio, { value: false, children: "Off" }), _jsx(Radio, { value: true, children: "All" }), _jsx(Radio, { value: 'visible-only', children: "Visible only" })] })] })),
                key: 'dom-included-config',
            });
        }
        // Android-specific options
        if (deviceType === 'android') {
            items.push({
                label: (_jsxs("div", { style: { padding: '4px 0' }, children: [_jsx("div", { style: { marginBottom: '4px', fontSize: '14px' }, children: imeStrategyTip }), _jsxs(Radio.Group, { size: "small", value: imeStrategy, onChange: (e) => setImeStrategy(e.target.value), children: [_jsx(Radio, { value: "always-yadb", children: "Always YADB" }), _jsx(Radio, { value: "yadb-for-non-ascii", children: "YADB for non-ASCII" })] })] })),
                key: 'ime-strategy-config',
            });
            items.push({
                label: (_jsx(Checkbox, { onChange: (e) => setAutoDismissKeyboard(e.target.checked), checked: autoDismissKeyboard, children: autoDismissKeyboardTip })),
                key: 'auto-dismiss-keyboard-config',
            });
            items.push({
                label: (_jsxs("div", { style: { padding: '4px 0' }, children: [_jsx("div", { style: { marginBottom: '4px', fontSize: '14px' }, children: keyboardDismissStrategyTip }), _jsxs(Radio.Group, { size: "small", value: keyboardDismissStrategy, onChange: (e) => setKeyboardDismissStrategy(e.target.value), children: [_jsx(Radio, { value: "esc-first", children: "ESC first" }), _jsx(Radio, { value: "back-first", children: "Back first" })] })] })),
                key: 'keyboard-dismiss-strategy-config',
            });
            items.push({
                label: (_jsx(Checkbox, { onChange: (e) => setAlwaysRefreshScreenInfo(e.target.checked), checked: alwaysRefreshScreenInfo, children: alwaysRefreshScreenInfoTip })),
                key: 'always-refresh-screen-info-config',
            });
        }
        // iOS-specific options
        if (deviceType === 'ios') {
            items.push({
                label: (_jsx(Checkbox, { onChange: (e) => setAutoDismissKeyboard(e.target.checked), checked: autoDismissKeyboard, children: autoDismissKeyboardTip })),
                key: 'auto-dismiss-keyboard-config',
            });
        }
        return items;
    }
};
