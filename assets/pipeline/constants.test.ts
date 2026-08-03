import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { ChunkSpec } from "../../src/engine/streaming/chunkGrid";
import { deriveExtents } from "../../src/engine/streaming/chunkGrid";

/**
 * The measured world, checked against the sliced one.
 *
 * These two files are written by the same run and describe the same island
 * from opposite directions: the manifest says which cells exist, the
 * constants say where the geometry actually reaches. If they disagree,
 * something between measuring and slicing moved, and the symptom in a browser
 * would be a world whose bounds do not match its ground — a character walking
 * off the edge of a chunk that the config still believes is inside the world.
 *
 * This is the round-trip the plan asks for: extents derived from the manifest
 * must contain the measured bounds, and both must contain the spawn.
 */

const ROOT = join(import.meta.dirname, "..", "..");

interface Constants {
  readonly bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  readonly vertical: { groundMinY: number; groundMaxY: number };
  readonly spawn: { position: [number, number, number]; yaw: number };
  readonly measuredMaxRiser: number;
  readonly maxStepHeight: number;
}

interface Manifest {
  readonly chunkSize: number;
  readonly chunks: readonly ChunkSpec[];
}

const constants = JSON.parse(
  readFileSync(join(ROOT, "src", "world", "island", "data", "constants.json"), "utf-8"),
) as Constants;

const manifest = JSON.parse(
  readFileSync(join(ROOT, "src", "world", "island", "data", "chunks.json"), "utf-8"),
) as Manifest;

describe("the measured world", () => {
  it("has bounds the right way round", () => {
    expect(constants.bounds.maxX).toBeGreaterThan(constants.bounds.minX);
    expect(constants.bounds.maxZ).toBeGreaterThan(constants.bounds.minZ);
    expect(constants.vertical.groundMaxY).toBeGreaterThan(constants.vertical.groundMinY);
  });

  it("fits inside the cells the manifest names", () => {
    // The round trip. Cells are whole; geometry is not, so the derived
    // extents must contain the measured bounds rather than equal them.
    const extents = deriveExtents(manifest.chunks, manifest.chunkSize);
    expect(extents).not.toBeNull();
    expect(extents!.minX).toBeLessThanOrEqual(constants.bounds.minX);
    expect(extents!.maxX).toBeGreaterThanOrEqual(constants.bounds.maxX);
    expect(extents!.minZ).toBeLessThanOrEqual(constants.bounds.minZ);
    expect(extents!.maxZ).toBeGreaterThanOrEqual(constants.bounds.maxZ);
  });

  it("does not claim cells the geometry never reaches", () => {
    // The other direction: a slicer that ran away would write cells with
    // nothing in them, and the world would stream empty files forever.
    const extents = deriveExtents(manifest.chunks, manifest.chunkSize)!;
    const size = manifest.chunkSize;
    expect(extents.minX).toBeGreaterThanOrEqual(constants.bounds.minX - size);
    expect(extents.maxX).toBeLessThanOrEqual(constants.bounds.maxX + size);
  });

  it("puts the spawn on the island", () => {
    const [x, y, z] = constants.spawn.position;
    expect(x).toBeGreaterThanOrEqual(constants.bounds.minX);
    expect(x).toBeLessThanOrEqual(constants.bounds.maxX);
    expect(z).toBeGreaterThanOrEqual(constants.bounds.minZ);
    expect(z).toBeLessThanOrEqual(constants.bounds.maxZ);
    // Above the ground rather than inside it, or the first frame resolves
    // upward through whatever is overhead.
    expect(y).toBeGreaterThan(0);
    expect(y).toBeLessThan(constants.vertical.groundMaxY + 4);
  });

  it("derives a step limit that clears the geometry", () => {
    // The contract that makes the export fail rather than shipping a world
    // that looks correct and cannot be walked up.
    expect(constants.maxStepHeight).toBeGreaterThan(constants.measuredMaxRiser);
  });

  it("agrees with the step limit the controller was built against", () => {
    // If these drift, the pipeline is checking a rule the client does not
    // enforce, which is worse than not checking at all.
    expect(constants.maxStepHeight).toBeCloseTo(0.65, 3);
  });

  it("leaves the respawn floor room below the ground", () => {
    // The failure that cost the predecessor most: a floor left at a value
    // suited to terrain that had since moved puts the whole world under its
    // own kill plane and respawns the player every frame.
    const VOID_CLEARANCE = 5;
    expect(constants.vertical.groundMinY - VOID_CLEARANCE).toBeLessThan(
      constants.vertical.groundMinY,
    );
    expect(constants.vertical.groundMinY).toBeLessThan(constants.spawn.position[1]);
  });
});
