import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { InfoCircleOutlined, ReloadOutlined } from '@ant-design/icons';
import { Button, Spin, Tooltip } from 'antd';
import { useCallback, useEffect, useRef, useState } from 'react';
import './index.less';
export default function ScreenshotViewer({ getScreenshot, getInterfaceInfo, serverOnline, isUserOperating = false, mjpegUrl, }) {
    const [screenshot, setScreenshot] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [lastUpdateTime, setLastUpdateTime] = useState(0);
    const [interfaceInfo, setInterfaceInfo] = useState(null);
    const isMjpeg = Boolean(mjpegUrl && serverOnline);
    // Refs for managing polling
    const pollingIntervalRef = useRef(null);
    const isPollingPausedRef = useRef(false);
    // Core function to fetch screenshot
    const fetchScreenshot = useCallback(async (isManual = false) => {
        if (!serverOnline)
            return;
        setLoading(true);
        if (isManual)
            setError(null); // Clear errors on manual refresh
        try {
            const result = await getScreenshot();
            console.log('Screenshot API response:', result); // Debug log
            if (result?.screenshot) {
                // Ensure screenshot is a valid string
                const screenshotData = result.screenshot.toString().trim();
                if (screenshotData) {
                    // Screenshot data is already in full data URL format from createImgBase64ByFormat
                    setScreenshot(screenshotData);
                    setError(null); // Clear any previous errors
                    setLastUpdateTime(Date.now());
                }
                else {
                    setError('Empty screenshot data received');
                }
            }
            else {
                setError('No screenshot data in response');
            }
        }
        catch (err) {
            console.error('Screenshot fetch error:', err); // Debug log
            setError(err instanceof Error ? err.message : 'Failed to fetch screenshot');
        }
        finally {
            setLoading(false);
        }
    }, [getScreenshot, serverOnline]);
    // Function to fetch interface info
    const fetchInterfaceInfo = useCallback(async () => {
        if (!serverOnline || !getInterfaceInfo)
            return;
        try {
            const info = await getInterfaceInfo();
            if (info) {
                setInterfaceInfo(info);
            }
        }
        catch (err) {
            console.error('Interface info fetch error:', err);
        }
    }, [getInterfaceInfo, serverOnline]);
    // Start polling
    const startPolling = useCallback(() => {
        if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
        }
        console.log('Starting screenshot polling (5s interval)');
        pollingIntervalRef.current = setInterval(() => {
            if (!isPollingPausedRef.current && serverOnline) {
                fetchScreenshot(false);
            }
        }, 5000); // 5 second polling
    }, [fetchScreenshot, serverOnline]);
    // Stop polling
    const stopPolling = useCallback(() => {
        if (pollingIntervalRef.current) {
            console.log('Stopping screenshot polling');
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
        }
    }, []);
    // Pause polling (don't clear interval, just mark as paused)
    const pausePolling = useCallback(() => {
        console.log('Pausing screenshot polling');
        isPollingPausedRef.current = true;
    }, []);
    // Resume polling
    const resumePolling = useCallback(() => {
        console.log('Resuming screenshot polling');
        isPollingPausedRef.current = false;
    }, []);
    const handleManualRefresh = useCallback(() => {
        fetchScreenshot(true);
    }, [fetchScreenshot]);
    // Manage server connection status changes
    useEffect(() => {
        if (!serverOnline) {
            setScreenshot(null);
            setError(null);
            setInterfaceInfo(null);
            stopPolling();
            return;
        }
        // Fetch interface info regardless of mode
        fetchInterfaceInfo();
        // In MJPEG mode, skip polling entirely
        if (isMjpeg) {
            stopPolling();
            return;
        }
        // When server comes online, fetch screenshot and interface info immediately, then start polling
        fetchScreenshot(false);
        startPolling();
        return () => {
            stopPolling();
        };
    }, [
        serverOnline,
        isMjpeg,
        startPolling,
        stopPolling,
        fetchScreenshot,
        fetchInterfaceInfo,
    ]);
    // Manage user operation status changes
    useEffect(() => {
        if (!serverOnline)
            return;
        if (isUserOperating) {
            // When user starts operating, pause polling
            pausePolling();
        }
        else {
            // When user operation ends, update screenshot immediately and resume polling
            resumePolling();
            fetchScreenshot(false);
        }
    }, [
        isUserOperating,
        pausePolling,
        resumePolling,
        fetchScreenshot,
        serverOnline,
    ]);
    // Cleanup function
    useEffect(() => {
        return () => {
            stopPolling();
        };
    }, [stopPolling]);
    if (!serverOnline) {
        return (_jsx("div", { className: "screenshot-viewer offline", children: _jsxs("div", { className: "screenshot-placeholder", children: [_jsx("h3", { children: "\uD83D\uDCF1 Screen Preview" }), _jsx("p", { children: "Start the playground server to see real-time screenshots" })] }) }));
    }
    if (!isMjpeg && loading && !screenshot) {
        return (_jsxs("div", { className: "screenshot-viewer loading", children: [_jsx(Spin, { size: "large" }), _jsx("p", { children: "Loading screenshot..." })] }));
    }
    if (!isMjpeg && error && !screenshot) {
        return (_jsx("div", { className: "screenshot-viewer error", children: _jsxs("div", { className: "screenshot-placeholder", children: [_jsx("h3", { children: "\uD83D\uDCF1 Screen Preview" }), _jsx("p", { className: "error-message", children: error })] }) }));
    }
    const formatLastUpdateTime = (timestamp) => {
        if (!timestamp)
            return '';
        const now = Date.now();
        const diff = Math.floor((now - timestamp) / 1000);
        if (diff < 60)
            return `${diff}s ago`;
        if (diff < 3600)
            return `${Math.floor(diff / 60)}m ago`;
        return new Date(timestamp).toLocaleTimeString();
    };
    return (_jsxs("div", { className: "screenshot-viewer", children: [_jsx("div", { className: "screenshot-header", children: _jsx("div", { className: "screenshot-title", children: _jsx("h3", { children: interfaceInfo?.type ? interfaceInfo.type : 'Device Name' }) }) }), _jsxs("div", { className: "screenshot-container", children: [_jsxs("div", { className: "screenshot-overlay", children: [_jsxs("div", { className: "device-name-overlay", children: ["Device Name", _jsx(Tooltip, { title: interfaceInfo?.description, children: _jsx(InfoCircleOutlined, { size: 16, className: "info-icon" }) })] }), !isMjpeg && (_jsxs("div", { className: "screenshot-controls", children: [lastUpdateTime > 0 && (_jsxs("span", { className: "last-update-time", children: ["Last updated ", formatLastUpdateTime(lastUpdateTime)] })), _jsx(Tooltip, { title: "Refresh screenshot", children: _jsx(Button, { icon: _jsx(ReloadOutlined, {}), onClick: handleManualRefresh, loading: loading, size: "small" }) }), isUserOperating && (_jsxs("span", { className: "operation-indicator", children: [_jsx(Spin, { size: "small" }), " Operating..."] }))] }))] }), _jsx("div", { className: "screenshot-content", children: isMjpeg ? (_jsx("img", { src: mjpegUrl, alt: "Device Live Stream", className: "screenshot-image" })) : screenshot ? (_jsx("img", { src: screenshot.startsWith('data:image/')
                                ? screenshot
                                : `data:image/png;base64,${screenshot}`, alt: "Device Screenshot", className: "screenshot-image", onLoad: () => console.log('Screenshot image loaded successfully'), onError: (e) => {
                                console.error('Screenshot image load error:', e);
                                console.error('Screenshot data preview:', screenshot.substring(0, 100));
                                setError('Failed to load screenshot image');
                            } })) : (_jsx("div", { className: "screenshot-placeholder", children: _jsx("p", { children: "No screenshot available" }) })) })] })] }));
}
