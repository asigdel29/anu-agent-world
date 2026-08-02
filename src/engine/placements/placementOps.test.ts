import { describe, expect, it } from "vitest";

import { buildCatalog } from "./catalogTypes";
import type { Placement, PlacementLimits, PlacementMap, PlacementOp } from "./placementOps";
import {
  applyOps,
  expiredIds,
  oldestEphemeral,
  validatePlacement,
} from "./placementOps";

const CATALOG = buildCatalog([
  {
    id: "crate",
    shape: "box",
    sizeX: 1,
    sizeY: 1,
    sizeZ: 1,
    material: "dynamic",
    color: "#805749",
    collider: { halfX: 0.5, halfY: 0.5, halfZ: 0.5, offsetY: 0.5 },
    standable: true,
    maxInstances: 200,
    bounds: 1,
    textSlots: 0,
  },
]);

const LIMITS: PlacementLimits = {
  minX: -96,
  maxX: 96,
  minZ: -96,
  maxZ: 96,
  minY: -5,
  maxY: 40,
  minScale: 0.25,
  maxScale: 4,
  maxTextLength: 120,
  maxLive: 5,
};

function place(overrides: Partial<Placement> = {}): Placement {
  return {
    id: "p1",
    kind: "crate",
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    scale: 1,
    cx: 0,
    cz: 0,
    rev: 1,
    authorId: "visitor-1",
    createdAt: 1000,
    expiresAt: 2000,
    ...overrides,
  };
}

function mapOf(...places: Placement[]): PlacementMap {
  return new Map(places.map((p) => [p.id, p]));
}

describe("validatePlacement", () => {
  it("accepts a well-formed placement", () => {
    expect(validatePlacement(place(), CATALOG, LIMITS)).toBeNull();
  });

  it("rejects a kind that is not in the catalog", () => {
    // The catalog is the security boundary: a model talked out of its
    // instructions can still only name something that is or is not in a list.
    expect(validatePlacement(place({ kind: "trebuchet" }), CATALOG, LIMITS)).toContain(
      "unknown kind",
    );
  });

  it("rejects non-finite coordinates", () => {
    expect(validatePlacement(place({ x: Number.NaN }), CATALOG, LIMITS)).toContain("finite");
    expect(
      validatePlacement(place({ z: Number.POSITIVE_INFINITY }), CATALOG, LIMITS),
    ).toContain("finite");
  });

  it("rejects a position outside the world", () => {
    expect(validatePlacement(place({ x: 5000 }), CATALOG, LIMITS)).toContain("bounds");
  });

  it("rejects a scale outside the permitted range", () => {
    expect(validatePlacement(place({ scale: 0 }), CATALOG, LIMITS)).toContain("scale");
    expect(validatePlacement(place({ scale: 99 }), CATALOG, LIMITS)).toContain("scale");
  });

  it("rejects overlong text", () => {
    const long = "x".repeat(LIMITS.maxTextLength + 1);
    expect(validatePlacement(place({ text: long }), CATALOG, LIMITS)).toContain("too long");
  });

  it("rejects a colour outside the palette", () => {
    // Free hex is one more field where an arbitrary string reaches a renderer.
    expect(validatePlacement(place({ color: "#123456" }), CATALOG, LIMITS)).toContain(
      "palette",
    );
  });

  it("accepts a colour from the palette", () => {
    expect(validatePlacement(place({ color: "#ff4f38" }), CATALOG, LIMITS)).toBeNull();
  });
});

