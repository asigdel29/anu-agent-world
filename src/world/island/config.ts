import type { WorldConfig } from "../../engine/config/types";
import constants from "../../../public/world/constants.json";
import { islandChunkSize } from "./manifest";

/**
 * The island's configuration, built from what the pipeline measured.
 *
 * Every number describing where the world *is* comes from `constants.json`:
 * its bounds, the height of its ground, where the character starts, and what
 * step the geometry actually contains. None of them are typed here, because
 * typing them here is what let the predecessor acquire a respawn floor suited
 * to terrain that had since moved.
 *
 * What is typed here is how the world *feels* — speeds, the camera, the
 * streaming radii. Those are judgements rather than measurements, and the
 * pipeline has no opinion about them.
 *
 * The dividing line is worth stating plainly, because the next person to add
 * a number has to choose a side: if changing the art would change it, it
 * belongs in the pipeline.
 */

/** How far below the ground the respawn floor sits. */
const VOID_CLEARANCE = 12;

export const islandConfig: WorldConfig = {
  id: "island",
  version: 1,

  units: { chunkSize: islandChunkSize, unitsPerMetre: 1 },

  spawn: {
    position: constants.spawn.position as [number, number, number],
    yaw: constants.spawn.yaw,
  },
  bounds: constants.bounds,
  vertical: {
    groundMinY: constants.vertical.groundMinY,
    groundMaxY: constants.vertical.groundMaxY,
    // Derived from the measured ground rather than chosen, so an island that
    // is re-authored deeper cannot end up underneath its own kill plane.
    voidY: constants.vertical.groundMinY - VOID_CLEARANCE,
    ceilingY: constants.vertical.groundMaxY + 100,
  },

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

    // Measured, not chosen: the tallest step the geometry actually contains,
    // with a little room. The export fails if the art outgrows it.
    maxStepHeight: constants.maxStepHeight,
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
    // No fog and a flat background: a diorama floating in an empty void has
    // no horizon to hide anything behind, and fog would only reveal that
    // there is nothing out there.
    fog: null,
    background: { kind: "color", color: "#f9f7f6" },
    // Restrained on purpose. A stepped ramp saturates: key and fill that sum
    // past one push every band to the top of the ramp, and the island arrives
    // pale and washed out with its palette nowhere to be seen. The bands are
    // the art, so the lighting's job is to reach them, not to exceed them.
    sun: { direction: [-0.5, -1, -0.35], color: "#fff2e0", intensity: 0.95 },
    ambient: { skyColor: "#dfe9ff", groundColor: "#c9bfb4", intensity: 0.45 },
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
