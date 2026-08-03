import { AIR, BLOCK_BY_NAME } from "./blocks";
import { SEA_LEVEL, WORLD_HEIGHT, heightAt, isCave, treeAt } from "./terrain";

/**
 * A chunk's blocks, filled in one pass.
 *
 * The terrain function answers for a single point, which is the right shape
 * for a ground query and the wrong shape for filling sixteen thousand of
 * them: asking it per block would recompute each column's height sixty-four
 * times, and asking it for foliage would recompute twenty-five neighbouring
 * columns per block on top of that. Filling by column instead computes each
 * height once.
 *
 * **The array carries a one-block margin on every side.** Meshing has to know
 * what is next to a face to decide whether to draw it, and a face on a chunk
 * boundary has its neighbour in the next chunk. Carrying the margin costs
 * about a third more memory during generation and removes the alternative
 * entirely — which is either loading neighbours before meshing, or meshing
 * boundaries wrongly and leaving seams that appear and vanish as chunks
 * arrive in different orders.
 */

const WOOD = BLOCK_BY_NAME.get("wood")!.id;
const LEAVES = BLOCK_BY_NAME.get("leaves")!.id;
const WATER = BLOCK_BY_NAME.get("water")!.id;
const STONE = BLOCK_BY_NAME.get("stone")!.id;
const GRASS = BLOCK_BY_NAME.get("grass")!.id;
const SOIL = BLOCK_BY_NAME.get("soil")!.id;
const SAND = BLOCK_BY_NAME.get("sand")!.id;

/** How far a crown reaches from its trunk. */
const CROWN_REACH = 2;

export interface ChunkData {
  /** Blocks, indexed by {@link index}. */
  readonly blocks: Uint8Array;
  /** Edge of the chunk proper, not counting the margin. */
  readonly size: number;
  /** Blocks of margin on each side. */
  readonly margin: number;
  readonly height: number;
}

/** Index into a chunk's blocks. Local coordinates may run into the margin. */
export function index(data: ChunkData, x: number, y: number, z: number): number {
  const stride = data.size + data.margin * 2;
  return ((y * stride) + (x + data.margin)) * stride + (z + data.margin);
}

/** The block at a local coordinate, or air outside the array. */
export function blockIn(data: ChunkData, x: number, y: number, z: number): number {
  if (y < 0 || y >= data.height) return AIR;
  if (x < -data.margin || x >= data.size + data.margin) return AIR;
  if (z < -data.margin || z >= data.size + data.margin) return AIR;
  return data.blocks[index(data, x, y, z)] ?? AIR;
}

/**
 * Fill a chunk, margin included.
 *
 * Trees are grown after the ground rather than sampled per block, because a
 * crown reaches across columns: finding it by asking every block whether some
 * neighbour has a tree is the same work done twenty-five times over.
 */
export function generateChunk(
  cx: number,
  cz: number,
  size: number,
  seed: number,
  height: number = WORLD_HEIGHT,
): ChunkData {
  const margin = 1 + CROWN_REACH;
  const stride = size + margin * 2;
  const data: ChunkData = {
    blocks: new Uint8Array(stride * stride * height),
    size,
    margin,
    height,
  };

  const originX = cx * size;
  const originZ = cz * size;

  // Ground, column by column.
  const heights = new Int16Array(stride * stride);
  for (let lx = -margin; lx < size + margin; lx += 1) {
    for (let lz = -margin; lz < size + margin; lz += 1) {
      const worldX = originX + lx;
      const worldZ = originZ + lz;
      const surface = heightAt(worldX, worldZ, seed);
      heights[(lx + margin) * stride + (lz + margin)] = surface;

      for (let y = 0; y < height; y += 1) {
        let block: number;
        if (y <= 1) {
          block = STONE;
        } else if (y > surface) {
          block = y <= SEA_LEVEL ? WATER : AIR;
        } else if (isCave(worldX, y, worldZ, seed, surface)) {
          block = AIR;
        } else {
          const depth = surface - y;
          block =
            depth > 4
              ? STONE
              : surface <= SEA_LEVEL + 1
                ? SAND
                : depth === 0
                  ? GRASS
                  : SOIL;
        }
        if (block !== AIR) data.blocks[index(data, lx, y, lz)] = block;
      }
    }
  }

  // Trees, from every column whose crown could reach this chunk.
  for (let lx = -margin; lx < size + margin; lx += 1) {
    for (let lz = -margin; lz < size + margin; lz += 1) {
      const worldX = originX + lx;
      const worldZ = originZ + lz;
      const trunk = treeAt(worldX, worldZ, seed);
      if (trunk === 0) continue;

      const base = heights[(lx + margin) * stride + (lz + margin)]! + 1;
      for (let i = 0; i < trunk; i += 1) {
        const y = base + i;
        if (y < height) data.blocks[index(data, lx, y, lz)] = WOOD;
      }

      const crown = base + trunk;
      for (let dx = -CROWN_REACH; dx <= CROWN_REACH; dx += 1) {
        for (let dz = -CROWN_REACH; dz <= CROWN_REACH; dz += 1) {
          for (let y = crown - 2; y <= crown + 1; y += 1) {
            if (y < 0 || y >= height) continue;
            const spread = Math.abs(dx) + Math.abs(dz);
            if (spread > (y >= crown ? 1 : 2)) continue;
            const x = lx + dx;
            const z = lz + dz;
            if (x < -margin || x >= size + margin) continue;
            if (z < -margin || z >= size + margin) continue;
            // Leaves never replace anything: a crown growing through a hill
            // would carve a hole in it.
            if (data.blocks[index(data, x, y, z)] === AIR) {
              data.blocks[index(data, x, y, z)] = LEAVES;
            }
          }
        }
      }
    }
  }

  return data;
}
