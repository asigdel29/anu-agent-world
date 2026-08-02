import { describe, expect, it } from "vitest";

import type { CameraConfig } from "../config/types";
import type { CameraContext, CameraMode, CameraPose } from "./cameraDirector";
import { createCameraDirector, createCameraPose } from "./cameraDirector";

const CAMERA_CFG = {
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

function context(): CameraContext {
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
    cfg: CAMERA_CFG,
    query: null,
  };
}

/** A mode that parks the camera at a fixed height, for checking blends. */
function fixedMode(id: string, priority: number, height: number): CameraMode {
  return {
    id,
    priority,
    sample(out: CameraPose) {
      out.px = 0;
      out.py = height;
      out.pz = 0;
      out.tx = 0;
      out.ty = 0;
      out.tz = 0;
    },
  };
}

function advance(
  director: ReturnType<typeof createCameraDirector>,
  out: CameraPose,
  ctx: CameraContext,
  seconds: number,
  dt = 1 / 60,
): void {
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i += 1) director.sample(out, dt, ctx);
}

describe("createCameraDirector", () => {
  it("reports no active mode when empty", () => {
    expect(createCameraDirector().activeId()).toBeNull();
  });

  it("holds the previous pose rather than snapping to the origin when empty", () => {
    // An unguarded read would place the camera at the world origin, which
    // presents as a single jarring frame rather than as a missing mode.
    const director = createCameraDirector();
    const out = createCameraPose();
    out.py = 42;
    director.sample(out, 1 / 60, context());
    expect(out.py).toBe(42);
  });

  it("samples the pushed mode", () => {
    const director = createCameraDirector();
    const out = createCameraPose();
    const ctx = context();

    director.push(fixedMode("follow", 0, 5), ctx);
    director.sample(out, 1 / 60, ctx);

    expect(director.activeId()).toBe("follow");
    expect(out.py).toBe(5);
  });

  it("calls enter when a mode is pushed and exit when popped", () => {
    const director = createCameraDirector();
    const ctx = context();
    const seen: string[] = [];
    const mode: CameraMode = {
      ...fixedMode("m", 0, 1),
      enter: () => seen.push("enter"),
      exit: () => seen.push("exit"),
    };

    director.push(mode, ctx);
    director.pop("m", ctx);

    expect(seen).toEqual(["enter", "exit"]);
  });

  it("ignores popping a mode that is not on the stack", () => {
    const director = createCameraDirector();
    const ctx = context();
    director.push(fixedMode("follow", 0, 5), ctx);

    expect(() => director.pop("missing", ctx)).not.toThrow();
    expect(director.activeId()).toBe("follow");
  });

  describe("priority", () => {
    it("gives the camera to the higher-priority mode", () => {
      const director = createCameraDirector();
      const ctx = context();

      director.push(fixedMode("follow", 0, 5), ctx);
      director.push(fixedMode("cinematic", 10, 20), ctx);

      expect(director.activeId()).toBe("cinematic");
    });

    it("does not let a low-priority push steal from an active high-priority mode", () => {
      const director = createCameraDirector();
      const ctx = context();

      director.push(fixedMode("cinematic", 10, 20), ctx);
      director.push(fixedMode("follow", 0, 5), ctx);

      expect(director.activeId()).toBe("cinematic");
    });

    it("returns control to the mode beneath when the top is popped", () => {
      const director = createCameraDirector();
      const ctx = context();

      director.push(fixedMode("follow", 0, 5), ctx);
      director.push(fixedMode("cinematic", 10, 20), ctx);
      director.pop("cinematic", ctx);

      expect(director.activeId()).toBe("follow");
    });
  });

  describe("handover", () => {
    it("completes without a blend when nothing was in charge before", () => {
      const director = createCameraDirector();
      const ctx = context();

      director.push(fixedMode("follow", 0, 5), ctx);
      director.sample(createCameraPose(), 1 / 60, ctx);

      expect(director.blendWeight()).toBe(1);
    });

    it("mixes the two modes partway through a handover", () => {
      const director = createCameraDirector();
      const out = createCameraPose();
      const ctx = context();

      director.push(fixedMode("follow", 0, 0), ctx);
      advance(director, out, ctx, 0.5);

      director.push(fixedMode("watch", 10, 10), ctx);
      advance(director, out, ctx, ctx.cfg.blendSec / 2);

      expect(out.py).toBeGreaterThan(0);
      expect(out.py).toBeLessThan(10);
    });

    it("finishes the handover after the configured period", () => {
      const director = createCameraDirector();
      const out = createCameraPose();
      const ctx = context();

      director.push(fixedMode("follow", 0, 0), ctx);
      advance(director, out, ctx, 0.5);
      director.push(fixedMode("watch", 10, 10), ctx);
      advance(director, out, ctx, ctx.cfg.blendSec + 0.1);

      expect(director.blendWeight()).toBe(1);
      expect(out.py).toBeCloseTo(10, 6);
    });

    it("blends back on the way out too", () => {
      const director = createCameraDirector();
      const out = createCameraPose();
      const ctx = context();

      director.push(fixedMode("follow", 0, 0), ctx);
      advance(director, out, ctx, 0.5);
      director.push(fixedMode("watch", 10, 10), ctx);
      advance(director, out, ctx, ctx.cfg.blendSec + 0.1);

      director.pop("watch", ctx);
      advance(director, out, ctx, ctx.cfg.blendSec / 2);

      expect(out.py).toBeGreaterThan(0);
      expect(out.py).toBeLessThan(10);
    });

    it("takes the same time to hand over at 30 and 60 frames per second", () => {
      const build = () => {
        const director = createCameraDirector();
        const out = createCameraPose();
        const ctx = context();
        director.push(fixedMode("follow", 0, 0), ctx);
        director.sample(out, 1 / 60, ctx);
        director.push(fixedMode("watch", 10, 10), ctx);
        return { director, out, ctx };
      };

      // 0.2 s is a whole number of frames at both rates, so the comparison
      // comes down to the blend rather than to rounding the step count.
      const fast = build();
      advance(fast.director, fast.out, fast.ctx, 0.2, 1 / 60);
      const slow = build();
      advance(slow.director, slow.out, slow.ctx, 0.2, 1 / 30);

      expect(slow.out.py).toBeCloseTo(fast.out.py, 4);
    });
  });
});
