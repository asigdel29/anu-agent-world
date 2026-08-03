import { describe, expect, it } from "vitest";

import type { PlacementContext, PlacementLimits } from "./placement";
import { PALETTE, isPaletteColor, readPlacement, validatePlacement } from "./placement";

const KINDS = new Set(["crate", "lantern", "bench"]);

const LIMITS: PlacementLimits = {
  minX: -100,
  maxX: 100,
  minZ: -100,
  maxZ: 100,
  minY: -5,
  maxY: 40,
  minScale: 0.5,
  maxScale: 2,
  maxTextLength: 60,
  maxLive: 500,
};

const CTX: PlacementContext = {
  authorId: "a-architect",
  now: 1_750_000_000_000,
  expiresAt: 1_750_000_086_400_000,
  cellSize: 16,
  id: "p-0001",
  rev: 7,
};

const GOOD = { kind: "crate", x: 10, y: 0, z: -20, yaw: 1.2, scale: 1 };

/** A small deterministic generator, so a failure can be reproduced. */
function makeRandom(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x1_0000_0000;
  };
}

/**
 * A request built by mutating a valid one.
 *
 * Purely random JSON is almost never accepted — the kind alone has to match a
 * closed set — so a fuzzer that only produces noise never exercises the path
 * where something is *let through*, which is the path that matters. Mutating
 * a good request keeps most candidates close enough to the boundary to test
 * both sides of it.
 */
function mutatedValue(rand: () => number): unknown {
  const out: Record<string, unknown> = { ...GOOD };
  const keys = ["kind", "x", "y", "z", "yaw", "scale", "text", "color"];
  const changes = 1 + Math.floor(rand() * 3);
  for (let i = 0; i < changes; i += 1) {
    const key = keys[Math.floor(rand() * keys.length)] ?? "x";
    const plausible: unknown[] = [
      "crate",
      "lantern",
      "obelisk",
      0,
      50,
      -50,
      500,
      0.75,
      1.5,
      3,
      PALETTE[0],
      "#ff00ff",
      "a note",
      "x".repeat(200),
      NaN,
      null,
      undefined,
      {},
    ];
    out[key] = rand() < 0.75 ? plausible[Math.floor(rand() * plausible.length)] : rand() * 400 - 200;
  }
  if (rand() < 0.15) delete out[keys[Math.floor(rand() * keys.length)] ?? "x"];

  // Identity is planted separately, and often, because the interesting
  // hostile request is not a malformed one — it is a *well-formed* one that
  // also claims to be somebody. Mutating only the value fields produced
  // candidates that parsed but never carried an identity, so the property
  // below asserted something it never actually reached: swapping the parser
  // to read `id` off the request left this fuzzer entirely happy.
  if (rand() < 0.5) {
    const spoofed: unknown[] = ["a-flora", "other", "", 7, null, { id: "x" }];
    for (const key of ["id", "authorId", "rev", "expiresAt", "cx", "cz"]) {
      if (rand() < 0.5) out[key] = spoofed[Math.floor(rand() * spoofed.length)];
    }
  }
  return out;
}

/** Arbitrary JSON, biased towards shapes that nearly look like a placement. */
function randomValue(rand: () => number, depth = 0): unknown {
  const roll = rand();
  if (depth > 2 || roll < 0.14) {
    const leaves: unknown[] = [
      null,
      true,
      false,
      0,
      -0,
      NaN,
      Infinity,
      -Infinity,
      1e308 * 10,
      "",
      "crate",
      "CRATE",
      "../../etc",
      "a".repeat(5000),
      1.5,
      -99999,
      Number.MAX_SAFE_INTEGER,
    ];
    return leaves[Math.floor(rand() * leaves.length)];
  }
  if (roll < 0.3) {
    return Array.from({ length: Math.floor(rand() * 4) }, () => randomValue(rand, depth + 1));
  }
  const keys = ["kind", "x", "y", "z", "yaw", "scale", "text", "color", "id", "authorId", "rev"];
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    if (rand() < 0.6) out[key] = randomValue(rand, depth + 1);
  }
  return out;
}

