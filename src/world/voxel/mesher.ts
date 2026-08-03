import { BLOCK_COLOURS, facesBetween } from "./blocks";
import type { ChunkData } from "./chunkData";
import { blockIn } from "./chunkData";

/**
 * Turn a chunk of blocks into geometry.
 *
 * One rule matters more than everything else here: **a face is emitted only
 * where a visible block meets something that is not solid.** A cube per block
 * is six faces where the honest answer is usually zero — the inside of a hill
 * is entirely hidden, and drawing it costs the whole frame budget to render
 * geometry nobody can ever see. On this terrain the difference is around
 * fifty to one.
 *
 * Colour travels per vertex rather than per material, for the same reason it
 * does on the props: a chunk contains grass, soil, stone, sand and water, and
 * a material each would be five draw calls per chunk against twenty-five
 * chunks on screen. One material, one draw call, colours in the vertices.
 *
 * Pure — blocks in, arrays out — so the meshing rules are testable without a
 * renderer, which is the only way to be sure about a hidden face.
 */

export interface MeshArrays {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly colours: Float32Array;
  /** How many faces were emitted, which is the number worth watching. */
  readonly faces: number;
}

/**
 * The six directions, each with the four corners of the face it produces.
 *
 * Corners are wound counter-clockwise seen from outside, so normals point
 * away from the block and nothing needs recomputing afterwards.
 */
const FACES: readonly {
  readonly dx: number;
  readonly dy: number;
  readonly dz: number;
  readonly corners: readonly (readonly [number, number, number])[];
}[] = [
  // +X
  {
    dx: 1, dy: 0, dz: 0,
    corners: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]],
  },
  // -X
  {
    dx: -1, dy: 0, dz: 0,
    corners: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]],
  },
  // +Y
  {
    dx: 0, dy: 1, dz: 0,
    corners: [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]],
  },
  // -Y
  {
    dx: 0, dy: -1, dz: 0,
    corners: [[0, 0, 1], [0, 0, 0], [1, 0, 0], [1, 0, 1]],
  },
  // +Z
  {
    dx: 0, dy: 0, dz: 1,
    corners: [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]],
  },
  // -Z
  {
    dx: 0, dy: 0, dz: -1,
    corners: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]],
  },
];

/**
 * Build the geometry for a chunk.
 *
 * The margin the chunk carries is read but never drawn: it exists so a face
 * on the boundary knows what is on the other side. Without it the choice is
 * loading neighbours before meshing, or guessing — and guessing leaves seams
 * that appear and disappear depending on which chunk arrived first.
 */
export function meshChunk(data: ChunkData): MeshArrays {
  const positions: number[] = [];
  const normals: number[] = [];
  const colours: number[] = [];
  let faces = 0;

  for (let x = 0; x < data.size; x += 1) {
    for (let z = 0; z < data.size; z += 1) {
      // Stop at the highest block rather than the world ceiling. On this
      // terrain that is roughly half the column, and the half being skipped
      // is guaranteed to produce nothing.
      const top = Math.min(data.maxY, data.height - 1);
      for (let y = 0; y <= top; y += 1) {
        const here = blockIn(data, x, y, z);
        if (here === 0) continue;

        const colour = BLOCK_COLOURS[here] ?? ([1, 1, 1] as const);

        for (const face of FACES) {
          const neighbour = blockIn(data, x + face.dx, y + face.dy, z + face.dz);
          if (!facesBetween(here, neighbour)) continue;

          faces += 1;
          // Two triangles from four corners, rather than an index buffer: the
          // extra vertices cost less than the bookkeeping at this size, and a
          // non-indexed mesh is what the outline pass wants anyway.
          const [a, b, c, d] = face.corners as readonly [
            readonly [number, number, number],
            readonly [number, number, number],
            readonly [number, number, number],
            readonly [number, number, number],
          ];
          for (const corner of [a, b, c, a, c, d]) {
            positions.push(x + corner[0], y + corner[1], z + corner[2]);
            normals.push(face.dx, face.dy, face.dz);
            colours.push(colour[0], colour[1], colour[2]);
          }
        }
      }
    }
  }

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    colours: new Float32Array(colours),
    faces,
  };
}

/** Highest solid block in a column, or -1 when the column is empty. */
export function surfaceIn(data: ChunkData, x: number, z: number): number {
  for (let y = data.height - 1; y >= 0; y -= 1) {
    if (blockIn(data, x, y, z) !== 0) return y;
  }
  return -1;
}
