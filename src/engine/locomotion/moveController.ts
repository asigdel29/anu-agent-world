import type { SurfaceQuery, SweepHit } from "../collision/surfaceQuery";
import { createSweepHit } from "../collision/surfaceQuery";
import type { LocomotionConfig, WorldBounds } from "../config/types";
import { isBlockedByObstacle, isClimbableStep, isWalkableStepDown } from "./stepRules";

/**
 * Character movement, as a pure function over a surface oracle.
 *
 * The whole point of the shape is testability: given a fake oracle, a
 * staircase is a few lines of arithmetic, so the rules that decide whether a
 * character climbs a step or falls off a ledge can be asserted directly rather
 * than eyeballed in a browser.
 *
 * The function mutates `state` in place and allocates nothing. Working values
 * live in module scope, which is safe because a frame loop is single-threaded
 * and calls are never nested.
 */

/** Share of an intended move that must survive a slide to count as clear. */
const BLOCKED_RATIO = 0.95;

/** Vertical slack allowed when deciding the character has landed. */
const LANDING_EPSILON = 0.05;

/** Sentinel for "has been airborne long enough that coyote time has lapsed". */
const LONG_AIRBORNE = 1e3;

export interface MoveState {
  x: number;
  y: number;
  z: number;
  /** Horizontal velocity, world units per second. */
  vx: number;
  vz: number;
  /** Vertical velocity, world units per second. */
  vy: number;
  /** Facing, radians. */
  yaw: number;
  grounded: boolean;
  /** Seconds since the character last stood on ground. */
  airborneFor: number;
  /** Seconds a pressed jump stays queued while the character is still falling. */
  jumpBufferedFor: number;
}

export interface MoveIntent {
  /** Desired direction in world axes, magnitude 0..1. */
  moveX: number;
  moveZ: number;
  run: boolean;
  /** True on the frame the jump control went down, not while it is held. */
  jumpPressed: boolean;
}

/** World limits movement must respect, separate from how movement feels. */
export interface MoveLimits {
  readonly bounds: WorldBounds;
  /** Falling below this height returns the character to spawn. */
  readonly voidY: number;
  readonly spawnX: number;
  readonly spawnY: number;
  readonly spawnZ: number;
}

export function createMoveState(x: number, y: number, z: number, yaw: number): MoveState {
  return {
    x,
    y,
    z,
    vx: 0,
    vz: 0,
    vy: 0,
    yaw,
    grounded: false,
    airborneFor: LONG_AIRBORNE,
    jumpBufferedFor: 0,
  };
}

// Reused across calls; see the note on allocation above.
const hit: SweepHit = createSweepHit();

/** Shortest signed angular difference, wrapping correctly across the seam. */
function angleDelta(from: number, to: number): number {
  const diff = to - from;
  return Math.atan2(Math.sin(diff), Math.cos(diff));
}

/**
 * Slide a horizontal move along whatever it hits.
 *
 * Several rays are cast, one per configured body height. A single mid-body ray
 * — which is what the predecessor project used — clips low kerbs, because
 * nothing at ankle height is ever tested, and vaults railing tops for the same
 * reason at the other end. Surfaces flat enough to walk on are ignored here:
 * they are the floor, and gravity deals with them.
 *
 * Writes the resolved move into `slid`, and returns nothing.
 */
const slid = { dx: 0, dz: 0 };

