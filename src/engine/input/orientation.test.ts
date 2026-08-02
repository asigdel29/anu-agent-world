import { describe, expect, it } from "vitest";

import { isPortrait, shouldPromptRotate } from "./orientation";

describe("isPortrait", () => {
  it("reports a taller-than-wide viewport as portrait", () => {
    expect(isPortrait(390, 844)).toBe(true);
  });

  it("reports a wider-than-tall viewport as landscape", () => {
    expect(isPortrait(844, 390)).toBe(false);
  });

  it("treats an exactly square viewport as landscape", () => {
    expect(isPortrait(500, 500)).toBe(false);
  });
});

describe("shouldPromptRotate", () => {
  it("prompts on a touch device held upright", () => {
    expect(shouldPromptRotate(true, 390, 844)).toBe(true);
  });

  it("stays quiet on a touch device already turned sideways", () => {
    expect(shouldPromptRotate(true, 844, 390)).toBe(false);
  });

  it("stays quiet on a narrow desktop window", () => {
    // A tall browser window is not something the visitor should be nagged
    // about, and cannot be rotated in any case.
    expect(shouldPromptRotate(false, 600, 900)).toBe(false);
  });
});
