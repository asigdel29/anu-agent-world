/**
 * The closed set of blocks the world is made of.
 *
 * Small on purpose. A voxel world's palette is its entire visual identity —
 * every surface anyone ever sees is one of these colours — so the list being
 * short is what keeps a world built by many hands looking like one place.
 * It is also the same argument as the prop catalogue: an agent cannot invent
 * a block, because a block is a number in this table and nothing else.
 *
 * Blocks are flat tones rather than textures. At one block per unit and a
 * stepped light ramp, a texture would be sampled at roughly one texel per
 * face and read as noise.
 *
 * **There is no colour here, only value.** That is a real constraint rather
 * than a repaint: with no hue to separate grass from stone, the only things
 * telling one block from another are how light it is and which way its faces
 * point. Two blocks a few per cent apart in value are the same block to
 * anybody looking, so the tones below are spaced widely and deliberately, and
 * the ones that matter most — the ground you walk on against the water you
 * fall into — are furthest apart.
 *
 * The stepped ramp does the rest. A white block's top, sides and underside
 * land on different steps, which is what makes a cube read as a cube without
 * a single line being drawn.
 */

/** Air is zero so an empty chunk is a zeroed buffer. */
export const AIR = 0;

export interface BlockKind {
  readonly id: number;
  readonly name: string;
  /** Flat colour, from the world palette. */
  readonly color: string;
  /** Whether it stops movement. */
  readonly solid: boolean;
  /** Whether a visitor or an agent may place and remove it. */
  readonly placeable: boolean;
}

export const BLOCKS: readonly BlockKind[] = [
  { id: 0, name: "air", color: "#000000", solid: false, placeable: false },
  // The ground sits clearly below the sky's white rather than near it. A
  // world the same value as its background has no horizon and no silhouette,
  // and the first attempt at this palette put grass within four per cent of
  // the sky -- correct geometry, invisible landscape.
  { id: 1, name: "grass", color: "#dedede", solid: true, placeable: true },
  { id: 2, name: "soil", color: "#a9a9a9", solid: true, placeable: true },
  { id: 3, name: "stone", color: "#8c8c8c", solid: true, placeable: true },
  { id: 4, name: "sand", color: "#cfcfcf", solid: true, placeable: true },
  // Water is drawn but walked into: the one place "visible" and "solid" part
  // company. Dark, because a light lake in a light world is a hole nobody
  // sees until they are in it.
  { id: 5, name: "water", color: "#5a5a5a", solid: false, placeable: false },
  { id: 6, name: "wood", color: "#4a4a4a", solid: true, placeable: true },
  { id: 7, name: "leaves", color: "#2e2e2e", solid: true, placeable: true },
  { id: 8, name: "plank", color: "#c2c2c2", solid: true, placeable: true },
  { id: 9, name: "slate", color: "#1c1c1c", solid: true, placeable: true },
  { id: 10, name: "clay", color: "#767676", solid: true, placeable: true },
  // The one pure black. Reserved for whatever should read as made rather than
  // grown, which in a world built by agents is worth being able to see.
  { id: 11, name: "lamp", color: "#000000", solid: true, placeable: true },
] as const;

export const BLOCK_BY_NAME: ReadonlyMap<string, BlockKind> = new Map(
  BLOCKS.map((block) => [block.name, block]),
);

/** Colours as packed floats, in block-id order, for the mesher to copy. */
export const BLOCK_COLOURS: readonly (readonly [number, number, number])[] = BLOCKS.map(
  (block) => {
    const hex = block.color.replace("#", "");
    return [
      parseInt(hex.slice(0, 2), 16) / 255,
      parseInt(hex.slice(2, 4), 16) / 255,
      parseInt(hex.slice(4, 6), 16) / 255,
    ] as const;
  },
);

/** Whether a block stops a character. */
export function isSolid(id: number): boolean {
  return BLOCKS[id]?.solid ?? false;
}

/** Whether a block is drawn at all. */
export function isVisible(id: number): boolean {
  return id !== AIR;
}

/**
 * Whether a face between two blocks should be drawn.
 *
 * The rule that decides how much geometry a world costs, and it is as simple
 * as it looks: a face exists only where something visible meets air.
 *
 * The case worth stating is water. Every block here is opaque, water
 * included, so a lake bed *under* water cannot be seen and building it is
 * pure waste — the water's own surface is what anybody looks at. An earlier
 * version drew the bed as well, on the reasoning that water is "not solid",
 * which confused two different questions: whether a character can walk
 * through a block, and whether light can. Only the second one decides a face.
 *
 * If water ever becomes transparent this has to change, and the test named
 * for the lake bed is where it will fail.
 */
export function facesBetween(here: number, neighbour: number): boolean {
  return isVisible(here) && !isVisible(neighbour);
}

/** The blocks an agent or a visitor may place. */
export const PLACEABLE: readonly BlockKind[] = BLOCKS.filter((b) => b.placeable);