describe("applyOps", () => {
  it("adds a placement", () => {
    const next = applyOps(new Map(), [{ t: "upsert", place: place() }], CATALOG, LIMITS);
    expect(next.get("p1")).toBeDefined();
  });

  it("removes a placement", () => {
    const next = applyOps(
      mapOf(place()),
      [{ t: "remove", id: "p1", rev: 2 }],
      CATALOG,
      LIMITS,
    );
    expect(next.has("p1")).toBe(false);
  });

  it("returns the same map when nothing applied", () => {
    // Lets a renderer skip work on the common case of a redelivered batch.
    const current = mapOf(place());
    const next = applyOps(current, [], CATALOG, LIMITS);
    expect(next).toBe(current);
  });

  describe("ordering", () => {
    it("ignores an update older than what is applied", () => {
      const current = mapOf(place({ rev: 5, scale: 2 }));
      const next = applyOps(
        current,
        [{ t: "upsert", place: place({ rev: 3, scale: 1 }) }],
        CATALOG,
        LIMITS,
      );
      expect(next.get("p1")?.scale).toBe(2);
    });

    it("ignores an update at the same revision", () => {
      const current = mapOf(place({ rev: 5, scale: 2 }));
      const next = applyOps(
        current,
        [{ t: "upsert", place: place({ rev: 5, scale: 1 }) }],
        CATALOG,
        LIMITS,
      );
      expect(next.get("p1")?.scale).toBe(2);
    });

    it("ignores a removal older than the placement", () => {
      // A removal overtaken in flight must not delete something placed after
      // it was issued.
      const current = mapOf(place({ rev: 5 }));
      const next = applyOps(current, [{ t: "remove", id: "p1", rev: 3 }], CATALOG, LIMITS);
      expect(next.has("p1")).toBe(true);
    });

    it("applies a newer update", () => {
      const current = mapOf(place({ rev: 1, scale: 1 }));
      const next = applyOps(
        current,
        [{ t: "upsert", place: place({ rev: 2, scale: 3 }) }],
        CATALOG,
        LIMITS,
      );
      expect(next.get("p1")?.scale).toBe(3);
    });
  });

  describe("idempotency", () => {
    it("reaches the same state when a batch is delivered twice", () => {
      const ops: PlacementOp[] = [{ t: "upsert", place: place() }];
      const once = applyOps(new Map(), ops, CATALOG, LIMITS);
      const twice = applyOps(once, ops, CATALOG, LIMITS);
      expect([...twice.keys()]).toEqual([...once.keys()]);
    });

    it("tolerates removing something that is already gone", () => {
      const next = applyOps(new Map(), [{ t: "remove", id: "ghost", rev: 1 }], CATALOG, LIMITS);
      expect(next.size).toBe(0);
    });
  });

  describe("resilience", () => {
    it("discards an invalid operation without stopping the batch", () => {
      // One bad frame must not block the good ones behind it.
      const ops: PlacementOp[] = [
        { t: "upsert", place: place({ id: "bad", kind: "trebuchet" }) },
        { t: "upsert", place: place({ id: "good" }) },
      ];
      const next = applyOps(new Map(), ops, CATALOG, LIMITS);
      expect(next.has("bad")).toBe(false);
      expect(next.has("good")).toBe(true);
    });

    it("refuses a new placement once the world is full", () => {
      let map: PlacementMap = new Map();
      for (let i = 0; i < LIMITS.maxLive; i += 1) {
        map = applyOps(
          map,
          [{ t: "upsert", place: place({ id: `p${String(i)}` }) }],
          CATALOG,
          LIMITS,
        );
      }
      const overflow = applyOps(
        map,
        [{ t: "upsert", place: place({ id: "one-too-many" }) }],
        CATALOG,
        LIMITS,
      );
      expect(overflow.has("one-too-many")).toBe(false);
      expect(overflow.size).toBe(LIMITS.maxLive);
    });

    it("still updates an existing placement when the world is full", () => {
      let map: PlacementMap = new Map();
      for (let i = 0; i < LIMITS.maxLive; i += 1) {
        map = applyOps(
          map,
          [{ t: "upsert", place: place({ id: `p${String(i)}` }) }],
          CATALOG,
          LIMITS,
        );
      }
      const updated = applyOps(
        map,
        [{ t: "upsert", place: place({ id: "p0", rev: 9, scale: 2 }) }],
        CATALOG,
        LIMITS,
      );
      expect(updated.get("p0")?.scale).toBe(2);
    });
  });
});

describe("expiredIds", () => {
  it("finds placements past their expiry", () => {
    const map = mapOf(place({ id: "old", expiresAt: 500 }), place({ id: "new", expiresAt: 5000 }));
    expect(expiredIds(map, 1000)).toEqual(["old"]);
  });

  it("never expires a promoted placement", () => {
    // Promotion is the owner's act, and it is what makes something permanent.
    const map = mapOf(place({ id: "kept", expiresAt: null }));
    expect(expiredIds(map, Number.MAX_SAFE_INTEGER)).toEqual([]);
  });
});

describe("oldestEphemeral", () => {
  it("finds the least recent temporary placement", () => {
    const map = mapOf(
      place({ id: "a", createdAt: 300 }),
      place({ id: "b", createdAt: 100 }),
      place({ id: "c", createdAt: 200 }),
    );
    expect(oldestEphemeral(map)).toBe("b");
  });

  it("never proposes evicting a promoted placement", () => {
    const map = mapOf(place({ id: "kept", createdAt: 1, expiresAt: null }));
    expect(oldestEphemeral(map)).toBeNull();
  });
});
