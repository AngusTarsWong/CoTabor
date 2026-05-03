/**
 * Centralized configuration for LLM Client Headers
 * 
 * These headers are injected into API requests (e.g., to OpenRouter)
 * to provide application context, improve brand visibility,
 * and ensure requests are properly attributed to CoTabor.
 */
export function getLlmClientHeaders(): Record<string, string> {
  return {
    "HTTP-Referer": "https://github.com/AngusTarsWong/CoTabor",
    "X-Title": "CoTabor"
  };
}
