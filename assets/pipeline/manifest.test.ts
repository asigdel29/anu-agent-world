import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { ChunkSpec } from "../../src/engine/streaming/chunkGrid";
import { deriveExtents } from "../../src/engine/streaming/chunkGrid";

/**
 * The manifest the pipeline emitted, checked against the files it emitted
 * beside it.
 *
 * This is the drift guard the predecessor lacked. There, the list of chunks
 * lived in the client and the files lived in a directory, both maintained by
 * hand, and they came apart the way two hand-maintained lists always do. A
 * chunk renamed on one side produces a hole in the world that reads as a
 * streaming bug, or worse, as a slow network — the client cannot tell a
 * missing file from a failed fetch, so the symptom is intermittent.
 *
 * Now one side is generated and this test checks the other. It runs against
 * whatever is committed, so re-running the pipeline and forgetting to commit
 * its output fails here rather than in a browser.
 */

const ROOT = join(import.meta.dirname, "..", "..");
const MANIFEST = join(ROOT, "public", "world", "chunks.json");

interface Manifest {
  readonly chunkSize: number;
  readonly chunks: readonly ChunkSpec[];
}

const manifest = JSON.parse(readFileSync(MANIFEST, "utf-8")) as Manifest;

describe("the emitted manifest", () => {
  it("declares the chunk size the streaming grid uses", () => {
    // If these disagree the world still loads, and every chunk is placed at
    // the wrong distance from every other one.
    expect(manifest.chunkSize).toBe(32);
  });

  it("names at least one chunk", () => {
    expect(manifest.chunks.length).toBeGreaterThan(0);
  });

  it("gives every chunk a file that exists", () => {
    for (const chunk of manifest.chunks) {
      expect(chunk.url, `${chunk.id} has no url`).toBeTruthy();
      const path = join(ROOT, "public", chunk.url!.replace(/^\//, ""));
      expect(existsSync(path), `${chunk.id} names a missing file: ${chunk.url!}`).toBe(true);
    }
  });

  it("gives every chunk a distinct identifier and cell", () => {
    const ids = new Set(manifest.chunks.map((c) => c.id));
    const cells = new Set(manifest.chunks.map((c) => `${c.cx},${c.cz}`));
    expect(ids.size).toBe(manifest.chunks.length);
    expect(cells.size).toBe(manifest.chunks.length);
  });

  it("covers the spawn, so the character is not released into nothing", () => {
    const eager = manifest.chunks.filter((c) => c.spawnEager);
    expect(eager.length).toBeGreaterThan(0);
    // The cell containing spawn must be among them: a character standing on a
    // boundary is over two cells, and being released above the one that has
    // not arrived is a fall.
    expect(eager.some((c) => c.cx === 0 && c.cz === 0)).toBe(true);
  });

  it("has extents the streaming grid can derive", () => {
    const extents = deriveExtents(manifest.chunks, manifest.chunkSize);
    expect(extents).not.toBeNull();
    expect(extents!.maxX).toBeGreaterThan(extents!.minX);
    expect(extents!.maxZ).toBeGreaterThan(extents!.minZ);
  });

  it("describes a world of a sane size", () => {
    // A guard against a slicer that ran away: an island authored at 64 units
    // should not produce extents measured in thousands.
    const extents = deriveExtents(manifest.chunks, manifest.chunkSize)!;
    expect(extents.maxX - extents.minX).toBeLessThanOrEqual(256);
    expect(extents.maxZ - extents.minZ).toBeLessThanOrEqual(256);
  });

  it("has contiguous cells, with no hole in the middle", () => {
    // An empty cell is legitimately omitted at the edge of an island, but a
    // gap surrounded by geometry means the slicer dropped something.
    const cells = new Set(manifest.chunks.map((c) => `${c.cx},${c.cz}`));
    const xs = manifest.chunks.map((c) => c.cx);
    const zs = manifest.chunks.map((c) => c.cz);
    for (let cx = Math.min(...xs) + 1; cx < Math.max(...xs); cx += 1) {
      for (let cz = Math.min(...zs) + 1; cz < Math.max(...zs); cz += 1) {
        expect(cells.has(`${cx},${cz}`), `interior cell ${cx},${cz} is missing`).toBe(true);
      }
    }
  });
});
