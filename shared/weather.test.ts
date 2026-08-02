import { describe, expect, it } from "vitest";

import type { Beat } from "./weather";
import { WEATHER_PERIOD_MS, effectiveWeather, weatherFor } from "./weather";
import { DAY_MS, EPOCH, dayPhase, isNight, sunElevation } from "./worldClock";

const SEED = "greybox-7f3a91c4";

describe("dayPhase", () => {
  it("starts the day at the epoch", () => {
    expect(dayPhase(EPOCH)).toBeCloseTo(0, 10);
  });

  it("reaches the middle of the day halfway through", () => {
    expect(dayPhase(EPOCH + DAY_MS / 2)).toBeCloseTo(0.5, 10);
  });

  it("wraps around at the end of a day", () => {
    expect(dayPhase(EPOCH + DAY_MS)).toBeCloseTo(0, 10);
  });

  it("handles instants before the epoch", () => {
    // A clock skewed backwards must still produce a valid time of day.
    const phase = dayPhase(EPOCH - DAY_MS / 4);
    expect(phase).toBeGreaterThanOrEqual(0);
    expect(phase).toBeLessThan(1);
    expect(phase).toBeCloseTo(0.75, 10);
  });
});

describe("sunElevation", () => {
  it("is lowest at the start of the day and highest at its middle", () => {
    expect(sunElevation(EPOCH)).toBeCloseTo(-1, 6);
    expect(sunElevation(EPOCH + DAY_MS / 2)).toBeCloseTo(1, 6);
  });

  it("moves continuously, so two samples a frame apart agree", () => {
    const a = sunElevation(EPOCH + DAY_MS * 0.3);
    const b = sunElevation(EPOCH + DAY_MS * 0.3 + 16);
    expect(Math.abs(a - b)).toBeLessThan(0.01);
  });
});

describe("isNight", () => {
  it("is dark at the start of the day", () => {
    expect(isNight(EPOCH)).toBe(true);
  });

  it("is light in the middle of the day", () => {
    expect(isNight(EPOCH + DAY_MS / 2)).toBe(false);
  });
});

describe("weatherFor", () => {
  it("gives the same answer for the same moment and seed", () => {
    // This is the property the whole design rests on: nothing needs to be
    // stored or sent, because everyone can compute it.
    const now = EPOCH + 12345678;
    expect(weatherFor(now, SEED)).toEqual(weatherFor(now, SEED));
  });

  it("gives different worlds different weather", () => {
    const now = EPOCH + 12345678;
    const a: string[] = [];
    const b: string[] = [];
    for (let i = 0; i < 40; i += 1) {
      const t = now + i * WEATHER_PERIOD_MS;
      a.push(weatherFor(t, "world-a").kind);
      b.push(weatherFor(t, "world-b").kind);
    }
    expect(a).not.toEqual(b);
  });

  it("holds steady within a period and may change between them", () => {
    const base = EPOCH + WEATHER_PERIOD_MS * 10;
    const early = weatherFor(base + 1000, SEED).kind;
    const late = weatherFor(base + WEATHER_PERIOD_MS - 1000, SEED).kind;
    expect(early).toBe(late);
  });

  it("ramps in and out rather than snapping", () => {
    const base = EPOCH + WEATHER_PERIOD_MS * 10;
    expect(weatherFor(base + 100, SEED).intensity).toBeLessThan(0.2);
    expect(weatherFor(base + WEATHER_PERIOD_MS / 2, SEED).intensity).toBeCloseTo(1, 6);
    expect(weatherFor(base + WEATHER_PERIOD_MS - 100, SEED).intensity).toBeLessThan(0.2);
  });

  it("produces a valid kind for any moment", () => {
    for (let i = 0; i < 500; i += 1) {
      const w = weatherFor(EPOCH + i * WEATHER_PERIOD_MS * 7, SEED);
      expect(typeof w.kind).toBe("string");
      expect(w.intensity).toBeGreaterThanOrEqual(0);
      expect(w.intensity).toBeLessThanOrEqual(1);
    }
  });

  it("works for moments before the epoch", () => {
    const w = weatherFor(EPOCH - WEATHER_PERIOD_MS * 3, SEED);
    expect(w.intensity).toBeGreaterThanOrEqual(0);
    expect(w.intensity).toBeLessThanOrEqual(1);
  });
});

describe("effectiveWeather", () => {
  const now = EPOCH + WEATHER_PERIOD_MS * 5;

  it("falls back to the baseline when no beat is in force", () => {
    expect(effectiveWeather(now, SEED, null).from).toBe("derived");
  });

  it("uses a beat while it is in force", () => {
    const beat: Beat = { kind: "rain", startsAt: now - 1000, endsAt: now + 60_000 };
    const weather = effectiveWeather(now, SEED, beat);
    expect(weather.kind).toBe("rain");
    expect(weather.from).toBe("beat");
  });

  it("ignores a beat that has not started", () => {
    const beat: Beat = { kind: "rain", startsAt: now + 60_000, endsAt: now + 120_000 };
    expect(effectiveWeather(now, SEED, beat).from).toBe("derived");
  });

  it("ignores a beat that has ended", () => {
    const beat: Beat = { kind: "rain", startsAt: now - 120_000, endsAt: now - 60_000 };
    expect(effectiveWeather(now, SEED, beat).from).toBe("derived");
  });

  it("keeps the sky changing when the director never runs", () => {
    // The director is garnish over something that already works, which is why
    // it is the first thing that can be switched off under cost pressure.
    const kinds = new Set<string>();
    for (let i = 0; i < 60; i += 1) {
      kinds.add(effectiveWeather(now + i * WEATHER_PERIOD_MS, SEED, null).kind);
    }
    expect(kinds.size).toBeGreaterThan(1);
  });

  it("reconstructs any past moment exactly", () => {
    // Replay is free, which is what makes a time-lapse possible later.
    const past = now - WEATHER_PERIOD_MS * 37;
    expect(effectiveWeather(past, SEED, null)).toEqual(effectiveWeather(past, SEED, null));
  });
});
