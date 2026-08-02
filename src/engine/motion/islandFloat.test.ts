import { describe, expect, it } from "vitest";

import type { DriftShape } from "./islandFloat";
import { createDrift, driftPhase, islandDrift, peakRiseSpeed } from "./islandFloat";

const SHAPE: DriftShape = { rise: 0.045, sway: 0.022, roll: 0.0021, periodSec: 6.4 };

function sample(shape: DriftShape, phase: number, steps = 400) {
  const out = createDrift();
  const ys: number[] = [];
  const xs: number[] = [];
  const rolls: number[] = [];
  for (let i = 0; i < steps; i += 1) {
    islandDrift((i / steps) * shape.periodSec * 4, phase, shape, out);
    ys.push(out.y);
    xs.push(out.x);
    rolls.push(out.roll);
  }
  return { ys, xs, rolls };
}

describe("islandDrift", () => {
  it("stays within its amplitudes", () => {
    const { ys, xs, rolls } = sample(SHAPE, 0);
    expect(Math.max(...ys.map(Math.abs))).toBeLessThanOrEqual(SHAPE.rise + 1e-9);
    expect(Math.max(...xs.map(Math.abs))).toBeLessThanOrEqual(SHAPE.sway + 1e-9);
    expect(Math.max(...rolls.map(Math.abs))).toBeLessThanOrEqual(SHAPE.roll + 1e-9);
  });

  it("actually uses its range rather than barely moving", () => {
    const { ys } = sample(SHAPE, 0);
    expect(Math.max(...ys)).toBeGreaterThan(SHAPE.rise * 0.98);
    expect(Math.min(...ys)).toBeLessThan(-SHAPE.rise * 0.98);
  });

  it("does not drive every axis from one wave", () => {
    // Rise, sway and roll run at different rates so the motion never repeats
    // exactly and never reads as a single sine driving the whole island.
    const out = createDrift();
    islandDrift(1.3, 0, SHAPE, out);
    const ratioXY = out.x / SHAPE.sway / (out.y / SHAPE.rise);
    expect(Math.abs(ratioXY - 1)).toBeGreaterThan(0.05);
  });

  it("returns to where it started after a period", () => {
    const a = islandDrift(0, 0.9, SHAPE, createDrift());
    const b = islandDrift(SHAPE.periodSec * 8, 0.9, SHAPE, createDrift());
    expect(b.y).toBeCloseTo(a.y, 6);
  });

  it("writes into the caller's object rather than allocating", () => {
    const out = createDrift();
    expect(islandDrift(1, 0, SHAPE, out)).toBe(out);
  });

  it("survives a period of zero", () => {
    const out = islandDrift(3, 0, { ...SHAPE, periodSec: 0 }, createDrift());
    for (const n of [out.x, out.y, out.roll]) expect(Number.isFinite(n)).toBe(true);
  });

  it("moves continuously, so two frames apart barely differ", () => {
    // If a frame's worth of drift were visible, it would be motion rather
    // than breathing — and the character would feel the ground twitch.
    const a = islandDrift(10, 0, SHAPE, createDrift());
    const b = islandDrift(10 + 1 / 60, 0, SHAPE, createDrift());
    expect(Math.abs(b.y - a.y)).toBeLessThan(0.002);
  });

  it("gives islands with different phases different positions", () => {
    const a = islandDrift(2, driftPhase("north"), SHAPE, createDrift());
    const b = islandDrift(2, driftPhase("south"), SHAPE, createDrift());
    expect(Math.abs(a.y - b.y)).toBeGreaterThan(1e-6);
  });
});

describe("driftPhase", () => {
  it("is stable for a name", () => {
    // Two visitors on the same island must watch it move identically.
    expect(driftPhase("harbour")).toBe(driftPhase("harbour"));
  });

  it("spreads names across the cycle", () => {
    const phases = ["a", "b", "c", "north", "south", "east", "west", "hub"].map(driftPhase);
    expect(new Set(phases).size).toBe(phases.length);
    for (const p of phases) {
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThan(Math.PI * 2);
    }
  });

  it("handles an empty name", () => {
    expect(Number.isFinite(driftPhase(""))).toBe(true);
  });
});

describe("peakRiseSpeed", () => {
  it("stays far below what the character controller absorbs", () => {
    // The constraint that keeps this decorative rather than a hazard: the
    // ground moves slowly enough that walking on a drifting island is
    // indistinguishable from walking on a still one.
    expect(peakRiseSpeed(SHAPE)).toBeLessThan(0.1);
  });

  it("grows with amplitude and shrinks with period", () => {
    expect(peakRiseSpeed({ ...SHAPE, rise: SHAPE.rise * 2 })).toBeCloseTo(
      peakRiseSpeed(SHAPE) * 2,
      9,
    );
    expect(peakRiseSpeed({ ...SHAPE, periodSec: SHAPE.periodSec * 2 })).toBeCloseTo(
      peakRiseSpeed(SHAPE) / 2,
      9,
    );
  });

  it("catches an island that has been made too lively", () => {
    // What the world validator is for: this is a number somebody could spend.
    expect(peakRiseSpeed({ rise: 1.5, sway: 0, roll: 0, periodSec: 2 })).toBeGreaterThan(0.1);
  });
});
