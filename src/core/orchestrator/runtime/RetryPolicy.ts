export interface RetryDecision {
  shouldRetry: boolean;
  delayMs: number;
}

const DEFAULT_BASE_DELAY_MS = 500;
const DEFAULT_MAX_DELAY_MS = 5000;

export function computeRetryDecision(
  attempt: number,
  maxAttempts: number,
  retryable: boolean,
  baseDelayMs = DEFAULT_BASE_DELAY_MS,
  maxDelayMs = DEFAULT_MAX_DELAY_MS,
): RetryDecision {
  if (!retryable || attempt >= maxAttempts) {
    return { shouldRetry: false, delayMs: 0 };
  }

  const exp = Math.max(0, attempt - 1);
  const delayMs = Math.min(baseDelayMs * Math.pow(2, exp), maxDelayMs);
  return {
    shouldRetry: true,
    delayMs,
  };
}
