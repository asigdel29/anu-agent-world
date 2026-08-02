import { describe, expect, it } from "vitest";

import { LERP_SPEED, dampFraction, stepAngle } from "./remoteInterp";

const TAU = Math.PI * 2;

describe("dampFraction", () => {
  it("closes nothing in no time and nearly everything in a long frame", () => {
    expect(dampFraction(LERP_SPEED, 0)).toBe(0);
    expect(dampFraction(LERP_SPEED, 10)).toBeCloseTo(1, 6);
  });

  it("never overshoots", () => {
    for (const step of [0.001, 1 / 60, 1 / 6, 1, 100]) {
      const t = dampFraction(LERP_SPEED, step);
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThanOrEqual(1);
    }
  });

  it("converges at the same rate whatever the frame rate", () => {
    // The property that matters: the same world must not feel different on a
    // 120 Hz display and a struggling phone.
    const close = (steps: number, step: number) => {
      let gap = 1;
      for (let i = 0; i < steps; i += 1) gap -= gap * dampFraction(LERP_SPEED, step);
      return gap;
    };
    expect(close(120, 1 / 120)).toBeCloseTo(close(30, 1 / 30), 6);
    expect(close(60, 1 / 60)).toBeCloseTo(close(30, 1 / 30), 6);
  });
});

describe("stepAngle", () => {
  it("moves part of the way towards the target", () => {
    expect(stepAngle(0, 1, 0.5)).toBeCloseTo(0.5, 10);
  });

  it("arrives exactly when the fraction is one", () => {
    expect(stepAngle(0, 1, 1)).toBeCloseTo(1, 10);
  });

  it("turns the short way across the seam", () => {
    // From just under a half turn to just over it is a few degrees, not most
    // of the way round the other way.
    const from = Math.PI - 0.1;
    const to = -Math.PI + 0.1;
    const stepped = stepAngle(from, to, 1);
    const travelled = Math.abs(Math.atan2(Math.sin(stepped - from), Math.cos(stepped - from)));
    expect(travelled).toBeCloseTo(0.2, 6);
  });

  it("does not spin for a full turn's difference", () => {
    expect(Math.abs(stepAngle(0, TAU, 1))).toBeCloseTo(0, 6);
  });

  it("clamps a fraction outside zero to one", () => {
    expect(stepAngle(0, 1, 5)).toBeCloseTo(1, 10);
    expect(stepAngle(0, 1, -5)).toBeCloseTo(0, 10);
  });

  it("converges from any starting angle", () => {
    for (const from of [-10, -Math.PI, 0, 1.5, Math.PI, 10]) {
      let angle = from;
      for (let i = 0; i < 200; i += 1) angle = stepAngle(angle, 1, 0.2);
      const gap = Math.abs(Math.atan2(Math.sin(angle - 1), Math.cos(angle - 1)));
      expect(gap).toBeCloseTo(0, 6);
    }
  });
});
