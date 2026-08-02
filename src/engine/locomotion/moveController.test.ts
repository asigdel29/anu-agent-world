import { describe, expect, it } from "vitest";

import type { SurfaceQuery, SweepHit } from "../collision/surfaceQuery";
import type { LocomotionConfig, WorldBounds } from "../config/types";
import type { MoveIntent, MoveLimits, MoveState } from "./moveController";
import { createMoveState, stepLocomotion } from "./moveController";

/**
 * Movement is tested against a fake surface oracle rather than a scene. A
 * staircase here is one arithmetic expression, which is the entire reason the
 * controller takes an oracle instead of owning a raycaster.
 */

const CFG: LocomotionConfig = {
  walkSpeed: 4,
  runSpeed: 8,
  accel: 40,
  friction: 20,
  airControl: 0.35,
  turnRate: 12,
  gravity: -20,
  jumpSpeed: 8,
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
};

const BOUNDS: WorldBounds = { minX: -50, maxX: 50, minZ: -50, maxZ: 50 };

const LIMITS: MoveLimits = {
  bounds: BOUNDS,
  voidY: -10,
  spawnX: 0,
  spawnY: 1,
  spawnZ: 0,
};

const STILL: MoveIntent = { moveX: 0, moveZ: 0, run: false, jumpPressed: false };
const FORWARD: MoveIntent = { moveX: 0, moveZ: 1, run: false, jumpPressed: false };

/** Ground everywhere at y = 0, nothing to walk into. */
function flatGround(): SurfaceQuery {
  return {
    groundAt: () => 0,
    sweep: () => false,
  };
}

/** Ground at y = 0, with a void beyond `edgeZ`. */
function groundWithVoid(edgeZ: number): SurfaceQuery {
  return {
    groundAt: (_x, z) => (z < edgeZ ? 0 : null),
    sweep: () => false,
  };
}

/**
 * Ground at y = 0 up to `atZ`, then a single riser of `riseHeight`. The riser
 * face is a vertical wall, so a character walking into it is blocked at foot
 * height and must resolve it as a step or refuse it.
 */
function singleStep(atZ: number, riseHeight: number): SurfaceQuery {
  return {
    groundAt: (_x, z) => (z >= atZ ? riseHeight : 0),
    sweep: (_fx, fy, fz, _dx, dz, distance, radius, out: SweepHit) => {
      if (dz <= 0) return false;
      // The riser face only obstructs rays below its top edge.
      if (fy >= riseHeight) return false;
      const gap = atZ - fz;
      if (gap < 0 || gap > distance + radius) return false;
      out.distance = gap;
      out.normalX = 0;
      out.normalY = 0;
      out.normalZ = -1;
      return true;
    },
  };
}

/** Ground at y = 0, with a full-height wall across `atZ`. */
function wall(atZ: number): SurfaceQuery {
  return {
    groundAt: () => 0,
    sweep: (_fx, _fy, fz, _dx, dz, distance, radius, out: SweepHit) => {
      if (dz <= 0) return false;
      const gap = atZ - fz;
      if (gap < 0 || gap > distance + radius) return false;
      out.distance = gap;
      out.normalX = 0;
      out.normalY = 0;
      out.normalZ = -1;
      return true;
    },
  };
}

/** Run the controller for `seconds` at a fixed timestep. */
function simulate(
  state: MoveState,
  intent: MoveIntent,
  query: SurfaceQuery,
  seconds: number,
  dt = 1 / 60,
): void {
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i += 1) {
    stepLocomotion(state, intent, CFG, LIMITS, query, dt);
  }
}

function grounded(y = 0): MoveState {
  const state = createMoveState(0, y, 0, 0);
  state.grounded = true;
  state.airborneFor = 0;
  return state;
}

