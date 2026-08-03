import { describe, expect, it } from "vitest";

import { castVoxel, placementFor } from "./raycast";

/** A world with one solid block, for reasoning about a single face. */
function only(bx: number, by: number, bz: number) {
  return (x: number, y: number, z: number) => x === bx && y === by && z === bz;
}

/** A world with a solid floor at and below y = 0. */
const floor = (_x: number, y: number): boolean => y <= 0;

const NOTHING = (): boolean => false;

describe("finding a block", () => {
  it("hits one straight ahead", () => {
    const hit = castVoxel(0.5, 0.5, 0.5, 1, 0, 0, 10, only(4, 0, 0));
    expect(hit).toMatchObject({ x: 4, y: 0, z: 0 });
  });

  it("reports the face it came in through", () => {
    // Travelling along +x, the face entered is the one facing -x, so the
    // normal points back at the ray. Getting this backwards buries a placed
    // block inside the one it was placed against.
    const hit = castVoxel(0.5, 0.5, 0.5, 1, 0, 0, 10, only(4, 0, 0));
    expect(hit).toMatchObject({ nx: -1, ny: 0, nz: 0 });
  });

  it("reports the face on each axis and direction", () => {
    const cases = [
      { d: [1, 0, 0], block: [3, 0, 0], n: [-1, 0, 0] },
      { d: [-1, 0, 0], block: [-3, 0, 0], n: [1, 0, 0] },
      { d: [0, 1, 0], block: [0, 3, 0], n: [0, -1, 0] },
      { d: [0, -1, 0], block: [0, -3, 0], n: [0, 1, 0] },
      { d: [0, 0, 1], block: [0, 0, 3], n: [0, 0, -1] },
      { d: [0, 0, -1], block: [0, 0, -3], n: [0, 0, 1] },
    ];
    for (const c of cases) {
      const hit = castVoxel(
        0.5,
        0.5,
        0.5,
        c.d[0]!,
        c.d[1]!,
        c.d[2]!,
        10,
        only(c.block[0]!, c.block[1]!, c.block[2]!),
      );
      expect(hit).toMatchObject({ nx: c.n[0], ny: c.n[1], nz: c.n[2] });
    }
  });

  it("returns nothing when there is nothing", () => {
    expect(castVoxel(0.5, 0.5, 0.5, 1, 0, 0, 10, NOTHING)).toBeNull();
  });

  it("returns nothing for a zero direction", () => {
    expect(castVoxel(0.5, 0.5, 0.5, 0, 0, 0, 10, floor)).toBeNull();
  });
});

describe("reach", () => {
  it("stops at the limit", () => {
    // Five blocks of reach must not find one eight away, or a visitor can
    // rearrange terrain they cannot walk to.
    expect(castVoxel(0.5, 0.5, 0.5, 1, 0, 0, 5, only(8, 0, 0))).toBeNull();
  });

  it("finds one inside the limit", () => {
    expect(castVoxel(0.5, 0.5, 0.5, 1, 0, 0, 5, only(4, 0, 0))).toMatchObject({ x: 4 });
  });

  it("rejects a block entered just past the limit", () => {
    // The case that pins the order of the two checks inside the walk. From
    // x = 0.5, cell 6 is entered at 5.5 — past a reach of 5 — so it must be
    // refused. Testing what a cell contains before testing how far away it is
    // makes this hit, and every other reach test still passes, which is how
    // the ordering survived until it was mutated.
    expect(castVoxel(0.5, 0.5, 0.5, 1, 0, 0, 5, only(6, 0, 0))).toBeNull();
  });

  it("accepts a block entered just inside the limit", () => {
    // The other side of the same boundary, so the fix cannot be "reject more".
    expect(castVoxel(0.5, 0.5, 0.5, 1, 0, 0, 5, only(5, 0, 0))).toMatchObject({ x: 5 });
  });

  it("measures distance along the ray, not along an axis", () => {
    // A diagonal ray crosses more distance per block of x than a straight one,
    // so a limit applied per axis would reach further diagonally.
    const straight = castVoxel(0.5, 0.5, 0.5, 1, 0, 0, 4.5, only(4, 0, 0));
    const diagonal = castVoxel(0.5, 0.5, 0.5, 1, 0, 1, 4.5, only(4, 0, 4));
    expect(straight).not.toBeNull();
    expect(diagonal).toBeNull();
  });
});

describe("the cell the ray starts in", () => {
  it("is never the answer", () => {
    // The camera clips into terrain routinely. A hit on the starting cell
    // would let a click act on whatever the camera is buried in rather than
    // on what is on screen.
    const inside = castVoxel(4.5, 0.5, 0.5, 1, 0, 0, 10, only(4, 0, 0));
    expect(inside).toBeNull();
  });

  it("still finds the next one along", () => {
    const solid = (x: number, y: number, z: number): boolean =>
      (x === 4 || x === 6) && y === 0 && z === 0;
    expect(castVoxel(4.5, 0.5, 0.5, 1, 0, 0, 10, solid)).toMatchObject({ x: 6 });
  });
});

describe("looking down at a floor", () => {
  it("hits the top face", () => {
    const hit = castVoxel(0.5, 4.5, 0.5, 0, -1, 0, 10, floor);
    expect(hit).toMatchObject({ x: 0, y: 0, z: 0, ny: 1 });
  });

  it("places on top of what it hit", () => {
    const hit = castVoxel(0.5, 4.5, 0.5, 0, -1, 0, 10, floor);
    expect(placementFor(hit!)).toEqual({ x: 0, y: 1, z: 0 });
  });

  it("does not place inside what it hit", () => {
    // The whole point of carrying a normal. Without it a placed block lands
    // in the block it was placed against and is invisible.
    const hit = castVoxel(0.5, 4.5, 0.5, 0, -1, 0, 10, floor);
    const at = placementFor(hit!);
    expect(floor(at.x, at.y)).toBe(false);
  });
});

describe("negative space", () => {
  it("works below the origin plane", () => {
    // Cells are floored, so -0.5 is in cell -1. Truncating instead would make
    // two cells share an index and building would go wrong on one side of the
    // world only.
    const hit = castVoxel(-0.5, 5.5, -0.5, 0, -1, 0, 10, (_x, y) => y <= -3);
    expect(hit).toMatchObject({ x: -1, y: -3, z: -1, ny: 1 });
  });

  it("places against a face in negative space", () => {
    const hit = castVoxel(-0.5, 5.5, -0.5, 0, -1, 0, 10, (_x, y) => y <= -3);
    expect(placementFor(hit!)).toEqual({ x: -1, y: -2, z: -1 });
  });
});

describe("a long shallow ray", () => {
  it("terminates rather than spinning", () => {
    // A ray almost parallel to an axis crosses very few boundaries on it. The
    // walk has to end on distance rather than on boundary count.
    const hit = castVoxel(0.5, 0.5, 0.5, 1, 0.0001, 0, 20, NOTHING);
    expect(hit).toBeNull();
  });

  it("still finds something along the way", () => {
    const hit = castVoxel(0.5, 0.5, 0.5, 1, 0.0001, 0, 20, only(9, 0, 0));
    expect(hit).toMatchObject({ x: 9, y: 0, z: 0 });
  });
});
