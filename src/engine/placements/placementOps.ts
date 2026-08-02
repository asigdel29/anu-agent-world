import type { PropCatalog } from "./catalogTypes";
import type { Placement, PlacementLimits } from "../../../protocol/placement";
import { validatePlacement } from "../../../protocol/placement";

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
 *
 * What a placement *is*, and what makes one acceptable, is deliberately not
 * defined here: the relay applies the same rules, and a validator that exists
 * twice will eventually disagree with itself.
 */

export type { Placement, PlacementLimits };
export { validatePlacement };

export type PlacementMap = ReadonlyMap<string, Placement>;

export type PlacementOp =
  | { readonly t: "upsert"; readonly place: Placement }
  | { readonly t: "remove"; readonly id: string; readonly rev: number };

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