describe("stepLocomotion", () => {
  describe("travel", () => {
    it("accelerates toward walking speed rather than snapping to it", () => {
      const state = grounded();
      stepLocomotion(state, FORWARD, CFG, LIMITS, flatGround(), 1 / 60);
      // One frame of 40 u/s^2 is well short of the 4 u/s target.
      expect(state.vz).toBeGreaterThan(0);
      expect(state.vz).toBeLessThan(CFG.walkSpeed);
    });

    it("reaches walking speed and holds it", () => {
      const state = grounded();
      simulate(state, FORWARD, flatGround(), 1);
      expect(state.vz).toBeCloseTo(CFG.walkSpeed, 5);
    });

    it("reaches running speed when running", () => {
      const state = grounded();
      simulate(state, { ...FORWARD, run: true }, flatGround(), 1);
      expect(state.vz).toBeCloseTo(CFG.runSpeed, 5);
    });

    it("comes to rest through friction when input stops", () => {
      const state = grounded();
      simulate(state, FORWARD, flatGround(), 1);
      simulate(state, STILL, flatGround(), 1);
      expect(state.vx).toBe(0);
      expect(state.vz).toBe(0);
    });

    it("faces the direction of travel", () => {
      const state = grounded();
      simulate(state, FORWARD, flatGround(), 1);
      expect(state.yaw).toBeCloseTo(0, 2);
    });
  });

  describe("walls", () => {
    it("stops at a wall instead of passing through it", () => {
      const state = grounded();
      simulate(state, FORWARD, wall(2), 3);
      expect(state.z).toBeLessThan(2);
    });

    it("preserves tangential speed when sliding along a wall", () => {
      // Approaching at 45 degrees: the component along the wall survives.
      const state = grounded();
      const diagonal: MoveIntent = {
        moveX: 1,
        moveZ: 1,
        run: false,
        jumpPressed: false,
      };
      simulate(state, diagonal, wall(1), 2);
      expect(state.z).toBeLessThan(1);
      expect(state.x).toBeGreaterThan(1);
    });
  });

  describe("steps", () => {
    it("climbs a rise within the step ceiling", () => {
      const state = grounded();
      simulate(state, FORWARD, singleStep(2, 0.6), 3);
      expect(state.z).toBeGreaterThan(2);
      expect(state.y).toBeCloseTo(0.6, 5);
    });

    it("refuses a rise above the step ceiling", () => {
      const state = grounded();
      simulate(state, FORWARD, singleStep(2, 0.7), 3);
      expect(state.z).toBeLessThan(2);
      expect(state.y).toBeCloseTo(0, 5);
    });

    it("follows a drop within reach rather than going airborne", () => {
      const state = grounded(0.6);
      // Ground falls away from 0.6 to 0 at z = 1: a 0.6 drop, inside the limit.
      const query: SurfaceQuery = {
        groundAt: (_x, z) => (z >= 1 ? 0 : 0.6),
        sweep: () => false,
      };
      simulate(state, FORWARD, query, 1);
      expect(state.z).toBeGreaterThan(1);
      expect(state.y).toBeCloseTo(0, 5);
      expect(state.grounded).toBe(true);
    });

    it("goes airborne over a drop beyond reach", () => {
      const state = grounded(3);
      const query: SurfaceQuery = {
        groundAt: (_x, z) => (z >= 1 ? 0 : 3),
        sweep: () => false,
      };
      // Sample immediately after crossing the lip, before it lands again.
      let wentAirborne = false;
      for (let i = 0; i < 40; i += 1) {
        stepLocomotion(state, FORWARD, CFG, LIMITS, query, 1 / 60);
        if (state.z > 1 && !state.grounded) wentAirborne = true;
      }
      expect(wentAirborne).toBe(true);
    });
  });

  describe("jumping", () => {
    it("leaves the ground when jump is pressed", () => {
      const state = grounded();
      const query = flatGround();

      // The impulse lands at the end of the frame, after the ground has been
      // resolved, so the character is committed to the jump now and gains
      // height on the following frame.
      stepLocomotion(state, { ...STILL, jumpPressed: true }, CFG, LIMITS, query, 1 / 60);
      expect(state.grounded).toBe(false);
      expect(state.vy).toBeCloseTo(CFG.jumpSpeed, 5);

      stepLocomotion(state, STILL, CFG, LIMITS, query, 1 / 60);
      expect(state.y).toBeGreaterThan(0);
    });

    it("returns to the ground", () => {
      const state = grounded();
      stepLocomotion(state, { ...STILL, jumpPressed: true }, CFG, LIMITS, flatGround(), 1 / 60);
      simulate(state, STILL, flatGround(), 3);
      expect(state.grounded).toBe(true);
      expect(state.y).toBeCloseTo(0, 5);
    });

    it("allows a jump inside the coyote window after leaving ground", () => {
      const state = grounded();
      state.grounded = false;
      state.airborneFor = 0.11; // inside the 0.12 s window
      stepLocomotion(state, { ...STILL, jumpPressed: true }, CFG, LIMITS, groundWithVoid(-1), 1 / 60);
      expect(state.vy).toBeGreaterThan(0);
    });

    it("refuses a jump once the coyote window has lapsed", () => {
      const state = grounded();
      state.grounded = false;
      state.airborneFor = 0.13; // outside the 0.12 s window
      stepLocomotion(state, { ...STILL, jumpPressed: true }, CFG, LIMITS, groundWithVoid(-1), 1 / 60);
      expect(state.vy).toBeLessThan(0);
    });

    it("fires a jump pressed just before landing", () => {
      // Without buffering this press is discarded and reads as dropped input.
      const state = createMoveState(0, 0.3, 0, 0);
      state.vy = -2;
      const query = flatGround();

      stepLocomotion(state, { ...STILL, jumpPressed: true }, CFG, LIMITS, query, 1 / 60);
      expect(state.jumpBufferedFor).toBeGreaterThan(0);

      // The character is still falling; the buffered press must survive until
      // it touches down and then fire.
      let jumped = false;
      for (let i = 0; i < 20; i += 1) {
        stepLocomotion(state, STILL, CFG, LIMITS, query, 1 / 60);
        if (state.vy > 0) jumped = true;
      }
      expect(jumped).toBe(true);
    });

    it("discards a press that expires before the character lands", () => {
      // The buffer is a courtesy, not a queue: a press seconds early should
      // not surface as a surprise jump on landing.
      const state = createMoveState(0, 6, 0, 0);
      const query = flatGround();

      stepLocomotion(state, { ...STILL, jumpPressed: true }, CFG, LIMITS, query, 1 / 60);
      simulate(state, STILL, query, 2);

      expect(state.grounded).toBe(true);
      expect(state.vy).toBe(0);
    });
  });

  describe("world limits", () => {
    it("clamps to the horizontal bounds", () => {
      const state = grounded();
      state.z = BOUNDS.maxZ - 0.1;
      simulate(state, FORWARD, flatGround(), 2);
      expect(state.z).toBeLessThanOrEqual(BOUNDS.maxZ);
    });

    it("falls through a hole rather than hovering over it", () => {
      const state = grounded();
      simulate(state, FORWARD, groundWithVoid(1), 0.5);
      expect(state.grounded).toBe(false);
    });

    it("respawns once below the void floor, not on every frame", () => {
      const state = grounded();
      const query = groundWithVoid(1);

      simulate(state, FORWARD, query, 3);

      // It must be back at spawn and settled there, not oscillating.
      expect(state.y).toBeGreaterThan(LIMITS.voidY);
      const yAfter = state.y;
      simulate(state, STILL, query, 0.5);
      expect(state.y).toBeGreaterThan(LIMITS.voidY);
      expect(Math.abs(state.y - yAfter)).toBeLessThan(5);
    });
  });

  describe("frame-rate independence", () => {
    it("reaches the same speed at 30 and 60 frames per second", () => {
      const at60 = grounded();
      const at30 = grounded();
      simulate(at60, FORWARD, flatGround(), 2, 1 / 60);
      simulate(at30, FORWARD, flatGround(), 2, 1 / 30);
      expect(at30.vz).toBeCloseTo(at60.vz, 5);
    });
  });

  it("allocates nothing per frame", () => {
    // The controller runs every frame; allocating here is how a frame-time
    // graph acquires a sawtooth. Asserted by identity: the state object handed
    // in must be the one mutated, never replaced.
    const state = grounded();
    const before = state;
    stepLocomotion(state, FORWARD, CFG, LIMITS, flatGround(), 1 / 60);
    expect(state).toBe(before);
  });
});
