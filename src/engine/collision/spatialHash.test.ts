import { describe, expect, it } from "vitest";

import type { Aabb } from "./aabb";
import { boxFrom, containsXZ, faceNormal, sweepXZ, topFaceBelow } from "./aabb";
import { buildSpatialHash } from "./spatialHash";

/** A unit crate resting on the ground at (x, z). */
function crate(id: string, x: number, z: number, scale = 1): Aabb {
  return boxFrom(id, x, 0, z, scale, 0.5, 0.5, 0.5, 0.5, true);
}

describe("boxFrom", () => {
  it("sits the box on the ground it was placed at", () => {
    const box = crate("a", 0, 0);
    expect(box.minY).toBeCloseTo(0, 6);
    expect(box.maxY).toBeCloseTo(1, 6);
  });

  it("scales about the placement's origin", () => {
    const box = crate("a", 0, 0, 2);
    expect(box.minY).toBeCloseTo(0, 6);
    expect(box.maxY).toBeCloseTo(2, 6);
    expect(box.minX).toBeCloseTo(-1, 6);
  });
});

describe("containsXZ", () => {
  it("includes points inside the footprint", () => {
    expect(containsXZ(crate("a", 0, 0), 0.2, -0.2)).toBe(true);
  });

  it("excludes points outside it", () => {
    expect(containsXZ(crate("a", 0, 0), 2, 0)).toBe(false);
  });
});

describe("topFaceBelow", () => {
  it("reports the top of a crate underfoot", () => {
    expect(topFaceBelow(crate("a", 0, 0), 0, 0, 1.5)).toBeCloseTo(1, 6);
  });

  it("ignores a crate the query is standing under", () => {
    // Treating it as ground would teleport the character on top of it.
    expect(topFaceBelow(crate("a", 0, 0), 0, 0, 0.2)).toBeNull();
  });

  it("ignores a crate the query is not over", () => {
    expect(topFaceBelow(crate("a", 0, 0), 5, 0, 1.5)).toBeNull();
  });

  it("ignores a kind that cannot be stood on", () => {
    const shrub = boxFrom("s", 0, 0, 0, 1, 0.5, 0.5, 0.5, 0.5, false);
    expect(topFaceBelow(shrub, 0, 0, 1.5)).toBeNull();
  });
});

describe("sweepXZ", () => {
  const box = crate("a", 0, 4);

  it("finds a box directly ahead", () => {
    const hit = sweepXZ(box, 0, 0, 0, 0, 1, 10, 1.8);
    expect(hit).toBeCloseTo(3.5, 6);
  });

  it("misses a box to one side", () => {
    expect(sweepXZ(box, 5, 0, 0, 0, 1, 10, 1.8)).toBeNull();
  });

  it("misses a box beyond the sweep distance", () => {
    expect(sweepXZ(box, 0, 0, 0, 0, 1, 2, 1.8)).toBeNull();
  });

  it("misses a box the body passes entirely beneath", () => {
    // A sign on a post is not something a body walks into at ankle height.
    const overhead = boxFrom("o", 0, 0, 4, 1, 0.5, 0.5, 0.5, 6, false);
    expect(sweepXZ(overhead, 0, 0, 0, 0, 1, 10, 1.8)).toBeNull();
  });

  it("misses a box entirely below the body", () => {
    const sunken = boxFrom("s", 0, -8, 4, 1, 0.5, 0.5, 0.5, 0, false);
    expect(sweepXZ(sunken, 0, 0, 0, 0, 1, 10, 1.8)).toBeNull();
  });

  it("finds a box approached diagonally", () => {
    const corner = crate("c", 4, 4);
    const hit = sweepXZ(corner, 0, 0, 0, 1, 1, 20, 1.8);
    expect(hit).not.toBeNull();
  });
});

describe("faceNormal", () => {
  const out = { x: 0, z: 0 };

  it("reports the face the hit landed on", () => {
    const box = crate("a", 0, 4);
    faceNormal(box, 0, 3.5, out);
    expect(out).toEqual({ x: 0, z: -1 });

    faceNormal(box, -0.5, 4, out);
    expect(out).toEqual({ x: -1, z: 0 });
  });
});

describe("buildSpatialHash", () => {
  it("finds a box in the queried cell", () => {
    const hash = buildSpatialHash([crate("a", 1, 1)], 8);
    const out: Aabb[] = [];
    hash.near(1, 1, out);
    expect(out).toHaveLength(1);
  });

  it("finds a box in a neighbouring cell", () => {
    // A body has width; something just over a boundary is still in reach.
    const hash = buildSpatialHash([crate("a", 9, 1)], 8);
    const out: Aabb[] = [];
    hash.near(7, 1, out);
    expect(out).toHaveLength(1);
  });

  it("ignores a box several cells away", () => {
    const hash = buildSpatialHash([crate("far", 60, 60)], 8);
    const out: Aabb[] = [];
    hash.near(0, 0, out);
    expect(out).toHaveLength(0);
  });

  it("finds a box spanning several cells from any of them", () => {
    const wide = boxFrom("wide", 0, 0, 0, 1, 12, 1, 12, 1, true);
    const hash = buildSpatialHash([wide], 8);

    for (const [x, z] of [
      [-10, -10],
      [10, 10],
      [0, 0],
    ] as const) {
      const out: Aabb[] = [];
      hash.near(x, z, out);
      expect(out).toHaveLength(1);
    }
  });

  it("reports a multi-cell box only once per query", () => {
    const wide = boxFrom("wide", 0, 0, 0, 1, 12, 1, 12, 1, true);
    const hash = buildSpatialHash([wide], 8);
    const out: Aabb[] = [];
    hash.near(0, 0, out);
    expect(out).toHaveLength(1);
  });

  it("reuses the caller's array rather than allocating", () => {
    const hash = buildSpatialHash([crate("a", 0, 0)], 8);
    const out: Aabb[] = [];
    hash.near(0, 0, out);
    const first = out;
    hash.near(40, 40, out);
    expect(out).toBe(first);
    expect(out).toHaveLength(0);
  });

  it("keeps query cost local rather than proportional to the world", () => {
    // This is the whole point: a world with thousands of things built in it
    // must answer a ground query by looking at the few underfoot.
    const boxes: Aabb[] = [];
    for (let i = 0; i < 2000; i += 1) {
      boxes.push(crate(`c${String(i)}`, (i % 50) * 10, Math.floor(i / 50) * 10));
    }
    const hash = buildSpatialHash(boxes, 8);
    const out: Aabb[] = [];
    hash.near(0, 0, out);
    expect(out.length).toBeLessThan(5);
    expect(hash.size()).toBe(2000);
  });
});
