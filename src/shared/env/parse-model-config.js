import { DEFAULT_MODEL_CONFIG_KEYS, INSIGHT_MODEL_CONFIG_KEYS, PLANNING_MODEL_CONFIG_KEYS, } from './constants';
import { MIDSCENE_OPENAI_HTTP_PROXY, MIDSCENE_OPENAI_INIT_CONFIG_JSON, MIDSCENE_OPENAI_SOCKS_PROXY, MIDSCENE_USE_DOUBAO_VISION, MIDSCENE_USE_GEMINI, MIDSCENE_USE_QWEN3_VL, MIDSCENE_USE_QWEN_VL, MIDSCENE_USE_VLM_UI_TARS, MODEL_FAMILY_VALUES, OPENAI_API_KEY, OPENAI_BASE_URL, UITarsModelVersion, } from './types';
import { getDebug } from '../logger';
import { assert } from '../utils';
import { maskConfig, parseJson } from './helper';
import { initDebugConfig } from './init-debug';
const KEYS_MAP = {
    insight: INSIGHT_MODEL_CONFIG_KEYS,
    planning: PLANNING_MODEL_CONFIG_KEYS,
    default: DEFAULT_MODEL_CONFIG_KEYS,
};
/**
 * Get UI-TARS model version from model family
 * @param modelFamily - The model family value
 * @returns UITarsModelVersion if the model family is a UI-TARS variant, undefined otherwise
 */
export const getUITarsModelVersion = (modelFamily) => {
    // UI-TARS variants with version handling
    if (modelFamily === 'vlm-ui-tars') {
        return UITarsModelVersion.V1_0;
    }
    if (modelFamily === 'vlm-ui-tars-doubao' ||
        modelFamily === 'vlm-ui-tars-doubao-1.5') {
        return UITarsModelVersion.DOUBAO_1_5_20B;
    }
    return undefined;
};
/**
 * Validate model family value
 * @param modelFamily - The model family value to validate
 * @throws Error if the model family is invalid
 */
export const validateModelFamily = (modelFamily) => {
    if (modelFamily && !MODEL_FAMILY_VALUES.includes(modelFamily)) {
        throw new Error(`Invalid MIDSCENE_MODEL_FAMILY value: ${modelFamily}`);
    }
};
/**
 * Convert legacy environment variables to model family
 * @param provider - Environment variable provider (e.g., process.env)
 * @returns The corresponding model family value, or undefined if no legacy config is found
 */
export const legacyConfigToModelFamily = (provider) => {
    const isDoubao = provider[MIDSCENE_USE_DOUBAO_VISION];
    const isQwen = provider[MIDSCENE_USE_QWEN_VL];
    const isQwen3 = provider[MIDSCENE_USE_QWEN3_VL];
    const isUiTars = provider[MIDSCENE_USE_VLM_UI_TARS];
    const isGemini = provider[MIDSCENE_USE_GEMINI];
    const enabledModes = [
        isDoubao && MIDSCENE_USE_DOUBAO_VISION,
        isQwen && MIDSCENE_USE_QWEN_VL,
        isQwen3 && MIDSCENE_USE_QWEN3_VL,
        isUiTars && MIDSCENE_USE_VLM_UI_TARS,
        isGemini && MIDSCENE_USE_GEMINI,
    ].filter(Boolean);
    if (enabledModes.length > 1) {
        throw new Error(`Only one vision mode can be enabled at a time. Currently enabled modes: ${enabledModes.join(', ')}. Please disable all but one mode.`);
    }
    // Simple modes that directly map to model family
    if (isQwen3)
        return 'qwen3-vl';
    if (isQwen)
        return 'qwen2.5-vl';
    if (isDoubao)
        return 'doubao-vision';
    if (isGemini)
        return 'gemini';
    // UI-TARS with version detection
    if (isUiTars) {
        if (isUiTars === '1') {
            return 'vlm-ui-tars';
        }
        else if (isUiTars === 'DOUBAO' || isUiTars === 'DOUBAO-1.5') {
            return 'vlm-ui-tars-doubao-1.5';
        }
        else {
            // Handle other UI-TARS versions
            return 'vlm-ui-tars-doubao';
        }
    }
    return undefined;
};
const getModelDescription = (modelFamily, uiTarsModelVersion) => {
    if (uiTarsModelVersion) {
        return `UI-TARS=${uiTarsModelVersion}`;
    }
    if (modelFamily) {
        return `${modelFamily} mode`;
    }
    return '';
};
/**
 * Parse OpenAI SDK config
 */
