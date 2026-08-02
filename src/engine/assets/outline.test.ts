import { describe, expect, it } from "vitest";

import { OUTLINE_MARGIN, hullScale, hullSize } from "./outline";

/** The width of the line an object of this size would actually get. */
function drawnMargin(size: [number, number, number], axis: 0 | 1 | 2): number {
  const scaled = size[axis] * hullScale(size)[axis];
  return (scaled - size[axis]) / 2;
}

describe("hullScale", () => {
  it("grows a cube by the margin on every side", () => {
    const [sx] = hullScale([1, 1, 1], 0.05);
    expect(sx).toBeCloseTo(1.1, 10);
  });

  it("gives every object the same line, whatever its size", () => {
    // The reason this is a per-axis size rather than a scale factor. A plain
    // multiplier makes the outline proportional to the object, so a ground
    // plane gets a band and a lantern gets a hairline.
    const slab: [number, number, number] = [40, 0.5, 40];
    const post: [number, number, number] = [0.2, 3, 0.2];
    for (const axis of [0, 1, 2] as const) {
      expect(drawnMargin(slab, axis)).toBeCloseTo(OUTLINE_MARGIN, 10);
      expect(drawnMargin(post, axis)).toBeCloseTo(OUTLINE_MARGIN, 10);
    }
  });

  it("gives the same line on every axis of a lopsided object", () => {
    const odd: [number, number, number] = [8, 0.25, 1.5];
    const margins = [0, 1, 2].map((axis) => drawnMargin(odd, axis as 0 | 1 | 2));
    for (const m of margins) expect(m).toBeCloseTo(OUTLINE_MARGIN, 10);
  });

  it("always grows, never shrinks", () => {
    for (const size of [0.01, 0.5, 1, 12, 400]) {
      const scale = hullScale([size, size, size]);
      for (const s of scale) expect(s).toBeGreaterThan(1);
    }
  });

  it("leaves a degenerate axis alone rather than dividing by zero", () => {
    // An outline on an axis that does not exist is not meaningful, and the
    // arithmetic for it is an infinity that would blow up a matrix.
    expect(hullScale([2, 0, 2])).toEqual([expect.any(Number), 1, expect.any(Number)]);
    for (const s of hullScale([0, 0, 0])) expect(Number.isFinite(s)).toBe(true);
  });

  it("stays hairline against a character's height", () => {
    // Roughly a centimetre against a body 1.8 units tall: a line, not a border.
    expect(OUTLINE_MARGIN).toBeGreaterThan(0);
    expect(OUTLINE_MARGIN).toBeLessThan(1.8 * 0.02);
  });
});

describe("hullSize", () => {
  it("adds the margin to both sides of each axis", () => {
    expect(hullSize([1, 2, 3], 0.1)).toEqual([1.2, 2.2, 3.2]);
  });

  it("agrees with the scale form", () => {
    // The two exist because an instanced batch shares one matrix buffer and
    // cannot scale its hull separately. They must describe the same object.
    const size: [number, number, number] = [2, 0.4, 5];
    const viaScale = hullScale(size).map((s, i) => s * size[i]!);
    const viaSize = hullSize(size);
    for (let i = 0; i < 3; i += 1) expect(viaSize[i]).toBeCloseTo(viaScale[i]!, 10);
  });
});
