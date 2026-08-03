import { describe, expect, it } from "vitest";

import { AIR, BLOCK_BY_NAME } from "./blocks";
import type { ChunkData } from "./chunkData";
import { blockIn, generateChunk, index } from "./chunkData";
import { meshChunk } from "./mesher";

const SEED = 0x5eed;
const STONE = BLOCK_BY_NAME.get("stone")!.id;
const WATER = BLOCK_BY_NAME.get("water")!.id;

/** An empty chunk of a given size, for building shapes by hand. */
function emptyChunk(size: number, height: number, margin = 1): ChunkData {
  const stride = size + margin * 2;
  return { blocks: new Uint8Array(stride * stride * height), size, margin, height };
}

function set(data: ChunkData, x: number, y: number, z: number, block: number): void {
  data.blocks[index(data, x, y, z)] = block;
}

describe("meshChunk", () => {
  it("emits nothing for an empty chunk", () => {
    const mesh = meshChunk(emptyChunk(4, 4));
    expect(mesh.faces).toBe(0);
    expect(mesh.positions).toHaveLength(0);
  });

  it("emits six faces for a lone block", () => {
    const data = emptyChunk(4, 4);
    set(data, 1, 1, 1, STONE);
    const mesh = meshChunk(data);
    expect(mesh.faces).toBe(6);
    // Six faces, two triangles each, three vertices each.
    expect(mesh.positions).toHaveLength(6 * 6 * 3);
  });

  it("never emits a face between two solid blocks", () => {
    // The rule the whole thing rests on. Two blocks touching share a face
    // neither of them can be seen through.
    const data = emptyChunk(4, 4);
    set(data, 1, 1, 1, STONE);
    set(data, 2, 1, 1, STONE);
    expect(meshChunk(data).faces).toBe(10);
  });

  it("hides the inside of a solid mass", () => {
    // A 3x3x3 cube: 54 faces on the outside, and the block in the middle
    // contributes nothing at all.
    const data = emptyChunk(5, 5);
    for (let x = 1; x <= 3; x += 1) {
      for (let y = 1; y <= 3; y += 1) {
        for (let z = 1; z <= 3; z += 1) set(data, x, y, z, STONE);
      }
    }
    expect(meshChunk(data).faces).toBe(54);
  });

  it("reads the margin so a boundary face is not drawn twice", () => {
    // Without the margin a block at the chunk edge sees air outside and draws
    // a face that the neighbouring chunk also draws, leaving a double
    // surface that flickers as chunks arrive in different orders.
    const data = emptyChunk(2, 3);
    set(data, 0, 1, 0, STONE);
    const alone = meshChunk(data).faces;
    set(data, -1, 1, 0, STONE); // in the margin, not the chunk
    expect(meshChunk(data).faces).toBe(alone - 1);
  });

  it("draws nothing for a block in the margin itself", () => {
    const data = emptyChunk(2, 3);
    set(data, -1, 1, 0, STONE);
    expect(meshChunk(data).faces).toBe(0);
  });

  it("gives every vertex the colour of its own block", () => {
    const data = emptyChunk(4, 4);
    set(data, 1, 1, 1, STONE);
    const mesh = meshChunk(data);
    expect(mesh.colours).toHaveLength(mesh.positions.length);
    for (let i = 0; i < mesh.colours.length; i += 3) {
      expect(mesh.colours[i]).toBeGreaterThan(0);
    }
  });

  it("keeps positions inside the chunk", () => {
    const data = emptyChunk(4, 6);
    for (let x = 0; x < 4; x += 1) set(data, x, 2, 2, STONE);
    const mesh = meshChunk(data);
    for (let i = 0; i < mesh.positions.length; i += 3) {
      expect(mesh.positions[i]!).toBeGreaterThanOrEqual(0);
      expect(mesh.positions[i]!).toBeLessThanOrEqual(4);
    }
  });

  it("gives each face an axis-aligned unit normal", () => {
    const data = emptyChunk(4, 4);
    set(data, 1, 1, 1, STONE);
    const mesh = meshChunk(data);
    for (let i = 0; i < mesh.normals.length; i += 3) {
      const length = Math.abs(mesh.normals[i]!) + Math.abs(mesh.normals[i + 1]!) + Math.abs(mesh.normals[i + 2]!);
      expect(length).toBe(1);
    }
  });

  it("draws the solid face where water meets stone, not both", () => {
    const data = emptyChunk(4, 4);
    set(data, 1, 1, 1, STONE);
    set(data, 1, 2, 1, WATER);
    const mesh = meshChunk(data);
    // Stone loses its top face to the water above; water keeps its own
    // surface. Drawing both would double-shade every lake bed.
    expect(mesh.faces).toBe(5 + 5);
  });

  it("treats water against water as interior", () => {
    const data = emptyChunk(4, 4);
    set(data, 1, 1, 1, WATER);
    set(data, 1, 2, 1, WATER);
    expect(meshChunk(data).faces).toBe(10);
  });
});

describe("meshing real terrain", () => {
  const data = generateChunk(0, 0, 16, SEED);
  const mesh = meshChunk(data);

  it("produces geometry", () => {
    expect(mesh.faces).toBeGreaterThan(0);
  });

  it("draws a small fraction of what a cube per block would", () => {
    // The number that decides whether this world runs at all. A cube per
    // solid block would be six faces each; almost all of them are buried.
    let solid = 0;
    for (let x = 0; x < data.size; x += 1) {
      for (let z = 0; z < data.size; z += 1) {
        for (let y = 0; y < data.height; y += 1) {
          if (blockIn(data, x, y, z) !== AIR) solid += 1;
        }
      }
    }
    expect(solid).toBeGreaterThan(1000);
    expect(mesh.faces).toBeLessThan(solid * 6 * 0.12);
  });

  it("stays within a sane triangle budget for one chunk", () => {
    // Twenty-five of these are on screen at the default streaming radius.
    const triangles = mesh.faces * 2;
    expect(triangles).toBeLessThan(6000);
  });

  it("is identical for the same chunk and seed", () => {
    const again = meshChunk(generateChunk(0, 0, 16, SEED));
    expect(again.faces).toBe(mesh.faces);
    expect(again.positions).toEqual(mesh.positions);
  });

  it("differs between chunks", () => {
    expect(meshChunk(generateChunk(3, -2, 16, SEED)).faces).not.toBe(mesh.faces);
  });
});
