/**
 * Agreeing with the relay about what time it is.
 *
 * Time of day and weather are *derived* from server time rather than sent,
 * which is what lets an empty world keep running at no cost and lets a
 * visitor arriving mid-storm compute the storm instead of being told about
 * it. The price of that decision is paid here: if two clients disagree about
 * the time, they disagree about the sky, and two people standing beside each
 * other see different weather.
 *
 * So the offset is not garnish. It is the mechanism that makes a derived
 * simulation shared rather than merely cheap.
 *
 * The estimator is the usual round-trip one, and its usual assumption — that
 * the trip out and the trip back took the same time — is wrong in exactly the
 * way that matters: a delayed packet is delayed in one direction. Hence the
 * rule below. Rather than averaging samples, keep the one with the *lowest*
 * round trip, because a fast round trip has less room to hide an asymmetry.
 * Averaging would fold every slow, lopsided sample into the answer.
 */

export interface Sample {
  /** How long the round trip took. */
  readonly rtt: number;
  /** How far ahead of the local clock the server is. */
  readonly offset: number;
}

/**
 * Build a sample from one exchange.
 *
 * `sentAt` and `receivedAt` are local; `serverTime` is what the relay stamped
 * when it replied. The server's stamp is assumed to have been taken halfway
 * through the trip.
 */
export function sampleFrom(sentAt: number, receivedAt: number, serverTime: number): Sample {
  const rtt = Math.max(0, receivedAt - sentAt);
  return { rtt, offset: serverTime + rtt / 2 - receivedAt };
}

/**
 * The best offset from a set of samples, or null when there are none.
 *
 * Lowest round trip wins. This is deliberately not a mean: one sample stuck
 * behind a slow uplink is asymmetric by exactly its delay, and averaging
 * spreads that error across the answer instead of discarding it.
 */
export function bestOffset(samples: readonly Sample[]): number | null {
  let best: Sample | null = null;
  for (const sample of samples) {
    if (best === null || sample.rtt < best.rtt) best = sample;
  }
  return best === null ? null : best.offset;
}

/** How many samples are retained. */
export const SAMPLE_WINDOW = 8;

/**
 * Add a sample, keeping only the most recent few.
 *
 * Bounded because a connection open for an hour would otherwise accumulate
 * thousands, and because an old sample is not evidence about the present: a
 * laptop that woke from sleep has a different clock than it had an hour ago,
 * and holding the best-ever sample would pin the world to the stale one.
 */
export function addSample(
  samples: readonly Sample[],
  sample: Sample,
  window: number = SAMPLE_WINDOW,
): Sample[] {
  return [...samples, sample].slice(-window);
}

/**
 * What time the world thinks it is.
 *
 * Falls back to the local clock when nothing has been measured yet, which is
 * right rather than merely convenient: a client running solo has no relay to
 * agree with and must still have a sky.
 */
export function serverNow(localNow: number, offset: number | null): number {
  return localNow + (offset ?? 0);
}
