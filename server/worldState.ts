import type { Placement, PlacementLimits } from "../protocol/placement";
import { readPlacement, validatePlacement } from "../protocol/placement";
import { CELL_SIZE, EPHEMERAL_TTL_MS, WORLD_KINDS, WORLD_LIMITS } from "./worldRules";

/**
 * What has been built, and what it takes to build something.
 *
 * Kept apart from the room so that admitting a change is a pure decision:
 * given what exists, who is asking, and what they sent, either a placement or
 * a reason. The room performs the effects — persist, broadcast — and this
 * decides whether there is anything to perform.
 *
 * The global cap is enforced by eviction rather than by refusal. A world that
 * starts erroring once it is full has failed in a way a visitor cannot fix
 * and Anu has to; a world that trims its oldest temporary object keeps
 * working. That is only safe because everything a visitor builds is temporary
 * to begin with, so eviction has a supply of things nobody promised to keep.
 */

export interface BuildRequest {
  /** Untrusted, straight off the wire. */
  readonly raw: unknown;
  /** Who is asking, as the relay knows them — never as they claim. */
  readonly authorId: string;
  readonly now: number;
  /** Whether this placement should survive on its own. */
  readonly permanent: boolean;
}

export interface BuildOutcome {
  readonly place: Placement | null;
  /** Ids evicted to make room, which the caller must also remove. */
  readonly evicted: readonly string[];
  /** Why nothing was placed, or null on success. */
  readonly refusal: string | null;
}

/** A monotonic identifier that no request can choose. */
export function mintId(now: number, sequence: number): string {
  return `p${now.toString(36)}${sequence.toString(36)}`;
}

/**
 * The oldest thing that may be removed to make room.
 *
 * Only ever an ephemeral placement: a permanent one was promoted on purpose
 * and must not be evicted to make space for something temporary.
 */
export function oldestEvictable(world: ReadonlyMap<string, Placement>): string | null {
  let oldest: Placement | null = null;
  for (const place of world.values()) {
    if (place.expiresAt === null) continue;
    if (oldest === null || place.createdAt < oldest.createdAt) oldest = place;
  }
  return oldest?.id ?? null;
}

/** Ids of everything whose time has run out. */
export function expiredIds(world: ReadonlyMap<string, Placement>, now: number): string[] {
  const out: string[] = [];
  for (const place of world.values()) {
    if (place.expiresAt !== null && place.expiresAt <= now) out.push(place.id);
  }
  return out;
}

/**
 * Decide whether a build request may proceed.
 *
 * Returns the placement to apply and anything that must be evicted for it to
 * fit, or a refusal. Performs no effects, so every rule here is testable
 * against a plain map.
 */
export function admitBuild(
  world: ReadonlyMap<string, Placement>,
  request: BuildRequest,
  sequence: number,
  limits: PlacementLimits = WORLD_LIMITS,
): BuildOutcome {
  const place = readPlacement(request.raw, {
    authorId: request.authorId,
    now: request.now,
    expiresAt: request.permanent ? null : request.now + EPHEMERAL_TTL_MS,
    cellSize: CELL_SIZE,
    id: mintId(request.now, sequence),
    rev: 1,
  });
  if (!place) return { place: null, evicted: [], refusal: "unreadable placement" };

  const invalid = validatePlacement(place, WORLD_KINDS, limits);
  if (invalid) return { place: null, evicted: [], refusal: invalid };

  const evicted: string[] = [];
  if (world.size >= limits.maxLive) {
    const victim = oldestEvictable(world);
    // Every permanent object and no room left is the one case where refusing
    // is right: there is nothing here that anybody agreed could be discarded.
    if (victim === null) return { place: null, evicted: [], refusal: "world is full" };
    evicted.push(victim);
  }

  return { place, evicted, refusal: null };
}

/**
 * Whether an author may remove a placement.
 *
 * Attribution is the whole mechanism: you may remove what you built and
 * nothing else, which makes the world a guestbook made of buildings rather
 * than a surface anyone can wipe.
 */
export function mayRemove(place: Placement | undefined, authorId: string): boolean {
  return place !== undefined && place.authorId === authorId;
}