describe("readPlacement", () => {
  it("accepts a well-formed request", () => {
    expect(readPlacement(GOOD, CTX)).toMatchObject({ kind: "crate", x: 10, z: -20, yaw: 1.2 });
  });

  it("assigns identity rather than reading it", () => {
    // The important half. A request cannot place an object as somebody else,
    // overwrite an existing one by guessing its id, or make itself permanent.
    const forged = readPlacement(
      { ...GOOD, id: "p-9999", authorId: "anu", rev: 999, createdAt: 0, expiresAt: null },
      CTX,
    );
    expect(forged).toMatchObject({
      id: CTX.id,
      authorId: CTX.authorId,
      rev: CTX.rev,
      createdAt: CTX.now,
      expiresAt: CTX.expiresAt,
    });
  });

  it("derives the spatial cell rather than trusting one", () => {
    const place = readPlacement({ ...GOOD, x: 33, z: -33, cx: 900, cz: 900 }, CTX);
    expect(place).toMatchObject({ cx: 2, cz: -3 });
  });

  it("survives a cell size of zero", () => {
    expect(readPlacement(GOOD, { ...CTX, cellSize: 0 })?.cx).toBe(10);
  });

  it("defaults the fields a request may omit", () => {
    const place = readPlacement({ kind: "crate", x: 0, y: 0, z: 0 }, CTX);
    expect(place).toMatchObject({ yaw: 0, scale: 1 });
    expect(place?.text).toBeUndefined();
    expect(place?.color).toBeUndefined();
  });

  it("rejects a request with no kind or no position", () => {
    expect(readPlacement({ x: 0, y: 0, z: 0 }, CTX)).toBeNull();
    expect(readPlacement({ kind: "crate", x: 0, y: 0 }, CTX)).toBeNull();
    expect(readPlacement({ kind: 7, x: 0, y: 0, z: 0 }, CTX)).toBeNull();
  });

  it("rejects a non-finite position", () => {
    for (const bad of [NaN, Infinity, -Infinity, "0", null]) {
      expect(readPlacement({ ...GOOD, x: bad }, CTX)).toBeNull();
    }
  });

  it("rejects anything that is not an object", () => {
    for (const raw of [null, undefined, 7, "crate", [1, 2, 3], true]) {
      expect(readPlacement(raw, CTX)).toBeNull();
    }
  });
});

/**
 * Report the first input that broke a property, or null if none did.
 *
 * Assertions live outside the loop rather than inside it, for two reasons.
 * An `expect` is expensive enough that a hundred thousand of them dominated
 * the whole suite's runtime and put these tests at the timeout, where they
 * failed whenever the machine was busy. And a property test that asserts per
 * iteration reports "expected true to be false" for case 13,847 rather than
 * the value that caused it, which is the one thing worth knowing.
 */
function firstCounterexample(
  runs: number,
  seed: number,
  holds: (raw: unknown) => boolean,
): unknown {
  const rand = makeRandom(seed);
  for (let i = 0; i < runs; i += 1) {
    const raw = i % 2 === 0 ? mutatedValue(rand) : randomValue(rand);
    let ok: boolean;
    try {
      ok = holds(raw);
    } catch {
      return raw;
    }
    if (!ok) return raw;
  }
  return null;
}

/** Rendered so a failure names the input rather than an iteration number. */
const NO_COUNTEREXAMPLE = null;

describe("readPlacement, fuzzed", () => {
  it("never throws, whatever it is handed", () => {
    const bad = firstCounterexample(20_000, 0x5eed, (raw) => {
      readPlacement(raw, CTX);
      return true;
    });
    expect(bad).toBe(NO_COUNTEREXAMPLE);
  });

  it("never lets a request choose its own identity", () => {
    const bad = firstCounterexample(20_000, 0xc0ffee, (raw) => {
      const place = readPlacement(raw, CTX);
      if (!place) return true;
      return (
        place.id === CTX.id &&
        place.authorId === CTX.authorId &&
        place.rev === CTX.rev &&
        place.expiresAt === CTX.expiresAt
      );
    });
    expect(bad).toBe(NO_COUNTEREXAMPLE);
  });

  it("never produces a placement with a non-finite coordinate", () => {
    const bad = firstCounterexample(20_000, 0xd15ea5e, (raw) => {
      const place = readPlacement(raw, CTX);
      if (!place) return true;
      return [place.x, place.y, place.z, place.yaw, place.scale, place.cx, place.cz].every(
        (n) => Number.isFinite(n),
      );
    });
    expect(bad).toBe(NO_COUNTEREXAMPLE);
  });
});

