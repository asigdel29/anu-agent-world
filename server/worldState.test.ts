import { describe, expect, it } from "vitest";

import type { Placement } from "../protocol/placement";
import { admitBuild, expiredIds, mayRemove, mintId, oldestEvictable } from "./worldState";
import { EPHEMERAL_TTL_MS, WORLD_LIMITS } from "./worldRules";

const NOW = 1_750_000_000_000;
const RAW = { kind: "crate", x: 10, y: 0, z: -20, yaw: 0, scale: 1 };

const request = (over: Partial<Parameters<typeof admitBuild>[1]> = {}) => ({
  raw: RAW,
  authorId: "bbbbbbbb",
  now: NOW,
  permanent: false,
  ...over,
});

function worldOf(...places: Placement[]): Map<string, Placement> {
  return new Map(places.map((p) => [p.id, p]));
}

function made(id: string, over: Partial<Placement> = {}): Placement {
  return {
    id,
    kind: "crate",
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    scale: 1,
    cx: 0,
    cz: 0,
    rev: 1,
    authorId: "bbbbbbbb",
    createdAt: NOW,
    expiresAt: NOW + EPHEMERAL_TTL_MS,
    ...over,
  };
}

describe("mintId", () => {
  it("gives a different id to each request in a moment", () => {
    const ids = new Set(Array.from({ length: 50 }, (_, i) => mintId(NOW, i)));
    expect(ids.size).toBe(50);
  });

  it("cannot be chosen by a request", () => {
    // A request that could name its own key could overwrite somebody else's
    // object by guessing it.
    const outcome = admitBuild(new Map(), request({ raw: { ...RAW, id: "p-victim" } }), 0);
    expect(outcome.place?.id).toBe(mintId(NOW, 0));
  });
});

describe("admitBuild", () => {
  it("accepts a well-formed request", () => {
    const { place, refusal } = admitBuild(new Map(), request(), 0);
    expect(refusal).toBeNull();
    expect(place).toMatchObject({ kind: "crate", authorId: "bbbbbbbb" });
  });

  it("makes what a visitor builds temporary", () => {
    // Griefing is self-healing: no queue, no human in the loop, because
    // anything unwanted removes itself within a day.
    const { place } = admitBuild(new Map(), request(), 0);
    expect(place?.expiresAt).toBe(NOW + EPHEMERAL_TTL_MS);
  });

  it("lets a promoted placement be permanent", () => {
    const { place } = admitBuild(new Map(), request({ permanent: true }), 0);
    expect(place?.expiresAt).toBeNull();
  });

  it("refuses a kind outside the catalog", () => {
    const outcome = admitBuild(new Map(), request({ raw: { ...RAW, kind: "castle" } }), 0);
    expect(outcome.refusal).toContain("unknown kind");
    expect(outcome.place).toBeNull();
  });

  it("refuses a position outside the world", () => {
    const outcome = admitBuild(new Map(), request({ raw: { ...RAW, x: 99_999 } }), 0);
    expect(outcome.refusal).toBe("outside bounds");
  });

  it("refuses something it cannot read at all", () => {
    for (const raw of [null, "crate", 7, [], { kind: "crate" }]) {
      expect(admitBuild(new Map(), request({ raw }), 0).refusal).toBe("unreadable placement");
    }
  });

  it("attributes to the asker rather than to the request", () => {
    const outcome = admitBuild(
      new Map(),
      request({ raw: { ...RAW, authorId: "a-architect" } }),
      0,
    );
    expect(outcome.place?.authorId).toBe("bbbbbbbb");
  });
});

describe("the global cap", () => {
  const fill = (count: number, over: Partial<Placement> = {}) =>
    worldOf(...Array.from({ length: count }, (_, i) => made(`p${i}`, { createdAt: NOW + i, ...over })));

  it("leaves room alone below the cap", () => {
    const outcome = admitBuild(fill(3), request(), 0);
    expect(outcome.evicted).toEqual([]);
    expect(outcome.refusal).toBeNull();
  });

  it("trims the oldest temporary object rather than refusing", () => {
    // A world that starts erroring once it is full has failed in a way a
    // visitor cannot fix. One that trims keeps working.
    const outcome = admitBuild(fill(WORLD_LIMITS.maxLive), request(), 0);
    expect(outcome.refusal).toBeNull();
    expect(outcome.evicted).toEqual(["p0"]);
  });

  it("never evicts something that was promoted", () => {
    const world = fill(WORLD_LIMITS.maxLive, { expiresAt: null });
    const outcome = admitBuild(world, request(), 0);
    expect(outcome.refusal).toBe("world is full");
    expect(outcome.evicted).toEqual([]);
  });

  it("prefers a temporary object even when a permanent one is older", () => {
    const world = fill(WORLD_LIMITS.maxLive - 1, { expiresAt: null });
    world.set("temp", made("temp", { createdAt: NOW + 10_000 }));
    const outcome = admitBuild(world, request(), 0);
    expect(outcome.evicted).toEqual(["temp"]);
  });
});

describe("oldestEvictable", () => {
  it("finds the oldest temporary placement", () => {
    const world = worldOf(
      made("a", { createdAt: NOW + 300 }),
      made("b", { createdAt: NOW + 100 }),
      made("c", { createdAt: NOW + 200 }),
    );
    expect(oldestEvictable(world)).toBe("b");
  });

  it("returns nothing when everything is permanent", () => {
    expect(oldestEvictable(worldOf(made("a", { expiresAt: null })))).toBeNull();
  });

  it("returns nothing for an empty world", () => {
    expect(oldestEvictable(new Map())).toBeNull();
  });
});

describe("expiredIds", () => {
  it("names what has run out and nothing else", () => {
    const world = worldOf(
      made("gone", { expiresAt: NOW - 1 }),
      made("due", { expiresAt: NOW }),
      made("alive", { expiresAt: NOW + 1 }),
      made("kept", { expiresAt: null }),
    );
    expect(expiredIds(world, NOW).sort()).toEqual(["due", "gone"]);
  });
});

describe("mayRemove", () => {
  it("lets an author remove their own work", () => {
    expect(mayRemove(made("a", { authorId: "anu" }), "anu")).toBe(true);
  });

  it("refuses anyone else", () => {
    // Attribution is the mechanism: the world is a guestbook made of
    // buildings, not a surface anyone can wipe.
    expect(mayRemove(made("a", { authorId: "anu" }), "someone")).toBe(false);
  });

  it("refuses a placement that does not exist", () => {
    expect(mayRemove(undefined, "anu")).toBe(false);
  });
});
