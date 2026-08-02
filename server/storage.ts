import { PLAYER_TTL_MS } from "../protocol/limits";

/**
 * Durable Object storage, divided into namespaces.
 *
 * The relay this replaces listed storage with no prefix and deleted every
 * record whose timestamp had aged out. Two facts combined into a live defect:
 * the list returned *all* keys, not just players, and `now - undefined` is
 * `NaN`, which fails the freshness comparison. So any record without a `ts` —
 * the world's weather, a schedule, anything the design was about to add — was
 * silently deleted the first time a visitor connected.
 *
 * The lesson is not "remember to filter". It is that an unprefixed list is a
 * query for *everything*, and the sweep that follows one will eventually be
 * asked to reason about records it was never written for. Every key is
 * namespaced and every sweep is scoped to a single namespace, so a sweep can
 * only ever delete records of the kind it understands.
 */

export const NAMESPACE = {
  /** A visitor's last known transform. */
  player: "player:",
  /** Something placed in the world. */
  place: "place:",
  /** Derived-simulation overrides, such as a weather beat. */
  sim: "sim:",
  /** Scheduler bookkeeping. */
  sched: "sched:",
} as const;

export type Namespace = keyof typeof NAMESPACE;

/** The storage key for a record. */
export function keyFor(namespace: Namespace, id: string): string {
  return `${NAMESPACE[namespace]}${id}`;
}

/**
 * The identifier a key names, or null when the key belongs to another
 * namespace. Checked rather than assumed, so a caller cannot strip a prefix
 * that was never there and act on the remainder.
 */
export function idFrom(namespace: Namespace, key: string): string | null {
  const prefix = NAMESPACE[namespace];
  return key.startsWith(prefix) ? key.slice(prefix.length) : null;
}

/** A stored player record. */
export interface PlayerRecord {
  readonly pos: readonly [number, number, number];
  readonly yaw: number;
  readonly action: string;
  readonly character: string;
  /** When this record was written. */
  readonly ts: number;
}

export interface Partitioned<T> {
  readonly live: readonly { readonly id: string; readonly record: T }[];
  /** Full keys, ready to hand to a delete. */
  readonly expired: readonly string[];
}

/**
 * Split a namespace's records into those still fresh and those to delete.
 *
 * A record whose timestamp is missing or not a number counts as expired. That
 * is the safe direction *because the sweep is scoped*: within `player:` a
 * record with no timestamp is corrupt and dropping it costs a visitor their
 * saved position. It was only dangerous before because the sweep ran over
 * records that had no business carrying a timestamp at all.
 */
export function partitionFresh<T extends { ts?: unknown }>(
  entries: Iterable<readonly [string, T]>,
  namespace: Namespace,
  now: number,
  ttlMs: number = PLAYER_TTL_MS,
): Partitioned<T> {
  const live: { id: string; record: T }[] = [];
  const expired: string[] = [];
  for (const [key, record] of entries) {
    const id = idFrom(namespace, key);
    if (id === null) continue;
    const ts = record?.ts;
    if (typeof ts === "number" && Number.isFinite(ts) && now - ts <= ttlMs) {
      live.push({ id, record });
    } else {
      expired.push(key);
    }
  }
  return { live, expired };
}
