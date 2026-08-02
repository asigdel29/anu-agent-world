import { describe, expect, it } from "vitest";

import { createSpring, omegaFromStiffness, stepSpring } from "./springFollow";
import { angleDelta, shouldAutoFollow, stepAngle } from "./followYaw";

const OMEGA = omegaFromStiffness(60);

function settle(target: number, dt: number, seconds: number, ratio = 1): number {
  const spring = createSpring(0);
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i += 1) stepSpring(spring, target, OMEGA, ratio, dt);
  return spring.value;
}

describe("stepSpring", () => {
  it("approaches its target", () => {
    const spring = createSpring(0);
    stepSpring(spring, 10, OMEGA, 1, 1 / 60);
    expect(spring.value).toBeGreaterThan(0);
    expect(spring.value).toBeLessThan(10);
  });

  it("settles on its target", () => {
    expect(settle(10, 1 / 60, 3)).toBeCloseTo(10, 4);
  });

  it("stays still when already at rest on the target", () => {
    const spring = createSpring(5);
    stepSpring(spring, 5, OMEGA, 1, 1 / 60);
    expect(spring.value).toBeCloseTo(5, 10);
    expect(spring.velocity).toBeCloseTo(0, 10);
  });

  it("produces the same trajectory at 30 and 60 frames per second", () => {
    // The predecessor project closed a fixed fraction of the gap per frame, so
    // the camera lagged further behind on slower hardware and the feel of the
    // game changed with the machine.
    expect(settle(10, 1 / 30, 0.5)).toBeCloseTo(settle(10, 1 / 60, 0.5), 4);
  });

  it("agrees with a much finer timestep", () => {
    expect(settle(10, 1 / 240, 0.5)).toBeCloseTo(settle(10, 1 / 60, 0.5), 3);
  });

  describe("damping", () => {
    it("never overshoots when critically damped", () => {
      const spring = createSpring(0);
      let peak = 0;
      for (let i = 0; i < 300; i += 1) {
        stepSpring(spring, 10, OMEGA, 1, 1 / 60);
        peak = Math.max(peak, spring.value);
      }
      expect(peak).toBeLessThanOrEqual(10.0001);
    });

    it("overshoots when underdamped", () => {
      const spring = createSpring(0);
      let peak = 0;
      for (let i = 0; i < 300; i += 1) {
        stepSpring(spring, 10, OMEGA, 0.3, 1 / 60);
        peak = Math.max(peak, spring.value);
      }
      expect(peak).toBeGreaterThan(10);
    });

    it("settles without overshooting when overdamped", () => {
      const spring = createSpring(0);
      let peak = 0;
      for (let i = 0; i < 900; i += 1) {
        stepSpring(spring, 10, OMEGA, 2.5, 1 / 60);
        peak = Math.max(peak, spring.value);
      }
      expect(peak).toBeLessThanOrEqual(10.0001);
      expect(spring.value).toBeCloseTo(10, 2);
    });

    it("reaches the target more slowly when overdamped than when critical", () => {
      expect(settle(10, 1 / 60, 0.2, 2.5)).toBeLessThan(settle(10, 1 / 60, 0.2, 1));
    });
  });

  it("ignores a non-advancing timestep", () => {
    const spring = createSpring(3);
    stepSpring(spring, 10, OMEGA, 1, 0);
    expect(spring.value).toBe(3);
  });
});

describe("angleDelta", () => {
  it("takes the short way across the seam", () => {
    expect(angleDelta(3.0, -3.0)).toBeCloseTo(2 * Math.PI - 6, 6);
    expect(Math.abs(angleDelta(3.0, -3.0))).toBeLessThan(Math.PI);
  });

  it("is zero for equal angles", () => {
    expect(angleDelta(1.2, 1.2)).toBeCloseTo(0, 10);
  });
});

describe("stepAngle", () => {
  it("closes part of the difference", () => {
    expect(stepAngle(0, 1, 0.5)).toBeCloseTo(0.5, 6);
  });

  it("snaps rather than overshooting when the step exceeds the gap", () => {
    expect(stepAngle(0, 1, 5)).toBeCloseTo(1, 6);
  });

  it("wraps across the seam rather than unwinding the long way", () => {
    const result = stepAngle(3.1, -3.1, 1);
    expect(result).toBeCloseTo(-3.1 + 2 * Math.PI, 6);
  });
});

describe("shouldAutoFollow", () => {
  const WALK = 4;

  it("follows a character running away from the camera", () => {
    expect(shouldAutoFollow(0.9, WALK, WALK, 0.5, 0.6)).toBe(true);
  });

  it("leaves the camera alone during a shuffle", () => {
    // Speed alone would re-centre the view every time the character edges
    // sideways to line up with a door.
    expect(shouldAutoFollow(0.9, WALK * 0.2, WALK, 0.5, 0.6)).toBe(false);
  });

  it("leaves the camera alone when running sideways past it", () => {
    // Alignment alone would swing the view exactly when the player is trying
    // to keep looking where they are looking.
    expect(shouldAutoFollow(0.1, WALK, WALK, 0.5, 0.6)).toBe(false);
  });

  it("leaves the camera alone when running toward it", () => {
    expect(shouldAutoFollow(-0.9, WALK, WALK, 0.5, 0.6)).toBe(false);
  });
});
