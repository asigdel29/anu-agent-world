import { describe, expect, it } from "vitest";
import { NearestFilter } from "three";

import { TOON_FLOOR, TOON_STEPS, rampBytes, toonRamp } from "./toonRamp";

describe("rampBytes", () => {
  it("has one value per step", () => {
    expect(rampBytes(4)).toHaveLength(4);
    expect(rampBytes()).toHaveLength(TOON_STEPS);
  });

  it("runs from the floor to full brightness", () => {
    const ramp = rampBytes(4, 0.55);
    expect(ramp[0]).toBe(Math.round(0.55 * 255));
    expect(ramp[ramp.length - 1]).toBe(255);
  });

  it("never reaches black", () => {
    // The decision that makes this a diorama on warm paper rather than a
    // scene lit at night: a face turned away from the sun is dimmer, not dark.
    const ramp = rampBytes();
    expect(ramp[0]).toBeGreaterThan(0.4 * 255);
    expect(TOON_FLOOR).toBeGreaterThan(0.4);
  });

  it("increases at every step", () => {
    const ramp = rampBytes(6);
    for (let i = 1; i < ramp.length; i += 1) {
      expect(ramp[i]!).toBeGreaterThan(ramp[i - 1]!);
    }
  });

  it("gives every step a distinct value, so each one reads", () => {
    for (const steps of [2, 3, 4, 5, 6, 7, 8]) {
      expect(new Set(rampBytes(steps)).size).toBe(steps);
    }
  });

  it("refuses to become a gradient", () => {
    // Beyond about eight the steps stop reading as steps, which is the same
    // as not having done any of this.
    expect(rampBytes(64)).toHaveLength(8);
    expect(rampBytes(1)).toHaveLength(2);
    expect(rampBytes(-5)).toHaveLength(2);
  });

  it("clamps a floor outside the range", () => {
    expect(rampBytes(3, 2)[0]).toBe(255);
    expect(rampBytes(3, -1)[0]).toBe(0);
  });

  it("is sampled without interpolation", () => {
    // The failure this guards against is silent and total: linear filtering
    // blends between the steps and gives back exactly the smooth gradient
    // the ramp exists to remove. Nothing errors; the look just goes away.
    const ramp = toonRamp();
    expect(ramp.magFilter).toBe(NearestFilter);
    expect(ramp.minFilter).toBe(NearestFilter);
    expect(ramp.generateMipmaps).toBe(false);
    expect(ramp.image.width).toBe(TOON_STEPS);
  });

  it("uploads one ramp rather than one per material", () => {
    expect(toonRamp()).toBe(toonRamp());
  });

  it("puts a hard edge between steps rather than a slope", () => {
    // Each step is a jump of the same size; nothing sits between them.
    const ramp = rampBytes(4);
    const gaps = [ramp[1]! - ramp[0]!, ramp[2]! - ramp[1]!, ramp[3]! - ramp[2]!];
    for (const gap of gaps) expect(Math.abs(gap - gaps[0]!)).toBeLessThanOrEqual(1);
    expect(gaps[0]).toBeGreaterThan(20);
  });
});
