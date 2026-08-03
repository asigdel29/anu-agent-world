import { AVATAR_PARTS, partFor } from "../../../protocol/avatar";
import type { Avatar } from "../../../protocol/avatar";

/**
 * What each avatar choice looks like.
 *
 * Separated from the part tables on purpose. The protocol module decides how
 * many options exist and what to call them, because the relay and both ends of
 * the wire have to agree on that; how those options are *drawn* is a decision
 * only the renderer needs, and putting three-dimensional measurements in a
 * module the Worker imports would drag geometry into the protocol.
 *
 * The cost of the split is that the two can drift — a part gains an option and
 * this file has no value for it. That is what `avatarLook.test.ts` exists to
 * prevent, and it is a better trade than one module that knows everything.
 *
 * **Lit values are chosen light; unlit ones are not.** The toon ramp's lowest
 * step is a little over half, so a colour handed to a lit material comes out
 * roughly half as light as it was written — while a flat, unlit feature comes
 * out exactly as written. The two therefore cannot be picked from one scale.
 * Every lit surface here sits in the same light band as the terrain palette,
 * and every drawn feature is near-black; picking a lit colour that looked
 * right on paper is what made the first version of this a row of silhouettes.
 *
 * That is the same mistake, inverted, as the one that once turned the whole
 * world white by summing two lights past the top of the ramp. The ramp is not
 * a tint. It is the entire mapping from colour to pixel, and nothing about it
 * can be judged without rendering something.
 */

/** How light the body is, per tone. Between the palette's extremes, always. */
export const TONE_INK: readonly string[] = ["#e2e2e2", "#b2b2b2", "#848484"];

/**
 * How wide the body is, per build, as a factor on the collision radius.
 *
 * Never above one. The capsule the renderer draws is the capsule the
 * controller sweeps, so a build that grew past the radius would put a
 * shoulder through a wall the physics believes is clear.
 */
export const BUILD_GIRTH: readonly number[] = [0.82, 0.91, 1];

/** How light the torso band is, per outfit. */
export const OUTFIT_INK: readonly string[] = ["#f2f2f2", "#aeaeae", "#6c6c6c", "#f2f2f2"];

/** Whether the outfit draws a second, darker band below the first. */
export const OUTFIT_BANDED: readonly boolean[] = [false, false, false, true];

/** The line colour every avatar feature is drawn in. */
export const FEATURE_INK = "#242424";

/**
 * Legs, which are not a choice.
 *
 * One value for every avatar, a step below the lightest outfit, so a figure
 * is anchored at the bottom and the outfit stays the one mass that varies.
 */
export const TROUSER_INK = "#8e8e8e";

/**
 * Hair, as boxes on the head: sizes and offsets are factors on the head's
 * side length, so hair scales with build without a second table.
 */
export interface HairShape {
  readonly size: readonly [number, number, number];
  readonly offset: readonly [number, number, number];
  /** A second box, for a bun, a brim, or a length down the back. */
  readonly extra?: {
    readonly size: readonly [number, number, number];
    readonly offset: readonly [number, number, number];
  };
}

export const HAIR_SHAPES: readonly (HairShape | null)[] = [
  null,
  // Short: a slab across the crown, overhanging just enough to cast an edge.
  { size: [1.06, 0.24, 1.06], offset: [0, 0.4, 0] },
  // Long: the same crown, continued down the back of the head.
  {
    size: [1.06, 0.24, 1.06],
    offset: [0, 0.4, 0],
    extra: { size: [1.04, 0.9, 0.14], offset: [0, -0.15, -0.53] },
  },
  // Bun: a thin crown and a knot behind it.
  {
    size: [1.04, 0.18, 1.04],
    offset: [0, 0.42, 0],
    extra: { size: [0.32, 0.32, 0.32], offset: [0, 0.42, -0.62] },
  },
  // Cap: a flat crown with a brim out over the eyes.
  {
    size: [1.08, 0.28, 1.08],
    offset: [0, 0.4, 0],
    extra: { size: [1.08, 0.08, 0.42], offset: [0, 0.27, 0.66] },
  },
];

/** Lens size as a factor on the head's side length. Zero draws nothing. */
export const GLASSES_LENS: readonly number[] = [0, 0.4, 0.42];

/** Whether the lenses are round. The alternative is square. */
export const GLASSES_ROUND: readonly boolean[] = [false, true, false];

/** Read a table entry, falling back rather than returning nothing. */
function pick<T>(table: readonly T[], index: number, fallback: T): T {
  return table[index] ?? fallback;
}

export interface AvatarLook {
  readonly ink: string;
  readonly girth: number;
  readonly outfitInk: string;
  readonly outfitBanded: boolean;
  readonly hair: HairShape | null;
  readonly lens: number;
  readonly roundLens: boolean;
}

/** Everything the renderer needs, resolved once per body rather than per frame. */
export function lookFor(avatar: Avatar): AvatarLook {
  return {
    ink: pick(TONE_INK, avatar.tone, "#b2b2b2"),
    girth: pick(BUILD_GIRTH, avatar.build, 0.91),
    outfitInk: pick(OUTFIT_INK, avatar.outfit, "#aeaeae"),
    outfitBanded: pick(OUTFIT_BANDED, avatar.outfit, false),
    hair: pick(HAIR_SHAPES, avatar.hair, null),
    lens: pick(GLASSES_LENS, avatar.glasses, 0),
    roundLens: pick(GLASSES_ROUND, avatar.glasses, false),
  };
}

/** The tables that must have one entry per option, for the drift test. */
export const LOOK_TABLES: readonly {
  readonly slot: string;
  readonly tables: readonly unknown[][];
}[] = [
  { slot: "tone", tables: [[...TONE_INK]] },
  { slot: "build", tables: [[...BUILD_GIRTH]] },
  { slot: "hair", tables: [[...HAIR_SHAPES]] },
  { slot: "outfit", tables: [[...OUTFIT_INK], [...OUTFIT_BANDED]] },
  { slot: "glasses", tables: [[...GLASSES_LENS], [...GLASSES_ROUND]] },
];

/** Whether every look table covers every option its part declares. */
export function looksCoverParts(): boolean {
  return AVATAR_PARTS.every((part) => {
    const entry = LOOK_TABLES.find((row) => row.slot === part.slot);
    if (!entry || !partFor(part.slot)) return false;
    return entry.tables.every((table) => table.length === part.options.length);
  });
}