function slideMove(
  state: MoveState,
  dx: number,
  dz: number,
  cfg: LocomotionConfig,
  query: SurfaceQuery,
  footY: number,
): void {
  slid.dx = dx;
  slid.dz = dz;

  const length = Math.hypot(dx, dz);
  if (length === 0) return;

  let nearest = Number.POSITIVE_INFINITY;
  let nx = 0;
  let nz = 0;
  let struck = false;

  for (const height of cfg.wallCastHeights) {
    const castY = footY + height;
    if (!query.sweep(state.x, castY, state.z, dx, dz, length, cfg.playerRadius, hit)) {
      continue;
    }
    // A surface whose normal points mostly upward is ground, not wall.
    if (Math.abs(hit.normalY) > cfg.wallSlopeLimit) continue;
    if (hit.distance < nearest) {
      nearest = hit.distance;
      nx = hit.normalX;
      nz = hit.normalZ;
      struck = true;
    }
  }

  if (!struck) return;

  // Project the move onto the wall plane so contact converts forward motion
  // into sliding rather than stopping the character dead.
  const normalLength = Math.hypot(nx, nz);
  if (normalLength === 0) return;
  const unitX = nx / normalLength;
  const unitZ = nz / normalLength;
  const into = dx * unitX + dz * unitZ;
  if (into >= 0) return;

  slid.dx = dx - into * unitX;
  slid.dz = dz - into * unitZ;
}

