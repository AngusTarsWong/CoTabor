import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Button, Input, Typography } from 'antd';
import { useEffect, useMemo, useRef, useState } from 'react';
import CloseOutlined from '../../icons/close.svg';
import HistoryOutlined from '../../icons/history.svg';
import MagnifyingGlass from '../../icons/magnifying-glass.svg';
import { useHistoryStore } from '../../store/history';
import './index.less';
const { Text } = Typography;
export const HistorySelector = ({ onSelect, history, currentType, }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [searchText, setSearchText] = useState('');
    const clearHistory = useHistoryStore((state) => state.clearHistory);
    const modalRef = useRef(null);
    // group history by time
    const groupedHistory = useMemo(() => {
        const now = Date.now();
        const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
        const oneYearAgo = now - 365 * 24 * 60 * 60 * 1000;
        const filteredHistory = history.filter((item) => item.prompt.toLowerCase().includes(searchText.toLowerCase()));
        const groups = {
            recent7Days: filteredHistory.filter((item) => item.timestamp >= sevenDaysAgo),
            recent1Year: filteredHistory.filter((item) => item.timestamp < sevenDaysAgo && item.timestamp >= oneYearAgo),
            older: filteredHistory.filter((item) => item.timestamp < oneYearAgo),
        };
        return groups;
    }, [history, searchText]);
    const handleHistoryClick = (item) => {
        onSelect(item);
        setIsModalOpen(false);
    };
    const handleClearHistory = () => {
        clearHistory(currentType);
        setSearchText('');
        setIsModalOpen(false); // clear and close modal
    };
    // Handle click outside to close modal
    useEffect(() => {
        if (!isModalOpen)
            return;
        const handleClickOutside = (event) => {
            // Check if click is outside the modal
            if (modalRef.current &&
                !modalRef.current.contains(event.target)) {
                setIsModalOpen(false);
            }
        };
        // Add listener after a short delay to avoid closing immediately when opening
        const timer = setTimeout(() => {
            document.addEventListener('click', handleClickOutside);
        }, 100);
        return () => {
            clearTimeout(timer);
            document.removeEventListener('click', handleClickOutside);
        };
    }, [isModalOpen]);
    const renderHistoryGroup = (title, items) => {
        if (items.length === 0)
            return null;
        return (_jsxs("div", { className: "history-group", children: [_jsx("div", { className: "history-group-title", children: title }), items.map((item, index) => (_jsx("div", { className: "history-item", onClick: () => handleHistoryClick(item), children: item.prompt }, `${item.timestamp}-${index}`)))] }, title));
    };
    return (_jsxs("div", { className: "history-selector-wrapper", children: [_jsx("div", { className: "selector-trigger", onClick: () => setIsModalOpen(true), children: _jsx(HistoryOutlined, { width: 24, height: 24 }) }), isModalOpen && (_jsx("div", { className: "history-modal-overlay", ref: modalRef, children: _jsxs("div", { className: "history-modal-container", children: [_jsxs("div", { className: "history-modal-header", children: [_jsxs(Text, { strong: true, style: { fontSize: '16px' }, children: ["History (", history.length, ")"] }), _jsx(Button, { size: "small", type: "text", icon: _jsx(CloseOutlined, { width: 16, height: 16 }), onClick: () => setIsModalOpen(false), className: "close-button" })] }), _jsx("div", { className: "history-search-section", children: _jsxs("div", { className: "search-input-wrapper", children: [_jsx(Input, { placeholder: "Search", value: searchText, onChange: (e) => setSearchText(e.target.value), prefix: _jsx(MagnifyingGlass, { width: 18, height: 18 }), className: "search-input", allowClear: true }), _jsx(Button, { type: "link", onClick: handleClearHistory, className: "clear-button", disabled: history.length === 0, children: "Clear" })] }) }), _jsx("div", { className: "history-content", children: history.length === 0 ? (
                            /* no history record */
                            _jsx("div", { className: "no-results", children: _jsx(Text, { type: "secondary", children: "No history record" }) })) : (_jsxs(_Fragment, { children: [renderHistoryGroup('Last 7 days', groupedHistory.recent7Days), renderHistoryGroup('Last 1 year', groupedHistory.recent1Year), renderHistoryGroup('Earlier', groupedHistory.older), searchText &&
                                        groupedHistory.recent7Days.length === 0 &&
                                        groupedHistory.recent1Year.length === 0 &&
                                        groupedHistory.older.length === 0 && (_jsx("div", { className: "no-results", children: _jsx(Text, { type: "secondary", children: "No matching history record" }) }))] })) })] }) }))] }));
};
