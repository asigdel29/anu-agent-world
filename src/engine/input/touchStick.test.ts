import { describe, expect, it } from "vitest";

import { DEAD_ZONE, createAxes, knobOffset, stickAxes } from "./touchStick";

const R = 60;
const axes = (dx: number, dy: number, radius = R) => stickAxes(dx, dy, radius, createAxes());

describe("stickAxes", () => {
  it("reads a resting thumb as still", () => {
    expect(axes(0, 0)).toEqual({ x: 0, y: 0 });
    expect(axes(R * DEAD_ZONE * 0.5, 0)).toEqual({ x: 0, y: 0 });
  });

  it("starts from nothing when the dead zone is crossed", () => {
    // The failure this avoids: reporting distance/radius means the instant a
    // thumb passes the boundary the character leaps to a third of walking
    // speed. Movement should begin at nothing and grow.
    const justOut = R * DEAD_ZONE + 0.5;
    expect(Math.abs(axes(justOut, 0).x)).toBeLessThan(0.05);
  });

  it("grows smoothly from the dead zone to the ring", () => {
    const steps = 200;
    let previous = 0;
    for (let i = 0; i <= steps; i += 1) {
      const d = R * DEAD_ZONE + ((R - R * DEAD_ZONE) * i) / steps;
      const value = axes(d, 0).x;
      expect(value).toBeGreaterThanOrEqual(previous - 1e-9);
      // No step anywhere along the travel, which is the property that makes
      // it feel like a stick rather than a switch.
      expect(value - previous).toBeLessThan(0.02);
      previous = value;
    }
    expect(previous).toBeCloseTo(1, 6);
  });

  it("reaches full deflection at the ring", () => {
    expect(axes(R, 0).x).toBeCloseTo(1, 6);
    expect(axes(0, -R).y).toBeCloseTo(-1, 6);
  });

  it("clamps beyond the ring rather than growing", () => {
    expect(axes(R * 5, 0).x).toBeCloseTo(1, 6);
  });

  it("keeps a diagonal from outrunning a straight line", () => {
    // Clamping the axes separately is the classic way a character moves
    // faster along the diagonals than along the axes.
    const diagonal = axes(R * 5, R * 5);
    expect(Math.hypot(diagonal.x, diagonal.y)).toBeLessThanOrEqual(1 + 1e-9);
    expect(Math.hypot(diagonal.x, diagonal.y)).toBeCloseTo(1, 6);
  });

  it("preserves direction through the clamp", () => {
    const far = axes(300, 150);
    expect(far.y / far.x).toBeCloseTo(0.5, 6);
  });

  it("never exceeds the unit circle, for any drag", () => {
    for (let angle = 0; angle < Math.PI * 2; angle += 0.2) {
      for (const d of [0, 5, 20, R, R * 3]) {
        const value = axes(Math.cos(angle) * d, Math.sin(angle) * d);
        expect(Math.hypot(value.x, value.y)).toBeLessThanOrEqual(1 + 1e-9);
      }
    }
  });

  it("writes into the caller's object rather than allocating", () => {
    const out = createAxes();
    expect(stickAxes(10, 10, R, out)).toBe(out);
  });

  it("survives a radius of zero", () => {
    const value = axes(5, 5, 0);
    expect(Number.isFinite(value.x)).toBe(true);
    expect(Number.isFinite(value.y)).toBe(true);
  });

  it("refuses a dead zone that would swallow the whole stick", () => {
    const value = stickAxes(R, 0, R, createAxes(), 5);
    expect(value.x).toBeGreaterThan(0);
  });
});

describe("knobOffset", () => {
  it("follows the thumb inside the ring", () => {
    expect(knobOffset(10, -20, R, createAxes())).toEqual({ x: 10, y: -20 });
  });

  it("holds the knob at the ring beyond it", () => {
    const held = knobOffset(300, 0, R, createAxes());
    expect(held.x).toBeCloseTo(R, 6);
  });

  it("keeps the direction when held", () => {
    const held = knobOffset(300, 300, R, createAxes());
    expect(Math.hypot(held.x, held.y)).toBeCloseTo(R, 6);
    expect(held.x).toBeCloseTo(held.y, 6);
  });

  it("survives no movement at all", () => {
    expect(knobOffset(0, 0, R, createAxes())).toEqual({ x: 0, y: 0 });
  });
});
