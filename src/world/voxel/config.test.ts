import { describe, expect, it } from "vitest";

import { validateWorldConfig } from "../../engine/config/validateWorldConfig";
import { isSolid } from "./blocks";
import { VOXEL_SEED, voxelConfig } from "./config";
import { blockAt, heightAt } from "./terrain";

describe("the voxel world's configuration", () => {
  it("is coherent", () => {
    // Run at boot too, where it throws. Here it names what is wrong instead,
    // which is the difference between a failing test and a blank page.
    expect(validateWorldConfig(voxelConfig)).toEqual([]);
  });

  it("spawns above the ground rather than inside it", () => {
    const [x, y, z] = voxelConfig.spawn.position;
    const surface = heightAt(Math.floor(x), Math.floor(z), VOXEL_SEED);
    expect(y).toBeGreaterThan(surface);
    expect(isSolid(blockAt(Math.floor(x), surface, Math.floor(z), VOXEL_SEED))).toBe(true);
  });

  it("steps half a block and jumps a whole one", () => {
    // The interaction that defines how this world moves. A step of a full
    // block gives a character who walks up walls; the jump is what clears a
    // block, and it has to actually reach.
    const { maxStepHeight, jumpSpeed, gravity } = voxelConfig.locomotion;
    expect(maxStepHeight).toBeLessThan(1);
    const apex = (jumpSpeed * jumpSpeed) / (2 * Math.abs(gravity));
    expect(apex).toBeGreaterThan(1);
  });

  it("closes its fog at the streaming edge", () => {
    // Fog hides an arriving chunk only if it is opaque by the time the chunk
    // arrives, which is why this world has fog and the diorama did not.
    const fog = voxelConfig.atmosphere.fog;
    expect(fog).not.toBeNull();
    const edge = voxelConfig.streaming.radii.loadRadius * voxelConfig.units.chunkSize;
    expect(fog!.far).toBeLessThanOrEqual(edge);
  });

  it("keeps the respawn floor below the deepest water", () => {
    expect(voxelConfig.vertical.voidY).toBeLessThan(0);
  });
});
