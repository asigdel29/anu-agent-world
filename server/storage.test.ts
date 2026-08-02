import { describe, expect, it } from "vitest";

import { NAMESPACE, idFrom, keyFor, partitionFresh } from "./storage";

const TTL = 5 * 60_000;
const NOW = 1_750_000_000_000;

const player = (ts: number) => ({
  pos: [0, 0, 0] as const,
  yaw: 0,
  action: "idle",
  character: "a",
  ts,
});

describe("keyFor / idFrom", () => {
  it("round-trips an identifier", () => {
    expect(idFrom("player", keyFor("player", "b7f2"))).toBe("b7f2");
  });

  it("refuses a key from another namespace", () => {
    expect(idFrom("player", keyFor("sim", "weather"))).toBeNull();
    expect(idFrom("sim", keyFor("player", "b7f2"))).toBeNull();
  });

  it("keeps the namespaces distinct", () => {
    const prefixes = Object.values(NAMESPACE);
    expect(new Set(prefixes).size).toBe(prefixes.length);
  });
});

describe("partitionFresh", () => {
  it("keeps a record written within the window", () => {
    const entries = [[keyFor("player", "a"), player(NOW - 1000)]] as const;
    const { live, expired } = partitionFresh(entries, "player", NOW, TTL);
    expect(live.map((e) => e.id)).toEqual(["a"]);
    expect(expired).toEqual([]);
  });

  it("expires a record older than the window", () => {
    const entries = [[keyFor("player", "a"), player(NOW - TTL - 1)]] as const;
    const { live, expired } = partitionFresh(entries, "player", NOW, TTL);
    expect(live).toEqual([]);
    expect(expired).toEqual(["player:a"]);
  });

  it("keeps a record exactly at the boundary", () => {
    const entries = [[keyFor("player", "a"), player(NOW - TTL)]] as const;
    expect(partitionFresh(entries, "player", NOW, TTL).live).toHaveLength(1);
  });

  it("never touches another namespace", () => {
    // The defect this replaces: an unprefixed list plus a timestamp sweep
    // deleted the world's weather the first time anyone connected, because
    // `now - undefined <= TTL` is false and the record looked expired.
    const entries = [
      [keyFor("player", "a"), player(NOW)],
      [keyFor("sim", "weather"), { kind: "rain" } as unknown as { ts?: unknown }],
      [keyFor("sched", "next"), { at: NOW } as unknown as { ts?: unknown }],
      [keyFor("place", "p1"), { kind: "crate" } as unknown as { ts?: unknown }],
    ] as const;
    const { live, expired } = partitionFresh(entries, "player", NOW, TTL);
    expect(live.map((e) => e.id)).toEqual(["a"]);
    expect(expired).toEqual([]);
  });

  it("expires a corrupt record inside its own namespace", () => {
    // Safe only because the sweep is scoped: within `player:` a record with
    // no usable timestamp is corrupt, and dropping it costs a saved position.
    const entries = [
      [keyFor("player", "a"), {} as { ts?: unknown }],
      [keyFor("player", "b"), { ts: "soon" } as { ts?: unknown }],
      [keyFor("player", "c"), { ts: NaN } as { ts?: unknown }],
    ] as const;
    const { live, expired } = partitionFresh(entries, "player", NOW, TTL);
    expect(live).toEqual([]);
    expect(expired).toEqual(["player:a", "player:b", "player:c"]);
  });

  it("survives a null record", () => {
    const entries = [[keyFor("player", "a"), null as unknown as { ts?: unknown }]] as const;
    expect(() => partitionFresh(entries, "player", NOW, TTL)).not.toThrow();
    expect(partitionFresh(entries, "player", NOW, TTL).expired).toEqual(["player:a"]);
  });

  it("returns keys ready to delete, not bare identifiers", () => {
    const entries = [[keyFor("player", "a"), player(0)]] as const;
    // Handing back "a" would delete nothing and look like it had worked.
    expect(partitionFresh(entries, "player", NOW, TTL).expired[0]).toBe("player:a");
  });
});
