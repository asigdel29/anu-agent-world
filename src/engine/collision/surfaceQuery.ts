import { Raycaster, Vector3 } from "three";

import type { ColliderRegistry } from "./colliderRegistry";

/**
 * The only view of world geometry that movement is allowed to have.
 *
 * The predecessor project's character controller owned its own raycaster,
 * scratch vectors, and collision decisions inside a single three-hundred-line
 * frame callback. That made the movement rules — the part most worth being
 * confident about — impossible to exercise without standing up a live scene,
 * so in practice they were never tested at all.
 *
 * Narrowing the dependency to two questions lets movement become a pure
 * function over an oracle: implemented once against three.js for the running
 * game, and once as a plain fake for tests, where a staircase is a few lines
 * of arithmetic rather than a loaded asset.
 */

/**
 * What a forward sweep struck.
 *
 * Filled in place by {@link SurfaceQuery.sweep} rather than returned, because
 * a sweep runs several times per frame and returning a fresh object from each
 * one is how a frame-time graph acquires a sawtooth.
 */
export interface SweepHit {
  /** Distance from the ray origin to the surface. */
  distance: number;
  /** Surface normal at the point struck. */
  normalX: number;
  normalY: number;
  normalZ: number;
}

/** An empty hit record for callers to reuse. */
export function createSweepHit(): SweepHit {
  return { distance: 0, normalX: 0, normalY: 1, normalZ: 0 };
}

export interface SurfaceQuery {
  /**
   * Height of the walkable surface beneath a point, or null when there is
   * none within reach.
   *
   * @param x     world x to test
   * @param z     world z to test
   * @param fromY height the downward ray starts at; callers raise this above
   *              the character so that a step is visible to the ray
   * @param far   how far the ray reaches
   */
  groundAt(x: number, z: number, fromY: number, far: number): number | null;

  /**
   * Test for an obstruction along a horizontal direction, writing the nearest
   * hit into `out`.
   *
   * @param fromY    ray origin height, already offset to the cast height
   * @param dirX     horizontal direction; need not be normalised
   * @param dirZ     horizontal direction; need not be normalised
   * @param distance how far ahead to test, excluding the body radius
   * @param radius   body radius, added to the tested distance
   * @param out      receives the hit; untouched when nothing was struck
   * @returns whether anything was struck
   */
  sweep(
    fromX: number,
    fromY: number,
    fromZ: number,
    dirX: number,
    dirZ: number,
    distance: number,
    radius: number,
    out: SweepHit,
  ): boolean;
}

/**
 * A surface oracle backed by three.js raycasting against the collider
 * registry. All working state is allocated once and reused.
 */
export function createSurfaceQuery(registry: ColliderRegistry): SurfaceQuery {
  const raycaster = new Raycaster();
  const origin = new Vector3();
  const direction = new Vector3();
  const down = new Vector3(0, -1, 0);

  return {
    groundAt(x, z, fromY, far) {
      origin.set(x, fromY, z);
      raycaster.set(origin, down);
      raycaster.far = far;
      const hits = raycaster.intersectObjects(registry.all() as never[], true);
      const first = hits[0];
      return first ? first.point.y : null;
    },

    sweep(fromX, fromY, fromZ, dirX, dirZ, distance, radius, out) {
      const length = Math.hypot(dirX, dirZ);
      if (length === 0) return false;

      origin.set(fromX, fromY, fromZ);
      direction.set(dirX / length, 0, dirZ / length);
      raycaster.set(origin, direction);
      raycaster.far = distance + radius;

      const hits = raycaster.intersectObjects(registry.all() as never[], true);
      const first = hits[0];
      if (!first) return false;

      out.distance = first.distance;
      const normal = first.normal;
      out.normalX = normal ? normal.x : 0;
      out.normalY = normal ? normal.y : 1;
      out.normalZ = normal ? normal.z : 0;
      return true;
    },
  };
}
