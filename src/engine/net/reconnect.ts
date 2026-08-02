/**
 * When to try the relay again.
 *
 * The failure this schedules for is not one client's bad network but a relay
 * that has just restarted and has every client trying to reconnect at once.
 * Plain exponential backoff does not help there — it synchronises the herd
 * rather than dispersing it, because every client backs off by the same
 * amount from the same instant.
 *
 * So the delay is exponential *and* jittered, with the random source injected
 * so the schedule can be tested rather than sampled.
 */

export interface BackoffPolicy {
  /** Delay after the first failure, before any jitter. */
  readonly baseMs: number;
  /** Longest delay, however many attempts have failed. */
  readonly capMs: number;
  /** Share of the delay that is randomised, from 0 to 1. */
  readonly jitter: number;
}

export const DEFAULT_BACKOFF: BackoffPolicy = {
  baseMs: 500,
  capMs: 20_000,
  jitter: 0.5,
};

/**
 * The delay before attempt `attempt` (counting from zero).
 *
 * `random` returns a value in [0, 1). Jitter subtracts from the delay rather
 * than adding to it, so the cap is a real ceiling rather than a value the
 * jitter can push past.
 */
export function retryDelay(
  attempt: number,
  random: () => number,
  policy: BackoffPolicy = DEFAULT_BACKOFF,
): number {
  const growth = policy.baseMs * 2 ** Math.max(0, attempt);
  const capped = Math.min(policy.capMs, growth);
  return capped * (1 - policy.jitter * random());
}

/**
 * Whether a closed socket should be retried at all.
 *
 * A policy-violation close is the relay saying it does not want this client,
 * and reconnecting into it is how a rate-limited client becomes a
 * reconnection flood. A normal close is the page navigating away. Everything
 * else — a dropped connection, a restarted relay — is worth retrying.
 */
export function shouldRetry(code: number): boolean {
  return code !== 1000 && code !== 1008;
}
