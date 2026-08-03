import type { PlacementLimits } from "../../engine/placements/placementOps";
import type { PropCatalog, PropKind } from "../../engine/placements/catalogTypes";
import { buildCatalog } from "../../engine/placements/catalogTypes";
import catalogData from "./data/catalog.json";
import { islandConfig } from "./config";

/**
 * What may be placed on the island, as the pipeline measured it.
 *
 * Every dimension and collider here was taken from the authored geometry, so
 * a prop resized in Blender cannot end up with a collision box describing
 * what it used to be. What the file does not measure — whether a thing can be
 * stood on, whether it carries words, how many may exist — was declared
 * deliberately, and those are the fields worth reading if you want to know
 * what this world lets people do.
 */

interface RawKind {
  readonly id: string;
  readonly model: string;
  readonly sizeX: number;
  readonly sizeY: number;
  readonly sizeZ: number;
  readonly bounds: number;
  readonly standable: boolean;
  readonly textSlots: number;
  readonly maxInstances: number;
  readonly collider: {
    readonly halfX: number;
    readonly halfY: number;
    readonly halfZ: number;
    readonly offsetY: number;
  } | null;
}

const kinds: PropKind[] = (catalogData.kinds as readonly RawKind[]).map((raw) => ({
  id: raw.id,
  model: raw.model,
  // The primitive is a fallback for the moment before the catalogue file has
  // loaded, sized so the wrong thing is at least the right size.
  shape: "box",
  sizeX: raw.sizeX,
  sizeY: raw.sizeY,
  sizeZ: raw.sizeZ,
  material: "dynamic",
  color: "#cab1ad",
  collider: raw.collider,
  standable: raw.standable,
  maxInstances: raw.maxInstances,
  bounds: raw.bounds,
  textSlots: raw.textSlots,
}));

export const islandCatalog: PropCatalog = buildCatalog(kinds);

/** Node names to pull out of the catalogue file. */
export const islandModelNames: readonly string[] = kinds
  .map((k) => k.model)
  .filter((m): m is string => typeof m === "string");

/**
 * What a placement on this island must satisfy.
 *
 * The bounds come from the measured world, so nothing can be placed off the
 * edge of the island it is supposed to be on, and the vertical range is the
 * ground's own range with headroom rather than a number somebody guessed.
 */
export const islandPlacementLimits: PlacementLimits = {
  minX: islandConfig.bounds.minX,
  maxX: islandConfig.bounds.maxX,
  minZ: islandConfig.bounds.minZ,
  maxZ: islandConfig.bounds.maxZ,
  minY: islandConfig.vertical.groundMinY,
  maxY: islandConfig.vertical.groundMaxY + 8,
  minScale: 0.6,
  maxScale: 1.6,
  maxTextLength: 60,
  maxLive: islandConfig.placements.maxLive,
};
