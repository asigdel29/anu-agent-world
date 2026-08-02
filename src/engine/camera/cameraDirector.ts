import type { CameraConfig } from "../config/types";
import type { SurfaceQuery } from "../collision/surfaceQuery";

/**
 * The camera has exactly one owner.
 *
 * The predecessor project let two things place the camera — the character
 * controller and a guided-tour rig — which forced an early return at the top
 * of the controller's frame callback so the tour could take over. That branch
 * fragmented the one function where ordering matters most, and adding a third
 * behaviour would have meant a third branch.
 *
 * Here every behaviour is a mode on a stack, and the director alone writes a
 * pose. Following the character, watching an agent, running a scripted
 * fly-through, and framing a photo are then the same kind of thing rather than
 * special cases of each other.
 *
 * The director is deliberately free of three.js: it produces a pose, and the
 * caller applies it. That keeps blending testable without a scene.
 */

/** Where the camera is and what it is looking at. */
export interface CameraPose {
  px: number;
  py: number;
  pz: number;
  tx: number;
  ty: number;
  tz: number;
}

export function createCameraPose(): CameraPose {
  return { px: 0, py: 0, pz: 0, tx: 0, ty: 0, tz: 0 };
}

/** What modes are given to work with, published by the controller each frame. */
export interface CameraContext {
  /** The thing being framed. */
  subjectX: number;
  subjectY: number;
  subjectZ: number;
  subjectYaw: number;
  /** Horizontal velocity, used for look-ahead. */
  velocityX: number;
  velocityZ: number;

  /** Orbit controls, driven by pointer or touch. */
  orbitYaw: number;
  orbitPitch: number;
  orbitDistance: number;

  cfg: CameraConfig;
  /** Used for occlusion tests; null before the world has colliders. */
  query: SurfaceQuery | null;
}

export interface CameraMode {
  readonly id: string;
  /** Higher priority modes take the camera from lower ones. */
  readonly priority: number;
  enter?(ctx: CameraContext): void;
  exit?(ctx: CameraContext): void;
  /** Write this mode's pose for the frame. */
  sample(out: CameraPose, dt: number, ctx: CameraContext): void;
}

export interface CameraDirector {
  push(mode: CameraMode, ctx: CameraContext): void;
  pop(id: string, ctx: CameraContext): void;
  /** Write the blended pose for this frame. */
  sample(out: CameraPose, dt: number, ctx: CameraContext): void;
  /** Id of the mode currently in charge, or null when the stack is empty. */
  activeId(): string | null;
  /** 0 while a handover is in progress, 1 once it has completed. */
  blendWeight(): number;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Smoothstep, so a handover eases in and out rather than starting abruptly. */
function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

export function createCameraDirector(): CameraDirector {
  const stack: CameraMode[] = [];

  // The mode being handed over from, kept alive only for the blend.
  let outgoing: CameraMode | null = null;
  let blend = 1;

  // Reused so sampling allocates nothing.
  const poseA = createCameraPose();
  const poseB = createCameraPose();

  function top(): CameraMode | null {
    return stack.length > 0 ? (stack[stack.length - 1] ?? null) : null;
  }

  function beginHandover(from: CameraMode | null): void {
    // A handover interrupted mid-way hands over from where the camera
    // actually is, not from where the previous mode began, so interrupting a
    // transition does not snap.
    outgoing = from;
    blend = from === null ? 1 : 0;
  }

  return {
    push(mode, ctx) {
      const previous = top();
      // Modes are ordered by priority, so a low-priority push beneath an
      // active high-priority mode does not steal the camera.
      let index = stack.length;
      while (index > 0 && (stack[index - 1]?.priority ?? 0) > mode.priority) index -= 1;
      stack.splice(index, 0, mode);

      mode.enter?.(ctx);
      if (top() === mode && previous !== mode) beginHandover(previous);
    },

    pop(id, ctx) {
      const index = stack.findIndex((mode) => mode.id === id);
      if (index === -1) return;
      const wasTop = index === stack.length - 1;
      const [removed] = stack.splice(index, 1);
      removed?.exit?.(ctx);
      if (wasTop) beginHandover(removed ?? null);
    },

    sample(out, dt, ctx) {
      const active = top();
      if (!active) {
        // Nothing is in charge. Holding the last pose is kinder than snapping
        // to the origin, which is what an unguarded read would do.
        return;
      }

      active.sample(out, dt, ctx);

      if (blend >= 1 || outgoing === null) {
        blend = 1;
        outgoing = null;
        return;
      }

      // Advance the handover and mix the two poses.
      const period = Math.max(ctx.cfg.blendSec, 1e-6);
      blend = Math.min(1, blend + dt / period);
      const t = smooth(blend);

      poseA.px = out.px;
      poseA.py = out.py;
      poseA.pz = out.pz;
      poseA.tx = out.tx;
      poseA.ty = out.ty;
      poseA.tz = out.tz;

      outgoing.sample(poseB, dt, ctx);

      out.px = lerp(poseB.px, poseA.px, t);
      out.py = lerp(poseB.py, poseA.py, t);
      out.pz = lerp(poseB.pz, poseA.pz, t);
      out.tx = lerp(poseB.tx, poseA.tx, t);
      out.ty = lerp(poseB.ty, poseA.ty, t);
      out.tz = lerp(poseB.tz, poseA.tz, t);

      if (blend >= 1) outgoing = null;
    },

    activeId() {
      return top()?.id ?? null;
    },

    blendWeight() {
      return blend;
    },
  };
}
