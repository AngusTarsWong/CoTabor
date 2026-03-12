// Avoid circular dependency: don't import from @/core
// Instead, use generic types that will be provided by implementation
/**
 * Default timeout constants for app loading verification
 */
export const defaultAppLoadingTimeoutMs = 10000;
export const defaultAppLoadingCheckIntervalMs = 2000;
