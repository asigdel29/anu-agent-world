import { describe, expect, it } from "vitest";

import type { Aabb } from "./aabb";
import { boxFrom } from "./aabb";
import { composeSurfaceQuery } from "./placementCollision";
import { buildSpatialHash } from "./spatialHash";
import type { SurfaceQuery, SweepHit } from "./surfaceQuery";
import { createSweepHit } from "./surfaceQuery";

/** Flat terrain at y = 0 with nothing to walk into. */
const flatTerrain: SurfaceQuery = {
  groundAt: () => 0,
  sweep: () => false,
  ray: () => false,
};

/** Terrain with a wall across z = 6. */
const walledTerrain: SurfaceQuery = {
  groundAt: () => 0,
  sweep: (_fx, _fy, fz, _dx, dz, distance, radius, out: SweepHit) => {
    if (dz <= 0) return false;
    const gap = 6 - fz;
    if (gap < 0 || gap > distance + radius) return false;
    out.distance = gap;
    out.normalX = 0;
    out.normalY = 0;
    out.normalZ = -1;
    return true;
  },
  ray: () => false,
};

function crate(id: string, x: number, z: number, y = 0): Aabb {
  return boxFrom(id, x, y, z, 1, 0.5, 0.5, 0.5, 0.5, true);
}

function withCrates(terrain: SurfaceQuery, boxes: Aabb[]): SurfaceQuery {
  const hash = buildSpatialHash(boxes, 8);
  return composeSurfaceQuery(terrain, () => hash);
}

describe("composeSurfaceQuery", () => {
  describe("ground", () => {
    it("returns terrain height where nothing is placed", () => {
      const query = withCrates(flatTerrain, []);
      expect(query.groundAt(0, 0, 3, 12)).toBe(0);
    });

    it("stands the character on a crate rather than the floor beneath it", () => {
      const query = withCrates(flatTerrain, [crate("a", 0, 0)]);
      expect(query.groundAt(0, 0, 3, 12)).toBeCloseTo(1, 6);
    });

    it("takes the highest of several stacked crates", () => {
      const query = withCrates(flatTerrain, [crate("a", 0, 0), crate("b", 0, 0, 1)]);
      expect(query.groundAt(0, 0, 5, 12)).toBeCloseTo(2, 6);
    });

    it("ignores a crate the character is standing under", () => {
      const query = withCrates(flatTerrain, [crate("over", 0, 0, 4)]);
      expect(query.groundAt(0, 0, 1, 12)).toBe(0);
    });

    it("ignores a crate outside the queried column", () => {
      const query = withCrates(flatTerrain, [crate("aside", 20, 0)]);
      expect(query.groundAt(0, 0, 3, 12)).toBe(0);
    });

    it("ignores a crate beyond the ray's reach", () => {
      // Below what the character could have stepped onto is not ground.
      const query = withCrates(flatTerrain, [crate("deep", 0, 0, -50)]);
      expect(query.groundAt(0, 0, 3, 12)).toBe(0);
    });

    it("works before any placements exist", () => {
      const query = composeSurfaceQuery(flatTerrain, () => null);
      expect(query.groundAt(0, 0, 3, 12)).toBe(0);
    });
  });

  describe("sweeps", () => {
    const out = createSweepHit();

    it("reports nothing when the way is clear", () => {
      const query = withCrates(flatTerrain, []);
      expect(query.sweep(0, 1, 0, 0, 1, 4, 0.35, out)).toBe(false);
    });

    it("stops at a placed crate", () => {
      const query = withCrates(flatTerrain, [crate("a", 0, 4)]);
      expect(query.sweep(0, 1, 0, 0, 1, 6, 0.35, out)).toBe(true);
      expect(out.distance).toBeCloseTo(3.5, 6);
    });

    it("reports the nearer of terrain and a placement", () => {
      // A crate in front of a wall is what stops the character.
      const query = withCrates(walledTerrain, [crate("a", 0, 3)]);
      expect(query.sweep(0, 1, 0, 0, 1, 8, 0.35, out)).toBe(true);
      expect(out.distance).toBeCloseTo(2.5, 6);
    });

    it("keeps the terrain hit when it is the nearer one", () => {
      const query = withCrates(walledTerrain, [crate("a", 0, 20)]);
      expect(query.sweep(0, 1, 0, 0, 1, 8, 0.35, out)).toBe(true);
      expect(out.distance).toBeCloseTo(6, 6);
    });

    it("reports an outward normal so the character slides along the face", () => {
      const query = withCrates(flatTerrain, [crate("a", 0, 4)]);
      query.sweep(0, 1, 0, 0, 1, 6, 0.35, out);
      expect(out.normalZ).toBeCloseTo(-1, 6);
      expect(out.normalY).toBe(0);
    });

    it("ignores a crate the body passes entirely over", () => {
      const flat = boxFrom("tile", 0, 0, 4, 1, 0.5, 0.02, 0.5, -1, false);
      const query = withCrates(flatTerrain, [flat]);
      expect(query.sweep(0, 1, 0, 0, 1, 6, 0.35, out)).toBe(false);
    });
  });

  describe("camera occlusion", () => {
    it("ignores placements entirely", () => {
      // A world anyone can build in would otherwise let a visitor drop a crate
      // behind the character and haul the camera into their face.
      let asked = false;
      const terrain: SurfaceQuery = {
        groundAt: () => 0,
        sweep: () => false,
        ray: () => {
          asked = true;
          return false;
        },
      };
      const query = withCrates(terrain, [crate("a", 0, 1)]);

      expect(query.ray(0, 2, 0, 0, 0.5, 1, 10, "structure", createSweepHit())).toBe(false);
      expect(asked).toBe(true);
    });
  });
});
