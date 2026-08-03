import type { WorldConfig } from "../../engine/config/types";
import { SEA_LEVEL, WORLD_HEIGHT, heightAt } from "./terrain";

/**
 * The voxel world's configuration.
 *
 * The bounds are the one interesting entry. A generated world has no edges —
 * the terrain function answers everywhere — so the bounds here are not a
 * description of the land but a leash on how far anybody may wander, which is
 * a different thing and worth naming as such. They exist because the streaming
 * grid, the placement validator and the respawn floor all need a finite world
 * to reason about, not because the ground stops.
 */

/** The seed the whole world is generated from. */
export const VOXEL_SEED = 0x5eed;

/** Blocks per chunk edge. */
const CHUNK = 16;

/** How many chunks from the origin a visitor may travel. */
const RADIUS_CHUNKS = 24;

const EXTENT = CHUNK * RADIUS_CHUNKS;

/** Where the character starts: on the surface at the origin, not in it. */
const SPAWN_Y = heightAt(0, 0, VOXEL_SEED) + 2;

export const voxelConfig: WorldConfig = {
  id: "voxel",
  version: 1,

  units: { chunkSize: CHUNK, unitsPerMetre: 1 },

  spawn: { position: [0.5, SPAWN_Y, 0.5], yaw: 0 },
  bounds: { minX: -EXTENT, maxX: EXTENT, minZ: -EXTENT, maxZ: EXTENT },
  vertical: {
    groundMinY: 0,
    groundMaxY: WORLD_HEIGHT,
    // Below the deepest cave and well below sea level, so falling into water
    // is swimming rather than respawning.
    voidY: -24,
    ceilingY: WORLD_HEIGHT + 64,
  },

  locomotion: {
    walkSpeed: 4.3,
    runSpeed: 7.6,
    accel: 30,
    friction: 14,
    airControl: 0.35,
    turnRate: 12,

    gravity: -24,
    jumpSpeed: 8.4,
    coyoteSec: 0.12,
    jumpBufferSec: 0.1,

    playerRadius: 0.35,
    playerHeight: 1.8,
    eyeHeight: 1.6,

    // Half a block, not a whole one. The reflex is to make the step a full
    // block because a block is the unit of everything here -- but that is not
    // how this kind of world moves. You *step* a half block, which is what a
    // slab or a stair is for, and you *jump* a whole one. Conflating them
    // gives a character who walks up walls, and the validator says so: a rise
    // taller than half the body is a wall rather than a stair.
    //
    // The jump reaches 1.47 at this gravity, so a full block is cleared with
    // room, which is the interaction that was actually wanted.
    maxStepHeight: 0.6,
    maxStepDown: 1.05,
    stepDownTolerance: 0.15,

    groundRayAbove: 2.4,
    groundRayFar: 16,

    wallCastHeights: [0.3, 1.0, 1.7],
    wallSlopeLimit: 0.5,

    footstepIntervalWalk: 0.34,
    footstepIntervalRun: 0.26,
  },

  camera: {
    fov: 60,
    near: 0.1,
    far: 2000,
    lookHeight: 1.5,
    distance: { min: 3, max: 14, default: 7 },
    pitch: { min: 0.05, max: 1.35 },
    sensitivity: { mouse: 0.005, touch: 0.013, zoom: 0.8 },
    occlusion: { nearMin: 1.6, skin: 0.3, pushOutSec: 0.35 },
    spring: { stiffness: 60, dampingRatio: 1 },
    lookAhead: { scale: 0.25, maxDistance: 2 },
    blendSec: 0.5,
    // Entered, not surveyed. This world has no outside to look at from.
    opening: "follow",
  },

  atmosphere: {
    // Fog, unlike the diorama: a generated world does have a horizon, and it
    // is where the streaming edge is. Hiding that edge is the whole job.
    // Far enough to hide the streaming edge rather than to decorate it. The
    // validator holds this against the load radius, because fog that stops
    // short of where chunks stop is worse than none: it draws attention to
    // the boundary instead of covering it.
    fog: { color: "#ffffff", near: CHUNK * 1.6, far: CHUNK * 3 },
    background: { kind: "color", color: "#ffffff" },
    // Neutral light. Any warmth or coolness here would put a hue back into a
    // world whose whole premise is that it has none, and it would show most
    // on the large flat surfaces that make up almost everything.
    // Key and fill sum to one, deliberately. A stepped ramp has a top, and
    // light that goes past it puts every face on the last step -- which in a
    // world with no colour to fall back on is a white screen. The island hit
    // this and was corrected; these numbers were written fresh and walked
    // straight back into it.
    sun: { direction: [-0.4, -1, -0.3], color: "#ffffff", intensity: 0.7 },
    ambient: { skyColor: "#ffffff", groundColor: "#bbbbbb", intensity: 0.3 },
    // The ground does not float. It is ground.
    drift: null,
  },

  interaction: { proximityRange: 3.2, pointerMaxRange: 40 },

  streaming: {
    // Three chunks out is forty-nine of them on screen. Five was a hundred
    // and twenty-one, each generating and meshing sixteen thousand blocks
    // before the first frame -- the world booted at nine frames a second and
    // showed nothing, because it was still building. A generated world pays
    // for its radius in work rather than in bandwidth, which is the opposite
    // of a streamed one and needs a different number.
    radii: { loadRadius: 3, unloadRadius: 5, colliderRadius: 2, prefetchRadius: 4 },
    mobileRadii: { loadRadius: 2, unloadRadius: 4, colliderRadius: 1, prefetchRadius: 3 },
    selectIntervalSec: 0.2,
  },

  placements: { cellSize: CHUNK, maxLive: 4000, maxPerKind: 1000, commitIntervalSec: 0.25 },
};

/** Sea level, re-exported so the world module reads from one place. */
export { SEA_LEVEL };
