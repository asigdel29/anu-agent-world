import { describe, expect, it } from "vitest";

import type { ChunkRadii } from "../config/types";
import type { ChunkSpec } from "./chunkGrid";
import {
  chunkDistance,
  chunkRangeDistance,
  deriveExtents,
  initialSelection,
  radiiForDevice,
  selectChunks,
  shouldBeVisible,
  worldToChunk,
} from "./chunkGrid";

const SIZE = 32;

const RADII: ChunkRadii = {
  loadRadius: 2,
  unloadRadius: 3,
  colliderRadius: 1,
  prefetchRadius: 3,
};

/** A three-by-three grid of single-cell chunks centred on the origin cell. */
function grid(): ChunkSpec[] {
  const chunks: ChunkSpec[] = [];
  for (let cx = -4; cx <= 4; cx += 1) {
    for (let cz = -4; cz <= 4; cz += 1) {
      chunks.push({ id: `c${String(cx)}_${String(cz)}`, cx, cz });
    }
  }
  return chunks;
}

describe("worldToChunk", () => {
  it("places the origin in cell zero", () => {
    expect(worldToChunk(0, 0, SIZE)).toEqual([0, 0]);
  });

  it("places a position inside the first cell in cell zero", () => {
    expect(worldToChunk(31.9, 31.9, SIZE)).toEqual([0, 0]);
  });

  it("rounds toward negative infinity so cells tile without a gap at zero", () => {
    expect(worldToChunk(-0.1, -0.1, SIZE)).toEqual([-1, -1]);
  });
});

describe("chunkDistance", () => {
  it("measures diagonals as a single step", () => {
    // Chebyshev, not Euclidean: the loaded region is a square ring.
    expect(chunkDistance(0, 0, 1, 1)).toBe(1);
  });

  it("is zero for the same cell", () => {
    expect(chunkDistance(2, -3, 2, -3)).toBe(0);
  });
});

describe("chunkRangeDistance", () => {
  const wide: ChunkSpec = { id: "wide", cx: 0, cz: 0, spanX: 5, spanZ: 5 };

  it("is zero anywhere inside a wide chunk", () => {
    // Measuring to the corner instead would unload the ground underfoot as
    // the player walked across a large piece.
    expect(chunkRangeDistance(2, 2, wide)).toBe(0);
    expect(chunkRangeDistance(4, 4, wide)).toBe(0);
  });

  it("measures from the nearest edge outside it", () => {
    expect(chunkRangeDistance(6, 2, wide)).toBe(2);
    expect(chunkRangeDistance(-1, 0, wide)).toBe(1);
  });

  it("treats an absent span as a single cell", () => {
    expect(chunkRangeDistance(2, 0, { id: "one", cx: 0, cz: 0 })).toBe(2);
  });
});

describe("initialSelection", () => {
  it("mounts only the spawn-eager chunks", () => {
    const chunks: ChunkSpec[] = [
      { id: "eager", cx: 0, cz: 0, spawnEager: true },
      { id: "far", cx: 9, cz: 9 },
    ];
    expect(initialSelection(chunks).active).toEqual(["eager"]);
  });

  it("registers collision for the eager chunks that always collide", () => {
    // Otherwise the character falls through the world for the frames between
    // the first paint and the first selection pass.
    const chunks: ChunkSpec[] = [
      { id: "ground", cx: 0, cz: 0, spawnEager: true, alwaysCollide: true },
      { id: "scenery", cx: 0, cz: 0, spawnEager: true },
    ];
    expect(initialSelection(chunks).colliders).toEqual(["ground"]);
  });
});

