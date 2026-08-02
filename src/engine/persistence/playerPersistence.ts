import type { WorldBounds } from "../config/types";

/**
 * Where the player was, remembered between visits.
 *
 * The subtlety is not the saving; it is knowing when a saved position has
 * become a lie. Geometry moves between releases, and a position that was on a
 * balcony in one layout is inside a wall in the next. The predecessor project
 * handled this by hand-editing a version suffix into the storage key and
 * remembering to bump it, which is exactly the kind of step that gets skipped.
 *
 * Here the key is derived from the world's identifier and version, so bumping
 * the version — which a layout change already requires — re-epochs saved state
 * as a side effect rather than as a separate act of discipline.
 */
export interface SavedPlayer {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  /** When it was written, so stale entries can be judged. */
  readonly ts: number;
}

/** Storage key for a world. Distinct worlds and versions never collide. */
export function playerKey(worldId: string, version: number): string {
  return `${worldId}:player:v${String(version)}`;
}

/** How long a saved position is honoured before the player returns to spawn. */
export const SAVE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function isFinite3(value: SavedPlayer): boolean {
  return (
    Number.isFinite(value.x) &&
    Number.isFinite(value.y) &&
    Number.isFinite(value.z) &&
    Number.isFinite(value.yaw)
  );
}

/**
 * Whether a saved position may still be used.
 *
 * Rejects anything malformed, expired, or outside the world it claims to
 * belong to. The bounds check is the one that matters after a layout change
 * that shrank the world: resuming outside it would put the player in the void
 * and, with nothing underfoot, straight into a respawn.
 */
export function isUsable(
  saved: SavedPlayer | null,
  bounds: WorldBounds,
  voidY: number,
  now: number,
  ttlMs = SAVE_TTL_MS,
): boolean {
  if (!saved || !isFinite3(saved)) return false;
  if (!Number.isFinite(saved.ts) || now - saved.ts > ttlMs) return false;
  if (saved.x < bounds.minX || saved.x > bounds.maxX) return false;
  if (saved.z < bounds.minZ || saved.z > bounds.maxZ) return false;
  if (saved.y <= voidY) return false;
  return true;
}

/** Parse a stored string, tolerating anything that is not a valid record. */
export function parseSaved(raw: string | null): SavedPlayer | null {
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const record = parsed as Record<string, unknown>;
    if (
      typeof record.x !== "number" ||
      typeof record.y !== "number" ||
      typeof record.z !== "number" ||
      typeof record.yaw !== "number" ||
      typeof record.ts !== "number"
    ) {
      return null;
    }
    return { x: record.x, y: record.y, z: record.z, yaw: record.yaw, ts: record.ts };
  } catch {
    // Storage is shared with everything else on the origin and is editable by
    // the visitor; malformed content must never throw out of a read.
    return null;
  }
}

/** Serialise a position for storage. */
export function serialise(x: number, y: number, z: number, yaw: number, now: number): string {
  return JSON.stringify({ x, y, z, yaw, ts: now } satisfies SavedPlayer);
}

/** Whether enough time has passed to write again. */
export function shouldSave(now: number, lastSaved: number, intervalMs: number): boolean {
  return now - lastSaved >= intervalMs;
}
