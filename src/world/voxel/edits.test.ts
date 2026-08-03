import { describe, expect, it } from "vitest";

import { AIR, BLOCK_BY_NAME } from "./blocks";
import { blockIn, generateChunk } from "./chunkData";
import {
  cellOf,
  clearEdit,
  createEdits,
  editAt,
  editCount,
  editRevAround,
  editsAround,
  setEdit,
} from "./edits";

const SIZE = 16;
const PLANK = BLOCK_BY_NAME.get("plank")!.id;
const SEED = 4242;

describe("cells", () => {
  it("floors rather than truncates", () => {
    // The world runs in both directions, and truncation would put -1 and 1 in
    // the same cell while leaving cell -1 with fifteen columns.
    expect(cellOf(0, SIZE)).toBe(0);
    expect(cellOf(15, SIZE)).toBe(0);
    expect(cellOf(16, SIZE)).toBe(1);
    expect(cellOf(-1, SIZE)).toBe(-1);
    expect(cellOf(-16, SIZE)).toBe(-1);
    expect(cellOf(-17, SIZE)).toBe(-2);
  });
});

describe("recording an edit", () => {
  it("reads back what was written", () => {
    const edits = createEdits(SIZE);
    setEdit(edits, 3, 30, -7, PLANK);
    expect(editAt(edits, 3, 30, -7)).toBe(PLANK);
  });

  it("knows nothing about a block nobody touched", () => {
    const edits = createEdits(SIZE);
    expect(editAt(edits, 1, 1, 1)).toBeUndefined();
  });

  it("treats air as a decision, not an absence", () => {
    // Breaking a block has to be recorded. An absent entry already means
    // "whatever the generator said", and what it said there was stone.
    const edits = createEdits(SIZE);
    setEdit(edits, 5, 20, 5, AIR);
    expect(editAt(edits, 5, 20, 5)).toBe(AIR);
    expect(editCount(edits)).toBe(1);
  });

  it("undo is not the same as placing air", () => {
    const edits = createEdits(SIZE);
    setEdit(edits, 5, 20, 5, AIR);
    clearEdit(edits, 5, 20, 5);
    expect(editAt(edits, 5, 20, 5)).toBeUndefined();
    expect(editCount(edits)).toBe(0);
  });

  it("reports whether anything changed", () => {
    const edits = createEdits(SIZE);
    expect(setEdit(edits, 0, 10, 0, PLANK)).toBe(true);
    // Placing the block that is already there must not force a rebuild.
    expect(setEdit(edits, 0, 10, 0, PLANK)).toBe(false);
    expect(clearEdit(edits, 0, 10, 0)).toBe(true);
    expect(clearEdit(edits, 0, 10, 0)).toBe(false);
  });
});

describe("revisions", () => {
  it("moves when a chunk's own cell changes", () => {
    const edits = createEdits(SIZE);
    const before = editRevAround(edits, 0, 0);
    setEdit(edits, 2, 25, 2, PLANK);
    expect(editRevAround(edits, 0, 0)).toBeGreaterThan(before);
  });

  it("moves when a neighbour's edge changes", () => {
    // A chunk draws faces against blocks in the next chunk, so an edit just
    // over the boundary changes what it must draw.
    const edits = createEdits(SIZE);
    const before = editRevAround(edits, 0, 0);
    setEdit(edits, SIZE + 1, 25, 0, PLANK);
    expect(editRevAround(edits, 0, 0)).toBeGreaterThan(before);
  });

  it("stays put when a distant cell changes", () => {
    const edits = createEdits(SIZE);
    const before = editRevAround(edits, 0, 0);
    setEdit(edits, SIZE * 5, 25, SIZE * 5, PLANK);
    expect(editRevAround(edits, 0, 0)).toBe(before);
  });

  it("does not move when nothing changed", () => {
    const edits = createEdits(SIZE);
    setEdit(edits, 2, 25, 2, PLANK);
    const after = editRevAround(edits, 0, 0);
    setEdit(edits, 2, 25, 2, PLANK);
    expect(editRevAround(edits, 0, 0)).toBe(after);
  });
});

