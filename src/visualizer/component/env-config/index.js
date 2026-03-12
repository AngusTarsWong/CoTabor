import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { SettingOutlined } from '@ant-design/icons';
import { Input, Modal, Tooltip } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { useEnvConfig } from '../../store/store';
export function EnvConfig({ showTooltipWhenEmpty = true, showModelName = true, tooltipPlacement = 'bottom', mode = 'icon', }) {
    const { config, configString, loadConfig, syncFromStorage } = useEnvConfig();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [tempConfigString, setTempConfigString] = useState(configString);
    const midsceneModelName = config.MIDSCENE_MODEL_NAME;
    const componentRef = useRef(null);
    const showModal = (e) => {
        // every time open modal, sync from localStorage
        syncFromStorage();
        setIsModalOpen(true);
        e.preventDefault();
        e.stopPropagation();
    };
    const handleOk = () => {
        setIsModalOpen(false);
        loadConfig(tempConfigString);
    };
    const handleCancel = () => {
        setIsModalOpen(false);
    };
    // when modal is open, use the latest config string
    useEffect(() => {
        if (isModalOpen) {
            setTempConfigString(configString);
        }
    }, [isModalOpen, configString]);
    return (_jsxs("div", { style: {
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '10px',
            alignItems: 'center',
            height: '100%',
            minHeight: '32px',
        }, ref: componentRef, children: [showModelName ? midsceneModelName : null, _jsx(Tooltip, { title: "Please set up your environment variables before using.", placement: tooltipPlacement, align: { offset: [-10, 5] }, getPopupContainer: () => componentRef.current, open: 
                // undefined for default behavior of tooltip, hover for show
                // close tooltip when modal is open
                isModalOpen
                    ? false
                    : showTooltipWhenEmpty
                        ? Object.keys(config).length === 0
                        : undefined, children: mode === 'icon' ? (_jsx(SettingOutlined, { onClick: showModal })) : (_jsx("span", { onClick: showModal, style: { color: '#006AFF', cursor: 'pointer' }, children: "set up" })) }), _jsxs(Modal, { title: "Model Env Config", open: isModalOpen, onOk: handleOk, onCancel: handleCancel, okText: "Save", style: { width: '800px', height: '100%', marginTop: '10%' }, destroyOnClose: true, maskClosable: true, centered: true, children: [_jsx(Input.TextArea, { rows: 7, placeholder: 'MIDSCENE_MODEL_API_KEY=sk-...\nMIDSCENE_MODEL_NAME=gpt-4o-2024-08-06\n...', value: tempConfigString, onChange: (e) => setTempConfigString(e.target.value), style: { whiteSpace: 'nowrap', wordWrap: 'break-word' } }), _jsxs("div", { children: [_jsx("p", { children: "The format is KEY=VALUE and separated by new lines." }), _jsxs("p", { children: ["These data will be saved ", _jsx("strong", { children: "locally in your browser" }), "."] })] })] })] }));
}
