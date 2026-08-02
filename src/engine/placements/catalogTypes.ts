/**
 * The closed set of things that may exist in the world at runtime.
 *
 * Agents and visitors never supply geometry. They name a kind from a catalog
 * the world author wrote, and the engine draws that. One decision, three
 * boundaries:
 *
 *  - **Security.** A model that has been talked out of its instructions still
 *    cannot inject a mesh, a shader, or a texture URL, because the only thing
 *    it can emit is a name that either is or is not in a fixed list. Design the
 *    tool surface so that a fully compromised model is boring.
 *  - **Performance.** Every kind declares its own instance cap, so the buffers
 *    are allocated once at a known size and no amount of placing can grow them.
 *  - **Art.** Everything that can appear was authored deliberately.
 */

/** How a kind's material should be built. */
export type MaterialFamily =
  /** Lighting is already in the texture; render unlit. */
  | "baked"
  /** Base colour with alpha, cut out rather than blended. */
  | "cutout"
  /** A flat colour, unlit. */
  | "flat"
  /**
   * Lit at runtime by the world's key light. Used for anything placed after
   * the bake, so it shares the baked world's light direction instead of
   * reading as a sticker laid on top of it.
   */
  | "dynamic";

/** An axis-aligned collision box, in the kind's own local space. */
export interface KindCollider {
  /** Half-extents. */
  readonly halfX: number;
  readonly halfY: number;
  readonly halfZ: number;
  /** Offset of the box centre from the placement's origin. */
  readonly offsetY: number;
}

export interface PropKind {
  readonly id: string;
  /** Primitive to draw. Real worlds add a glTF node reference alongside this. */
  readonly shape: "box" | "cylinder";
  /** Dimensions of the primitive. */
  readonly sizeX: number;
  readonly sizeY: number;
  readonly sizeZ: number;
  readonly material: MaterialFamily;
  /** Default colour, when the placement does not tint it. */
  readonly color: string;
  /** Collision box, or null for something purely decorative. */
  readonly collider: KindCollider | null;
  /** Whether the top face contributes ground height. */
  readonly standable: boolean;
  /** Ceiling on live instances; the instanced buffer is sized to this. */
  readonly maxInstances: number;
  /** Radius used for culling. */
  readonly bounds: number;
  /** Whether the kind carries visitor- or agent-authored text. */
  readonly textSlots: number;
}

export type PropCatalog = ReadonlyMap<string, PropKind>;

export function buildCatalog(kinds: readonly PropKind[]): PropCatalog {
  return new Map(kinds.map((kind) => [kind.id, kind]));
}

/**
 * The colours a placement may be tinted.
 *
 * A closed palette rather than free hex, for the same reason kinds are a
 * closed set: it is one fewer field where an arbitrary string reaches a
 * renderer, and it keeps a world that anyone can build in looking deliberate.
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
