import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { BorderOutlined, SendOutlined } from '@ant-design/icons';
import './index.less';
import { DownOutlined } from '@ant-design/icons';
import { Button, Dropdown, Form, Input, Radio, Tooltip } from 'antd';
import React, { useCallback, useEffect, useMemo, useRef, useState, } from 'react';
import { useHistoryStore } from '../../store/history';
import { extractDefaultValue, isLocateField, isZodObjectSchema, unwrapZodType, } from '../../types';
import { apiMetadata, defaultMainButtons } from '../../utils/constants';
import { actionNameForType, isRunButtonEnabled as calculateIsRunButtonEnabled, getPlaceholderForType, } from '../../utils/playground-utils';
import { ConfigSelector } from '../config-selector';
import { BooleanField, EnumField, LocateField, NumberField, TextField, } from '../form-field';
import { HistorySelector } from '../history-selector';
import './index.less';
const { TextArea } = Input;
export const PromptInput = ({ runButtonEnabled, form, serviceMode, selectedType, dryMode, stoppable, loading, onRun, onStop, clearPromptAfterRun = true, actionSpace, hideDomAndScreenshotOptions = false, deviceType, }) => {
    const [hoveringSettings, setHoveringSettings] = useState(false);
    const [promptValue, setPromptValue] = useState('');
    const placeholder = getPlaceholderForType(selectedType);
    const textAreaRef = useRef(null); // Ant Design TextArea ref with internal structure
    const modeRadioGroupRef = useRef(null); // Ref for the mode-radio-group container
    const params = Form.useWatch('params', form);
    const lastHistoryRef = useRef(null);
    // Get history from store
    const history = useHistoryStore((state) => state.history);
    const lastSelectedType = useHistoryStore((state) => state.lastSelectedType);
    const addHistory = useHistoryStore((state) => state.addHistory);
    const setLastSelectedType = useHistoryStore((state) => state.setLastSelectedType);
    const historyForSelectedType = useMemo(() => history[selectedType] || [], [history, selectedType]);
    // Check if current method needs structured parameters (dynamic based on actionSpace)
    const needsStructuredParams = useMemo(() => {
        if (actionSpace) {
            // Use actionSpace to determine if method needs structured params
            const action = actionSpace.find((a) => a.interfaceAlias === selectedType || a.name === selectedType);
            if (!action?.paramSchema)
                return false;
            // Check if paramSchema actually has fields
            if (isZodObjectSchema(action.paramSchema)) {
                const schema = action.paramSchema;
                const shape = schema.shape || {};
                const shapeKeys = Object.keys(shape);
                return shapeKeys.length > 0; // Only need structured params if there are actual fields
            }
            // If paramSchema exists but not in expected format, assume it needs params
            return true;
        }
        return false;
    }, [selectedType, actionSpace]);
    // Check if current method needs any input (either prompt or parameters)
    const needsAnyInput = useMemo(() => {
        if (actionSpace && actionSpace.length > 0) {
            // Use actionSpace to determine if method needs any input
            const action = actionSpace.find((a) => a.interfaceAlias === selectedType || a.name === selectedType);
            // If action exists in actionSpace, check if it has required parameters
            if (action) {
                // Check if the paramSchema has any required fields
                if (action.paramSchema && isZodObjectSchema(action.paramSchema)) {
                    const schema = action.paramSchema;
                    const shape = schema.shape || {};
                    // Check if any field is required (not optional)
                    const hasRequiredFields = Object.keys(shape).some((key) => {
                        const field = shape[key];
                        const { isOptional } = unwrapZodType(field);
                        return !isOptional;
                    });
                    return hasRequiredFields;
                }
                // If has paramSchema but not a ZodObject, assume it needs input
                return !!action.paramSchema;
            }
            // If not found in actionSpace, assume most methods need input
            return true;
        }
        // Fallback when actionSpace is not loaded yet - assume most methods need input
        return true;
    }, [selectedType, actionSpace]);
    // Check if current method supports data extraction options
    const showDataExtractionOptions = useMemo(() => {
        const dataExtractionMethods = [
            'aiQuery',
            'aiBoolean',
            'aiNumber',
            'aiString',
            'aiAsk',
            'aiAssert',
        ];
        return dataExtractionMethods.includes(selectedType);
    }, [selectedType]);
    // Check if current method supports deep locate option (dynamic based on actionSpace)
    const showDeepLocateOption = useMemo(() => {
        if (selectedType === 'aiAct' || selectedType === 'aiLocate') {
            return true;
        }
        if (actionSpace) {
            // Use actionSpace to determine if method supports deep locate
            const action = actionSpace.find((a) => a.interfaceAlias === selectedType || a.name === selectedType);
            if (action?.paramSchema && isZodObjectSchema(action.paramSchema)) {
                const schema = action.paramSchema;
                const shape = schema.shape || {};
                // Check if any parameter is a locate field
                const hasLocateField = Object.keys(shape).some((key) => {
                    const field = shape[key];
                    const { actualField } = unwrapZodType(field);
                    return isLocateField(actualField);
                });
                return hasLocateField;
            }
            return false;
        }
        return false;
    }, [selectedType, actionSpace]);
    // Check if current method supports deep think option (for aiAct planning)
    const showDeepThinkOption = useMemo(() => {
        return selectedType === 'aiAct';
    }, [selectedType]);
    // Check if ConfigSelector will actually have options to show
    const hasConfigOptions = useMemo(() => {
        const hasTracking = serviceMode === 'In-Browser-Extension';
        const hasDeepLocate = showDeepLocateOption;
        const hasDeepThink = showDeepThinkOption;
        const hasDataExtraction = showDataExtractionOptions && !hideDomAndScreenshotOptions;
        const hasDeviceOptions = deviceType === 'android' || deviceType === 'ios';
        return (hasTracking ||
            hasDeepLocate ||
            hasDeepThink ||
            hasDataExtraction ||
            hasDeviceOptions);
    }, [
        serviceMode,
        showDeepLocateOption,
        showDeepThinkOption,
        showDataExtractionOptions,
        hideDomAndScreenshotOptions,
        deviceType,
    ]);
    // Get available methods for dropdown (filtered by actionSpace)
    const availableDropdownMethods = useMemo(() => {
        const metadataMethods = Object.keys(apiMetadata);
        if (!actionSpace || actionSpace.length === 0) {
            // Fallback to metadata methods if actionSpace is not available
            return metadataMethods;
        }
        // Extract available methods from actionSpace
        const availableMethods = actionSpace.map((action) => action.interfaceAlias || action.name);
        // Combine methods from two sources:
        // 1. Methods from apiMetadata (filtered by rules)
        // 2. Methods from actionSpace (even if not in apiMetadata)
        const finalMethods = new Set();
        // Add filtered apiMetadata methods
        metadataMethods.forEach((method) => {
            const methodInfo = apiMetadata[method];
            // Always include extraction and validation methods
            if (methodInfo?.group === 'extraction' ||
                methodInfo?.group === 'validation') {
                finalMethods.add(method);
            }
            else {
                // For interaction methods, check if they're available in actionSpace
                if (availableMethods.includes(method)) {
                    finalMethods.add(method);
                }
            }
        });
        // Add all methods from actionSpace (including Android-specific ones)
        availableMethods.forEach((method) => {
            finalMethods.add(method);
        });
        return Array.from(finalMethods);
    }, [actionSpace]);
    // Get default values for fields with defaults
    const getDefaultParams = useCallback(() => {
        if (!needsStructuredParams || !actionSpace) {
            return {};
        }
        const action = actionSpace.find((a) => a.interfaceAlias === selectedType || a.name === selectedType);
        if (action?.paramSchema && isZodObjectSchema(action.paramSchema)) {
            const defaultParams = {};
            const schema = action.paramSchema;
            const shape = schema.shape || {};
            Object.keys(shape).forEach((key) => {
                const field = shape[key];
                const defaultValue = extractDefaultValue(field);
                if (defaultValue !== undefined) {
                    defaultParams[key] = defaultValue;
                }
            });
            return defaultParams;
        }
        return {};
    }, [selectedType, needsStructuredParams, actionSpace]);
    // Initialize form with last selected type when component mounts
    useEffect(() => {
        if (!form.getFieldValue('type') && lastSelectedType) {
            form.setFieldValue('type', lastSelectedType);
        }
    }, [form, lastSelectedType]);
    // Save selected type when it changes
    useEffect(() => {
        if (selectedType && selectedType !== lastSelectedType) {
            setLastSelectedType(selectedType);
        }
    }, [selectedType, lastSelectedType, setLastSelectedType]);
    // Scroll to selected item in mode-radio-group
    const scrollToSelectedItem = useCallback(() => {
        const container = modeRadioGroupRef.current;
        if (!container)
            return;
        let targetElement = null;
        // Find the selected radio button
        const selectedRadioButton = container.querySelector('.ant-radio-button-wrapper-checked');
        // Find the dropdown button if it's selected (showing a non-default item)
        const dropdownButton = container.querySelector('.more-apis-button.selected-from-dropdown');
        // Determine which element to scroll to
        if (selectedRadioButton) {
            targetElement = selectedRadioButton;
        }
        else if (dropdownButton) {
            targetElement = dropdownButton;
        }
        if (targetElement) {
            const containerRect = container.getBoundingClientRect();
            const targetRect = targetElement.getBoundingClientRect();
            // Calculate the relative position of the target within the container
            const targetLeft = targetRect.left - containerRect.left + container.scrollLeft;
            const targetWidth = targetRect.width;
            const containerWidth = containerRect.width;
            // Calculate the optimal scroll position to center the target
            const optimalScrollLeft = targetLeft - (containerWidth - targetWidth) / 2;
            // Smooth scroll to the target
            container.scrollTo({
                left: Math.max(0, optimalScrollLeft),
                behavior: 'smooth',
            });
        }
    }, []);
    // When the selectedType changes, populate the form with the last item from that type's history.
    useEffect(() => {
        const lastHistory = historyForSelectedType[0];
        // Skip auto-filling if this is the same history item we just added
        if (lastHistory &&
            lastHistoryRef.current &&
            lastHistory.timestamp === lastHistoryRef.current.timestamp) {
            return;
        }
        if (lastHistory) {
            form.setFieldsValue({
                type: lastHistory.type,
                prompt: lastHistory.prompt || '',
                params: lastHistory.params,
            });
            setPromptValue(lastHistory.prompt || '');
            lastHistoryRef.current = lastHistory;
        }
        else {
            // If there's no history for this type, fill with default values
            const defaultParams = getDefaultParams();
            form.setFieldsValue({
                prompt: '',
                params: defaultParams,
            });
            setPromptValue('');
            lastHistoryRef.current = null;
        }
    }, [selectedType, historyForSelectedType, form, getDefaultParams]);
    // Scroll to selected item when selectedType changes
    useEffect(() => {
        // Use a timeout to ensure the DOM has been updated with the new selection
        const timeoutId = setTimeout(() => {
            scrollToSelectedItem();
        }, 100);
        return () => clearTimeout(timeoutId);
    }, [selectedType, scrollToSelectedItem]);
    // Watch form prompt value changes
    const formPromptValue = Form.useWatch('prompt', form);
    // Sync promptValue with form field value when form changes
    useEffect(() => {
        if (formPromptValue !== promptValue) {
            setPromptValue(formPromptValue || '');
        }
    }, [formPromptValue, promptValue]);
    // Handle history selection internally
    const handleSelectHistory = useCallback((historyItem) => {
        form.setFieldsValue({
            prompt: historyItem.prompt,
            type: historyItem.type,
            params: historyItem.params,
        });
        setPromptValue(historyItem.prompt);
    }, [form]);
    // Handle prompt input change
    const handlePromptChange = useCallback((e) => {
        const value = e.target.value;
        setPromptValue(value);
    }, []);
    const hasSingleStructuredParam = useMemo(() => {
        if (!needsStructuredParams || !actionSpace) {
            return false;
        }
        const action = actionSpace.find((a) => a.interfaceAlias === selectedType || a.name === selectedType);
        if (action?.paramSchema && isZodObjectSchema(action.paramSchema)) {
            const schema = action.paramSchema;
            const shape = schema.shape || {};
            return Object.keys(shape).length === 1;
        }
        return false;
    }, [selectedType, needsStructuredParams, actionSpace]);
    // Calculate if run button should be enabled
    const isRunButtonEnabled = useMemo(() => calculateIsRunButtonEnabled(runButtonEnabled, !!needsStructuredParams, params, actionSpace, selectedType, promptValue), [
        runButtonEnabled,
        needsStructuredParams,
        selectedType,
        actionSpace,
        promptValue,
        params,
    ]);
    // Handle run with history addition
    const handleRunWithHistory = useCallback(() => {
        const values = form.getFieldsValue();
        // For structured params, create a display string for history - dynamically
        let historyPrompt = '';
        if (needsStructuredParams && values.params && actionSpace) {
            const action = actionSpace.find((a) => a.interfaceAlias === selectedType || a.name === selectedType);
            if (action?.paramSchema && isZodObjectSchema(action.paramSchema)) {
                // Separate locate field from other fields for legacy format compatibility
                let locateValue = '';
                const otherValues = [];
                const schema = action.paramSchema;
                const shape = schema.shape || {};
                Object.keys(shape).forEach((key) => {
                    const paramValue = values.params?.[key];
                    if (paramValue !== undefined &&
                        paramValue !== null &&
                        paramValue !== '') {
                        const field = shape[key];
                        const { actualField } = unwrapZodType(field);
                        if (isLocateField(actualField)) {
                            locateValue = String(paramValue);
                        }
                        else {
                            // Format based on field type
                            if (key === 'distance') {
                                otherValues.push(`${paramValue}`);
                            }
                            else {
                                otherValues.push(String(paramValue));
                            }
                        }
                    }
                });
                // Create legacy-compatible format for history
                const mainPart = otherValues.join(' ');
                historyPrompt = locateValue ? `${locateValue} - ${mainPart}` : mainPart;
            }
            else {
                historyPrompt = values.prompt || '';
            }
        }
        else {
            historyPrompt = values.prompt || '';
        }
        const newHistoryItem = {
            type: values.type,
            prompt: historyPrompt,
            params: values.params,
            timestamp: Date.now(),
        };
        addHistory(newHistoryItem);
        onRun();
        if (clearPromptAfterRun) {
            // Remember the history item we just added to avoid auto-filling with it
            lastHistoryRef.current = newHistoryItem;
            setPromptValue('');
            if (needsStructuredParams) {
                const defaultParams = getDefaultParams();
                form.setFieldValue('params', defaultParams);
            }
            else {
                form.setFieldValue('prompt', '');
            }
        }
    }, [
        form,
        addHistory,
        onRun,
        needsStructuredParams,
        selectedType,
        clearPromptAfterRun,
        actionSpace,
        getDefaultParams,
    ]);
    // Handle key events
    const handleKeyDown = useCallback((e) => {
        if (e.key === 'Enter' && e.metaKey && isRunButtonEnabled) {
            handleRunWithHistory();
            e.preventDefault();
            e.stopPropagation();
        }
        else if (e.key === 'Enter') {
            setTimeout(() => {
                if (textAreaRef.current) {
                    // Access the internal textarea element (Ant Design specific structure)
                    const textarea = textAreaRef.current.resizableTextArea
                        ?.textArea;
                    if (textarea) {
                        const selectionStart = textarea.selectionStart;
                        const value = textarea.value;
                        // check if cursor is at the end of the text
                        const lastNewlineIndex = value.lastIndexOf('\n');
                        const isAtLastLine = lastNewlineIndex === -1 || selectionStart > lastNewlineIndex;
                        // only scroll to bottom when cursor is at the end of the text
                        if (isAtLastLine) {
                            textarea.scrollTop = textarea.scrollHeight;
                        }
                    }
                }
            }, 0);
        }
    }, [handleRunWithHistory, isRunButtonEnabled]);
    // Handle key events for structured params
    const handleStructuredKeyDown = useCallback((e) => {
        if (e.key === 'Enter' && e.metaKey && isRunButtonEnabled) {
            handleRunWithHistory();
            e.preventDefault();
            e.stopPropagation();
        }
    }, [handleRunWithHistory, isRunButtonEnabled]);
    // Render structured parameter inputs dynamically based on paramSchema
    const renderStructuredParams = useCallback(() => {
        if (!needsStructuredParams)
            return null;
        // Try to get action from actionSpace first
        if (actionSpace) {
            const action = actionSpace.find((a) => a.interfaceAlias === selectedType || a.name === selectedType);
            if (action?.paramSchema && isZodObjectSchema(action.paramSchema)) {
                const schema = action.paramSchema;
                // Handle both runtime and serialized schemas
                const shape = schema.shape || {};
                const schemaKeys = Object.keys(shape);
                // If only one field, use traditional single input style without labels
                if (schemaKeys.length === 1) {
                    const key = schemaKeys[0];
                    const field = shape[key];
                    const { actualField } = unwrapZodType(field);
                    // Check if it's a locate field
                    const isLocateFieldFlag = isLocateField(actualField);
                    // Extract placeholder from fieldSchema if available, otherwise use defaults
                    const placeholderText = (() => {
                        const fieldWithRuntime = actualField;
                        // Try to get description from the field schema
                        if (fieldWithRuntime._def?.description) {
                            return fieldWithRuntime._def.description;
                        }
                        if (fieldWithRuntime.description) {
                            return fieldWithRuntime.description;
                        }
                        // Try to get from action's paramSchema directly
                        if (actionSpace) {
                            const action = actionSpace.find((a) => a.interfaceAlias === selectedType || a.name === selectedType);
                            if (action?.paramSchema &&
                                typeof action.paramSchema === 'object' &&
                                'shape' in action.paramSchema) {
                                const shape = action.paramSchema.shape ||
                                    {};
                                const fieldDef = shape[key];
                                if (fieldDef?._def?.description) {
                                    return fieldDef._def.description;
                                }
                                if (fieldDef?.description) {
                                    return fieldDef.description;
                                }
                            }
                        }
                        // Fallback to default placeholders
                        if (isLocateFieldFlag) {
                            return 'Describe the element you want to interact with';
                        }
                        else {
                            if (key === 'keyName')
                                return 'Enter key name or text to type';
                            if (key === 'value')
                                return 'Enter text to input';
                            return `Enter ${key}`;
                        }
                    })();
                    return (_jsx(Form.Item, { name: ['params', key], style: { margin: 0 }, children: _jsx(Input.TextArea, { className: "main-side-console-input-textarea", rows: 3, placeholder: placeholderText, autoFocus: true, onKeyDown: handleStructuredKeyDown }) }));
                }
                // Multiple fields - use structured layout with labels
                const fields = [];
                // Sort fields: required fields first, then optional fields
                const sortedKeys = schemaKeys.sort((keyA, keyB) => {
                    const fieldSchemaA = shape[keyA];
                    const fieldSchemaB = shape[keyB];
                    const { isOptional: isOptionalA } = unwrapZodType(fieldSchemaA);
                    const { isOptional: isOptionalB } = unwrapZodType(fieldSchemaB);
                    // Required fields (isOptional = false) come first
                    if (!isOptionalA && isOptionalB)
                        return -1;
                    if (isOptionalA && !isOptionalB)
                        return 1;
                    return 0;
                });
                // Dynamically render form fields based on paramSchema
                sortedKeys.forEach((key, index) => {
                    const fieldSchema = shape[key];
                    const { actualField, isOptional } = unwrapZodType(fieldSchema);
                    const isLocateFieldFlag = isLocateField(actualField);
                    const label = key.charAt(0).toUpperCase() + key.slice(1);
                    const isRequired = !isOptional;
                    const marginBottom = index === sortedKeys.length - 1 ? 0 : 12;
                    // Extract placeholder from fieldSchema if available
                    const placeholder = (() => {
                        // Try to get placeholder from field description or other metadata
                        const fieldWithRuntime = actualField;
                        if (fieldWithRuntime._def?.description) {
                            return fieldWithRuntime._def.description;
                        }
                        // Try to get from field metadata/annotations
                        if (fieldWithRuntime.description) {
                            return fieldWithRuntime.description;
                        }
                        // Try to get from action's paramSchema directly
                        if (actionSpace) {
                            const action = actionSpace.find((a) => a.interfaceAlias === selectedType || a.name === selectedType);
                            if (action?.paramSchema &&
                                typeof action.paramSchema === 'object' &&
                                'shape' in action.paramSchema) {
                                const shape = action.paramSchema
                                    .shape || {};
                                const fieldDef = shape[key];
                                if (fieldDef?._def?.description) {
                                    return fieldDef._def.description;
                                }
                                if (fieldDef?.description) {
                                    return fieldDef.description;
                                }
                            }
                        }
                        // For locate fields, provide a default placeholder
                        if (isLocateFieldFlag) {
                            return 'Describe the element you want to interact with';
                        }
                        return undefined;
                    })();
                    const fieldProps = {
                        name: key,
                        label,
                        fieldSchema: actualField,
                        isRequired,
                        marginBottom,
                        placeholder,
                    };
                    if (isLocateFieldFlag) {
                        fields.push(_jsx(LocateField, { ...fieldProps }, key));
                    }
                    else if (actualField._def?.typeName === 'ZodEnum') {
                        fields.push(_jsx(EnumField, { ...fieldProps }, key));
                    }
                    else if (actualField._def?.typeName === 'ZodNumber') {
                        fields.push(_jsx(NumberField, { ...fieldProps }, key));
                    }
                    else if (actualField._def?.typeName === 'ZodBoolean') {
                        fields.push(_jsx(BooleanField, { ...fieldProps }, key));
                    }
                    else {
                        fields.push(_jsx(TextField, { ...fieldProps }, key));
                    }
                });
                // Special layout handling for scroll action with direction and distance
                if (selectedType === 'aiScroll') {
                    const directionField = fields.find((field) => React.isValidElement(field) && field.props.name === 'direction');
                    const distanceField = fields.find((field) => React.isValidElement(field) && field.props.name === 'distance');
                    const otherFields = fields.filter((field) => React.isValidElement(field) &&
                        field.props.name !== 'direction' &&
                        field.props.name !== 'distance');
                    if (directionField && distanceField) {
                        return (_jsxs("div", { className: "structured-params", children: [_jsxs("div", { style: { display: 'flex', gap: 12, marginBottom: 12 }, children: [directionField, distanceField] }), otherFields] }));
                    }
                }
                return _jsx("div", { className: "structured-params", children: fields });
            }
        }
        // Fallback - should not be reached if actionSpace is properly loaded
        return null;
    }, [
        selectedType,
        needsStructuredParams,
        actionSpace,
        handleStructuredKeyDown,
    ]);
    // Handle settings hover state
    const handleMouseEnter = useCallback(() => {
        setHoveringSettings(true);
    }, []);
    const handleMouseLeave = useCallback(() => {
        setHoveringSettings(false);
    }, []);
    // Render action button based on current state
    const renderActionButton = useCallback(() => {
        const runButton = (text) => (_jsx(Button, { type: "primary", icon: _jsx(SendOutlined, {}), style: { borderRadius: 20, zIndex: 999 }, onClick: handleRunWithHistory, disabled: !isRunButtonEnabled, loading: loading, children: text }));
        if (dryMode) {
            return selectedType === 'aiAct' ? (_jsx(Tooltip, { title: "Start executing until some interaction actions need to be performed. You can see the process of planning and locating.", children: runButton('Dry Run') })) : (runButton('Run'));
        }
        if (stoppable) {
            return (_jsx(Button, { icon: _jsx(BorderOutlined, {}), onClick: onStop, style: { borderRadius: 20, zIndex: 999 }, children: "Stop" }));
        }
        return runButton('Run');
    }, [
        dryMode,
        loading,
        handleRunWithHistory,
        onStop,
        isRunButtonEnabled,
        selectedType,
        stoppable,
    ]);
    return (_jsxs("div", { className: "prompt-input-wrapper", children: [_jsxs("div", { className: "mode-radio-group-wrapper", children: [_jsxs("div", { className: "mode-radio-group", ref: modeRadioGroupRef, children: [_jsx(Form.Item, { name: "type", style: { margin: 0 }, children: _jsx(Radio.Group, { buttonStyle: "solid", disabled: !runButtonEnabled, children: defaultMainButtons.map((apiType) => (_jsx(Tooltip, { title: apiMetadata[apiType]?.title ||
                                            '', children: _jsx(Radio.Button, { value: apiType, children: actionNameForType(apiType) }) }, apiType))) }) }), _jsx(Dropdown, { menu: (() => {
                                    // Get all APIs not currently shown in main buttons, filtered by actionSpace
                                    const hiddenAPIs = availableDropdownMethods.filter((api) => !defaultMainButtons.includes(api));
                                    // Group hidden APIs by category
                                    const groupedItems = [];
                                    const interactionAPIs = hiddenAPIs.filter((api) => apiMetadata[api]?.group ===
                                        'interaction');
                                    if (interactionAPIs.length > 0) {
                                        groupedItems.push({
                                            key: 'interaction-group',
                                            type: 'group',
                                            label: 'Interaction APIs',
                                            children: interactionAPIs.map((api) => ({
                                                key: api,
                                                label: actionNameForType(api),
                                                title: apiMetadata[api]?.title || '',
                                                onClick: () => {
                                                    form.setFieldValue('type', api);
                                                },
                                            })),
                                        });
                                    }
                                    const extractionAPIs = hiddenAPIs.filter((api) => apiMetadata[api]?.group ===
                                        'extraction');
                                    if (extractionAPIs.length > 0) {
                                        groupedItems.push({
                                            key: 'extraction-group',
                                            type: 'group',
                                            label: 'Data Extraction APIs',
                                            children: extractionAPIs.map((api) => ({
                                                key: api,
                                                label: actionNameForType(api),
                                                title: apiMetadata[api]?.title || '',
                                                onClick: () => {
                                                    form.setFieldValue('type', api);
                                                },
                                            })),
                                        });
                                    }
                                    const validationAPIs = hiddenAPIs.filter((api) => apiMetadata[api]?.group ===
                                        'validation');
                                    if (validationAPIs.length > 0) {
                                        groupedItems.push({
                                            key: 'validation-group',
                                            type: 'group',
                                            label: 'Validation APIs',
                                            children: validationAPIs.map((api) => ({
                                                key: api,
                                                label: actionNameForType(api),
                                                title: apiMetadata[api]?.title || '',
                                                onClick: () => {
                                                    form.setFieldValue('type', api);
                                                },
                                            })),
                                        });
                                    }
                                    // Add device-specific APIs (those not in apiMetadata)
                                    const deviceSpecificAPIs = hiddenAPIs.filter((api) => !apiMetadata[api]);
                                    if (deviceSpecificAPIs.length > 0) {
                                        groupedItems.push({
                                            key: 'device-specific-group',
                                            type: 'group',
                                            label: 'Device-Specific APIs',
                                            children: deviceSpecificAPIs.map((api) => ({
                                                key: api,
                                                label: actionNameForType(api),
                                                title: '',
                                                onClick: () => {
                                                    form.setFieldValue('type', api);
                                                },
                                            })),
                                        });
                                    }
                                    return { items: groupedItems };
                                })(), placement: "bottomLeft", trigger: ['click'], disabled: !runButtonEnabled, overlayClassName: "more-apis-dropdown", children: _jsxs(Button, { className: `more-apis-button ${!defaultMainButtons.includes(selectedType) ? 'selected-from-dropdown' : ''}`, children: [selectedType && !defaultMainButtons.includes(selectedType)
                                            ? actionNameForType(selectedType)
                                            : 'more', _jsx(DownOutlined, { style: { fontSize: '10px', marginLeft: '2px' } })] }) })] }), _jsxs("div", { className: "action-icons", children: [hasConfigOptions && (_jsx("div", { className: hoveringSettings
                                    ? 'settings-wrapper settings-wrapper-hover'
                                    : 'settings-wrapper', onMouseEnter: handleMouseEnter, onMouseLeave: handleMouseLeave, children: _jsx(ConfigSelector, { enableTracking: serviceMode === 'In-Browser-Extension', showDeepLocateOption: showDeepLocateOption, showDeepThinkOption: showDeepThinkOption, showDataExtractionOptions: showDataExtractionOptions, hideDomAndScreenshotOptions: hideDomAndScreenshotOptions, deviceType: deviceType }) })), _jsx(HistorySelector, { onSelect: handleSelectHistory, history: historyForSelectedType, currentType: selectedType })] })] }), _jsxs("div", { className: `main-side-console-input ${!runButtonEnabled ? 'disabled' : ''} ${loading ? 'loading' : ''}`, children: [needsAnyInput ? (needsStructuredParams ? (hasSingleStructuredParam ? (renderStructuredParams()) : (
                    // Render structured parameters for specific AI methods
                    _jsx("div", { className: "structured-params-container", children: renderStructuredParams() }))) : (
                    // Render traditional prompt input for other methods
                    _jsx(Form.Item, { name: "prompt", style: { margin: 0 }, children: _jsx(TextArea, { className: "main-side-console-input-textarea", disabled: !runButtonEnabled, rows: 3, placeholder: placeholder, autoFocus: true, onKeyDown: handleKeyDown, onChange: handlePromptChange, ref: textAreaRef }) }))) : (
                    // Methods that don't need any input - show a message or empty state
                    _jsxs("div", { className: "no-input-method", style: {
                            padding: '20px',
                            textAlign: 'center',
                            color: '#666',
                            fontSize: '14px',
                        }, children: ["Click \"Run\" to execute ", actionNameForType(selectedType)] })), _jsx("div", { className: "form-controller-wrapper", children: renderActionButton() })] })] }));
};
