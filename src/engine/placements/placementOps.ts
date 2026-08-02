import type { PropCatalog } from "./catalogTypes";
import { isPaletteColor } from "./catalogTypes";

/**
 * Changes to the world, folded over a map as a pure reducer.
 *
 * Operations arrive over a network from agents and from other visitors, which
 * means they arrive out of order, more than once, and occasionally malformed.
 * All three are ordinary rather than exceptional, so the reducer handles them
 * as rules instead of as errors:
 *
 *  - Each placement carries a monotonic revision. An operation older than what
 *    is already applied is dropped, so a message overtaken in flight cannot
 *    resurrect a deleted object.
 *  - Applying the same operation twice reaches the same state as applying it
 *    once, so a redelivered message needs no bookkeeping.
 *  - Anything failing validation is discarded rather than throwing, because a
 *    single bad frame must not stop the ones behind it.
 *
 * Keeping this pure means ordering, idempotency, and quota logic are testable
 * without a socket.
 */

export interface Placement {
  readonly id: string;
  /** A key in the catalog. */
  readonly kind: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Rotation about the vertical axis, radians. */
  readonly yaw: number;
  readonly scale: number;
  /** Cell coordinates, used to bucket rendering and collision. */
  readonly cx: number;
  readonly cz: number;
  /** Monotonic per-placement revision. */
  readonly rev: number;
  /** Who placed it: an agent identifier or a visitor identifier. */
  readonly authorId: string;
  readonly createdAt: number;
  /** When it disappears, or null once promoted to permanent. */
  readonly expiresAt: number | null;
  readonly text?: string | undefined;
  readonly color?: string | undefined;
}

export type PlacementMap = ReadonlyMap<string, Placement>;

export type PlacementOp =
  | { readonly t: "upsert"; readonly place: Placement }
  | { readonly t: "remove"; readonly id: string; readonly rev: number };

/** Limits a placement must satisfy to be accepted. */
export interface PlacementLimits {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
  readonly minY: number;
  readonly maxY: number;
  readonly minScale: number;
  readonly maxScale: number;
  readonly maxTextLength: number;
  /** Ceiling on simultaneously live placements. */
  readonly maxLive: number;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Whether a placement is acceptable.
 *
 * This is the surface a compromised model reaches, so it is deliberately
 * exhaustive about the boring cases: a non-finite coordinate, a kind that is
 * not in the catalog, a scale of zero, a colour outside the palette.
 */
export function validatePlacement(
  place: Placement,
  catalog: PropCatalog,
  limits: PlacementLimits,
): string | null {
  if (typeof place.id !== "string" || place.id.length === 0) return "missing id";
  if (!catalog.has(place.kind)) return `unknown kind "${place.kind}"`;

  if (!isFiniteNumber(place.x) || !isFiniteNumber(place.y) || !isFiniteNumber(place.z)) {
    return "coordinates must be finite";
  }
  if (!isFiniteNumber(place.yaw)) return "yaw must be finite";
  if (!isFiniteNumber(place.rev)) return "rev must be finite";

  if (place.x < limits.minX || place.x > limits.maxX) return "outside bounds";
  if (place.z < limits.minZ || place.z > limits.maxZ) return "outside bounds";
  if (place.y < limits.minY || place.y > limits.maxY) return "outside vertical range";

  if (
    !isFiniteNumber(place.scale) ||
    place.scale < limits.minScale ||
    place.scale > limits.maxScale
  ) {
    return "scale outside range";
  }

  if (place.text !== undefined) {
    if (typeof place.text !== "string") return "text must be a string";
    if (place.text.length > limits.maxTextLength) return "text too long";
  }

  if (place.color !== undefined && !isPaletteColor(place.color)) {
    return "colour outside palette";
  }

  return null;
}

/**
 * Apply operations to a map, returning a new map only when something changed.
 *
 * Returning the same reference when nothing applied lets a renderer skip work
 * on the common case of a redelivered or stale batch.
 */
export function applyOps(
  current: PlacementMap,
  ops: readonly PlacementOp[],
  catalog: PropCatalog,
  limits: PlacementLimits,
): PlacementMap {
  let next: Map<string, Placement> | null = null;

  const ensure = (): Map<string, Placement> => {
    next ??= new Map(current);
    return next;
  };

  for (const op of ops) {
    if (op.t === "upsert") {
      const existing = (next ?? current).get(op.place.id);
      // An operation older than what is applied is dropped: a message
      // overtaken in flight must not resurrect a deleted object.
      if (existing && existing.rev >= op.place.rev) continue;
      if (validatePlacement(op.place, catalog, limits) !== null) continue;

      const map = ensure();
      if (!existing && map.size >= limits.maxLive) continue;
      map.set(op.place.id, op.place);
      continue;
    }

    const existing = (next ?? current).get(op.id);
    if (!existing) continue;
    if (existing.rev > op.rev) continue;
    ensure().delete(op.id);
  }

  return next ?? current;
}

/**
 * Placements whose lifetime has run out.
 *
 * Everything a visitor places is born temporary. That single decision is what
 * makes griefing self-healing: there is no moderation queue and no human in
 * the loop, because anything unwanted removes itself. Promotion to permanent
 * is the owner's act, and clears the expiry.
 */
export function expiredIds(current: PlacementMap, now: number): string[] {
  const out: string[] = [];
  for (const [id, place] of current) {
    if (place.expiresAt !== null && place.expiresAt <= now) out.push(id);
  }
  return out;
}

/**
 * The oldest temporary placement, evicted when the world is full.
 *
 * Trimming rather than refusing keeps the world responsive at its ceiling: a
 * visitor who places something always sees it appear, and the world sheds its
 * least recent instead of rejecting the newest.
 */
export function oldestEphemeral(current: PlacementMap): string | null {
  let oldestId: string | null = null;
  let oldestAt = Number.POSITIVE_INFINITY;
  for (const [id, place] of current) {
    if (place.expiresAt === null) continue;
    if (place.createdAt < oldestAt) {
      oldestAt = place.createdAt;
      oldestId = id;
    }
  }
  return oldestId;
}
