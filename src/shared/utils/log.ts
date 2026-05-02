const isDebug = typeof process !== "undefined"
  ? process.env.VITE_DEBUG_MODE === "true"
  : false;

/**
 * Lightweight structured logger.
 *
 * - log/debug: only emit in debug mode (VITE_DEBUG_MODE=true)
 * - info: always visible, used for key lifecycle events
 * - warn/error: always visible
 */
export const log = {
  debug: (tag: string, ...args: unknown[]) => {
    if (isDebug) console.log(`[${tag}]`, ...args);
  },
  info: (tag: string, ...args: unknown[]) => {
    console.log(`[${tag}]`, ...args);
  },
  warn: (tag: string, ...args: unknown[]) => {
    console.warn(`[${tag}]`, ...args);
  },
  error: (tag: string, ...args: unknown[]) => {
    console.error(`[${tag}]`, ...args);
  },
};
