import { initDebugConfig } from './init-debug';
import { BOOLEAN_ENV_KEYS, GLOBAL_ENV_KEYS, NUMBER_ENV_KEYS, STRING_ENV_KEYS, } from './types';
import { ALL_ENV_KEYS, MATCH_BY_POSITION, MODEL_ENV_KEYS, } from './types';
/**
 * Collect global configs from process.env, overrideAIConfig, etc.
 * And provider methods to get merged config value
 */
export class GlobalConfigManager {
    override;
    keysHaveBeenRead = {};
    globalModelConfigManager = undefined;
    constructor() {
        initDebugConfig();
    }
    /**
     * recalculate allEnvConfig every time because process.env can be updated any time
     */
    getAllEnvConfig() {
        const envConfig = ALL_ENV_KEYS.reduce((p, name) => {
            p[name] = process.env[name];
            return p;
        }, Object.create(null));
        if (this.override) {
            const { newConfig, extendMode } = this.override;
            if (extendMode) {
                return { ...envConfig, ...newConfig };
            }
            else {
                return { ...newConfig };
            }
        }
        else {
            return envConfig;
        }
    }
    getEnvConfigValue(key) {
        const allConfig = this.getAllEnvConfig();
        if (key === MATCH_BY_POSITION) {
            throw new Error('MATCH_BY_POSITION is discarded, use MIDSCENE_MODEL_FAMILY instead');
        }
        if (!STRING_ENV_KEYS.includes(key)) {
            throw new Error(`getEnvConfigValue with key ${key} is not supported.`);
        }
        const value = allConfig[key];
        this.keysHaveBeenRead[key] = true;
        if (typeof value === 'string') {
            return value.trim();
        }
        return value;
    }
    /**
     * read boolean only from process.env
     */
    getEnvConfigInBoolean(key) {
        const allConfig = this.getAllEnvConfig();
        if (!BOOLEAN_ENV_KEYS.includes(key)) {
            throw new Error(`getEnvConfigInBoolean with key ${key} is not supported`);
        }
        const value = allConfig[key];
        this.keysHaveBeenRead[key] = true;
        if (!value) {
            return false;
        }
        if (/^(true|1)$/i.test(value)) {
            return true;
        }
        if (/^(false|0)$/i.test(value)) {
            return false;
        }
        return !!value.trim();
    }
    /**
     * Read environment variable value and convert it to number.
     * Returns undefined if the value is not set or cannot be converted to a valid number.
     */
    getEnvConfigValueAsNumber(key) {
        if (!STRING_ENV_KEYS.includes(key) &&
            !NUMBER_ENV_KEYS.includes(key)) {
            throw new Error(`getEnvConfigValueAsNumber with key ${key} is not supported.`);
        }
        const allConfig = this.getAllEnvConfig();
        const value = allConfig[key];
        this.keysHaveBeenRead[key] = true;
        if (typeof value !== 'string') {
            return undefined;
        }
        const trimmed = value.trim();
        if (!trimmed) {
            return undefined;
        }
        const numValue = Number(trimmed);
        return Number.isNaN(numValue) ? undefined : numValue;
    }
    registerModelConfigManager(globalModelConfigManager) {
        this.globalModelConfigManager = globalModelConfigManager;
    }
    /**
     * @deprecated use the modelConfig param in Agent constructor instead
     */
    overrideAIConfig(newConfig, extendMode = false) {
        for (const key in newConfig) {
            if (![...GLOBAL_ENV_KEYS, ...MODEL_ENV_KEYS].includes(key)) {
                throw new Error(`Failed to override AI config, invalid key: ${key}`);
            }
            const value = newConfig[key];
            if (typeof value !== 'string') {
                throw new Error(`Failed to override AI config, value for key ${key} must be a string, but got with type ${typeof value}`);
            }
            if (this.keysHaveBeenRead[key]) {
                console.warn(`Warning: try to override AI config with key ${key} ,but it has been read.`);
            }
        }
        const savedNewConfig = extendMode
            ? {
                ...this.override?.newConfig,
                ...newConfig,
            }
            : newConfig;
        this.override = {
            newConfig: {
                ...savedNewConfig,
            },
            extendMode,
        };
        if (!this.globalModelConfigManager) {
            throw new Error('globalModelConfigManager is not registered, which should not happen');
        }
        this.globalModelConfigManager.clearModelConfigMap();
    }
}
