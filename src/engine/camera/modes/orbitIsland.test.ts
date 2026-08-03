import { describe, expect, it } from "vitest";

import { createCameraPose } from "../cameraDirector";
import type { CameraContext } from "../cameraDirector";
import {
  DEFAULT_ORBIT,
  createOrbitIslandMode,
  orbitDistanceFor,
  wantsToDescend,
} from "./orbitIsland";

const CENTRE = { centreX: 0, centreY: 2, centreZ: 0 };
const OPTIONS = { ...CENTRE, ...DEFAULT_ORBIT };

function context(over: Partial<CameraContext> = {}): CameraContext {
  return {
    subjectX: 0,
    subjectY: 0,
    subjectZ: 0,
    subjectYaw: 0,
    velocityX: 0,
    velocityZ: 0,
    orbitYaw: 0,
    orbitPitch: 0,
    orbitDistance: 9,
    cfg: {
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
    query: null,
    ...over,
  };
}

describe("createOrbitIslandMode", () => {
  it("always looks at the island", () => {
    const mode = createOrbitIslandMode(OPTIONS);
    const pose = createCameraPose();
    mode.enter?.(context());
    for (let i = 0; i < 50; i += 1) {
      mode.sample(pose, 1 / 60, context());
      expect(pose.tx).toBe(CENTRE.centreX);
      expect(pose.ty).toBe(CENTRE.centreY);
      expect(pose.tz).toBe(CENTRE.centreZ);
    }
  });

  it("holds its distance while turning", () => {
    const mode = createOrbitIslandMode(OPTIONS);
    const pose = createCameraPose();
    mode.enter?.(context());
    for (let i = 0; i < 400; i += 1) {
      mode.sample(pose, 1 / 30, context());
      const horizontal = Math.hypot(pose.px - CENTRE.centreX, pose.pz - CENTRE.centreZ);
      expect(horizontal).toBeCloseTo(OPTIONS.distance, 6);
    }
  });

  it("looks down at the island rather than across it", () => {
    const mode = createOrbitIslandMode(OPTIONS);
    const pose = createCameraPose();
    mode.sample(pose, 1 / 60, context());
    expect(pose.py).toBeGreaterThan(CENTRE.centreY);
  });

  it("turns slowly enough never to read as spinning", () => {
    // If a visitor notices the rotation as motion it is too fast. A full turn
    // takes minutes, and a single frame moves it a small fraction of a degree.
    const perFrame = DEFAULT_ORBIT.turnRate / 60;
    expect(perFrame).toBeLessThan(0.001);
    const secondsPerTurn = (Math.PI * 2) / DEFAULT_ORBIT.turnRate;
    expect(secondsPerTurn).toBeGreaterThan(120);
  });

  it("turns in one direction rather than drifting back", () => {
    const mode = createOrbitIslandMode(OPTIONS);
    const pose = createCameraPose();
    mode.enter?.(context());
    mode.sample(pose, 1, context());
    const first = Math.atan2(pose.px, pose.pz);
    mode.sample(pose, 1, context());
    const second = Math.atan2(pose.px, pose.pz);
    expect(second).toBeGreaterThan(first);
  });

  it("lets the visitor steer, adding to the drift rather than replacing it", () => {
    // Letting go resumes from where they left it instead of snapping back to
    // wherever the animation had got to.
    const mode = createOrbitIslandMode(OPTIONS);
    const still = createCameraPose();
    const steered = createCameraPose();
    mode.enter?.(context());
    mode.sample(still, 1 / 60, context());
    const mode2 = createOrbitIslandMode(OPTIONS);
    mode2.enter?.(context());
    mode2.sample(steered, 1 / 60, context({ orbitYaw: 1 }));
    expect(steered.px).not.toBeCloseTo(still.px, 3);
  });

  it("restarts its turn on re-entry", () => {
    const mode = createOrbitIslandMode(OPTIONS);
    const pose = createCameraPose();
    mode.enter?.(context());
    for (let i = 0; i < 100; i += 1) mode.sample(pose, 1 / 60, context());
    const drifted = pose.px;
    mode.enter?.(context());
    mode.sample(pose, 1 / 60, context());
    expect(pose.px).not.toBeCloseTo(drifted, 3);
  });

  it("centres on wherever the island is", () => {
    const off = createOrbitIslandMode({ ...DEFAULT_ORBIT, centreX: 100, centreY: 5, centreZ: -40 });
    const pose = createCameraPose();
    off.sample(pose, 1 / 60, context());
    expect(pose.tx).toBe(100);
    expect(pose.tz).toBe(-40);
  });
});

describe("wantsToDescend", () => {
  it("takes movement as the decision", () => {
    // Someone who presses a direction has already decided to be in the place
    // rather than to look at it.
    expect(wantsToDescend(1, 0, false)).toBe(true);
    expect(wantsToDescend(0, -1, false)).toBe(true);
    expect(wantsToDescend(0, 0, true)).toBe(true);
  });

  it("leaves someone who is only looking where they are", () => {
    expect(wantsToDescend(0, 0, false)).toBe(false);
  });
});

describe("orbitDistanceFor", () => {
  it("sits far enough back to see the whole world", () => {
    // The island is 66 across; the fixed 42 this replaced could not frame it,
    // and a screen full of grass reads as a world that failed to load rather
    // than as a camera in the wrong place.
    const distance = orbitDistanceFor(66, 45);
    const visible = 2 * distance * Math.tan((45 * Math.PI) / 360);
    expect(visible).toBeGreaterThan(66);
  });

  it("scales with the world", () => {
    expect(orbitDistanceFor(200, 45)).toBeGreaterThan(orbitDistanceFor(66, 45));
    expect(orbitDistanceFor(20, 45)).toBeLessThan(orbitDistanceFor(66, 45));
  });

  it("needs less room with a wider lens", () => {
    expect(orbitDistanceFor(66, 70)).toBeLessThan(orbitDistanceFor(66, 45));
  });

  it("survives a degenerate world or lens", () => {
    for (const [extent, fov] of [[0, 45], [66, 0], [0, 0], [-5, -5]] as const) {
      const d = orbitDistanceFor(extent, fov);
      expect(Number.isFinite(d)).toBe(true);
      expect(d).toBeGreaterThan(0);
    }
  });
});
