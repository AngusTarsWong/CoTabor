import { deriveFrameState } from './derive-frame-state';
export function getPlaybackFrameState(frameMap, frame) {
    const state = deriveFrameState(frameMap.scriptFrames, frame, frameMap.imageWidth, frameMap.imageHeight, frameMap.fps);
    return state.img ? state : null;
}
