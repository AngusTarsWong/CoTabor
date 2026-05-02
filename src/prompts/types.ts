/**
 * Base type for all prompt templates in CoTabor.
 *
 * - `system`: Static system prompt string (no variable interpolation).
 * - `user`: Function that accepts dynamic variables and returns the user prompt string.
 *
 * Keeping prompts in dedicated files makes them easy to find, read, and modify
 * without touching business logic.
 */
export interface PromptTemplate<T extends Record<string, unknown> = Record<string, unknown>> {
  /** Static string or function that receives vars and returns the system prompt. */
  system: string | ((vars: T) => string);
  /** Function that receives vars and returns the user prompt. */
  user: (vars: T) => string;
}

/** Resolve system prompt — handles both static string and dynamic function forms. */
export function resolveSystem<T extends Record<string, unknown>>(
  prompt: PromptTemplate<T>,
  vars: T,
): string {
  return typeof prompt.system === "function" ? prompt.system(vars) : prompt.system;
}

/** Prompt with only a system message (no dynamic user turn). */
export interface SystemOnlyPrompt {
  system: string;
}

/** Prompt built entirely at call-site from dynamic vars (no static system). */
export interface DynamicPrompt<T extends Record<string, unknown> = Record<string, unknown>> {
  build: (vars: T) => string;
}
