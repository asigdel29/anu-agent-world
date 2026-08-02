import type { PropKind } from "../../engine/placements/catalogTypes";
import { buildCatalog } from "../../engine/placements/catalogTypes";
import type { PlacementLimits } from "../../engine/placements/placementOps";
import { greyboxConfig as CFG } from "./config";

/**
 * A small kit for the grey box: enough shapes to exercise every property of a
 * placement without pretending to be art.
 *
 * A crate can be stood on and walked into. A post is an obstruction that
 * cannot be stood on. A tuft is purely decorative, so it exercises the path
 * where a kind has no collision at all. A slab is wide and low, which is what
 * catches a spatial hash that assumes one cell per box.
 */
const KINDS: PropKind[] = [
  {
    id: "crate",
    shape: "box",
    sizeX: 1,
    sizeY: 1,
    sizeZ: 1,
    material: "dynamic",
    color: "#805749",
    collider: { halfX: 0.5, halfY: 0.5, halfZ: 0.5, offsetY: 0.5 },
    standable: true,
    maxInstances: 400,
    bounds: 1,
    textSlots: 0,
  },
  {
    id: "post",
    shape: "cylinder",
    sizeX: 0.4,
    sizeY: 2.4,
    sizeZ: 0.4,
    material: "dynamic",
    color: "#4e3c40",
    collider: { halfX: 0.2, halfY: 1.2, halfZ: 0.2, offsetY: 1.2 },
    standable: false,
    maxInstances: 300,
    bounds: 1.4,
    textSlots: 0,
  },
  {
    id: "slab",
    shape: "box",
    sizeX: 4,
    sizeY: 0.4,
    sizeZ: 4,
    material: "dynamic",
    color: "#cab1ad",
    collider: { halfX: 2, halfY: 0.2, halfZ: 2, offsetY: 0.2 },
    standable: true,
    maxInstances: 200,
    bounds: 3,
    textSlots: 0,
  },
  {
    id: "tuft",
    shape: "box",
    sizeX: 0.4,
    sizeY: 0.5,
    sizeZ: 0.4,
    material: "flat",
    color: "#a1bf79",
    collider: null,
    standable: false,
    maxInstances: 600,
    bounds: 0.5,
    textSlots: 0,
  },
];

export const greyboxCatalog = buildCatalog(KINDS);

/** What a placement in this world must satisfy to be accepted. */
export const greyboxPlacementLimits: PlacementLimits = {
  minX: CFG.bounds.minX,
  maxX: CFG.bounds.maxX,
  minZ: CFG.bounds.minZ,
  maxZ: CFG.bounds.maxZ,
  minY: CFG.vertical.voidY,
  maxY: CFG.vertical.ceilingY,
  minScale: 0.25,
  maxScale: 4,
  maxTextLength: 120,
  maxLive: CFG.placements.maxLive,
};
