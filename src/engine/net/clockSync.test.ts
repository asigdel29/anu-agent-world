import { describe, expect, it } from "vitest";

import type { Sample } from "./clockSync";
import { SAMPLE_WINDOW, addSample, bestOffset, sampleFrom, serverNow } from "./clockSync";

describe("sampleFrom", () => {
  it("finds no offset when the clocks already agree", () => {
    // Sent at 1000, back at 1100, server stamped 1050 halfway through.
    expect(sampleFrom(1000, 1100, 1050)).toEqual({ rtt: 100, offset: 0 });
  });

  it("measures a server running ahead", () => {
    expect(sampleFrom(1000, 1100, 6050).offset).toBe(5000);
  });

  it("measures a server running behind", () => {
    expect(sampleFrom(1000, 1100, -3950).offset).toBe(-5000);
  });

  it("credits half the round trip to the reply", () => {
    // A slow link must not read as a server that is behind.
    const fast = sampleFrom(0, 100, 50);
    const slow = sampleFrom(0, 1000, 500);
    expect(fast.offset).toBe(slow.offset);
  });

  it("never reports a negative round trip", () => {
    expect(sampleFrom(1000, 900, 950).rtt).toBe(0);
  });
});

describe("bestOffset", () => {
  it("returns null before anything is measured", () => {
    expect(bestOffset([])).toBeNull();
  });

  it("keeps the sample with the shortest round trip", () => {
    // Not a mean: a sample stuck behind a slow uplink is asymmetric by
    // exactly its delay, and averaging spreads that error into the answer.
    const samples: Sample[] = [
      { rtt: 800, offset: 900 },
      { rtt: 40, offset: 1000 },
      { rtt: 600, offset: 1200 },
    ];
    expect(bestOffset(samples)).toBe(1000);
  });

  it("is unmoved by a burst of slow samples", () => {
    const good: Sample = { rtt: 30, offset: 500 };
    const noisy = [good, ...Array.from({ length: 20 }, (_, i) => ({ rtt: 900 + i, offset: 900 }))];
    expect(bestOffset(noisy)).toBe(500);
  });
});

describe("addSample", () => {
  it("keeps the window bounded", () => {
    let samples: Sample[] = [];
    for (let i = 0; i < 50; i += 1) samples = addSample(samples, { rtt: i, offset: i });
    expect(samples).toHaveLength(SAMPLE_WINDOW);
  });

  it("forgets old samples rather than holding the best one forever", () => {
    // A laptop that woke from sleep has a different clock than it had an
    // hour ago. Pinning the world to the best-ever sample would keep the
    // stale one.
    let samples: Sample[] = [{ rtt: 1, offset: 999 }];
    for (let i = 0; i < SAMPLE_WINDOW; i += 1) {
      samples = addSample(samples, { rtt: 50, offset: 10 });
    }
    expect(bestOffset(samples)).toBe(10);
  });

  it("keeps the most recent samples, in order", () => {
    let samples: Sample[] = [];
    for (let i = 0; i < SAMPLE_WINDOW + 3; i += 1) {
      samples = addSample(samples, { rtt: 10, offset: i });
    }
    expect(samples.map((s) => s.offset)).toEqual([3, 4, 5, 6, 7, 8, 9, 10]);
  });
});

describe("serverNow", () => {
  it("applies a measured offset", () => {
    expect(serverNow(1000, 250)).toBe(1250);
  });

  it("falls back to the local clock when running solo", () => {
    // A client with no relay still needs a sky.
    expect(serverNow(1000, null)).toBe(1000);
  });
});
