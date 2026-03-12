import { GlobalConfigManager } from './global-config-manager';
import { ModelConfigManager } from './model-config-manager';
import { MIDSCENE_PREFERRED_LANGUAGE, } from './types';
export const globalModelConfigManager = new ModelConfigManager();
export const globalConfigManager = new GlobalConfigManager();
globalConfigManager.registerModelConfigManager(globalModelConfigManager);
globalModelConfigManager.registerGlobalConfigManager(globalConfigManager);
/**
 * Get the current timestamp, optionally from the target device.
 *
 * When useDeviceTimestamp is enabled and a device with getTimestamp is provided,
 * this function will return the device's time. Otherwise, it returns the system time.
 *
 * This is useful when:
 * - Testing on devices with different time zones
 * - Debugging time-sensitive features
 * - The system clock and device clock are not synchronized
 *
 * @param device Optional device interface that supports getTimestamp
 * @param useDeviceTimestamp Whether to use device timestamp (from agent config)
 * @returns Timestamp in milliseconds
 *
 * @example
 * // Without device - always returns system time
 * const systemTime = await getCurrentTime();
 *
 * @example
 * // With device and config enabled - returns device time
 * const deviceTime = await getCurrentTime(androidDevice, true);
 */
export async function getCurrentTime(device, useDeviceTimestamp) {
    if (useDeviceTimestamp && device?.getTimestamp) {
        try {
            return await device.getTimestamp();
        }
        catch (error) {
            // Fall back to system time if device time retrieval fails
            console.warn(`Failed to get device time, falling back to system time: ${error}`);
            return Date.now();
        }
    }
    return Date.now();
}
export const getPreferredLanguage = () => {
    const prefer = globalConfigManager.getEnvConfigValue(MIDSCENE_PREFERRED_LANGUAGE);
    if (prefer) {
        return prefer;
    }
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const isChina = timeZone === 'Asia/Shanghai';
    return isChina ? 'Chinese' : 'English';
};
export const overrideAIConfig = (newConfig, extendMode = false) => {
    globalConfigManager.overrideAIConfig(newConfig, extendMode);
};
