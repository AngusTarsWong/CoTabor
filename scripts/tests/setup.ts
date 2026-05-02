/**
 * Shared test bootstrap — imported automatically by all unit tests.
 *
 * Provides:
 *  - dotenv: reads .env so API keys are available without manual export
 *  - fake-indexeddb: in-memory IndexedDB polyfill (no browser required)
 *  - requestAnimationFrame / cancelAnimationFrame: needed by LangGraph internals
 *
 * Usage in unit test files:
 *   import "../../setup.js";   // path relative to scripts/tests/unit/
 */

import "dotenv/config";
import "fake-indexeddb/auto";

if (typeof requestAnimationFrame === "undefined") {
  (globalThis as any).requestAnimationFrame = (cb: FrameRequestCallback) =>
    setTimeout(cb, 0);
}
if (typeof cancelAnimationFrame === "undefined") {
  (globalThis as any).cancelAnimationFrame = (id: number) => clearTimeout(id);
}
