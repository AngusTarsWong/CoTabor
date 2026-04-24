/**
 * Ebbinghaus Forgetting Curve implementation for memory retention scoring.
 *
 * Formula: R(t) = e^(-t / S)
 *   R = retention rate in [0, 1]
 *   t = days elapsed since last access
 *   S = stability (days); grows with each successful retrieval hit
 *
 * Intuition:
 *   - A brand-new memory (S=2) drops to ~0.03 after 7 days → quickly forgotten if unused
 *   - A frequently-hit memory (S=14) retains 0.61 after 7 days → stable knowledge
 *   - stability × 1.5 per hit mirrors spaced-repetition: each review extends the interval
 */

const INITIAL_STABILITY = 2;    // days — new memory starts with a 2-day half-life
const STABILITY_GROWTH = 1.5;   // multiplier applied to stability on each retrieval hit
const MAX_STABILITY = 90;       // cap at 90 days to avoid infinite growth
const MS_PER_DAY = 1000 * 60 * 60 * 24;

export interface EbbinghausFields {
  stability?: number;
  lastAccessedAt?: number;
  updatedAt: number;
}

/**
 * Compute the current Ebbinghaus retention score for a memory record.
 * Returns a value in [0, 1]. Call this lazily at retrieval time.
 */
export function computeRetention(rule: EbbinghausFields): number {
  const S = rule.stability ?? INITIAL_STABILITY;
  const lastTime = rule.lastAccessedAt ?? rule.updatedAt;
  const daysSince = (Date.now() - lastTime) / MS_PER_DAY;
  return Math.exp(-daysSince / S);
}

/**
 * Return the new stability value after a successful retrieval hit.
 * Stability grows by STABILITY_GROWTH multiplier each time and is capped at MAX_STABILITY.
 */
export function growStability(current?: number): number {
  return Math.min((current ?? INITIAL_STABILITY) * STABILITY_GROWTH, MAX_STABILITY);
}

/**
 * Initial stability value to assign when a memory is first written.
 */
export function initialStability(): number {
  return INITIAL_STABILITY;
}
