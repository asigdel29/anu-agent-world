import type { SweepHit } from "../../collision/surfaceQuery";
import { createSweepHit } from "../../collision/surfaceQuery";
import type { CameraContext, CameraMode, CameraPose } from "../cameraDirector";

/**
 * Third-person following: orbit the subject at a distance, aim slightly above
 * it, and get out of the way when geometry intrudes.
 *
 * The asymmetry in how occlusion is resolved is deliberate and is the whole
 * feel of the mode. Pulling in happens immediately, because a camera that
 * eases into a wall spends those frames inside it and the view fills with
 * backfaces. Pushing back out is eased, because doing that instantly makes the
 * camera pop the moment the player clears a corner — the same event, handled
 * symmetrically, reads as a glitch in one direction and as smoothness in the
 * other.
 */

/** Reused so sampling allocates nothing. */
const hit: SweepHit = createSweepHit();

export function createFollowMode(id = "follow", priority = 0): CameraMode {
  // Held across frames so the push-out can be eased.
  let distance = -1;

  return {
    id,
    priority,

    enter(ctx: CameraContext) {
      // Take the requested distance immediately on entry rather than easing
      // out from wherever a previous mode happened to leave things.
      distance = ctx.orbitDistance;
    },

    sample(out: CameraPose, dt: number, ctx: CameraContext) {
      const { cfg } = ctx;
      if (distance < 0) distance = ctx.orbitDistance;

      // ---- aim ------------------------------------------------------------
      // Lead the subject by its velocity so that running reads as purposeful
      // rather than as the camera being dragged along behind.
      const speed = Math.hypot(ctx.velocityX, ctx.velocityZ);
      let leadX = 0;
      let leadZ = 0;
      if (speed > 0) {
        const lead = Math.min(speed * cfg.lookAhead.scale, cfg.lookAhead.maxDistance);
        leadX = (ctx.velocityX / speed) * lead;
        leadZ = (ctx.velocityZ / speed) * lead;
      }

      const aimX = ctx.subjectX + leadX;
      const aimY = ctx.subjectY + cfg.lookHeight;
      const aimZ = ctx.subjectZ + leadZ;

      // ---- desired placement ----------------------------------------------
      const pitch = Math.min(Math.max(ctx.orbitPitch, cfg.pitch.min), cfg.pitch.max);
      const wanted = Math.min(
        Math.max(ctx.orbitDistance, cfg.distance.min),
        cfg.distance.max,
      );

      const horizontal = Math.cos(pitch);
      const dirX = Math.sin(ctx.orbitYaw) * horizontal;
      const dirY = Math.sin(pitch);
      const dirZ = Math.cos(ctx.orbitYaw) * horizontal;

      // ---- occlusion -------------------------------------------------------
      let allowed = wanted;
      if (ctx.query) {
        const reach = wanted + cfg.occlusion.skin;
        if (ctx.query.ray(aimX, aimY, aimZ, dirX, dirY, dirZ, reach, "structure", hit)) {
          allowed = Math.max(cfg.occlusion.nearMin, hit.distance - cfg.occlusion.skin);
        }
      }

      if (allowed <= distance) {
        distance = allowed;
      } else {
        // Ease outward at a rate that crosses the full distance band in the
        // configured time, so the recovery feels the same wherever it starts.
        const span = Math.max(cfg.distance.max - cfg.distance.min, 1e-6);
        const rate = span / Math.max(cfg.occlusion.pushOutSec, 1e-6);
        distance = Math.min(allowed, distance + rate * dt);
      }

      out.tx = aimX;
      out.ty = aimY;
      out.tz = aimZ;
      out.px = aimX + dirX * distance;
      out.py = aimY + dirY * distance;
      out.pz = aimZ + dirZ * distance;
    },
  };
}