describe("selectChunks", () => {
  it("mounts everything inside the load radius", () => {
    const selection = selectChunks(0, 0, grid(), SIZE, null, RADII);
    expect(selection.active).toContain("c0_0");
    expect(selection.active).toContain("c2_2");
    expect(selection.active).not.toContain("c4_4");
  });

  it("registers collision only for the tighter ring", () => {
    const selection = selectChunks(0, 0, grid(), SIZE, null, RADII);
    expect(selection.colliders).toContain("c1_0");
    expect(selection.colliders).not.toContain("c2_0");
  });

  it("warms chunks just beyond the mounted region", () => {
    const selection = selectChunks(0, 0, grid(), SIZE, null, RADII);
    expect(selection.prefetch).toContain("c3_0");
    expect(selection.prefetch).not.toContain("c0_0");
  });

  it("always mounts spawn-eager chunks however far away the player walks", () => {
    const chunks: ChunkSpec[] = [{ id: "eager", cx: 0, cz: 0, spawnEager: true }];
    const selection = selectChunks(9999, 9999, chunks, SIZE, null, RADII);
    expect(selection.active).toEqual(["eager"]);
  });

  it("keeps collision on an always-collide chunk beyond the collider ring", () => {
    const chunks: ChunkSpec[] = [
      { id: "big", cx: 0, cz: 0, spanX: 5, spanZ: 5, alwaysCollide: true },
    ];
    const selection = selectChunks(0, 0, chunks, SIZE, null, RADII);
    expect(selection.colliders).toEqual(["big"]);
  });

  describe("hysteresis", () => {
    it("keeps a chunk mounted between the load and unload radii", () => {
      const chunks = grid();
      // Standing where c0_0 is two cells away: inside load, so it mounts.
      const near = selectChunks(2 * SIZE, 0, chunks, SIZE, null, RADII);
      expect(near.active).toContain("c0_0");

      // Step out to three cells: past load, still inside unload, so it stays.
      const stepped = selectChunks(3 * SIZE, 0, chunks, SIZE, near, RADII);
      expect(stepped.active).toContain("c0_0");
    });

    it("unloads a chunk once it passes the unload radius", () => {
      const chunks = grid();
      const near = selectChunks(0, 0, chunks, SIZE, null, RADII);
      const far = selectChunks(4 * SIZE, 0, chunks, SIZE, near, RADII);
      expect(far.active).not.toContain("c0_0");
    });

    it("does not thrash while pacing a cell boundary", () => {
      // The failure this prevents is a stutter exactly where a player is most
      // likely to be standing still and looking around.
      const chunks = grid();
      let selection = selectChunks(2 * SIZE + 1, 0, chunks, SIZE, null, RADII);
      const firstActive = [...selection.active];

      for (let i = 0; i < 20; i += 1) {
        const x = i % 2 === 0 ? 2 * SIZE + 1 : 3 * SIZE - 1;
        selection = selectChunks(x, 0, chunks, SIZE, selection, RADII);
      }

      expect([...selection.active].sort()).toEqual(firstActive.sort());
    });
  });

  describe("identity", () => {
    it("returns the previous selection unchanged when nothing moved", () => {
      // Callers hold this in state and compare by reference to skip work.
      const chunks = grid();
      const first = selectChunks(0, 0, chunks, SIZE, null, RADII);
      const second = selectChunks(1, 1, chunks, SIZE, first, RADII);
      expect(second).toBe(first);
    });

    it("returns a new selection when the set changes", () => {
      const chunks = grid();
      const first = selectChunks(0, 0, chunks, SIZE, null, RADII);
      const second = selectChunks(4 * SIZE, 0, chunks, SIZE, first, RADII);
      expect(second).not.toBe(first);
    });
  });
});

describe("deriveExtents", () => {
  it("returns nothing for an empty manifest", () => {
    expect(deriveExtents([], SIZE)).toBeNull();
  });

  it("spans the outer edges of the outermost cells", () => {
    const chunks: ChunkSpec[] = [
      { id: "a", cx: -2, cz: -2 },
      { id: "b", cx: 1, cz: 1 },
    ];
    expect(deriveExtents(chunks, SIZE)).toEqual({
      minX: -64,
      maxX: 64,
      minZ: -64,
      maxZ: 64,
    });
  });

  it("accounts for chunks that span several cells", () => {
    const chunks: ChunkSpec[] = [{ id: "wide", cx: 0, cz: 0, spanX: 4, spanZ: 2 }];
    expect(deriveExtents(chunks, SIZE)).toEqual({
      minX: 0,
      maxX: 128,
      minZ: 0,
      maxZ: 64,
    });
  });
});

describe("radiiForDevice", () => {
  const mobile: ChunkRadii = {
    loadRadius: 1,
    unloadRadius: 2,
    colliderRadius: 1,
    prefetchRadius: 2,
  };

  it("gives a touch device the tighter ring", () => {
    expect(radiiForDevice(true, RADII, mobile)).toBe(mobile);
  });

  it("gives a mouse the wider ring", () => {
    expect(radiiForDevice(false, RADII, mobile)).toBe(RADII);
  });
});

describe("shouldBeVisible", () => {
  it("shows a hidden group once inside the show radius", () => {
    expect(shouldBeVisible(9 * 9, false, 10, 14)).toBe(true);
  });

  it("leaves a hidden group hidden between the two radii", () => {
    expect(shouldBeVisible(12 * 12, false, 10, 14)).toBe(false);
  });

  it("keeps a visible group visible between the two radii", () => {
    expect(shouldBeVisible(12 * 12, true, 10, 14)).toBe(true);
  });

  it("hides a visible group past the hide radius", () => {
    expect(shouldBeVisible(15 * 15, true, 10, 14)).toBe(false);
  });
});
