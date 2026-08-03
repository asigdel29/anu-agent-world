import { describe, expect, it } from "vitest";

import type { WorldConfig } from "./types";
import { validateWorldConfig } from "./validateWorldConfig";

/**
 * A coherent world, used as the baseline that each case perturbs in exactly one
 * way. Its numbers mirror the grey-box world: a human-scaled character on
 * ground at y = 0, which is precisely the shape that the predecessor project's
 * constants — tuned for terrain sitting between y 60 and 85 — broke on.
 */
function baseConfig(): WorldConfig {
  return {
    id: "test",
    version: 1,
    units: { chunkSize: 32, unitsPerMetre: 1 },
    spawn: { position: [0, 1, 0], yaw: 0 },
    bounds: { minX: -96, maxX: 96, minZ: -96, maxZ: 96 },
    vertical: { groundMinY: 0, groundMaxY: 24, voidY: -10, ceilingY: 120 },
    locomotion: {
      walkSpeed: 4.2,
      runSpeed: 7,
      accel: 28,
      friction: 12,
      airControl: 0.35,
      turnRate: 12,
      gravity: -22,
      jumpSpeed: 8.5,
      coyoteSec: 0.12,
      jumpBufferSec: 0.1,
      playerRadius: 0.35,
      playerHeight: 1.8,
      eyeHeight: 1.6,
      maxStepHeight: 0.65,
      maxStepDown: 0.65,
      stepDownTolerance: 0.1,
      groundRayAbove: 2.2,
      groundRayFar: 12,
      wallCastHeights: [0.25, 1, 1.7],
      wallSlopeLimit: 0.5,
      footstepIntervalWalk: 0.34,
      footstepIntervalRun: 0.26,
    },
    camera: {
      fov: 45,
      near: 0.1,
      far: 2000,
      lookHeight: 1.5,
      distance: { min: 4, max: 16, default: 9 },
      pitch: { min: 0.05, max: 1.3 },
      sensitivity: { mouse: 0.005, touch: 0.013, zoom: 0.8 },
      occlusion: { nearMin: 2, skin: 0.3, pushOutSec: 0.35 },
      spring: { stiffness: 60, dampingRatio: 1 },
      lookAhead: { scale: 0.25, maxDistance: 2 },
      blendSec: 0.5,
    },
    atmosphere: {
      fog: null,
      background: { kind: "color", color: "#f9f7f6" },
      sun: { direction: [-0.5, -1, -0.35], color: "#fff2e0", intensity: 2 },
      ambient: { skyColor: "#dfe9ff", groundColor: "#c9bfb4", intensity: 1.2 },
      drift: { rise: 0.045, sway: 0.022, roll: 0.0021, periodSec: 6.4 },
    },
    interaction: { proximityRange: 3.2, pointerMaxRange: 40 },
    streaming: {
      radii: { loadRadius: 2, unloadRadius: 3, colliderRadius: 1, prefetchRadius: 3 },
      mobileRadii: { loadRadius: 1, unloadRadius: 2, colliderRadius: 1, prefetchRadius: 2 },
      selectIntervalSec: 0.25,
    },
    placements: { cellSize: 8, maxLive: 2000, maxPerKind: 400, commitIntervalSec: 0.25 },
  };
}

/** Assert that some reported problem mentions `needle`. */
function expectProblem(problems: string[], needle: string): void {
  expect(
    problems.some((p) => p.includes(needle)),
    `expected a problem mentioning "${needle}", got: ${JSON.stringify(problems, null, 2)}`,
  ).toBe(true);
}

