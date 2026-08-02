import { describe, expect, it } from "vitest";

import type { WorldBounds } from "../config/types";
import type { SavedPlayer } from "./playerPersistence";
import {
  SAVE_TTL_MS,
  isUsable,
  parseSaved,
  playerKey,
  serialise,
  shouldSave,
} from "./playerPersistence";

const BOUNDS: WorldBounds = { minX: -96, maxX: 96, minZ: -96, maxZ: 96 };
const VOID_Y = -10;
const NOW = 1_800_000_000_000;

function saved(overrides: Partial<SavedPlayer> = {}): SavedPlayer {
  return { x: 0, y: 1, z: 0, yaw: 0, ts: NOW, ...overrides };
}

describe("playerKey", () => {
  it("separates worlds", () => {
    expect(playerKey("greybox", 1)).not.toBe(playerKey("simile", 1));
  });

  it("separates versions of the same world", () => {
    // A layout change bumps the version, which re-epochs saved state as a side
    // effect rather than as a separate act of discipline that gets skipped.
    expect(playerKey("simile", 1)).not.toBe(playerKey("simile", 2));
  });
});

describe("parseSaved", () => {
  it("returns nothing when there is nothing stored", () => {
    expect(parseSaved(null)).toBeNull();
  });

  it("reads back what was written", () => {
    const round = parseSaved(serialise(1, 2, 3, 0.5, NOW));
    expect(round).toEqual({ x: 1, y: 2, z: 3, yaw: 0.5, ts: NOW });
  });

  it("tolerates content that is not JSON", () => {
    // Storage is shared with everything else on the origin and the visitor can
    // edit it; a malformed value must never throw out of a read.
    expect(parseSaved("not json at all")).toBeNull();
  });

  it("rejects JSON of the wrong shape", () => {
    expect(parseSaved('{"x":1}')).toBeNull();
    expect(parseSaved('"a string"')).toBeNull();
    expect(parseSaved("null")).toBeNull();
  });

  it("rejects a record whose fields are the wrong type", () => {
    expect(parseSaved('{"x":"1","y":2,"z":3,"yaw":0,"ts":0}')).toBeNull();
  });
});

describe("isUsable", () => {
  it("accepts a fresh position inside the world", () => {
    expect(isUsable(saved(), BOUNDS, VOID_Y, NOW)).toBe(true);
  });

  it("rejects nothing at all", () => {
    expect(isUsable(null, BOUNDS, VOID_Y, NOW)).toBe(false);
  });

  it("rejects a position outside the world's horizontal bounds", () => {
    // This is what protects a visitor after a layout change that shrank the
    // world: resuming outside it drops them into the void and straight into a
    // respawn.
    expect(isUsable(saved({ x: 500 }), BOUNDS, VOID_Y, NOW)).toBe(false);
    expect(isUsable(saved({ z: -500 }), BOUNDS, VOID_Y, NOW)).toBe(false);
  });

  it("rejects a position at or below the void floor", () => {
    expect(isUsable(saved({ y: VOID_Y }), BOUNDS, VOID_Y, NOW)).toBe(false);
  });

  it("rejects a position that has expired", () => {
    expect(isUsable(saved({ ts: NOW - SAVE_TTL_MS - 1 }), BOUNDS, VOID_Y, NOW)).toBe(false);
  });

  it("accepts a position on the expiry boundary", () => {
    expect(isUsable(saved({ ts: NOW - SAVE_TTL_MS }), BOUNDS, VOID_Y, NOW)).toBe(true);
  });

  it("rejects non-finite coordinates", () => {
    expect(isUsable(saved({ x: Number.NaN }), BOUNDS, VOID_Y, NOW)).toBe(false);
    expect(isUsable(saved({ y: Number.POSITIVE_INFINITY }), BOUNDS, VOID_Y, NOW)).toBe(false);
  });

  it("rejects a record with a non-finite timestamp", () => {
    expect(isUsable(saved({ ts: Number.NaN }), BOUNDS, VOID_Y, NOW)).toBe(false);
  });
});

describe("shouldSave", () => {
  it("declines before the interval has passed", () => {
    expect(shouldSave(1000, 900, 500)).toBe(false);
  });

  it("allows once the interval has passed", () => {
    expect(shouldSave(1500, 1000, 500)).toBe(true);
  });

  it("allows the first write", () => {
    expect(shouldSave(1000, 0, 500)).toBe(true);
  });
});
