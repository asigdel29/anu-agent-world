import type { ChunkRadii, WorldBounds } from "../config/types";

/**
 * Which parts of the world should be in memory, expressed as arithmetic.
 *
 * Deliberately free of three.js and of React so the streaming rules can be
 * checked without a scene. The manager owns the frame loop and the mounting;
 * every judgement call is made here.
 */

/** One streamable piece of the world. */
export interface ChunkSpec {
  readonly id: string;
  /** Where its file lives, when it has one. */
  readonly url?: string;
  /** Cell coordinates of its lower corner. */
  readonly cx: number;
  readonly cz: number;
  /** How many cells it spans; defaults to one. */
  readonly spanX?: number;
  readonly spanZ?: number;
  /**
   * Mounted before the player has moved. Used for the pieces that must be
   * present the instant the world appears.
   */
  readonly spawnEager?: boolean;
  /**
   * Always contributes collision while mounted, regardless of distance. Used
   * by pieces whose footprint spans more cells than the collider radius, where
   * distance to the nearest cell is a poor guide to whether the player might
   * be standing on it.
   */
  readonly alwaysCollide?: boolean;
}

export interface ChunkSelection {
  readonly active: readonly string[];
  readonly colliders: readonly string[];
  readonly prefetch: readonly string[];
}

/** Cell coordinates containing a world position. */
export function worldToChunk(x: number, z: number, chunkSize: number): [number, number] {
  return [Math.floor(x / chunkSize), Math.floor(z / chunkSize)];
}

/** Chebyshev distance between two cells, in whole chunks. */
export function chunkDistance(cxA: number, czA: number, cxB: number, czB: number): number {
  return Math.max(Math.abs(cxA - cxB), Math.abs(czA - czB));
}

/**
 * Chebyshev distance from a cell to a chunk's whole footprint.
 *
 * Zero anywhere inside the footprint, so a wide chunk stays loaded while the
 * player stands anywhere on it. Measuring to its corner instead would unload
 * the ground underfoot as the player walked across a large piece.
 */
export function chunkRangeDistance(pcx: number, pcz: number, chunk: ChunkSpec): number {
  const spanX = chunk.spanX ?? 1;
  const spanZ = chunk.spanZ ?? 1;
  const dx = Math.max(chunk.cx - pcx, pcx - (chunk.cx + spanX - 1), 0);
  const dz = Math.max(chunk.cz - pcz, pcz - (chunk.cz + spanZ - 1), 0);
  return Math.max(dx, dz);
}

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

/**
 * The selection before any movement is known.
 *
 * Only spawn-eager chunks mount, and the always-collide ones among them
 * register collision at once, so the character has ground to stand on the
 * instant the world appears rather than falling through it while the first
 * selection pass runs.
 */
export function initialSelection(chunks: readonly ChunkSpec[]): ChunkSelection {
  return {
    active: chunks.filter((c) => c.spawnEager).map((c) => c.id),
    colliders: chunks.filter((c) => c.spawnEager && c.alwaysCollide).map((c) => c.id),
    prefetch: [],
  };
}

/**
 * Choose what should be mounted, collidable, and warmed for a player at
 * (x, z).
 *
 * A chunk is active when it is spawn-eager, inside the load radius, or already
 * active and still inside the larger unload radius. That gap is the whole
 * point: without it, pacing back and forth across a cell boundary mounts and
 * unmounts the same chunk repeatedly, which shows up as a stutter exactly
 * where the player is most likely to be standing still and looking around.
 *
 * Returns `prev` by reference when nothing changed, so a caller holding the
 * result in state can compare identity and skip the work.
 */
export function selectChunks(
  x: number,
  z: number,
  chunks: readonly ChunkSpec[],
  chunkSize: number,
  prev: ChunkSelection | null,
  radii: ChunkRadii,
): ChunkSelection {
  const [pcx, pcz] = worldToChunk(x, z, chunkSize);
  const prevActive = new Set(prev ? prev.active : []);

  const active: string[] = [];
  const colliders: string[] = [];
  const prefetch: string[] = [];

  for (const chunk of chunks) {
    const distance = chunkRangeDistance(pcx, pcz, chunk);
    const isActive =
      chunk.spawnEager === true ||
      distance <= radii.loadRadius ||
      (prevActive.has(chunk.id) && distance <= radii.unloadRadius);

    if (isActive) {
      active.push(chunk.id);
      if (chunk.alwaysCollide === true || distance <= radii.colliderRadius) {
        colliders.push(chunk.id);
      }
    } else if (distance <= radii.prefetchRadius) {
      prefetch.push(chunk.id);
    }
  }

  if (
    prev &&
    sameIds(active, prev.active) &&
    sameIds(colliders, prev.colliders) &&
    sameIds(prefetch, prev.prefetch)
  ) {
    return prev;
  }

  return { active, colliders, prefetch };
}

/**
 * World-space extents of the cells a manifest covers.
 *
 * The world's walkable bounds are derived from this rather than written down
 * separately, so terrain and bounds cannot drift apart as the world grows.
 */
export function deriveExtents(
  chunks: readonly ChunkSpec[],
  chunkSize: number,
): WorldBounds | null {
  if (chunks.length === 0) return null;

  let minCx = Number.POSITIVE_INFINITY;
  let maxCx = Number.NEGATIVE_INFINITY;
  let minCz = Number.POSITIVE_INFINITY;
  let maxCz = Number.NEGATIVE_INFINITY;

  for (const chunk of chunks) {
    minCx = Math.min(minCx, chunk.cx);
    maxCx = Math.max(maxCx, chunk.cx + (chunk.spanX ?? 1) - 1);
    minCz = Math.min(minCz, chunk.cz);
    maxCz = Math.max(maxCz, chunk.cz + (chunk.spanZ ?? 1) - 1);
  }

  return {
    minX: minCx * chunkSize,
    maxX: (maxCx + 1) * chunkSize,
    minZ: minCz * chunkSize,
    maxZ: (maxCz + 1) * chunkSize,
  };
}

/** Streaming radii for a device; touch devices get a tighter ring. */
export function radiiForDevice(
  coarsePointer: boolean,
  desktop: ChunkRadii,
  mobile: ChunkRadii,
): ChunkRadii {
  return coarsePointer ? mobile : desktop;
}

/**
 * Whether a decorative group should be visible, with hysteresis.
 *
 * Distances are squared so callers never need a square root. As with chunk
 * loading, the two thresholds differ so that standing on the boundary does not
 * flicker the group on and off.
 */
export function shouldBeVisible(
  distanceSq: number,
  wasVisible: boolean,
  showRadius: number,
  hideRadius: number,
): boolean {
  return wasVisible
    ? distanceSq <= hideRadius * hideRadius
    : distanceSq <= showRadius * showRadius;
}
