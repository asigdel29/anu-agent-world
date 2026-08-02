import type { Aabb } from "./aabb";

/**
 * A uniform grid over placed boxes.
 *
 * The property that matters is that query cost tracks local density rather
 * than total count: a world with two thousand things built in it answers a
 * ground query by examining the handful in the cell underfoot, not two
 * thousand. Without that, the frame budget would quietly degrade as the world
 * filled up — the failure arriving weeks after the code that caused it.
 *
 * A box spanning several cells is registered in each, so a query never misses
 * something it overlaps.
 */
export interface SpatialHash {
  /** Boxes overlapping a cell and its eight neighbours. */
  near(x: number, z: number, out: Aabb[]): void;
  /** Every box, in insertion order. */
  all(): readonly Aabb[];
  size(): number;
}

function key(cx: number, cz: number): string {
  return `${String(cx)},${String(cz)}`;
}

/**
 * Build a hash over a set of boxes.
 *
 * Rebuilt wholesale when the world changes rather than mutated in place.
 * Changes arrive in batches at a quarter-second cadence, and a rebuild over a
 * few thousand boxes is cheaper than the bookkeeping that incremental removal
 * would need to stay correct across out-of-order operations.
 */
export function buildSpatialHash(boxes: readonly Aabb[], cellSize: number): SpatialHash {
  const cells = new Map<string, Aabb[]>();

  for (const box of boxes) {
    const minCx = Math.floor(box.minX / cellSize);
    const maxCx = Math.floor(box.maxX / cellSize);
    const minCz = Math.floor(box.minZ / cellSize);
    const maxCz = Math.floor(box.maxZ / cellSize);

    for (let cx = minCx; cx <= maxCx; cx += 1) {
      for (let cz = minCz; cz <= maxCz; cz += 1) {
        const k = key(cx, cz);
        const bucket = cells.get(k);
        if (bucket) bucket.push(box);
        else cells.set(k, [box]);
      }
    }
  }

  return {
    near(x, z, out) {
      out.length = 0;
      const cx = Math.floor(x / cellSize);
      const cz = Math.floor(z / cellSize);

      // The eight neighbours are included because a body has width: something
      // just over a cell boundary is still within reach of a sweep.
      for (let dx = -1; dx <= 1; dx += 1) {
        for (let dz = -1; dz <= 1; dz += 1) {
          const bucket = cells.get(key(cx + dx, cz + dz));
          if (!bucket) continue;
          for (const box of bucket) {
            // A box spanning several cells appears in each of them, so it can
            // be reached more than once in a single query.
            if (!out.includes(box)) out.push(box);
          }
        }
      }
    },

    all() {
      return boxes;
    },

    size() {
      return boxes.length;
    },
  };
}
