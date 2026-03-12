import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import Icon, { ClearOutlined, LoadingOutlined, ArrowDownOutlined, } from '@ant-design/icons';
import { Alert, Button, Form, List, Typography, message } from 'antd';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePlaygroundExecution } from '../../hooks/usePlaygroundExecution';
import { usePlaygroundState } from '../../hooks/usePlaygroundState';
import { useEnvConfig } from '../../store/store';
import { ContextPreview } from '../context-preview';
import { EnvConfigReminder } from '../env-config-reminder';
import { PlaygroundResultView } from '../playground-result';
import './index.less';
import PlaygroundIcon from '../../icons/avatar.svg';
import { defaultMainButtons } from '../../utils/constants';
import { PromptInput } from '../prompt-input';
import ShinyText from '../shiny-text';
import { createStorageProvider, detectBestStorageType, } from './providers/storage-provider';
const { Text } = Typography;
// Function to get stable ID for SDK (adapter-driven)
function getSDKId(sdk) {
    // Handle null/undefined SDK
    if (!sdk) {
        return 'playground-default';
    }
    // Primary: Use adapter ID if available (works for both remote and local)
    if (sdk.id && typeof sdk.id === 'string') {
        return `agent-${sdk.id}`;
    }
    // Fallback: Use default when ID is not available
    return 'playground-default';
}
function ErrorMessage({ error }) {
    if (!error)
        return null;
    // Ensure only one "Error: " prefix and style it red
    const cleanError = error.replace(/^(Error:\s*)+/, 'Error: ');
    return (_jsx(Alert, { message: _jsx("span", { style: { color: '#ff4d4f' }, children: cleanError }), type: "error", showIcon: true }));
}
export function UniversalPlayground({ playgroundSDK, storage, contextProvider, config: componentConfig = {}, branding = {}, className = '', dryMode = false, showContextPreview = true, }) {
    const [form] = Form.useForm();
    const { config } = useEnvConfig();
    const [sdkReady, setSdkReady] = useState(false);
    // Initialize form with default type on mount
    useEffect(() => {
        form.setFieldsValue({
            type: defaultMainButtons[0],
        });
    }, [form]);
    // Initialize SDK ID on mount for remote execution
    useEffect(() => {
        const initializeSDK = async () => {
            if (playgroundSDK && typeof playgroundSDK.checkStatus === 'function') {
                try {
                    await playgroundSDK.checkStatus();
                    setSdkReady(true);
                }
                catch (error) {
                    console.warn('Failed to initialize SDK, using default namespace:', error);
                    setSdkReady(true); // Still proceed with default
                }
            }
            else {
                setSdkReady(true); // For local execution, no need to wait
            }
        };
        initializeSDK();
    }, [playgroundSDK]);
    // Use custom hooks for state management
    // Determine the storage provider based on configuration
    const effectiveStorage = useMemo(() => {
        // If external storage is provided, use it
        if (storage) {
            return storage;
        }
        // Wait for SDK to be ready before creating storage
        if (!sdkReady) {
            return null;
        }
        // Otherwise, create the best available storage provider with unique namespace
        // Priority: explicit storageNamespace > auto-generated SDK ID
        const namespace = componentConfig.storageNamespace || getSDKId(playgroundSDK);
        // Detect and use the best available storage type
        const bestStorageType = detectBestStorageType();
        console.log(`Using ${bestStorageType} storage for namespace: ${namespace}`);
        return createStorageProvider(bestStorageType, namespace);
    }, [storage, sdkReady, componentConfig.storageNamespace, playgroundSDK]);
    const { loading, setLoading, infoList, setInfoList, actionSpace, actionSpaceLoading, uiContextPreview, setUiContextPreview, showScrollToBottomButton, verticalMode, replayCounter, setReplayCounter, infoListRef, currentRunningIdRef, interruptedFlagRef, clearInfoList, handleScrollToBottom, } = usePlaygroundState(playgroundSDK, effectiveStorage, contextProvider, branding.targetName);
    // Use execution hook
    const { handleRun: executeAction, handleStop, canStop, } = usePlaygroundExecution({
        playgroundSDK,
        storage: effectiveStorage,
        actionSpace,
        loading,
        setLoading,
        setInfoList,
        replayCounter,
        setReplayCounter,
        verticalMode,
        currentRunningIdRef,
        interruptedFlagRef,
        deviceType: componentConfig.deviceType,
    });
    // Override SDK config when environment config changes
    useEffect(() => {
        // Only pass global config, not execution options like deepLocate, screenshotIncluded, domIncluded
        // These execution options will be passed through ExecutionOptions during execution
        if (playgroundSDK?.overrideConfig && config) {
            playgroundSDK.overrideConfig(config).catch((error) => {
                console.error('Failed to override SDK config:', error);
                const errorMsg = error instanceof Error ? error.message : String(error);
                message.error(`Failed to apply AI configuration: ${errorMsg}`);
            });
        }
    }, [playgroundSDK, config]);
    // Handle form submission with error handling
    const handleFormRun = useCallback(async () => {
        try {
            const value = form.getFieldsValue();
            await executeAction(value);
        }
        catch (error) {
            message.error(error?.message || 'Execution failed');
        }
    }, [form, executeAction]);
    // Check if run button should be enabled
    const configAlreadySet = Object.keys(config || {}).length >= 1;
    const runButtonEnabled = componentConfig.serverMode ||
        (!dryMode && !actionSpaceLoading && configAlreadySet);
    // Get the currently selected type
    const selectedType = Form.useWatch('type', form);
    // Determine service mode based on SDK adapter type
    const serviceMode = useMemo(() => {
        if (!playgroundSDK || typeof playgroundSDK.getServiceMode !== 'function') {
            return 'Server'; // Default fallback
        }
        return playgroundSDK.getServiceMode();
    }, [playgroundSDK]);
    // Apply configuration
    const finalShowContextPreview = showContextPreview && componentConfig.showContextPreview !== false;
    const layout = componentConfig.layout || 'vertical';
    const showVersionInfo = componentConfig.showVersionInfo !== false;
    const deviceType = componentConfig.deviceType;
    return (_jsx("div", { className: `playground-container ${layout}-mode ${className}`.trim(), children: _jsxs(Form, { form: form, onFinish: handleFormRun, className: "command-form", children: [finalShowContextPreview && (_jsx("div", { className: "context-preview-section", children: _jsx(ContextPreview, { uiContextPreview: uiContextPreview, setUiContextPreview: setUiContextPreview, showContextPreview: finalShowContextPreview }) })), _jsxs("div", { className: "middle-dialog-area", children: [infoList.length > 1 && (_jsx("div", { className: "clear-button-container", children: _jsx(Button, { size: "small", icon: _jsx(ClearOutlined, {}), onClick: clearInfoList, type: "text", className: "clear-button" }) })), _jsx("div", { ref: infoListRef, className: "info-list-container", children: _jsx(List, { itemLayout: "vertical", dataSource: infoList, renderItem: (item) => (_jsx(List.Item, { className: "list-item", children: item.type === 'user' ? (_jsx("div", { className: "user-message-container", children: _jsx("div", { className: "user-message-bubble", children: item.content }) })) : item.type === 'progress' ? (
                                    /* Progress Message */
                                    _jsx("div", { children: (() => {
                                            const parts = item.content.split(' - ');
                                            const action = parts[0]?.trim();
                                            const description = parts.slice(1).join(' - ').trim();
                                            const currentIndex = infoList.findIndex((listItem) => listItem.id === item.id);
                                            const laterProgressExists = infoList
                                                .slice(currentIndex + 1)
                                                .some((listItem) => listItem.type === 'progress');
                                            const isLatestProgress = !laterProgressExists;
                                            const shouldShowLoading = loading && isLatestProgress;
                                            return (_jsxs(_Fragment, { children: [action && (_jsxs("span", { className: "progress-action-item", children: [action, _jsx("span", { className: `progress-status-icon ${shouldShowLoading
                                                                    ? 'loading'
                                                                    : item.result?.error
                                                                        ? 'error'
                                                                        : 'completed'}`, children: shouldShowLoading ? (_jsx(LoadingOutlined, { spin: true })) : item.result?.error ? ('✗') : ('✓') })] })), description && (_jsx("div", { children: _jsx(ShinyText, { text: description, className: "progress-description", disabled: !shouldShowLoading }) })), item.result?.error && (_jsx(ErrorMessage, { error: item.result.error }))] }));
                                        })() })) : item.type === 'separator' ? (
                                    /* Separator Message */
                                    _jsxs("div", { className: "new-conversation-separator", children: [_jsx("div", { className: "separator-line" }), _jsx("div", { className: "separator-text-container", children: _jsx(Text, { type: "secondary", className: "separator-text", children: item.content }) })] })) : (
                                    /* System Message */
                                    _jsxs("div", { className: "system-message-container", children: [_jsxs("div", { className: "system-message-header", children: [_jsx(Icon, { component: branding.icon || PlaygroundIcon, style: { fontSize: 20 } }), _jsx("span", { className: "system-message-title", children: branding.title || 'Playground' })] }), (item.content || item.result) && (_jsx("div", { className: "system-message-content", children: item.type === 'result' ? (_jsx(PlaygroundResultView, { result: item.result || null, loading: item.loading || false, serverValid: true, serviceMode: serviceMode, replayScriptsInfo: item.replayScriptsInfo || null, replayCounter: item.replayCounter || 0, loadingProgressText: item.loadingProgressText || '', verticalMode: item.verticalMode || false, fitMode: "width", actionType: item.actionType })) : (_jsxs(_Fragment, { children: [_jsx("div", { className: "system-message-text", children: item.content }), item.loading && item.loadingProgressText && (_jsx("div", { className: "loading-progress-text", children: _jsx("span", { children: item.loadingProgressText }) }))] })) }))] })) }, item.id)) }) }), showScrollToBottomButton &&
                            componentConfig.enableScrollToBottom !== false && (_jsx(Button, { className: "scroll-to-bottom-button", type: "primary", shape: "circle", icon: _jsx(ArrowDownOutlined, {}), onClick: handleScrollToBottom, size: "large" }))] }), _jsxs("div", { className: "bottom-input-section", children: [componentConfig.showEnvConfigReminder ? _jsx(EnvConfigReminder, {}) : null, _jsx(PromptInput, { runButtonEnabled: runButtonEnabled, form: form, serviceMode: serviceMode, selectedType: selectedType, dryMode: dryMode, stoppable: canStop, loading: loading, onRun: handleFormRun, onStop: handleStop, actionSpace: actionSpace, deviceType: deviceType })] }), showVersionInfo && branding.version && (_jsx("div", { className: "version-info-section", children: _jsxs("span", { className: "version-text", children: ["Midscene.js version: ", branding.version] }) }))] }) }));
}
export default UniversalPlayground;
