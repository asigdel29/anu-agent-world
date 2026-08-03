import type { ChunkSpec } from "../../engine/streaming/chunkGrid";
import { voxelConfig } from "./config";

/**
 * Every cell the world may stream, as a list.
 *
 * A generated world has no manifest in the usual sense — there is no file per
 * chunk and nothing to enumerate — but the streaming grid selects from a list
 * of candidates, so the list is produced rather than loaded.
 *
 * It is bounded by the world's own bounds, which exist to give the grid, the
 * placement validator and the respawn floor something finite to reason about.
 * The terrain itself would answer anywhere.
 */
const SIZE = voxelConfig.units.chunkSize;
const MIN_CELL = Math.floor(voxelConfig.bounds.minX / SIZE);
const MAX_CELL = Math.ceil(voxelConfig.bounds.maxX / SIZE) - 1;

/** Cells mounted before the character is released, so spawn has ground. */
function isSpawnEager(cx: number, cz: number): boolean {
  return Math.abs(cx) <= 1 && Math.abs(cz) <= 1;
}

export const voxelChunks: readonly ChunkSpec[] = (() => {
  const chunks: ChunkSpec[] = [];
  for (let cx = MIN_CELL; cx <= MAX_CELL; cx += 1) {
    for (let cz = MIN_CELL; cz <= MAX_CELL; cz += 1) {
      const eager = isSpawnEager(cx, cz);
      chunks.push({
        id: `v${String(cx)}_${String(cz)}`,
        cx,
        cz,
        ...(eager ? { spawnEager: true, alwaysCollide: true } : {}),
      });
    }
  }
  return chunks;
})();
