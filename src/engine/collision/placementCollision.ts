import type { Aabb } from "./aabb";
import { faceNormal, sweepXZ, topFaceBelow } from "./aabb";
import type { SpatialHash } from "./spatialHash";
import type { SurfaceQuery, SweepHit } from "./surfaceQuery";

/**
 * Placed objects, answered as an oracle so movement cannot tell them apart
 * from terrain.
 *
 * This is what makes a crate something a character stands on and walks into
 * without the controller learning that placements exist. Movement asks the
 * same two questions it always asks; composing the answers is this module's
 * job.
 */

/** Reused across queries so composition allocates nothing per frame. */
const candidates: Aabb[] = [];
const normal = { x: 0, z: 0 };

/**
 * Combine terrain and placements behind one oracle.
 *
 * Ground takes the higher of the two, so a crate resting on a floor is what
 * the character stands on rather than the floor beneath it. Sweeps take the
 * nearer, so whichever obstruction comes first is the one that stops them.
 *
 * The hash is read through a callback rather than captured, so the oracle
 * built once at start-up keeps answering against whatever the latest committed
 * world is.
 */
export function composeSurfaceQuery(
  terrain: SurfaceQuery,
  hash: () => SpatialHash | null,
): SurfaceQuery {
  return {
    groundAt(x, z, fromY, far) {
      const fromTerrain = terrain.groundAt(x, z, fromY, far);

      const grid = hash();
      if (!grid) return fromTerrain;

      grid.near(x, z, candidates);
      let best = fromTerrain;
      for (const box of candidates) {
        const top = topFaceBelow(box, x, z, fromY);
        if (top === null) continue;
        // Below the reach of the ray is below what the character could have
        // stepped onto, so it is not ground for this query.
        if (top < fromY - far) continue;
        if (best === null || top > best) best = top;
      }
      return best;
    },

    sweep(fromX, fromY, fromZ, dirX, dirZ, distance, radius, out) {
      const hitTerrain = terrain.sweep(
        fromX,
        fromY,
        fromZ,
        dirX,
        dirZ,
        distance,
        radius,
        out,
      );
      let nearest = hitTerrain ? out.distance : Number.POSITIVE_INFINITY;

      const grid = hash();
      if (!grid) return hitTerrain;

      const length = Math.hypot(dirX, dirZ);
      if (length === 0) return hitTerrain;
      const unitX = dirX / length;
      const unitZ = dirZ / length;
      const reach = distance + radius;

      grid.near(fromX, fromZ, candidates);
      let struck = hitTerrain;

      for (const box of candidates) {
        const hit = sweepXZ(box, fromX, fromY, fromZ, unitX, unitZ, reach);
        if (hit === null || hit >= nearest) continue;

        nearest = hit;
        faceNormal(box, fromX + unitX * hit, fromZ + unitZ * hit, normal);
        out.distance = hit;
        out.normalX = normal.x;
        out.normalY = 0;
        out.normalZ = normal.z;
        struck = true;
      }

      return struck;
    },

    // Camera occlusion deliberately ignores placements. A world anyone can
    // build in would otherwise let a visitor drop a crate behind the character
    // and haul the camera into their face, which is both unpleasant and
    // trivially abusable.
    ray(fromX, fromY, fromZ, dirX, dirY, dirZ, far, layer, out: SweepHit) {
      return terrain.ray(fromX, fromY, fromZ, dirX, dirY, dirZ, far, layer, out);
    },
  };
}
