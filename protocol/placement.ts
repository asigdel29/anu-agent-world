/**
 * What may be built, and what a request to build it must look like.
 *
 * This is the surface a compromised model reaches. The design assumption is
 * not that the model behaves but that **a fully successful prompt injection
 * should be boring**: the most an attacker can achieve by talking a model out
 * of its instructions is a handful of catalogue objects, in a palette colour,
 * inside the world's bounds, that expire on their own.
 *
 * Everything here serves that. `kind` is a name checked against a closed set
 * rather than geometry. `color` is checked against a closed palette rather
 * than being a string handed to a renderer. Coordinates are clamped to the
 * world. Text is length-capped and escaped by whoever draws it. None of these
 * is defence in depth on top of a trusted model — with open weights they are
 * the primary control.
 *
 * It lives in `protocol/` because the client and the relay must apply the
 * same rules. A validator that exists twice is a validator that will
 * eventually disagree with itself, and the half that is wrong will be the one
 * facing the network.
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

/**
 * The colours a placement may be tinted.
 *
 * A closed palette rather than free hex, for the same reason kinds are a
 * closed set: one fewer field where an arbitrary string reaches a renderer,
 * and a world anyone can build in still looks deliberate.
 */
export const PALETTE = [
  "#a1bf79",
  "#85a46a",
  "#805749",
  "#97654e",
  "#cab1ad",
  "#64a5c8",
  "#376898",
  "#ff4f38",
  "#fd524f",
  "#f0edea",
  "#7d7b79",
  "#4e3c40",
] as const;

export type PaletteColor = (typeof PALETTE)[number];

export function isPaletteColor(value: string): value is PaletteColor {
  return (PALETTE as readonly string[]).includes(value);
}

/**
 * Anything that can answer whether a kind exists.
 *
 * Narrower than the catalog on purpose: this module has no business knowing
 * what a kind's material family or collider is, and a relay that had to carry
 * the full catalog would be carrying render data it never renders.
 */
export interface KindSet {
  has(kind: string): boolean;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Whether a placement is acceptable, as a reason or null.
 *
 * Deliberately exhaustive about boring cases — a non-finite coordinate, a
 * kind not in the catalog, a scale of zero, a colour outside the palette —
 * because boring is what the whole design is trying to make an attack.
 */
export function validatePlacement(
  place: Placement,
  kinds: KindSet,
  limits: PlacementLimits,
): string | null {
  if (typeof place.id !== "string" || place.id.length === 0) return "missing id";
  if (!kinds.has(place.kind)) return `unknown kind "${place.kind}"`;

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

/** What the caller supplies rather than the request. */
export interface PlacementContext {
  /** Who is asking. Never read from the request. */
  readonly authorId: string;
  readonly now: number;
  /** When this placement should disappear, or null for permanent. */
  readonly expiresAt: number | null;
  /** Size of a spatial cell, used to derive the bucket coordinates. */
  readonly cellSize: number;
  /** Assigned by the caller so a request cannot choose its own key. */
  readonly id: string;
  readonly rev: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Turn arbitrary JSON into a placement candidate, or null.
 *
 * The fields a request may supply are exactly the fields named here, and the
 * rest come from the context. That is the important half: identity,
 * authorship, revision, and expiry are **assigned**, never read, so no
 * request can place an object as somebody else, overwrite an existing one by
 * guessing its id, or make itself permanent.
 *
 * Returning null rather than throwing keeps a bad request from stopping the
 * good ones behind it in the same batch.
 */
export function readPlacement(raw: unknown, ctx: PlacementContext): Placement | null {
  if (!isRecord(raw)) return null;
  if (typeof raw["kind"] !== "string") return null;

  const x = raw["x"];
  const y = raw["y"];
  const z = raw["z"];
  if (!isFiniteNumber(x) || !isFiniteNumber(y) || !isFiniteNumber(z)) return null;

  const yaw = raw["yaw"];
  const scale = raw["scale"];
  const text = raw["text"];
  const color = raw["color"];

  const cell = ctx.cellSize > 0 ? ctx.cellSize : 1;

  return {
    id: ctx.id,
    kind: raw["kind"],
    x,
    y,
    z,
    yaw: isFiniteNumber(yaw) ? yaw : 0,
    scale: isFiniteNumber(scale) ? scale : 1,
    cx: Math.floor(x / cell),
    cz: Math.floor(z / cell),
    rev: ctx.rev,
    authorId: ctx.authorId,
    createdAt: ctx.now,
    expiresAt: ctx.expiresAt,
    ...(typeof text === "string" ? { text } : {}),
    ...(typeof color === "string" ? { color } : {}),
  };
}
