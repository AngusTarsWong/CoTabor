import { overrideAIConfig } from '@/shared/env';
import { message } from 'antd';
/**
 * Safely override AI configuration with built-in error handling
 * @param newConfig - The configuration to override
 * @param extendMode - Whether to extend or replace the config (default: false)
 * @param showErrorMessage - Whether to show error message in UI (default: true)
 * @returns boolean indicating success
 */
export function safeOverrideAIConfig(newConfig, extendMode = false, showErrorMessage = true) {
    try {
        overrideAIConfig(newConfig, extendMode);
        return true;
    }
    catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        console.error('Failed to override AI config:', err);
        if (showErrorMessage) {
            message.error(`Failed to apply AI configuration: ${err.message}`);
        }
        return false;
    }
}
/**
 * React Hook for safely overriding AI config with error handling
 * Useful for components that need to handle config changes
 */
export function useSafeOverrideAIConfig() {
    const applyConfig = (newConfig, extendMode = false, showErrorMessage = true) => {
        return safeOverrideAIConfig(newConfig, extendMode, showErrorMessage);
    };
    return { applyConfig };
}
