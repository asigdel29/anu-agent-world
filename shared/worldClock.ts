/**
 * Time of day, derived rather than transmitted.
 *
 * The organising principle of the whole simulation is this:
 *
 *   **Continuous state is a pure function of (serverNow, worldSeed).
 *   Discrete state is an append-only log.**
 *
 * Everything follows from it. Continuous state needs no ticks, no storage, and
 * no broadcasts, so an empty world genuinely keeps running at no cost. A
 * visitor arriving mid-storm computes the storm rather than being told about
 * it. Any past moment can be reconstructed exactly, which makes both testing
 * and a future time-lapse trivial.
 *
 * The cost is that every participant must agree on what time it is — which is
 * why the clock offset negotiated on connect is load-bearing rather than
 * garnish. Without it, two visitors standing beside each other see different
 * skies.
 *
 * Imported by both the client and the worker, so the two cannot disagree about
 * the rules.
 */

/** Length of one full day in the world, in real milliseconds. */
export const DAY_MS = 24 * 60_000;

/** The instant the world's clock counts from. */
export const EPOCH = 1_750_000_000_000;

/**
 * Where in the day a moment falls, from 0 (midnight) to 1.
 *
 * Wraps correctly for instants before the epoch, so a clock skewed backwards
 * produces a valid time of day rather than a negative one.
 */
export function dayPhase(now: number): number {
  const elapsed = now - EPOCH;
  return (((elapsed % DAY_MS) + DAY_MS) % DAY_MS) / DAY_MS;
}

/** Whether it is dark. */
export function isNight(now: number): boolean {
  const phase = dayPhase(now);
  return phase < 0.22 || phase > 0.8;
}

/**
 * Sun elevation for a moment, from -1 (midnight) through 1 (noon).
 *
 * A smooth curve rather than a step, so lighting derived from it moves
 * continuously and a client that samples at an arbitrary instant agrees with
 * one that samples a frame later.
 */
export function sunElevation(now: number): number {
  return -Math.cos(dayPhase(now) * Math.PI * 2);
}

/** A deterministic 32-bit hash of a string, used to seed the world. */
export function hash32(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** One step of a deterministic generator, for values derived from a seed. */
export function xorshift32(state: number): number {
  let x = state === 0 ? 0x9e3779b9 : state;
  x ^= x << 13;
  x >>>= 0;
  x ^= x >> 17;
  x ^= x << 5;
  x >>>= 0;
  return x;
}
