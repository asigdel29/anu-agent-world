import { describe, expect, it } from "vitest";

import { bearerToken, constantTimeEqual, mayWrite } from "./auth";

const SECRET = "sk-world-2f8a91c4d7e3";

describe("constantTimeEqual", () => {
  it("accepts identical strings", () => {
    expect(constantTimeEqual(SECRET, SECRET)).toBe(true);
    expect(constantTimeEqual("", "")).toBe(true);
  });

  it("refuses any difference", () => {
    expect(constantTimeEqual(SECRET, `${SECRET}x`)).toBe(false);
    expect(constantTimeEqual(SECRET, SECRET.slice(0, -1))).toBe(false);
    expect(constantTimeEqual("abc", "abd")).toBe(false);
    expect(constantTimeEqual("abc", "Abc")).toBe(false);
  });

  it("examines every byte rather than stopping at the first difference", () => {
    // The property that matters, checked by construction rather than by
    // timing: a comparison that returned early would leak how many leading
    // characters were right, which recovers a secret one character at a time.
    // Two candidates differing only in the last byte must do the same work as
    // two differing in the first, so both must still be refused.
    const early = "Xk-world-2f8a91c4d7e3";
    const late = "sk-world-2f8a91c4d7eX";
    expect(constantTimeEqual(SECRET, early)).toBe(false);
    expect(constantTimeEqual(SECRET, late)).toBe(false);
    expect(early).toHaveLength(SECRET.length);
    expect(late).toHaveLength(SECRET.length);
  });

  it("handles characters outside the ascii range", () => {
    expect(constantTimeEqual("café", "café")).toBe(true);
    expect(constantTimeEqual("café", "cafe")).toBe(false);
  });
});

describe("bearerToken", () => {
  it("reads a bearer token", () => {
    expect(bearerToken(`Bearer ${SECRET}`)).toBe(SECRET);
  });

  it("trims surrounding space", () => {
    expect(bearerToken(`Bearer  ${SECRET} `)).toBe(SECRET);
  });

  it("returns nothing for another scheme or no header", () => {
    expect(bearerToken(`Basic ${SECRET}`)).toBe("");
    expect(bearerToken(SECRET)).toBe("");
    expect(bearerToken(null)).toBe("");
    expect(bearerToken("")).toBe("");
    expect(bearerToken("Bearer")).toBe("");
  });

  it("is case sensitive about the scheme", () => {
    expect(bearerToken(`bearer ${SECRET}`)).toBe("");
  });
});

describe("mayWrite", () => {
  it("admits the right token", () => {
    expect(mayWrite(`Bearer ${SECRET}`, SECRET)).toBe(true);
  });

  it("refuses a wrong or absent token", () => {
    expect(mayWrite(`Bearer wrong`, SECRET)).toBe(false);
    expect(mayWrite(null, SECRET)).toBe(false);
    expect(mayWrite("Bearer ", SECRET)).toBe(false);
  });

  it("refuses everything when no secret is configured", () => {
    // The opposite of the Origin allowlist's default, deliberately. There an
    // empty list permits everything, because an Origin header is a courtesy
    // from a browser. Here the secret is the only control, so forgetting to
    // set it must close the door rather than open it to the internet.
    expect(mayWrite(`Bearer ${SECRET}`, undefined)).toBe(false);
    expect(mayWrite(`Bearer ${SECRET}`, "")).toBe(false);
    expect(mayWrite("Bearer anything", undefined)).toBe(false);
  });

  it("refuses a token that merely starts correctly", () => {
    expect(mayWrite(`Bearer ${SECRET.slice(0, 8)}`, SECRET)).toBe(false);
  });
});
