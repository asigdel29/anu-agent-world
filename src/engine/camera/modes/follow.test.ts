import { describe, expect, it } from "vitest";

import type { SurfaceQuery, SweepHit } from "../../collision/surfaceQuery";
import type { CameraConfig } from "../../config/types";
import type { CameraContext, CameraPose } from "../cameraDirector";
import { createCameraPose } from "../cameraDirector";
import { createFollowMode } from "./follow";

const CFG = {
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
} satisfies CameraConfig;

/** Nothing blocks the view. */
const clear: SurfaceQuery = {
  groundAt: () => 0,
  sweep: () => false,
  ray: () => false,
};

/** A surface sits `at` units along every ray from the subject. */
function occluderAt(at: number): SurfaceQuery {
  return {
    groundAt: () => 0,
    sweep: () => false,
    ray: (_fx, _fy, _fz, _dx, _dy, _dz, far, _layer, out: SweepHit) => {
      if (at > far) return false;
      out.distance = at;
      out.normalX = 0;
      out.normalY = 0;
      out.normalZ = 1;
      return true;
    },
  };
}

function context(query: SurfaceQuery = clear): CameraContext {
  return {
    subjectX: 0,
    subjectY: 0,
    subjectZ: 0,
    subjectYaw: 0,
    velocityX: 0,
    velocityZ: 0,
    orbitYaw: 0,
    orbitPitch: 0.4,
    orbitDistance: 9,
    cfg: CFG,
    query,
  };
}

/** Distance from the camera to what it is aiming at. */
function radius(pose: CameraPose): number {
  return Math.hypot(pose.px - pose.tx, pose.py - pose.ty, pose.pz - pose.tz);
}

describe("createFollowMode", () => {
  it("sits at the requested distance when the view is clear", () => {
    const mode = createFollowMode();
    const ctx = context();
    const out = createCameraPose();

    mode.enter?.(ctx);
    mode.sample(out, 1 / 60, ctx);

    expect(radius(out)).toBeCloseTo(9, 5);
  });

  it("aims above the subject rather than at its feet", () => {
    const mode = createFollowMode();
    const ctx = context();
    const out = createCameraPose();

    mode.enter?.(ctx);
    mode.sample(out, 1 / 60, ctx);

    expect(out.ty).toBeCloseTo(CFG.lookHeight, 5);
  });

  it("clamps the distance to the configured band", () => {
    const mode = createFollowMode();
    const ctx = { ...context(), orbitDistance: 500 };
    const out = createCameraPose();

    mode.enter?.(ctx);
    mode.sample(out, 1 / 60, ctx);

    expect(radius(out)).toBeCloseTo(CFG.distance.max, 5);
  });

  it("clamps pitch to the configured band", () => {
    const mode = createFollowMode();
    const ctx = { ...context(), orbitPitch: 99 };
    const out = createCameraPose();

    mode.enter?.(ctx);
    mode.sample(out, 1 / 60, ctx);

    // Sitting almost directly overhead, not beyond the pole.
    const climb = Math.asin((out.py - out.ty) / radius(out));
    expect(climb).toBeCloseTo(CFG.pitch.max, 5);
  });

  it("leads the subject in the direction of travel", () => {
    const mode = createFollowMode();
    const ctx = { ...context(), velocityX: 4, velocityZ: 0 };
    const out = createCameraPose();

    mode.enter?.(ctx);
    mode.sample(out, 1 / 60, ctx);

    expect(out.tx).toBeGreaterThan(0);
  });

  it("caps how far it leads however fast the subject runs", () => {
    const mode = createFollowMode();
    const ctx = { ...context(), velocityX: 400, velocityZ: 0 };
    const out = createCameraPose();

    mode.enter?.(ctx);
    mode.sample(out, 1 / 60, ctx);

    expect(out.tx).toBeCloseTo(CFG.lookAhead.maxDistance, 5);
  });

  describe("occlusion", () => {
    it("pulls in immediately when geometry intrudes", () => {
      // Easing inward would spend those frames inside the wall, filling the
      // view with backfaces.
      const mode = createFollowMode();
      const ctx = context(occluderAt(5));
      const out = createCameraPose();

      mode.enter?.(ctx);
      mode.sample(out, 1 / 60, ctx);

      expect(radius(out)).toBeCloseTo(5 - CFG.occlusion.skin, 5);
    });

    it("never pulls closer than the configured minimum", () => {
      const mode = createFollowMode();
      const ctx = context(occluderAt(0.1));
      const out = createCameraPose();

      mode.enter?.(ctx);
      mode.sample(out, 1 / 60, ctx);

      expect(radius(out)).toBeCloseTo(CFG.occlusion.nearMin, 5);
    });

    it("eases back out rather than popping when the view clears", () => {
      const mode = createFollowMode();
      const blocked = context(occluderAt(5));
      const out = createCameraPose();

      mode.enter?.(blocked);
      mode.sample(out, 1 / 60, blocked);
      const pulledIn = radius(out);

      // One frame after the obstruction disappears it must have moved, but
      // nowhere near all the way back.
      mode.sample(out, 1 / 60, context());
      const afterOneFrame = radius(out);

      expect(afterOneFrame).toBeGreaterThan(pulledIn);
      expect(afterOneFrame).toBeLessThan(9);
    });

    it("completes the recovery given enough time", () => {
      const mode = createFollowMode();
      const blocked = context(occluderAt(5));
      const out = createCameraPose();

      mode.enter?.(blocked);
      mode.sample(out, 1 / 60, blocked);

      const open = context();
      for (let i = 0; i < 120; i += 1) mode.sample(out, 1 / 60, open);

      expect(radius(out)).toBeCloseTo(9, 4);
    });
  });

  it("works before the world has any colliders", () => {
    const mode = createFollowMode();
    const ctx = { ...context(), query: null };
    const out = createCameraPose();

    mode.enter?.(ctx);
    expect(() => mode.sample(out, 1 / 60, ctx)).not.toThrow();
    expect(radius(out)).toBeCloseTo(9, 5);
  });
});