describe("validatePlacement", () => {
  const good = readPlacement(GOOD, CTX);

  it("accepts a placement inside every limit", () => {
    expect(good).not.toBeNull();
    expect(validatePlacement(good!, KINDS, LIMITS)).toBeNull();
  });

  it("refuses a kind that is not in the catalog", () => {
    const place = readPlacement({ ...GOOD, kind: "nuclear-reactor" }, CTX);
    expect(validatePlacement(place!, KINDS, LIMITS)).toContain("unknown kind");
  });

  it("refuses a position outside the world", () => {
    for (const [key, value] of [
      ["x", 1000],
      ["z", -1000],
      ["y", 9999],
    ] as const) {
      const place = readPlacement({ ...GOOD, [key]: value }, CTX);
      expect(validatePlacement(place!, KINDS, LIMITS)).not.toBeNull();
    }
  });

  it("refuses a scale outside the range", () => {
    for (const scale of [0, 0.1, 50, -1]) {
      const place = readPlacement({ ...GOOD, scale }, CTX);
      expect(validatePlacement(place!, KINDS, LIMITS)).toBe("scale outside range");
    }
  });

  it("refuses a colour outside the palette", () => {
    const place = readPlacement({ ...GOOD, color: "#ff00ff" }, CTX);
    expect(validatePlacement(place!, KINDS, LIMITS)).toBe("colour outside palette");
  });

  it("accepts every palette colour", () => {
    for (const color of PALETTE) {
      const place = readPlacement({ ...GOOD, color }, CTX);
      expect(validatePlacement(place!, KINDS, LIMITS)).toBeNull();
    }
  });

  it("refuses text longer than the cap", () => {
    const place = readPlacement({ ...GOOD, text: "x".repeat(500) }, CTX);
    expect(validatePlacement(place!, KINDS, LIMITS)).toBe("text too long");
  });
});

describe("validatePlacement, fuzzed", () => {
  it("never throws on a parsed placement", () => {
    const bad = firstCounterexample(20_000, 0xbadf00d, (raw) => {
      const place = readPlacement(raw, CTX);
      if (!place) return true;
      validatePlacement(place, KINDS, LIMITS);
      return true;
    });
    expect(bad).toBe(NO_COUNTEREXAMPLE);
  });

  it("anything it accepts is inside every limit", () => {
    // The claim the whole design leans on: a fully successful injection is
    // boring, because whatever survives here is a catalogue object in a
    // palette colour inside the world's bounds that expires on its own.
    let accepted = 0;
    const bad = firstCounterexample(40_000, 0xfeedface, (raw) => {
      const place = readPlacement(raw, CTX);
      if (!place || validatePlacement(place, KINDS, LIMITS) !== null) return true;
      accepted += 1;
      return (
        KINDS.has(place.kind) &&
        place.x >= LIMITS.minX &&
        place.x <= LIMITS.maxX &&
        place.z >= LIMITS.minZ &&
        place.z <= LIMITS.maxZ &&
        place.y >= LIMITS.minY &&
        place.y <= LIMITS.maxY &&
        place.scale >= LIMITS.minScale &&
        place.scale <= LIMITS.maxScale &&
        (place.text === undefined || place.text.length <= LIMITS.maxTextLength) &&
        (place.color === undefined || isPaletteColor(place.color)) &&
        place.expiresAt === CTX.expiresAt
      );
    });
    expect(bad).toBe(NO_COUNTEREXAMPLE);
    // A guard against the test passing because nothing was ever accepted.
    expect(accepted).toBeGreaterThan(0);
  });
});
