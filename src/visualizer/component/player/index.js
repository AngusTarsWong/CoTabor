'use client';
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './index.less';
import { CaretRightOutlined, CompressOutlined, DownloadOutlined, ExpandOutlined, ExportOutlined, FontSizeOutlined, PauseOutlined, ThunderboltOutlined, } from '@ant-design/icons';
import { Dropdown, Spin, Switch, Tooltip, message } from 'antd';
import GlobalPerspectiveIcon from '../../icons/global-perspective.svg';
import PlayerSettingIcon from '../../icons/player-setting.svg';
import { useGlobalPreference } from '../../store/store';
import { StepsTimeline } from './scenes/StepScene';
import { exportBrandedVideo } from './scenes/export-branded-video';
import { calculateFrameMap } from './scenes/frame-calculator';
import { getPlaybackFrameState } from './scenes/playback-frame';
import { useFramePlayer } from './use-frame-player';
const downloadReport = (content) => {
    const blob = new Blob([content], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'midscene_report.html';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
};
function deriveTaskId(scriptFrames, stepsFrame) {
    let taskId = null;
    for (const sf of scriptFrames) {
        if (sf.durationInFrames === 0) {
            if (sf.startFrame <= stepsFrame) {
                taskId = sf.taskId ?? taskId;
            }
            continue;
        }
        if (stepsFrame < sf.startFrame)
            break;
        taskId = sf.taskId ?? taskId;
    }
    return taskId;
}
function formatTime(frame, fps) {
    const totalSeconds = Math.floor(frame / fps);
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
export function Player(props) {
    const { autoZoom, setAutoZoom, playbackSpeed, setPlaybackSpeed, subtitleEnabled, setSubtitleEnabled, } = useGlobalPreference();
    useEffect(() => {
        if (props?.autoZoom !== undefined) {
            setAutoZoom(props.autoZoom);
        }
    }, [props?.autoZoom, setAutoZoom]);
    const scripts = props?.replayScripts;
    const frameMap = useMemo(() => {
        if (!scripts || scripts.length === 0)
            return null;
        return calculateFrameMap(scripts, {
            imageWidth: props?.imageWidth,
            imageHeight: props?.imageHeight,
        });
    }, [props?.imageHeight, props?.imageWidth, scripts]);
    const containerRef = useRef(null);
    const renderLayerRef = useRef(null);
    const lastTaskIdRef = useRef(null);
    const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
    // Observe render layer size to compute scale factor
    useEffect(() => {
        const el = renderLayerRef.current;
        if (!el)
            return;
        const ro = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const { width, height } = entry.contentRect;
                setContainerSize((prev) => prev.width === width && prev.height === height
                    ? prev
                    : { width, height });
            }
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);
    const player = useFramePlayer({
        durationInFrames: Math.max(frameMap?.totalDurationInFrames ?? 1, 1),
        fps: frameMap?.fps ?? 30,
        autoPlay: true,
        loop: false,
        playbackRate: playbackSpeed,
    });
    // Track frame for taskId callback
    useEffect(() => {
        if (!frameMap || !props?.onTaskChange)
            return;
        const taskId = deriveTaskId(frameMap.scriptFrames, player.currentFrame);
        if (taskId !== lastTaskIdRef.current) {
            lastTaskIdRef.current = taskId;
            props.onTaskChange(taskId);
        }
    }, [frameMap, props?.onTaskChange, player.currentFrame]);
    const currentFrameState = useMemo(() => {
        if (!frameMap)
            return null;
        return getPlaybackFrameState(frameMap, player.currentFrame);
    }, [frameMap, player.currentFrame]);
    const subtitle = useMemo(() => {
        if (!currentFrameState)
            return null;
        if (!currentFrameState.title && !currentFrameState.subTitle)
            return null;
        return {
            title: currentFrameState.title,
            subTitle: currentFrameState.subTitle,
        };
    }, [currentFrameState]);
    // Controls auto-hide
    const [controlsVisible, setControlsVisible] = useState(true);
    const hideTimerRef = useRef(null);
    const showControls = useCallback(() => {
        setControlsVisible(true);
        if (hideTimerRef.current)
            clearTimeout(hideTimerRef.current);
        hideTimerRef.current = setTimeout(() => setControlsVisible(false), 3000);
    }, []);
    const onMouseEnter = useCallback(() => {
        setControlsVisible(true);
        if (hideTimerRef.current)
            clearTimeout(hideTimerRef.current);
    }, []);
    const onMouseLeave = useCallback(() => {
        if (hideTimerRef.current)
            clearTimeout(hideTimerRef.current);
        hideTimerRef.current = setTimeout(() => setControlsVisible(false), 1000);
    }, []);
    const handleKeyDown = useCallback((e) => {
        if (e.code === 'Space') {
            e.preventDefault();
            player.toggle();
        }
    }, [player]);
    // Seek bar drag
    const seekBarRef = useRef(null);
    const handleSeekPointerDown = useCallback((e) => {
        if (!frameMap || !seekBarRef.current)
            return;
        const bar = seekBarRef.current;
        bar.setPointerCapture(e.pointerId);
        const seek = (clientX) => {
            const rect = bar.getBoundingClientRect();
            const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
            player.seekTo(Math.round(ratio * (frameMap.totalDurationInFrames - 1)));
        };
        seek(e.clientX);
        const onMove = (ev) => seek(ev.clientX);
        const onUp = () => {
            bar.removeEventListener('pointermove', onMove);
            bar.removeEventListener('pointerup', onUp);
        };
        bar.addEventListener('pointermove', onMove);
        bar.addEventListener('pointerup', onUp);
    }, [frameMap, player]);
    // Fullscreen
    const [isFullscreen, setIsFullscreen] = useState(false);
    const toggleFullscreen = useCallback(() => {
        const el = containerRef.current;
        if (!el)
            return;
        if (!document.fullscreenElement) {
            el.requestFullscreen().then(() => setIsFullscreen(true));
        }
        else {
            document.exitFullscreen().then(() => setIsFullscreen(false));
        }
    }, []);
    useEffect(() => {
        const handler = () => setIsFullscreen(!!document.fullscreenElement);
        document.addEventListener('fullscreenchange', handler);
        return () => document.removeEventListener('fullscreenchange', handler);
    }, []);
    // Export video
    const [isExporting, setIsExporting] = useState(false);
    const [exportProgress, setExportProgress] = useState(0);
    const handleExportVideo = useCallback(async () => {
        if (!frameMap || isExporting)
            return;
        setIsExporting(true);
        setExportProgress(0);
        try {
            await exportBrandedVideo(frameMap, (pct) => setExportProgress(Math.round(pct * 100)));
            message.success('Video exported');
        }
        catch (e) {
            console.error('Export failed:', e);
            message.error('Export failed');
        }
        finally {
            setIsExporting(false);
            setExportProgress(0);
        }
    }, [frameMap, isExporting]);
    // Compute chapter markers
    const chapterMarkers = useMemo(() => {
        if (!frameMap)
            return [];
        const { scriptFrames, totalDurationInFrames } = frameMap;
        if (totalDurationInFrames === 0)
            return [];
        const markers = [];
        for (const sf of scriptFrames) {
            if ((sf.type !== 'img' && sf.type !== 'insight') ||
                sf.durationInFrames === 0)
                continue;
            const globalFrame = sf.startFrame;
            const percent = (globalFrame / totalDurationInFrames) * 100;
            if (percent > 1 && percent < 99) {
                const parts = [sf.title, sf.subTitle].filter(Boolean);
                markers.push({
                    percent,
                    title: parts.length > 0
                        ? parts.join(': ')
                        : `Chapter ${markers.length + 1}`,
                    frame: globalFrame,
                });
            }
        }
        return markers;
    }, [frameMap]);
    // If no scripts, show empty
    if (!scripts || scripts.length === 0 || !frameMap) {
        return _jsx("div", { className: "player-container" });
    }
    const compositionWidth = currentFrameState?.imageWidth || frameMap.imageWidth;
    const compositionHeight = currentFrameState?.imageHeight || frameMap.imageHeight;
    const isPortraitCanvas = compositionHeight > compositionWidth;
    const totalFrames = frameMap.totalDurationInFrames;
    const seekPercent = totalFrames > 1 ? (player.currentFrame / (totalFrames - 1)) * 100 : 0;
    return (_jsx("div", { className: "player-container", "data-fit-mode": props?.fitMode, children: _jsxs("div", { className: "canvas-container", ref: containerRef, onKeyDown: handleKeyDown, onMouseMove: showControls, onMouseEnter: onMouseEnter, onMouseLeave: onMouseLeave, children: [_jsx("div", { className: "player-wrapper", "data-portrait": isPortraitCanvas ? '' : undefined, style: {
                        aspectRatio: `${compositionWidth}/${compositionHeight}`,
                    }, children: _jsx("div", { ref: renderLayerRef, style: {
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            width: '100%',
                            height: '100%',
                            overflow: 'hidden',
                        }, onClick: player.toggle, children: (() => {
                            const scale = containerSize.width > 0 && containerSize.height > 0
                                ? Math.min(containerSize.width / compositionWidth, containerSize.height / compositionHeight)
                                : 1;
                            return (_jsx("div", { style: {
                                    width: compositionWidth * scale,
                                    height: compositionHeight * scale,
                                    flexShrink: 0,
                                    position: 'relative',
                                    overflow: 'hidden',
                                }, children: _jsx("div", { style: {
                                        width: compositionWidth,
                                        height: compositionHeight,
                                        transformOrigin: '0 0',
                                        transform: `scale(${scale})`,
                                    }, children: _jsx(StepsTimeline, { frameMap: frameMap, autoZoom: autoZoom, frame: player.currentFrame, width: compositionWidth, height: compositionHeight, fps: frameMap.fps }) }) }));
                        })() }) }), subtitleEnabled && subtitle && (_jsxs("div", { className: "player-subtitle", children: [subtitle.title && (_jsx("span", { className: "player-subtitle-badge", children: subtitle.title })), subtitle.subTitle && (_jsx("span", { className: "player-subtitle-text", children: subtitle.subTitle }))] })), _jsxs("div", { className: `control-bar ${controlsVisible ? '' : 'hidden'}`, onClick: (e) => e.stopPropagation(), children: [_jsx("div", { className: "status-icon", onClick: player.toggle, children: player.playing ? _jsx(PauseOutlined, {}) : _jsx(CaretRightOutlined, {}) }), _jsxs("span", { className: "time-display", children: [formatTime(player.currentFrame, frameMap.fps), " /", ' ', formatTime(totalFrames, frameMap.fps)] }), _jsxs("div", { className: "seek-bar-track", ref: seekBarRef, onPointerDown: handleSeekPointerDown, children: [_jsx("div", { className: "seek-bar-fill", style: { width: `${seekPercent}%` } }), _jsx("div", { className: "seek-bar-knob", style: { left: `${seekPercent}%` } }), chapterMarkers.map((marker) => (_jsx(Tooltip, { title: marker.title, overlayClassName: "chapter-tooltip", children: _jsx("div", { className: "chapter-marker", style: { left: `${marker.percent}%` }, onClick: (e) => {
                                            e.stopPropagation();
                                            player.seekTo(marker.frame);
                                        } }) }, marker.percent)))] }), _jsxs("div", { className: "player-custom-controls", children: [props?.reportFileContent && props?.canDownloadReport !== false ? (_jsx(Tooltip, { title: "Download Report", children: _jsx("div", { className: "status-icon", onClick: () => downloadReport(props.reportFileContent), children: _jsx(DownloadOutlined, {}) }) })) : null, _jsx(Dropdown, { trigger: ['hover', 'click'], placement: "topRight", overlayStyle: { minWidth: '148px' }, dropdownRender: () => (_jsxs("div", { className: "player-settings-dropdown", children: [_jsxs("div", { className: "player-settings-item", style: {
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '4px',
                                                    height: '32px',
                                                    padding: '0 8px',
                                                    borderRadius: '4px',
                                                    cursor: isExporting ? 'not-allowed' : 'pointer',
                                                    opacity: isExporting ? 0.5 : 1,
                                                }, onClick: isExporting ? undefined : handleExportVideo, children: [isExporting ? (_jsx(Spin, { size: "small" })) : (_jsx(ExportOutlined, { style: { width: '16px', height: '16px' } })), _jsx("span", { style: { fontSize: '14px' }, children: isExporting
                                                            ? `Exporting ${exportProgress}%`
                                                            : 'Export video' })] }), _jsx("div", { className: "player-settings-divider" }), _jsxs("div", { className: "player-settings-item", style: {
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'space-between',
                                                    height: '32px',
                                                    padding: '0 8px',
                                                    borderRadius: '4px',
                                                }, children: [_jsxs("div", { style: {
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '4px',
                                                        }, children: [_jsx(GlobalPerspectiveIcon, { style: { width: '16px', height: '16px' } }), _jsx("span", { style: { fontSize: '14px', marginRight: '16px' }, children: "Focus on cursor" })] }), _jsx(Switch, { size: "small", checked: autoZoom, onChange: (checked) => setAutoZoom(checked) })] }), _jsxs("div", { className: "player-settings-item", style: {
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'space-between',
                                                    height: '32px',
                                                    padding: '0 8px',
                                                    borderRadius: '4px',
                                                }, children: [_jsxs("div", { style: {
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '4px',
                                                        }, children: [_jsx(FontSizeOutlined, { style: { width: '16px', height: '16px' } }), _jsx("span", { style: { fontSize: '14px', marginRight: '16px' }, children: "Subtitle" })] }), _jsx(Switch, { size: "small", checked: subtitleEnabled, onChange: (checked) => setSubtitleEnabled(checked) })] }), _jsx("div", { className: "player-settings-divider" }), _jsxs("div", { style: {
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '4px',
                                                    height: '32px',
                                                    padding: '0 8px',
                                                }, children: [_jsx(ThunderboltOutlined, { style: { width: '16px', height: '16px' } }), _jsx("span", { style: { fontSize: '14px' }, children: "Playback speed" })] }), [0.5, 1, 1.5, 2].map((speed) => (_jsxs("div", { onClick: () => setPlaybackSpeed(speed), style: {
                                                    height: '32px',
                                                    lineHeight: '32px',
                                                    padding: '0 8px 0 24px',
                                                    fontSize: '14px',
                                                    cursor: 'pointer',
                                                    borderRadius: '4px',
                                                }, className: `player-speed-option${playbackSpeed === speed ? ' active' : ''}`, children: [speed, "x"] }, speed)))] })), menu: { items: [] }, children: _jsx("div", { className: "status-icon", children: _jsx(PlayerSettingIcon, { style: { width: '16px', height: '16px' } }) }) }), _jsx("div", { className: "status-icon", onClick: toggleFullscreen, children: isFullscreen ? _jsx(CompressOutlined, {}) : _jsx(ExpandOutlined, {}) })] })] })] }) }));
}