export const parseOpenaiSdkConfig = ({ keys, provider, useLegacyLogic = false, }) => {
    initDebugConfig();
    const debugLog = getDebug('ai:config');
    debugLog('enter parseOpenaiSdkConfig with keys:', keys);
    const legacyAPIKey = useLegacyLogic ? provider[OPENAI_API_KEY] : undefined;
    const legacyBaseURL = useLegacyLogic ? provider[OPENAI_BASE_URL] : undefined;
    const legacySocksProxy = useLegacyLogic
        ? provider[MIDSCENE_OPENAI_SOCKS_PROXY]
        : undefined;
    const legacyHttpProxy = useLegacyLogic
        ? provider[MIDSCENE_OPENAI_HTTP_PROXY]
        : undefined;
    const legacyOpenaiExtraConfig = useLegacyLogic
        ? provider[MIDSCENE_OPENAI_INIT_CONFIG_JSON]
        : undefined;
    const legacyModelFamily = useLegacyLogic
        ? legacyConfigToModelFamily(provider)
        : undefined;
    const modelFamilyRaw = provider[keys.modelFamily] || legacyModelFamily;
    const openaiApiKey = provider[keys.openaiApiKey] || legacyAPIKey;
    const openaiBaseURL = provider[keys.openaiBaseURL] || legacyBaseURL;
    const socksProxy = provider[keys.socksProxy] || legacySocksProxy;
    const httpProxy = provider[keys.httpProxy] || legacyHttpProxy;
    const modelName = provider[keys.modelName];
    const openaiExtraConfigStr = provider[keys.openaiExtraConfig];
    const openaiExtraConfig = parseJson(keys.openaiExtraConfig, openaiExtraConfigStr || legacyOpenaiExtraConfig);
    const temperature = provider[keys.temperature]
        ? Number(provider[keys.temperature])
        : 0;
    const modelFamily = modelFamilyRaw;
    validateModelFamily(modelFamily);
    const uiTarsModelVersion = getUITarsModelVersion(modelFamily);
    const modelDescription = getModelDescription(modelFamily, uiTarsModelVersion);
    return {
        socksProxy,
        httpProxy,
        openaiBaseURL,
        openaiApiKey,
        openaiExtraConfig,
        modelFamily,
        uiTarsModelVersion,
        modelName: modelName,
        modelDescription,
        intent: '-',
        timeout: provider[keys.timeout]
            ? Number(provider[keys.timeout])
            : undefined,
        temperature,
        retryCount: (() => {
            if (!provider[keys.retryCount])
                return 1;
            const val = Number(provider[keys.retryCount]);
            if (!Number.isFinite(val))
                return 1;
            if (val < 0)
                throw new Error(`${keys.retryCount} must be non-negative, got ${val}`);
            return val;
        })(),
        retryInterval: (() => {
            if (!provider[keys.retryInterval])
                return 2000;
            const val = Number(provider[keys.retryInterval]);
            if (!Number.isFinite(val))
                return 2000;
            if (val < 0)
                throw new Error(`${keys.retryInterval} must be non-negative, got ${val}`);
            return val;
        })(),
        reasoningEffort: provider[keys.reasoningEffort]?.trim() || undefined,
        reasoningEnabled: (() => {
            const val = provider[keys.reasoningEnabled]?.trim()?.toLowerCase();
            if (val === 'true' || val === '1')
                return true;
            if (val === 'false' || val === '0')
                return false;
            return undefined;
        })(),
        reasoningBudget: (() => {
            const val = provider[keys.reasoningBudget]?.trim();
            if (!val)
                return undefined;
            const num = Number(val);
            return Number.isFinite(num) ? num : undefined;
        })(),
    };
};
export const decideModelConfigFromIntentConfig = (intent, configMap) => {
    const debugLog = getDebug('ai:config');
    debugLog('will decideModelConfig base on agent.modelConfig()', intent, maskConfig(configMap));
    const keysForFn = KEYS_MAP[intent];
    const modelName = configMap[keysForFn.modelName];
    if (!modelName) {
        debugLog('no modelName found for intent', intent);
        return undefined;
    }
    const finalResult = parseOpenaiSdkConfig({
        keys: keysForFn,
        provider: configMap,
        useLegacyLogic: intent === 'default',
    });
    finalResult.intent = intent;
    debugLog('decideModelConfig result by agent.modelConfig() with intent', intent, maskConfig({ ...finalResult }));
    assert(finalResult.openaiBaseURL, `failed to get base URL of model (intent=${intent}). See https://midscenejs.com/model-strategy`);
    if (!finalResult.modelName) {
        console.warn(`modelName is not set for intent ${intent}, this may cause unexpected behavior. See https://midscenejs.com/model-strategy`);
    }
    return finalResult;
};