describe("validateWorldConfig", () => {
  it("accepts a coherent world", () => {
    expect(validateWorldConfig(baseConfig())).toEqual([]);
  });

  describe("the respawn floor", () => {
    it("rejects a void floor sitting above the lowest ground", () => {
      const base = baseConfig();
      // The exact shape of the predecessor bug: a floor tuned for terrain at
      // y 60-85, carried into a world built at y 0.
      const cfg = { ...base, vertical: { ...base.vertical, voidY: 40 } };
      expectProblem(validateWorldConfig(cfg), "respawn floor");
    });

    it("rejects a void floor too close beneath the ground", () => {
      const base = baseConfig();
      const cfg = { ...base, vertical: { ...base.vertical, voidY: -1 } };
      expectProblem(validateWorldConfig(cfg), "voidY");
    });

    it("rejects a spawn at or below the void floor", () => {
      const base = baseConfig();
      const cfg = { ...base, spawn: { ...base.spawn, position: [0, -20, 0] as const } };
      expectProblem(validateWorldConfig(cfg), "respawn immediately");
    });
  });

  describe("spawn placement", () => {
    it("rejects a spawn outside the horizontal bounds", () => {
      const base = baseConfig();
      const cfg = { ...base, spawn: { ...base.spawn, position: [500, 1, 0] as const } };
      expectProblem(validateWorldConfig(cfg), "outside bounds");
    });

    it("rejects a non-finite spawn component", () => {
      const base = baseConfig();
      const cfg = { ...base, spawn: { ...base.spawn, position: [0, Number.NaN, 0] as const } };
      expectProblem(validateWorldConfig(cfg), "finite");
    });
  });

  describe("step geometry", () => {
    it("rejects a step taller than half the body", () => {
      const base = baseConfig();
      const cfg = {
        ...base,
        locomotion: { ...base.locomotion, maxStepHeight: 1.2 },
      };
      expectProblem(validateWorldConfig(cfg), "wall, not a stair");
    });

    it("rejects a ground ray that starts below the step it tests", () => {
      const base = baseConfig();
      const cfg = {
        ...base,
        locomotion: { ...base.locomotion, groundRayAbove: 0.5 },
      };
      expectProblem(validateWorldConfig(cfg), "groundRayAbove");
    });

    it("rejects a step-down deeper than the ground ray reaches", () => {
      const base = baseConfig();
      const cfg = {
        ...base,
        locomotion: { ...base.locomotion, maxStepDown: 20 },
      };
      expectProblem(validateWorldConfig(cfg), "maxStepDown");
    });

    it("rejects wall cast heights outside the body", () => {
      const base = baseConfig();
      const cfg = {
        ...base,
        locomotion: { ...base.locomotion, wallCastHeights: [0.25, 4] },
      };
      expectProblem(validateWorldConfig(cfg), "outside the body");
    });
  });

  describe("streaming radii", () => {
    it("rejects an unload radius that does not exceed the load radius", () => {
      const base = baseConfig();
      const cfg = {
        ...base,
        streaming: {
          ...base.streaming,
          radii: { ...base.streaming.radii, unloadRadius: 2 },
        },
      };
      expectProblem(validateWorldConfig(cfg), "thrashes chunks");
    });

    it("rejects colliders required beyond the mounted region", () => {
      const base = baseConfig();
      const cfg = {
        ...base,
        streaming: {
          ...base.streaming,
          radii: { ...base.streaming.radii, colliderRadius: 3 },
        },
      };
      expectProblem(validateWorldConfig(cfg), "not mounted");
    });

    it("checks the mobile radii as well as the desktop ones", () => {
      const base = baseConfig();
      const cfg = {
        ...base,
        streaming: {
          ...base.streaming,
          mobileRadii: { ...base.streaming.mobileRadii, unloadRadius: 1 },
        },
      };
      expectProblem(validateWorldConfig(cfg), "mobileRadii");
    });
  });

  describe("fog against the streaming edge", () => {
    /** The base world's fog, at a chosen far distance. */
    const withFog = (far: number) => {
      const base = baseConfig();
      return {
        ...base,
        atmosphere: {
          ...base.atmosphere,
          fog: { color: "#a9c9ff", near: far * 0.4, far },
        },
      };
    };

    const EDGE = baseConfig().streaming.radii.loadRadius * baseConfig().units.chunkSize;

    it("accepts fog that closes at the streaming edge", () => {
      expect(validateWorldConfig(withFog(EDGE))).toEqual([]);
    });

    it("accepts fog that closes a little inside the edge", () => {
      expect(validateWorldConfig(withFog(EDGE * 0.8))).toEqual([]);
    });

    it("rejects fog that reaches past the streaming edge", () => {
      // This test used to assert the opposite, and so did the rule. Fog hides
      // an arriving chunk only if it is already opaque at the distance the
      // chunk arrives at, so it must close at or inside the edge -- demanding
      // that it extend beyond guarantees the pop it claims to prevent. The
      // rule and its test were written from the same wrong picture, which is
      // how a test comes to agree with a bug.
      expectProblem(validateWorldConfig(withFog(EDGE * 1.5)), "reaches past the streaming edge");
    });

    it("rejects fog that closes far inside the edge", () => {
      // The other half of the trade: chunks loaded that nobody can see.
      expectProblem(validateWorldConfig(withFog(EDGE * 0.2)), "nobody can see");
    });

    it("rejects a camera that can zoom into fully-fogged space", () => {
      // Distance max is 16 in the base world, so fog closing at 60 is fine;
      // this pushes the camera out past it instead of pulling the fog in,
      // which keeps the case about the camera rather than about the fog.
      const base = baseConfig();
      const cfg = {
        ...base,
        camera: { ...base.camera, distance: { ...base.camera.distance, max: 80 } },
        atmosphere: {
          ...base.atmosphere,
          fog: { color: "#a9c9ff", near: 30, far: 60 },
        },
      };
      expectProblem(validateWorldConfig(cfg), "fully-fogged");
    });

    it("accepts a world with no fog at all", () => {
      // The Simile look is a flat void: no gradient, no fog, no horizon.
      expect(validateWorldConfig(baseConfig())).toEqual([]);
    });
  });

  describe("placement hashing", () => {
    it("rejects a cell size that does not divide the chunk size", () => {
      const base = baseConfig();
      const cfg = {
        ...base,
        placements: { ...base.placements, cellSize: 7 },
      };
      expectProblem(validateWorldConfig(cfg), "align with chunk boundaries");
    });

    it("rejects a per-kind cap above the global cap", () => {
      const base = baseConfig();
      const cfg = {
        ...base,
        placements: { ...base.placements, maxPerKind: 5000 },
      };
      expectProblem(validateWorldConfig(cfg), "maxPerKind");
    });
  });

  describe("identity", () => {
    it("rejects an empty id", () => {
      expectProblem(validateWorldConfig({ ...baseConfig(), id: "  " }), "id must not be empty");
    });

    it("rejects a non-positive version", () => {
      expectProblem(validateWorldConfig({ ...baseConfig(), version: 0 }), "version");
    });
  });

  it("reports every independent problem at once rather than stopping at the first", () => {
    const base = baseConfig();
    const cfg = {
      ...base,
      id: "",
      vertical: { ...base.vertical, voidY: 40 },
      locomotion: { ...base.locomotion, maxStepHeight: 1.2 },
    };
    expect(validateWorldConfig(cfg).length).toBeGreaterThanOrEqual(3);
  });
});

