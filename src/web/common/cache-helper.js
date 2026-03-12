import { AiJudgeOrderSensitive, callAIWithObjectResponse, } from '@/core/ai-model';
// Shared function to sanitize xpaths
export const sanitizeXpaths = (xpaths) => {
    if (!Array.isArray(xpaths)) {
        return [];
    }
    return xpaths.filter((xpath) => typeof xpath === 'string' && xpath.length > 0);
};
// Shared logic for judging isOrderSensitive
export async function judgeOrderSensitive(options, debug) {
    if (!options?.targetDescription || !options?.modelConfig) {
        return false;
    }
    try {
        const judgeResult = await AiJudgeOrderSensitive(options.targetDescription, callAIWithObjectResponse, options.modelConfig);
        debug('judged isOrderSensitive=%s for description: %s', judgeResult.isOrderSensitive, options.targetDescription);
        return judgeResult.isOrderSensitive;
    }
    catch (error) {
        debug('Failed to judge isOrderSensitive: %O', error);
        return false;
    }
}
// Shared logic to build Rect from elementInfo
export function buildRectFromElementInfo(elementInfo) {
    const matchedRect = {
        left: elementInfo.rect.left,
        top: elementInfo.rect.top,
        width: elementInfo.rect.width,
        height: elementInfo.rect.height,
    };
    return matchedRect;
}
