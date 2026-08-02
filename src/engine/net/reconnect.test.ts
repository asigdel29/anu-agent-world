import { describe, expect, it } from "vitest";

import type { BackoffPolicy } from "./reconnect";
import { DEFAULT_BACKOFF, retryDelay, shouldRetry } from "./reconnect";

const noJitter = () => 0;
const fullJitter = () => 0.999999;

describe("retryDelay", () => {
  it("grows exponentially", () => {
    const delays = [0, 1, 2, 3].map((n) => retryDelay(n, noJitter));
    expect(delays).toEqual([500, 1000, 2000, 4000]);
  });

  it("never exceeds the cap, jitter included", () => {
    // Jitter subtracts rather than adds, so the cap is a real ceiling.
    for (let attempt = 0; attempt < 40; attempt += 1) {
      for (const random of [noJitter, fullJitter, () => 0.5]) {
        expect(retryDelay(attempt, random)).toBeLessThanOrEqual(DEFAULT_BACKOFF.capMs);
      }
    }
  });

  it("stays positive however large the attempt", () => {
    expect(retryDelay(1000, fullJitter)).toBeGreaterThan(0);
  });

  it("treats a negative attempt as the first", () => {
    expect(retryDelay(-3, noJitter)).toBe(retryDelay(0, noJitter));
  });

  it("disperses a herd rather than synchronising it", () => {
    // The failure being scheduled for is a relay that restarted with every
    // client reconnecting at once. Undispersed backoff makes that worse.
    const clients = Array.from({ length: 200 }, (_, i) => retryDelay(4, () => i / 200));
    expect(new Set(clients).size).toBeGreaterThan(150);
    expect(Math.max(...clients) - Math.min(...clients)).toBeGreaterThan(1000);
  });

  it("honours a policy passed in", () => {
    const eager: BackoffPolicy = { baseMs: 100, capMs: 300, jitter: 0 };
    expect([0, 1, 2, 3].map((n) => retryDelay(n, noJitter, eager))).toEqual([100, 200, 300, 300]);
  });
});

describe("shouldRetry", () => {
  it("does not reconnect after a normal close", () => {
    // The page is navigating away.
    expect(shouldRetry(1000)).toBe(false);
  });

  it("does not reconnect after a policy violation", () => {
    // The relay has said it does not want this client. Reconnecting into
    // that is how a rate-limited client becomes a reconnection flood.
    expect(shouldRetry(1008)).toBe(false);
  });

  it("reconnects after anything else", () => {
    for (const code of [1001, 1006, 1011, 1012, 1013, 4000]) {
      expect(shouldRetry(code)).toBe(true);
    }
  });
});
