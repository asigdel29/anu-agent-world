/**
 * The closed set of blocks the world is made of.
 *
 * Small on purpose. A voxel world's palette is its entire visual identity —
 * every surface anyone ever sees is one of these colours — so the list being
 * short is what keeps a world built by many hands looking like one place.
 * It is also the same argument as the prop catalogue: an agent cannot invent
 * a block, because a block is a number in this table and nothing else.
 *
 * Blocks are flat colours rather than textures. At one block per unit and a
 * stepped light ramp, a texture would be sampled at roughly one texel per
 * face and read as noise, and the outline is doing the work a texture's edge
 * detail normally does.
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
  { id: 1, name: "grass", color: "#a8d377", solid: true, placeable: true },
  { id: 2, name: "soil", color: "#805749", solid: true, placeable: true },
  { id: 3, name: "stone", color: "#7d7b79", solid: true, placeable: true },
  { id: 4, name: "sand", color: "#cab1ad", solid: true, placeable: true },
  // Water is solid to the mesher and not to the character: it is drawn as a
  // surface but walked into, which is the one place those two ideas differ.
  { id: 5, name: "water", color: "#64a5c8", solid: false, placeable: false },
  { id: 6, name: "wood", color: "#97654e", solid: true, placeable: true },
  { id: 7, name: "leaves", color: "#43683e", solid: true, placeable: true },
  { id: 8, name: "plank", color: "#c4b1a1", solid: true, placeable: true },
  { id: 9, name: "slate", color: "#4e3c40", solid: true, placeable: true },
  { id: 10, name: "clay", color: "#98837f", solid: true, placeable: true },
  { id: 11, name: "lamp", color: "#ff4f38", solid: true, placeable: true },
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
