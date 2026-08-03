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
  /**
   * Primitive to draw when no authored geometry is available.
   *
   * Kept as the fallback rather than removed: the grey box has no catalogue
   * file, and a world that can only render art is a world that cannot be
   * tested before the art exists.
   */
  readonly shape: "box" | "cylinder";
  /**
   * Node in the catalogue file holding this kind's authored geometry. When
   * present and loaded, it is drawn instead of the primitive.
   */
  readonly model?: string | undefined;
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
 * The palette and its guard live in `protocol/`, because the relay validates
 * a colour before the client ever sees it and the two must agree.
 */
export { PALETTE, isPaletteColor } from "../../../protocol/placement";
export type { PaletteColor } from "../../../protocol/placement";
