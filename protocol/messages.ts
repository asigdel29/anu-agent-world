import { MAX_CHAT_LENGTH, MAX_FRAME_BYTES, MAX_USERNAME_LENGTH, ROOM } from "./limits";
import { sanitizeId } from "./ids";
import type { Placement } from "./placement";

/**
 * The frames the client and the relay exchange.
 *
 * Both directions are untrusted. The relay must not believe a client that
 * claims to be someone else, and the client must not believe a relay frame
 * that is missing the fields it is about to read — a world that renders
 * `undefined` as a position is worse than one that drops a frame. So every
 * inbound frame passes a narrowing guard before anything reads it, and the
 * guards live here so the two sides cannot disagree about what a frame is.
 */

/** Whether an entity is a person or something the world runs itself. */
export type ActorKind = "visitor" | "agent";

/** Where an entity is and what it is doing. */
export interface ActorState {
  readonly pos: readonly [number, number, number];
  /** Facing, in radians. */
  readonly yaw: number;
  /** The animation the entity is playing. */
  readonly action: string;
  /** Which appearance to draw. */
  readonly character: string;
}

/** An entity as described in a snapshot. */
export interface ActorRecord extends ActorState {
  readonly id: string;
  readonly kind: ActorKind;
}

/** Frames a client may send. */
export type ClientFrame =
  | ({ readonly type: "state" } & ActorState)
  | { readonly type: "chat"; readonly username: string; readonly text: string }
  | { readonly type: "ping"; readonly t: number }
  /**
   * A request to build. The payload stays `unknown` on purpose: this module
   * decides what a *frame* is, and the placement module decides what a
   * *placement* is. Narrowing it here would put the rules in two places.
   */
  | { readonly type: "build"; readonly place: unknown }
  | { readonly type: "unbuild"; readonly id: string };

/**
 * A change to what has been built.
 *
 * A removal carries the revision it removes, not just an identifier. Without
 * it the client's monotonic rule — which exists so a message overtaken in
 * flight cannot resurrect a deleted object — has nothing to compare against
 * and silently discards the removal instead.
 */
export type WorldOp =
  | { readonly t: "upsert"; readonly place: Placement }
  | { readonly t: "remove"; readonly id: string; readonly rev: number };

/** Frames the relay may send. */
export type ServerFrame =
  /** Sent once on connect: who you are, and what time the world thinks it is. */
  | { readonly type: "hello"; readonly id: string; readonly s: number }
  | { readonly type: "pong"; readonly t: number; readonly s: number }
  | { readonly type: "join"; readonly id: string; readonly ts: number }
  | { readonly type: "leave"; readonly id: string; readonly ts: number }
  | ({ readonly type: "state"; readonly id: string; readonly kind: ActorKind } & ActorState)
  | {
      readonly type: "chat";
      readonly id: string;
      readonly username: string;
      readonly text: string;
    }
  | { readonly type: "snapshot"; readonly actors: readonly ActorRecord[] }
  /** Everything currently built, sent once on connect. */
  | { readonly type: "world"; readonly ops: readonly WorldOp[] }
  /** Why a build request was refused, sent only to whoever made it. */
  | { readonly type: "refused"; readonly reason: string };

/** The frame types a client is allowed to send. Anything else is dropped. */
export const CLIENT_FRAME_TYPES: ReadonlySet<string> = new Set([
  "state",
  "chat",
  "ping",
  "build",
  "unbuild",
]);

/** Longest an action or character name may be. */
const MAX_ANIMATION_NAME_LENGTH = 32;

/** Longest a placement identifier may be. */
const MAX_PLACEMENT_ID_LENGTH = 24;

function isRecord(value: unknown): value is Record<string, unknown> {
  // An array is an object, so excluding it here is not pedantry: without the
  // check a frame of `[…]` reaches the readers as a record whose every field
  // is undefined.
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isVec3(value: unknown): value is readonly [number, number, number] {
  return Array.isArray(value) && value.length === 3 && value.every(isFiniteNumber);
}

/**
 * Cap a string, returning "" for anything that is not one.
 *
 * Length only — display escapes the result. Trying to make text safe by
 * inspecting it here would be the wrong layer and would give a false sense of
 * having handled it.
 */
export function clampText(value: unknown, max: number): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}

/**
 * Parse a frame off the wire.
 *
 * Returns null for anything oversized, unparseable, or not an object. Size is
 * checked before parsing, so a hostile payload is rejected without ever being
 * expanded into memory.
 */
export function parseFrame(raw: unknown): Record<string, unknown> | null {
  if (typeof raw !== "string" || raw.length > MAX_FRAME_BYTES) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  return isRecord(parsed) ? parsed : null;
}

/** Whether a parsed frame carries a well-formed transform. */
export function isActorState(frame: Record<string, unknown>): boolean {
  return (
    isVec3(frame["pos"]) &&
    isFiniteNumber(frame["yaw"]) &&
    typeof frame["action"] === "string" &&
    typeof frame["character"] === "string"
  );
}

/**
 * Narrow a parsed frame to one a client is allowed to send, normalising the
 * text fields as it goes.
 *
 * Returning a rebuilt object rather than the original is the point: nothing a
 * client sent survives except the fields named here, so a frame carrying an
 * extra `id` cannot smuggle it past the relay.
 */
export function readClientFrame(frame: Record<string, unknown>): ClientFrame | null {
  const type = frame["type"];
  if (typeof type !== "string" || !CLIENT_FRAME_TYPES.has(type)) return null;

  if (type === "state") {
    if (!isActorState(frame)) return null;
    return {
      type: "state",
      pos: frame["pos"] as readonly [number, number, number],
      yaw: frame["yaw"] as number,
      action: clampText(frame["action"], MAX_ANIMATION_NAME_LENGTH),
      character: clampText(frame["character"], MAX_ANIMATION_NAME_LENGTH),
    };
  }

  if (type === "chat") {
    const text = clampText(frame["text"], MAX_CHAT_LENGTH);
    if (!text) return null;
    return {
      type: "chat",
      username: clampText(frame["username"], MAX_USERNAME_LENGTH),
      text,
    };
  }

  if (type === "build") {
    // Passed along unnarrowed: what a placement is belongs to the placement
    // module, and duplicating those rules here is how two validators start
    // disagreeing.
    return { type: "build", place: frame["place"] };
  }

  if (type === "unbuild") {
    const id = sanitizeId(frame["id"], MAX_PLACEMENT_ID_LENGTH);
    return id ? { type: "unbuild", id } : null;
  }

  if (!isFiniteNumber(frame["t"])) return null;
  return { type: "ping", t: frame["t"] };
}

/**
 * Build the relay URL for a host.
 *
 * A bare localhost uses the insecure scheme because `wrangler dev` serves
 * plain ws; every deployed host uses wss. Returns null for an empty host,
 * which is how the client runs solo: no host configured is a supported mode,
 * not a misconfiguration.
 */
export function roomUrl(host: string | undefined, playerId?: string): string | null {
  if (!host) return null;
  const scheme = host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "ws" : "wss";
  const pid = sanitizeId(playerId);
  return `${scheme}://${host}/party/${ROOM}${pid ? `?pid=${pid}` : ""}`;
}

/**
 * Throttle gate for outbound state. Pure, with the clock passed in, so the
 * cadence is testable without waiting for it.
 */
export function shouldSend(now: number, lastSent: number, interval: number): boolean {
  return now - lastSent >= interval;
}
