import { describe, expect, it } from "vitest";

import { validateWorldConfig } from "../../engine/config/validateWorldConfig";
import { greyboxConfig } from "./config";
import { greyboxExtents } from "./manifest";

/**
 * Every world that ships is checked against the invariants.
 *
 * This is the guard that would have caught the predecessor project's worst
 * class of bug at build time rather than in a browser: a constant tuned for
 * one world's scale, carried into another's. Adding a world without adding it
 * here removes that guarantee, so the list is deliberately exhaustive.
 */
const SHIPPED_WORLDS = [{ name: "greybox", config: greyboxConfig }];

describe("shipped world configurations", () => {
  for (const { name, config } of SHIPPED_WORLDS) {
    it(`${name} satisfies every invariant`, () => {
      expect(validateWorldConfig(config)).toEqual([]);
    });
  }

  it("gives each world a distinct identifier", () => {
    // Identifiers namespace persisted state; a collision would let one world
    // resume a player inside another's geometry.
    const ids = SHIPPED_WORLDS.map((world) => world.config.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("greybox", () => {
  it("sits at ground level so scale mistakes surface immediately", () => {
    // The predecessor project's terrain sat between y 60 and 85, which let
    // constants that assumed that range go unnoticed.
    expect(greyboxConfig.vertical.groundMinY).toBe(0);
  });

  it("agrees with the extents its own manifest covers", () => {
    // Bounds written down separately from the terrain is how the two drift
    // apart, and the symptom — an invisible wall, or walkable ground beyond
    // the edge of the world — is far from the cause.
    expect(greyboxExtents).toEqual(greyboxConfig.bounds);
  });

  it("brackets the step ceiling with climbable and unclimbable ledges", () => {
    // GreyBoxScene derives its ledge heights from this value, so the scene and
    // the rules cannot drift apart.
    const step = greyboxConfig.locomotion.maxStepHeight;
    expect(step).toBeGreaterThan(0);
    expect(step).toBeLessThan(greyboxConfig.locomotion.playerHeight / 2);
  });
});
