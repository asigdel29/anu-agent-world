import type { PlacementLimits } from "../protocol/placement";

/**
 * What the relay knows about the world it is hosting.
 *
 * The relay validates a placement before any client sees it, which means it
 * needs the closed set of kinds and the world's bounds — and nothing else. It
 * has no business knowing what a crate looks like.
 *
 * These are written by hand for the grey box and will be replaced by the
 * constants the asset pipeline emits, which is the point at which the world's
 * bounds stop being a number somebody typed in two places. Until then the
 * client's own validator runs against the same protocol module, so the two
 * cannot disagree about the *rules* even while they disagree about the
 * *numbers*.
 */

export const WORLD_KINDS: ReadonlySet<string> = new Set(["crate", "post", "slab", "tuft"]);

export const WORLD_LIMITS: PlacementLimits = {
  minX: -160,
  maxX: 160,
  minZ: -160,
  maxZ: 160,
  minY: -4,
  maxY: 48,
  minScale: 0.5,
  maxScale: 2,
  maxTextLength: 60,
  maxLive: 600,
};

/** Size of a spatial cell, matching the client's placement bucketing. */
export const CELL_SIZE = 16;

/**
 * How long something a visitor builds survives without being promoted.
 *
 * Griefing is self-healing rather than moderated: there is no queue and no
 * human in the loop, because anything unwanted removes itself within a day
 * and anything good can be made permanent deliberately.
 */
export const EPHEMERAL_TTL_MS = 24 * 60 * 60 * 1000;
