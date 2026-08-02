import type { WorldConfig } from "../../engine/config/types";

/**
 * The engine's permanent test world.
 *
 * It exists so that movement, streaming, and camera behaviour can be judged
 * against geometry whose dimensions are known exactly, rather than against art
 * that happens to be loaded. Every feature in {@link GreyBoxScene} is sized to
 * a threshold in this configuration, so a change in feel shows up as a
 * staircase that no longer climbs rather than as a vague sense that something
 * is off.
 *
 * It is not scaffolding to be deleted once the real world exists. Keeping it
 * reachable means that when the art changes and movement starts misbehaving,
 * there is somewhere to stand that has not changed.
 *
 * Note the ground sits at y = 0. That is deliberate: the predecessor project's
 * terrain sat between y 60 and 85, and constants tuned for it silently broke
 * anything built at the origin.
 */
export const greyboxConfig: WorldConfig = {
  id: "greybox",
  version: 1,

  units: { chunkSize: 32, unitsPerMetre: 1 },

  spawn: { position: [0, 1, -6], yaw: 0 },
  bounds: { minX: -96, maxX: 96, minZ: -96, maxZ: 96 },
  vertical: { groundMinY: 0, groundMaxY: 24, voidY: -10, ceilingY: 120 },

  locomotion: {
    walkSpeed: 4.2,
    runSpeed: 7.4,
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
    // No fog and a flat background: the world is a diorama floating in an
    // empty void, so there is no horizon to hide anything behind.
    fog: null,
    background: { kind: "color", color: "#f9f7f6" },
    sun: { direction: [-0.5, -1, -0.35], color: "#fff2e0", intensity: 1.6 },
    ambient: { skyColor: "#dfe9ff", groundColor: "#c9bfb4", intensity: 1.1 },
    // A couple of centimetres against a character 1.8 tall, over six and a
    // half seconds. Read as breathing rather than as motion; the validator
    // holds the resulting speed well below what the ground resolve absorbs.
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
