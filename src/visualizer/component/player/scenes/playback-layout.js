export function getPlaybackViewport(containerWidth, containerHeight, imageWidth, imageHeight) {
    const scale = Math.min(containerWidth / imageWidth, containerHeight / imageHeight);
    const contentWidth = imageWidth * scale;
    const contentHeight = imageHeight * scale;
    return {
        offsetX: (containerWidth - contentWidth) / 2,
        offsetY: (containerHeight - contentHeight) / 2,
        contentWidth,
        contentHeight,
    };
}