describe("island drift", () => {
  it("accepts a drift small enough to go unnoticed", () => {
    expect(validateWorldConfig(baseConfig())).toEqual([]);
  });

  it("accepts a world that holds still", () => {
    const cfg = baseConfig();
    expect(validateWorldConfig({ ...cfg, atmosphere: { ...cfg.atmosphere, drift: null } })).toEqual(
      [],
    );
  });

  it("refuses a drift the character would feel", () => {
    // The failure this prevents is not a fall but a world that feels subtly
    // wrong to stand still in, which is far harder to trace back. The check
    // is on distance moved within one frame: a speed compared against a
    // tolerance measured in units is a category error that rejects a calm
    // island and admits a violent short-period one.
    const cfg = baseConfig();
    const problems = validateWorldConfig({
      ...cfg,
      atmosphere: {
        ...cfg.atmosphere,
        drift: { rise: 1.2, sway: 0.02, roll: 0.002, periodSec: 3 },
      },
    });
    expect(problems.join(" ")).toContain("in a single\n            frame".replace(/\s+/g, " "));
  });

  it("refuses a period of zero", () => {
    const cfg = baseConfig();
    const problems = validateWorldConfig({
      ...cfg,
      atmosphere: { ...cfg.atmosphere, drift: { ...cfg.atmosphere.drift!, periodSec: 0 } },
    });
    expect(problems.join(" ")).toContain("periodSec");
  });

  it("refuses a negative amplitude", () => {
    const cfg = baseConfig();
    const problems = validateWorldConfig({
      ...cfg,
      atmosphere: { ...cfg.atmosphere, drift: { ...cfg.atmosphere.drift!, rise: -1 } },
    });
    expect(problems.join(" ")).toContain("must not be negative");
  });
});
