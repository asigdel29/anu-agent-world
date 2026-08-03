import type { Placement, PlacementOp } from "../../engine/placements/placementOps";
import { EPOCH } from "../../../shared/worldClock";

/**
 * What is already on the island when somebody arrives.
 *
 * A world that starts empty reads as unfinished rather than as new, and the
 * catalogue it ships is invisible until somebody happens to place something
 * from it. These few are authored content: a bench where you would sit, a
 * lantern where you arrive, shrubs along the terrace edge.
 *
 * They are deliberately sparse. The empty paved plot is the growth mechanic —
 * an island that arrived full would have nothing for an agent to do, and the
 * fill ratio is what a returning visitor is meant to notice.
 *
 * Placed through the same reducer as everything else, with the same author
 * and expiry fields, so nothing here is a special case the rest of the system
 * has to know about. The author is the world itself, which means these cannot
 * be removed by a visitor: removal is author-scoped, and no visitor is this
 * author.
 */

/** Who owns the placements a world ships with. */
export const WORLD_AUTHOR = "a-world";

interface Seed {
  readonly kind: string;
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
  readonly y?: number;
}

/**
 * Positions are on the island's upper surface, which sits at zero. The
 * terrace tops are the one exception and are given their height explicitly
 * rather than being dropped and hoped for: a seed that starts inside the
 * ground is resolved upward on the first frame and jumps.
 */
const SEEDS: readonly Seed[] = [
  { kind: "lantern", x: 2.4, z: -7.0, yaw: 0 },
  { kind: "bench", x: -1.6, z: -8.6, yaw: Math.PI },
  { kind: "planter", x: 6.5, z: -5.5, yaw: 0.4 },

  // Along the terrace edge, on top of it rather than beside it.
  { kind: "shrub", x: -9.0, z: 5.0, yaw: 0.2, y: 0.6 },
  { kind: "shrub", x: -12.5, z: 3.2, yaw: 1.1, y: 0.6 },
  { kind: "shrub", x: -16.0, z: 6.4, yaw: 2.3, y: 0.6 },

  // Beside the pond.
  { kind: "stone", x: -8.5, z: -12.0, yaw: 0.8 },
  { kind: "shrub", x: -1.5, z: -13.5, yaw: 1.9 },

  // A sign at the plot, which is the thing worth explaining.
  { kind: "sign", x: 4.0, z: 10.5, yaw: -0.3 },
  { kind: "post", x: 15.0, z: 15.5, yaw: 0 },
  { kind: "crate", x: 12.0, z: -16.0, yaw: 0.6 },
];

/**
 * The island's starting placements, as operations the store can apply.
 *
 * Identifiers are fixed rather than generated, so applying the seed twice — a
 * remount, a hot reload — reaches the same world rather than a doubled one.
 */
export function islandSeed(cellSize: number): PlacementOp[] {
  return SEEDS.map((seed, index): PlacementOp => {
    const place: Placement = {
      id: `seed-${index}`,
      kind: seed.kind,
      x: seed.x,
      y: seed.y ?? 0,
      z: seed.z,
      yaw: seed.yaw,
      scale: 1,
      cx: Math.floor(seed.x / cellSize),
      cz: Math.floor(seed.z / cellSize),
      rev: 1,
      authorId: WORLD_AUTHOR,
      // The world's own epoch rather than whenever a page happened to load.
      // These were not created by this visit, and stamping them with it would
      // make a returning visitor's diff claim the island was built while they
      // were away.
      createdAt: EPOCH,
      // Never expires. What the world ships with is not somebody's temporary
      // contribution, and letting the garbage collector eat it after a day
      // would leave the island slowly emptying itself.
      expiresAt: null,
    };
    return { t: "upsert", place };
  });
}
