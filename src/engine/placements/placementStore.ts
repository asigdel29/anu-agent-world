import type { Aabb } from "../collision/aabb";
import { boxFrom } from "../collision/aabb";
import type { SpatialHash } from "../collision/spatialHash";
import { buildSpatialHash } from "../collision/spatialHash";
import type { PropCatalog } from "./catalogTypes";
import type { PlacementLimits, PlacementMap, PlacementOp } from "./placementOps";
import { applyOps, expiredIds } from "./placementOps";

/**
 * The world as built, and the queue of changes waiting to be applied to it.
 *
 * Operations arrive in socket callbacks, which run at arbitrary points between
 * frames. Applying them where they land would let one ray in a frame see a
 * crate that the next ray does not, and would mutate collision structures
 * outside the commit phase — the precise rule the collider registry exists to
 * enforce, expressed for a structure React does not own.
 *
 * So operations queue, and `commitPending` applies them once at the top of a
 * frame and swaps in a new immutable snapshot. Mid-frame mutation is not
 * discouraged; it is impossible.
 */
export interface PlacementSnapshot {
  readonly placements: PlacementMap;
  readonly boxes: readonly Aabb[];
  readonly hash: SpatialHash;
  /** Bumped whenever the snapshot changes, so renderers can compare cheaply. */
  readonly version: number;
}

export interface PlacementStore {
  /** Queue operations for the next commit. */
  enqueue(ops: readonly PlacementOp[]): void;
  /**
   * Apply everything queued and swap in a new snapshot.
   *
   * @returns whether the world changed
   */
  commitPending(now: number): boolean;
  /** The current snapshot. Safe to read for a whole frame. */
  snapshot(): PlacementSnapshot;
}

function buildSnapshot(
  placements: PlacementMap,
  catalog: PropCatalog,
  cellSize: number,
  version: number,
): PlacementSnapshot {
  const boxes: Aabb[] = [];
  for (const place of placements.values()) {
    const kind = catalog.get(place.kind);
    if (!kind?.collider) continue;
    boxes.push(
      boxFrom(
        place.id,
        place.x,
        place.y,
        place.z,
        place.scale,
        kind.collider.halfX,
        kind.collider.halfY,
        kind.collider.halfZ,
        kind.collider.offsetY,
        kind.standable,
      ),
    );
  }
  return {
    placements,
    boxes,
    hash: buildSpatialHash(boxes, cellSize),
    version,
  };
}

export function createPlacementStore(
  catalog: PropCatalog,
  limits: PlacementLimits,
  cellSize: number,
): PlacementStore {
  let pending: PlacementOp[] = [];
  let current = buildSnapshot(new Map(), catalog, cellSize, 0);

  return {
    enqueue(ops) {
      if (ops.length === 0) return;
      pending.push(...ops);
    },

    commitPending(now) {
      const expired = expiredIds(current.placements, now);
      if (pending.length === 0 && expired.length === 0) return false;

      // Expiry is folded in as ordinary removals, so temporary things vanish
      // through exactly the same path as anything else.
      const ops =
        expired.length === 0
          ? pending
          : [
              ...pending,
              ...expired.map(
                (id): PlacementOp => ({
                  t: "remove",
                  id,
                  rev: Number.MAX_SAFE_INTEGER,
                }),
              ),
            ];

      pending = [];

      const next = applyOps(current.placements, ops, catalog, limits);
      if (next === current.placements) return false;

      current = buildSnapshot(next, catalog, cellSize, current.version + 1);
      return true;
    },

    snapshot() {
      return current;
    },
  };
}
