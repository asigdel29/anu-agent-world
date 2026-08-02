import { describe, expect, it } from "vitest";

import { AGENT_PREFIX, connectionId, isAgentId, isReservedId, sanitizeId } from "./ids";
import { MAX_ID_LENGTH } from "./limits";

describe("sanitizeId", () => {
  it("keeps an already-safe identifier unchanged", () => {
    expect(sanitizeId("a1b2-c3d4")).toBe("a1b2-c3d4");
  });

  it("lowercases", () => {
    expect(sanitizeId("ABC")).toBe("abc");
  });

  it("drops everything outside the safe alphabet", () => {
    expect(sanitizeId("../../etc/passwd")).toBe("etcpasswd");
    expect(sanitizeId("player:1")).toBe("player1");
  });

  it("cannot escape a storage namespace", () => {
    // The result is used as a key under a prefix, so a colon surviving here
    // would let a caller write into a namespace that is not theirs.
    expect(sanitizeId("x:sim")).not.toContain(":");
  });

  it("bounds the length", () => {
    expect(sanitizeId("a".repeat(200))).toHaveLength(MAX_ID_LENGTH);
  });

  it("returns empty for anything that is not a string", () => {
    for (const value of [null, undefined, 7, {}, []]) {
      expect(sanitizeId(value)).toBe("");
    }
  });

  it("returns empty when nothing usable remains", () => {
    expect(sanitizeId("!!!")).toBe("");
  });
});

describe("isAgentId", () => {
  it("recognises the reserved prefix", () => {
    expect(isAgentId(`${AGENT_PREFIX}flora`)).toBe(true);
    expect(isAgentId("flora")).toBe(false);
  });
});

describe("isReservedId", () => {
  it("rejects an agent identifier", () => {
    expect(isReservedId("a-flora")).toBe(true);
  });

  it("rejects one that only becomes reserved after sanitising", () => {
    // The check must run on the reduced form, or "A-flora" walks straight
    // past it and is then stored as "a-flora".
    expect(isReservedId("A-flora")).toBe(true);
    expect(isReservedId("a_-flora")).toBe(true);
  });

  it("accepts an ordinary visitor identifier", () => {
    expect(isReservedId("b7f2c1a9")).toBe(false);
  });
});

describe("connectionId", () => {
  const random = () => "0f1e2d3c";

  it("honours a usable request", () => {
    expect(connectionId("b7f2c1a9", random)).toBe("b7f2c1a9");
  });

  it("issues a fresh identifier when none was supplied", () => {
    expect(connectionId(undefined, random)).toBe("0f1e2d3c");
    expect(connectionId("!!!", random)).toBe("0f1e2d3c");
  });

  it("refuses to hand a visitor an agent identity", () => {
    expect(connectionId("a-flora", random)).toBe("0f1e2d3c");
  });

  it("never returns something unsafe to use as a key", () => {
    expect(connectionId("../x", () => "!!!")).toBe("x");
    expect(connectionId(null, () => "AB:CD")).toBe("abcd");
  });
});
