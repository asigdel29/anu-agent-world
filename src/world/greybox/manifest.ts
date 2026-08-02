import type { ChunkSpec } from "../../engine/streaming/chunkGrid";
import { deriveExtents } from "../../engine/streaming/chunkGrid";
import { greyboxConfig } from "./config";

/**
 * The grey box, cut into streamable cells.
 *
 * Real worlds are exported as chunks by the asset pipeline. This one is
 * generated, which matters more than it sounds: it means the streaming rules —
 * hysteresis, prefetch, collider handover, readiness gating — are exercised
 * from the first phase, against geometry whose extents are known exactly,
 * rather than waiting on art that does not exist yet. A streaming bug found
 * here is a bug found before it can hide behind a loading screen.
 */
const SIZE = greyboxConfig.units.chunkSize;

/** Cell range covering the world's bounds. */
const MIN_CELL = Math.floor(greyboxConfig.bounds.minX / SIZE);
const MAX_CELL = Math.ceil(greyboxConfig.bounds.maxX / SIZE) - 1;

/**
 * Cells around the origin are mounted before the character is released, so
 * there is ground underfoot at spawn rather than a fall while the first
 * selection pass runs.
 */
function isSpawnEager(cx: number, cz: number): boolean {
  return Math.abs(cx) <= 1 && cz >= -1 && cz <= 0;
}

export const greyboxChunks: readonly ChunkSpec[] = (() => {
  const chunks: ChunkSpec[] = [];
  for (let cx = MIN_CELL; cx <= MAX_CELL; cx += 1) {
    for (let cz = MIN_CELL; cz <= MAX_CELL; cz += 1) {
      const eager = isSpawnEager(cx, cz);
      chunks.push({
        id: `g${String(cx)}_${String(cz)}`,
        cx,
        cz,
        ...(eager ? { spawnEager: true, alwaysCollide: true } : {}),
      });
    }
  }
  return chunks;
})();

/**
 * The world's extents, derived from the manifest rather than restated.
 *
 * Writing bounds down separately is how terrain and bounds drift apart; the
 * suite asserts these agree with the configuration.
 */
export const greyboxExtents = deriveExtents(greyboxChunks, SIZE);