/** Advance the character by one frame. Mutates `state`. */
export function stepLocomotion(
  state: MoveState,
  intent: MoveIntent,
  cfg: LocomotionConfig,
  limits: MoveLimits,
  query: SurfaceQuery,
  dt: number,
): void {
  // ---- jump buffering ----------------------------------------------------
  // A jump pressed just before landing should fire on landing rather than be
  // discarded; without this, missed jumps at ledges read as dropped input.
  state.jumpBufferedFor = intent.jumpPressed
    ? cfg.jumpBufferSec
    : Math.max(0, state.jumpBufferedFor - dt);

  // Coyote time is judged against how long the character had been airborne
  // when the frame began. Reading it after this frame's increment would shorten
  // the window by a frame and make the tolerance depend on the frame rate.
  const airborneAtFrameStart = state.airborneFor;

  // ---- horizontal velocity ----------------------------------------------
  const intentLength = Math.hypot(intent.moveX, intent.moveZ);
  const control = state.grounded ? 1 : cfg.airControl;

  if (intentLength > 0) {
    const speed = (intent.run ? cfg.runSpeed : cfg.walkSpeed) * Math.min(1, intentLength);
    const targetX = (intent.moveX / intentLength) * speed;
    const targetZ = (intent.moveZ / intentLength) * speed;
    const rate = cfg.accel * control * dt;
    const gapX = targetX - state.vx;
    const gapZ = targetZ - state.vz;
    const gap = Math.hypot(gapX, gapZ);
    if (gap <= rate || gap === 0) {
      state.vx = targetX;
      state.vz = targetZ;
    } else {
      state.vx += (gapX / gap) * rate;
      state.vz += (gapZ / gap) * rate;
    }
  } else if (state.grounded) {
    // No input on the ground: bleed speed off rather than stopping dead.
    const speed = Math.hypot(state.vx, state.vz);
    const drop = cfg.friction * dt;
    if (speed <= drop || speed === 0) {
      state.vx = 0;
      state.vz = 0;
    } else {
      state.vx -= (state.vx / speed) * drop;
      state.vz -= (state.vz / speed) * drop;
    }
  }

  // ---- horizontal move, with a step-up retry -----------------------------
  const intendedX = state.vx * dt;
  const intendedZ = state.vz * dt;
  const intendedLength = Math.hypot(intendedX, intendedZ);

  slideMove(state, intendedX, intendedZ, cfg, query, state.y);
  let moveX = slid.dx;
  let moveZ = slid.dz;

  if (
    state.grounded &&
    isBlockedByObstacle(intendedLength, Math.hypot(moveX, moveZ), BLOCKED_RATIO)
  ) {
    // Blocked at foot height may mean a stair rather than a wall. Retry the
    // same move from one step higher, and accept it only if there is real
    // ground to stand on at the far side.
    slideMove(state, intendedX, intendedZ, cfg, query, state.y + cfg.maxStepHeight);
    const raisedLength = Math.hypot(slid.dx, slid.dz);
    if (!isBlockedByObstacle(intendedLength, raisedLength, BLOCKED_RATIO)) {
      const stepX = state.x + slid.dx;
      const stepZ = state.z + slid.dz;
      const groundY = query.groundAt(
        stepX,
        stepZ,
        state.y + cfg.maxStepHeight + cfg.groundRayAbove,
        cfg.groundRayFar,
      );
      if (isClimbableStep(groundY, state.y, cfg.maxStepHeight, cfg.stepDownTolerance)) {
        moveX = slid.dx;
        moveZ = slid.dz;
        state.y = groundY as number;
      }
    }
  }

  state.x += moveX;
  state.z += moveZ;

  // ---- gravity -----------------------------------------------------------
  const wasGrounded = state.grounded;
  state.vy += cfg.gravity * dt;
  state.y += state.vy * dt;

  // ---- ground resolution -------------------------------------------------
  const groundY = query.groundAt(
    state.x,
    state.z,
    state.y + cfg.groundRayAbove,
    cfg.groundRayFar,
  );

  if (groundY === null) {
    // Nothing underfoot: keep falling. The predecessor project held height
    // here to guard against a chunk that had not streamed in yet, but that
    // makes a genuine hole unfallable — the character hovers over it. Falling
    // is the honest reading, and the void floor below catches both cases: a
    // real pit and a streaming gap both end in a respawn, which is
    // recoverable and legible, rather than in mid-air suspension, which is
    // neither.
    state.grounded = false;
    state.airborneFor += dt;
  } else if (state.vy <= 0 && state.y <= groundY + LANDING_EPSILON) {
    state.y = groundY;
    state.vy = 0;
    state.grounded = true;
    state.airborneFor = 0;
  } else if (wasGrounded && state.vy <= 0 && isWalkableStepDown(state.y, groundY, cfg.maxStepDown)) {
    // Follow the surface down instead of going airborne, so descending stairs
    // reads as walking rather than falling off each lip.
    state.y = groundY;
    state.vy = 0;
    state.grounded = true;
    state.airborneFor = 0;
  } else {
    state.grounded = false;
    state.airborneFor += dt;
  }

  // ---- jumping -----------------------------------------------------------
  // Resolved after the ground, so a jump pressed a moment before touching down
  // fires on the landing frame itself rather than the one after it. Coyote
  // time covers the mirror case: a jump pressed just after walking off an edge
  // still counts. Both exist because either failure reads to a player as the
  // control having been ignored.
  const mayJump = state.grounded || airborneAtFrameStart <= cfg.coyoteSec;
  if (mayJump && state.jumpBufferedFor > 0) {
    state.vy = cfg.jumpSpeed;
    state.grounded = false;
    state.airborneFor = LONG_AIRBORNE;
    state.jumpBufferedFor = 0;
  }

  // ---- facing ------------------------------------------------------------
  // Turn toward travel rather than toward input, so a character sliding along
  // a wall faces where it is actually going.
  const travel = Math.hypot(state.vx, state.vz);
  if (travel > 0.01) {
    const target = Math.atan2(state.vx, state.vz);
    state.yaw += angleDelta(state.yaw, target) * Math.min(1, cfg.turnRate * dt);
  }

  // ---- world limits ------------------------------------------------------
  const b = limits.bounds;
  if (state.x < b.minX) state.x = b.minX;
  else if (state.x > b.maxX) state.x = b.maxX;
  if (state.z < b.minZ) state.z = b.minZ;
  else if (state.z > b.maxZ) state.z = b.maxZ;

  if (state.y < limits.voidY) {
    state.x = limits.spawnX;
    state.y = limits.spawnY;
    state.z = limits.spawnZ;
    state.vx = 0;
    state.vy = 0;
    state.vz = 0;
    state.grounded = false;
    state.airborneFor = LONG_AIRBORNE;
    state.jumpBufferedFor = 0;
  }
}
