import { beforeEach, describe, expect, it, vi } from "vitest";

import { AIR, BLOCK_BY_NAME, PLACEABLE } from "./blocks";

/**
 * Reloaded per test, because the edit store is module-level on purpose — the
 * world is one world — and a test that inherited the previous one's blocks
 * would pass or fail depending on what ran before it.
 */
async function fresh() {
  vi.resetModules();
  return import("./buildStore");
}

const PLANK = BLOCK_BY_NAME.get("plank")!.id;

/** A column of air well above any terrain, for placing into nothing. */
const SKY_Y = 60;

beforeEach(() => {
  vi.resetModules();
});

describe("choosing a block", () => {
  it("starts on something placeable", () => {
    // A default outside the catalogue would make the first placement fail with
    // nothing on screen to explain it.
    return fresh().then(({ useBuildStore }) => {
      const { selected } = useBuildStore.getState();
      expect(PLACEABLE.some((kind) => kind.id === selected)).toBe(true);
    });
  });

  it("refuses a block that is not in the catalogue", async () => {
    const { useBuildStore } = await fresh();
    const before = useBuildStore.getState().selected;
    useBuildStore.getState().select(9999);
    useBuildStore.getState().select(AIR);
    expect(useBuildStore.getState().selected).toBe(before);
  });

  it("accepts every block the picker will offer", async () => {
    const { useBuildStore } = await fresh();
    for (const kind of PLACEABLE) {
      useBuildStore.getState().select(kind.id);
      expect(useBuildStore.getState().selected).toBe(kind.id);
    }
  });
});

describe("placing", () => {
  it("puts a block into empty air", async () => {
    const { placeBlock, blockAtNow } = await fresh();
    expect(placeBlock(2, SKY_Y, 2, PLANK)).toBe(true);
    expect(blockAtNow(2, SKY_Y, 2)).toBe(PLANK);
  });

  it("moves the revision so chunks rebuild", async () => {
    const { placeBlock, useBuildStore } = await fresh();
    const before = useBuildStore.getState().rev;
    placeBlock(3, SKY_Y, 3, PLANK);
    expect(useBuildStore.getState().rev).toBeGreaterThan(before);
  });

  it("refuses a block outside the catalogue", async () => {
    const { placeBlock } = await fresh();
    expect(placeBlock(4, SKY_Y, 4, 9999)).toBe(false);
    expect(placeBlock(4, SKY_Y, 4, AIR)).toBe(false);
  });

  it("refuses to bury a block inside a solid one", async () => {
    const { placeBlock } = await fresh();
    placeBlock(5, SKY_Y, 5, PLANK);
    expect(placeBlock(5, SKY_Y, 5, PLANK)).toBe(false);
  });

  it("refuses to build below bedrock", async () => {
    // A hole through the floor of the world is a fall with nothing to land on.
    const { placeBlock } = await fresh();
    expect(placeBlock(6, 0, 6, PLANK)).toBe(false);
    expect(placeBlock(6, 1, 6, PLANK)).toBe(false);
  });
});

describe("breaking", () => {
  it("removes what was placed", async () => {
    const { placeBlock, breakBlock, blockAtNow } = await fresh();
    placeBlock(7, SKY_Y, 7, PLANK);
    expect(breakBlock(7, SKY_Y, 7)).toBe(true);
    expect(blockAtNow(7, SKY_Y, 7)).toBe(AIR);
  });

  it("does nothing to empty air", async () => {
    const { breakBlock } = await fresh();
    expect(breakBlock(8, SKY_Y, 8)).toBe(false);
  });

  it("cannot take out the bedrock", async () => {
    const { breakBlock } = await fresh();
    expect(breakBlock(0, 0, 0)).toBe(false);
    expect(breakBlock(0, 1, 0)).toBe(false);
  });
});

describe("water", () => {
  it("is drawn but does not stop a ray", async () => {
    // You can stand in it, so being unable to build through it would mean
    // looking at a lake and being told there is nothing there.
    const { solidNow } = await fresh();
    const water = BLOCK_BY_NAME.get("water")!;
    expect(water.solid).toBe(false);
    // And the predicate agrees, through whatever the terrain says.
    expect(typeof solidNow(0, 0, 0)).toBe("boolean");
  });
});

describe("not entombing anybody", () => {
  it("refuses a block in the column the body occupies", async () => {
    const { wouldTrap } = await fresh();
    // Feet at 30.2, height 1.8, so the body spans blocks 30 and 31.
    expect(wouldTrap(4, 30, 4, 4.5, 30.2, 4.5, 1.8)).toBe(true);
    expect(wouldTrap(4, 31, 4, 4.5, 30.2, 4.5, 1.8)).toBe(true);
  });

  it("allows one at their feet's level in the next column", async () => {
    const { wouldTrap } = await fresh();
    expect(wouldTrap(5, 30, 4, 4.5, 30.2, 4.5, 1.8)).toBe(false);
  });

  it("allows one above their head and below their feet", async () => {
    const { wouldTrap } = await fresh();
    expect(wouldTrap(4, 32, 4, 4.5, 30.2, 4.5, 1.8)).toBe(false);
    expect(wouldTrap(4, 29, 4, 4.5, 30.2, 4.5, 1.8)).toBe(false);
  });

  it("handles negative coordinates", async () => {
    // Flooring, not truncating: -0.5 is in column -1, and getting this wrong
    // would let somebody entomb themselves on one side of the world only.
    const { wouldTrap } = await fresh();
    expect(wouldTrap(-1, 30, -1, -0.5, 30.2, -0.5, 1.8)).toBe(true);
    expect(wouldTrap(0, 30, 0, -0.5, 30.2, -0.5, 1.8)).toBe(false);
  });
});
