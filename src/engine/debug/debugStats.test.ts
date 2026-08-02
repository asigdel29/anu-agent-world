import { describe, expect, it } from "vitest";

import { isDebugEnabled, sampleFps } from "./debugStats";

describe("isDebugEnabled", () => {
  it("is off by default", () => {
    expect(isDebugEnabled("")).toBe(false);
  });

  it("is on when the flag is present", () => {
    expect(isDebugEnabled("?debug")).toBe(true);
    expect(isDebugEnabled("?debug=1")).toBe(true);
  });

  it("is on when the flag sits among other parameters", () => {
    expect(isDebugEnabled("?world=greybox&debug=1")).toBe(true);
  });

  it("ignores unrelated parameters", () => {
    expect(isDebugEnabled("?world=greybox")).toBe(false);
  });
});

describe("sampleFps", () => {
  it("takes the instantaneous rate on the first sample", () => {
    // Smoothing from zero would spend the first second climbing out of a
    // number that was never a measurement.
    expect(sampleFps(0, 1 / 60)).toBeCloseTo(60, 5);
  });

  it("moves toward a new rate without jumping to it", () => {
    const next = sampleFps(60, 1 / 30);
    expect(next).toBeLessThan(60);
    expect(next).toBeGreaterThan(30);
  });

  it("converges on a sustained rate", () => {
    let fps = 60;
    for (let i = 0; i < 200; i += 1) fps = sampleFps(fps, 1 / 30);
    expect(fps).toBeCloseTo(30, 1);
  });

  it("ignores a non-advancing frame rather than dividing by zero", () => {
    expect(sampleFps(60, 0)).toBe(60);
  });
});
