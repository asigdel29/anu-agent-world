import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The catalogue, checked as the boundary it is.
 *
 * This file is simultaneously the security boundary (a model cannot name
 * anything that is not in it), the performance boundary (every buffer is
 * allocated at a cap declared here), and the art boundary (everything that
 * can appear was authored deliberately). A defect in it is therefore not a
 * cosmetic problem — a missing cap is an unbounded allocation, and a collider
 * measured wrongly is a prop somebody walks through.
 *
 * The measured fields are checked for sanity rather than for exact values.
 * Asserting that a bench is 1.8 wide would make this a copy of the geometry
 * and would fail every time the art changed, which is precisely the coupling
 * the pipeline exists to remove.
 */

const ROOT = join(import.meta.dirname, "..", "..");

interface Kind {
  readonly id: string;
  readonly model: string;
  readonly sizeX: number;
  readonly sizeY: number;
  readonly sizeZ: number;
  readonly collider: {
    readonly halfX: number;
    readonly halfY: number;
    readonly halfZ: number;
    readonly offsetY: number;
  } | null;
  readonly bounds: number;
  readonly standable: boolean;
  readonly textSlots: number;
  readonly maxInstances: number;
  readonly material: string;
}

const catalog = JSON.parse(
  readFileSync(join(ROOT, "public", "world", "catalog.json"), "utf-8"),
) as { kinds: readonly Kind[] };

describe("the prop catalogue", () => {
  it("is not empty", () => {
    expect(catalog.kinds.length).toBeGreaterThan(0);
  });

  it("ships the geometry it names", () => {
    expect(existsSync(join(ROOT, "public", "models", "catalog", "catalog.glb"))).toBe(true);
  });

  it("gives every kind a distinct identifier", () => {
    // Two kinds sharing an id means one silently shadows the other, and the
    // one that loses is whichever the map happened to see last.
    const ids = new Set(catalog.kinds.map((k) => k.id));
    expect(ids.size).toBe(catalog.kinds.length);
  });

  it("gives every kind real dimensions", () => {
    for (const kind of catalog.kinds) {
      for (const size of [kind.sizeX, kind.sizeY, kind.sizeZ]) {
        expect(size, `${kind.id} has a zero dimension`).toBeGreaterThan(0);
        // A prop smaller than this cannot be seen from the diorama camera,
        // and one larger than this is terrain rather than a prop.
        expect(size, `${kind.id} is implausible`).toBeLessThan(8);
      }
    }
  });

  it("caps every kind, because the buffer is allocated at the cap", () => {
    // The number that makes a compromised model boring: an injection asking
    // for ten thousand lanterns gets this instead.
    for (const kind of catalog.kinds) {
      expect(kind.maxInstances, `${kind.id} is uncapped`).toBeGreaterThan(0);
      expect(kind.maxInstances, `${kind.id} is capped too high`).toBeLessThanOrEqual(1000);
    }
  });

  it("keeps the whole catalogue within one world's budget", () => {
    // Every cap allocates, so the sum is what a world actually reserves.
    const total = catalog.kinds.reduce((sum, k) => sum + k.maxInstances, 0);
    expect(total).toBeLessThanOrEqual(2000);
  });

  it("gives a collider dimensions that match the prop", () => {
    for (const kind of catalog.kinds) {
      if (kind.collider === null) continue;
      expect(kind.collider.halfX * 2).toBeCloseTo(kind.sizeX, 3);
      expect(kind.collider.halfY * 2).toBeCloseTo(kind.sizeY, 3);
      expect(kind.collider.halfZ * 2).toBeCloseTo(kind.sizeZ, 3);
    }
  });

  it("stands a collider on its base rather than straddling it", () => {
    // Props are authored sitting on the ground. A box centred on the origin
    // would put half of every prop underground.
    for (const kind of catalog.kinds) {
      if (kind.collider === null) continue;
      expect(kind.collider.offsetY).toBeCloseTo(kind.collider.halfY, 3);
    }
  });

  it("never calls something standable that has no collision", () => {
    // Standing on a thing the character passes through is a contradiction
    // the surface query cannot express.
    for (const kind of catalog.kinds) {
      if (kind.collider === null) {
        expect(kind.standable, `${kind.id} is standable but has no collider`).toBe(false);
      }
    }
  });

  it("keeps text to the kinds meant to carry it", () => {
    // Every text slot is a place visitor- or agent-authored words reach other
    // people, so the count of them is a number worth being able to see.
    const withText = catalog.kinds.filter((k) => k.textSlots > 0);
    expect(withText.length).toBeLessThanOrEqual(2);
    for (const kind of withText) expect(kind.textSlots).toBe(1);
  });

  it("reaches far enough to cull correctly", () => {
    // A bounding radius smaller than the prop culls it while it is still on
    // screen, which reads as props flickering out at the edge of vision.
    for (const kind of catalog.kinds) {
      const halfDiagonal = Math.max(kind.sizeX, kind.sizeY, kind.sizeZ) / 2;
      expect(kind.bounds, `${kind.id} culls too early`).toBeGreaterThanOrEqual(halfDiagonal);
    }
  });
});
