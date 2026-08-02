import { describe, expect, it } from "vitest";

import type { Aabb } from "../collision/aabb";
import { buildCatalog } from "./catalogTypes";
import type { Placement, PlacementLimits } from "./placementOps";
import { createPlacementStore } from "./placementStore";

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
  {
    id: "tuft",
    shape: "box",
    sizeX: 0.4,
    sizeY: 0.4,
    sizeZ: 0.4,
    material: "flat",
    color: "#a1bf79",
    // Decorative: nothing to walk into or stand on.
    collider: null,
    standable: false,
    maxInstances: 400,
    bounds: 0.5,
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
  maxLive: 100,
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
    expiresAt: null,
    ...overrides,
  };
}

describe("createPlacementStore", () => {
  it("starts empty", () => {
    const store = createPlacementStore(CATALOG, LIMITS, 8);
    expect(store.snapshot().placements.size).toBe(0);
    expect(store.snapshot().boxes).toHaveLength(0);
  });

  it("does not apply queued operations until the frame commits", () => {
    // This is the guarantee: one ray in a frame must never see a crate that
    // the next ray does not.
    const store = createPlacementStore(CATALOG, LIMITS, 8);
    store.enqueue([{ t: "upsert", place: place() }]);

    expect(store.snapshot().placements.size).toBe(0);

    store.commitPending(1000);
    expect(store.snapshot().placements.size).toBe(1);
  });

  it("reports whether the world changed", () => {
    const store = createPlacementStore(CATALOG, LIMITS, 8);
    expect(store.commitPending(1000)).toBe(false);

    store.enqueue([{ t: "upsert", place: place() }]);
    expect(store.commitPending(1000)).toBe(true);
    expect(store.commitPending(1000)).toBe(false);
  });

  it("swaps in a whole new snapshot rather than mutating the old one", () => {
    // A frame that has already read the snapshot must keep seeing what it read.
    const store = createPlacementStore(CATALOG, LIMITS, 8);
    const before = store.snapshot();

    store.enqueue([{ t: "upsert", place: place() }]);
    store.commitPending(1000);

    expect(store.snapshot()).not.toBe(before);
    expect(before.placements.size).toBe(0);
  });

  it("bumps the version only when something changed", () => {
    const store = createPlacementStore(CATALOG, LIMITS, 8);
    const start = store.snapshot().version;

    store.commitPending(1000);
    expect(store.snapshot().version).toBe(start);

    store.enqueue([{ t: "upsert", place: place() }]);
    store.commitPending(1000);
    expect(store.snapshot().version).toBe(start + 1);
  });

  it("drains the queue so a commit is not applied twice", () => {
    const store = createPlacementStore(CATALOG, LIMITS, 8);
    store.enqueue([{ t: "upsert", place: place() }]);
    store.commitPending(1000);
    const version = store.snapshot().version;

    store.commitPending(1000);
    expect(store.snapshot().version).toBe(version);
  });

  describe("collision boxes", () => {
    it("builds a box for a kind that has one", () => {
      const store = createPlacementStore(CATALOG, LIMITS, 8);
      store.enqueue([{ t: "upsert", place: place() }]);
      store.commitPending(1000);

      expect(store.snapshot().boxes).toHaveLength(1);
    });

    it("builds no box for a decorative kind", () => {
      const store = createPlacementStore(CATALOG, LIMITS, 8);
      store.enqueue([{ t: "upsert", place: place({ kind: "tuft" }) }]);
      store.commitPending(1000);

      expect(store.snapshot().placements.size).toBe(1);
      expect(store.snapshot().boxes).toHaveLength(0);
    });

    it("makes new placements reachable through the hash", () => {
      const store = createPlacementStore(CATALOG, LIMITS, 8);
      store.enqueue([{ t: "upsert", place: place({ x: 3, z: 3 }) }]);
      store.commitPending(1000);

      const found: Aabb[] = [];
      store.snapshot().hash.near(3, 3, found);
      expect(found).toHaveLength(1);
    });
  });

  describe("expiry", () => {
    it("removes a placement whose lifetime has run out", () => {
      const store = createPlacementStore(CATALOG, LIMITS, 8);
      store.enqueue([{ t: "upsert", place: place({ expiresAt: 2000 }) }]);
      store.commitPending(1000);
      expect(store.snapshot().placements.size).toBe(1);

      store.commitPending(2500);
      expect(store.snapshot().placements.size).toBe(0);
    });

    it("keeps a promoted placement indefinitely", () => {
      const store = createPlacementStore(CATALOG, LIMITS, 8);
      store.enqueue([{ t: "upsert", place: place({ expiresAt: null }) }]);
      store.commitPending(1000);

      store.commitPending(Number.MAX_SAFE_INTEGER);
      expect(store.snapshot().placements.size).toBe(1);
    });

    it("expires through the same path as any other removal", () => {
      const store = createPlacementStore(CATALOG, LIMITS, 8);
      store.enqueue([{ t: "upsert", place: place({ expiresAt: 2000 }) }]);
      store.commitPending(1000);

      expect(store.commitPending(2500)).toBe(true);
      expect(store.snapshot().boxes).toHaveLength(0);
    });
  });
});
