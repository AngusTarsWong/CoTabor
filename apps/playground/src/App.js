import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { PlaygroundSDK } from '@/playground-lib';
import { Logo, NavActions, ScreenshotViewer, UniversalPlayground, globalThemeConfig, } from '@/visualizer';
import { ConfigProvider, Layout } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import serverOfflineBackground from './icons/server-offline-background.svg';
import serverOfflineForeground from './icons/server-offline-foreground.svg';
import './App.less';
const { Content } = Layout;
export default function App() {
    const [serverOnline, setServerOnline] = useState(false);
    const [isUserOperating, setIsUserOperating] = useState(false);
    const [isNarrowScreen, setIsNarrowScreen] = useState(false);
    const [deviceType, setDeviceType] = useState('web');
    // Create PlaygroundSDK and storage provider
    const playgroundSDK = useMemo(() => {
        // Support environment variable for serverUrl, fallback to default
        const serverUrl = __SERVER_URL__;
        const sdk = new PlaygroundSDK({
            type: 'remote-execution',
            serverUrl,
        });
        console.log('🌐 Connecting to playground server:', serverUrl);
        // Set progress callback to monitor user operation status
        sdk.onProgressUpdate((tip) => {
            // When there's a progress tip, it means user is operating
            setIsUserOperating(!!tip);
        });
        return sdk;
    }, []);
    // Check server status on mount
    useEffect(() => {
        const checkServer = async () => {
            try {
                const online = await playgroundSDK.checkStatus();
                setServerOnline(online);
                // Get device type from server if online
                if (online) {
                    try {
                        const interfaceInfo = await playgroundSDK.getInterfaceInfo();
                        if (interfaceInfo?.type) {
                            const type = interfaceInfo.type.toLowerCase();
                            if (type === 'android' ||
                                type === 'ios' ||
                                type === 'web' ||
                                type === 'harmony') {
                                setDeviceType(type);
                            }
                        }
                    }
                    catch (error) {
                        console.warn('Failed to get interface info:', error);
                    }
                }
            }
            catch (error) {
                console.error('Failed to check server status:', error);
                setServerOnline(false);
            }
        };
        checkServer();
        // Check server status periodically
        const interval = setInterval(checkServer, 5000);
        return () => clearInterval(interval);
    }, [playgroundSDK]);
    // Handle window resize to detect narrow screens
    useEffect(() => {
        const handleResize = () => {
            setIsNarrowScreen(window.innerWidth <= 1024);
        };
        // Set initial value
        handleResize();
        // Add event listener
        window.addEventListener('resize', handleResize);
        // Cleanup
        return () => window.removeEventListener('resize', handleResize);
    }, []);
    if (!serverOnline) {
        return (_jsx(ConfigProvider, { theme: globalThemeConfig(), children: _jsx("div", { className: "server-offline-container", children: _jsxs("div", { className: "server-offline-message", children: [_jsx(Logo, {}), _jsxs("div", { className: "server-offline-content", children: [_jsxs("div", { className: "server-offline-icon", children: [_jsx("img", { src: serverOfflineBackground, className: "icon-background", alt: "" }), _jsx("img", { src: serverOfflineForeground, className: "icon-foreground", alt: "" })] }), _jsx("h1", { children: "Midscene Playground" }), _jsx("p", { className: "connection-status", children: "Server offline..." })] })] }) }) }));
    }
    return (_jsx(ConfigProvider, { theme: globalThemeConfig(), children: _jsx(Layout, { className: "app-container playground-container", children: _jsx(Content, { className: "app-content", children: _jsxs(PanelGroup, { autoSaveId: "playground-layout", direction: isNarrowScreen ? 'vertical' : 'horizontal', children: [_jsx(Panel, { defaultSize: isNarrowScreen ? 67 : 32, maxSize: isNarrowScreen ? 85 : 60, minSize: isNarrowScreen ? 67 : 25, className: "app-panel left-panel", children: _jsxs("div", { className: "panel-content left-panel-content", children: [_jsx("div", { className: "playground-panel-header", children: _jsxs("div", { className: "header-row", children: [_jsx(Logo, {}), _jsx(NavActions, { showTooltipWhenEmpty: false, showModelName: false })] }) }), _jsx("div", { className: "playground-panel-playground", children: _jsx(UniversalPlayground, { playgroundSDK: playgroundSDK, config: {
                                                showContextPreview: false,
                                                layout: 'vertical',
                                                showVersionInfo: true,
                                                enableScrollToBottom: true,
                                                serverMode: true,
                                                showEnvConfigReminder: true,
                                                deviceType: deviceType,
                                            }, branding: {
                                                title: 'Playground',
                                                version: __APP_VERSION__,
                                            }, className: "playground-container" }) })] }) }), _jsx(PanelResizeHandle, { className: `panel-resize-handle ${isNarrowScreen ? 'vertical' : 'horizontal'}` }), _jsx(Panel, { className: "app-panel right-panel", children: _jsx("div", { className: "panel-content right-panel-content", children: _jsx(ScreenshotViewer, { getScreenshot: () => playgroundSDK.getScreenshot(), getInterfaceInfo: () => playgroundSDK.getInterfaceInfo(), serverOnline: serverOnline, isUserOperating: isUserOperating, mjpegUrl: deviceType === 'ios' || deviceType === 'harmony'
                                        ? `${__SERVER_URL__}/mjpeg`
                                        : undefined }) }) })] }) }) }) }));
}