describe("gathering", () => {
  it("collects from the nine cells around a chunk", () => {
    const edits = createEdits(SIZE);
    setEdit(edits, 1, 25, 1, PLANK);
    setEdit(edits, -1, 25, -1, PLANK);
    setEdit(edits, SIZE, 25, SIZE, PLANK);
    setEdit(edits, SIZE * 4, 25, 0, PLANK);
    const found = editsAround(edits, 0, 0);
    expect(found).toHaveLength(3);
    expect(found.every((e) => Number.isFinite(e.x) && Number.isFinite(e.z))).toBe(true);
  });

  it("survives negative coordinates through the key round trip", () => {
    const edits = createEdits(SIZE);
    setEdit(edits, -3, 12, -9, PLANK);
    const found = editsAround(edits, -1, -1);
    expect(found).toContainEqual({ x: -3, y: 12, z: -9, block: PLANK });
  });
});

describe("a generated chunk with edits", () => {
  it("is unchanged when there are none", () => {
    const plain = generateChunk(0, 0, SIZE, SEED);
    const empty = generateChunk(0, 0, SIZE, SEED, undefined, createEdits(SIZE));
    expect(empty.maxY).toBe(plain.maxY);
    expect(Array.from(empty.blocks)).toEqual(Array.from(plain.blocks));
  });

  it("shows a block placed in the air, and raises the scan ceiling", () => {
    const plain = generateChunk(0, 0, SIZE, SEED);
    const above = plain.maxY + 6;
    const edits = createEdits(SIZE);
    setEdit(edits, 4, above, 4, PLANK);

    const built = generateChunk(0, 0, SIZE, SEED, undefined, edits);
    expect(blockIn(built, 4, above, 4)).toBe(PLANK);
    // Without this the mesher stops scanning below the block and draws
    // nothing, which is a placement that silently does not appear.
    expect(built.maxY).toBeGreaterThanOrEqual(above);
  });

  it("removes a block that was broken", () => {
    const plain = generateChunk(0, 0, SIZE, SEED);
    // Find something solid to break rather than assuming where the ground is.
    let target: { y: number } | null = null;
    for (let y = plain.maxY; y >= 0 && !target; y -= 1) {
      if (blockIn(plain, 8, y, 8) !== AIR) target = { y };
    }
    expect(target).not.toBeNull();

    const edits = createEdits(SIZE);
    setEdit(edits, 8, target!.y, 8, AIR);
    const broken = generateChunk(0, 0, SIZE, SEED, undefined, edits);
    expect(blockIn(broken, 8, target!.y, 8)).toBe(AIR);
  });

  it("beats a tree that would have grown through it", () => {
    // Edits are applied after foliage on purpose. Applying them first would
    // let a crown overwrite a placed block, and the block would vanish on the
    // next visit rather than at the moment somebody watched it happen.
    const edits = createEdits(SIZE);
    const plain = generateChunk(0, 0, SIZE, SEED);
    const leaves = BLOCK_BY_NAME.get("leaves")!.id;
    let found: { x: number; y: number; z: number } | null = null;
    for (let x = 0; x < SIZE && !found; x += 1) {
      for (let z = 0; z < SIZE && !found; z += 1) {
        for (let y = 0; y <= plain.maxY; y += 1) {
          if (blockIn(plain, x, y, z) === leaves) {
            found = { x, y, z };
            break;
          }
        }
      }
    }
    // Asserted rather than skipped: an early return here would make this test
    // pass on a chunk with no trees in it, which is the shape of a test that
    // silently stops testing anything.
    if (!found) throw new Error("this chunk has no crown to test against");
    setEdit(edits, found.x, found.y, found.z, AIR);
    const built = generateChunk(0, 0, SIZE, SEED, undefined, edits);
    expect(blockIn(built, found.x, found.y, found.z)).toBe(AIR);
  });

  it("shows a neighbour's edit inside the margin", () => {
    // The case that decides whether boundary faces are right: a block placed
    // one step over the edge has to be visible to this chunk, or it draws a
    // face into what it thinks is empty air.
    const edits = createEdits(SIZE);
    const y = 30;
    setEdit(edits, SIZE, y, 4, PLANK);
    const built = generateChunk(0, 0, SIZE, SEED, undefined, edits);
    expect(blockIn(built, SIZE, y, 4)).toBe(PLANK);
  });
});
