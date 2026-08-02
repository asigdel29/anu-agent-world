/**
 * The complete description of a world, as the engine sees it.
 *
 * Every fact the engine needs about a specific world lives here and nowhere
 * else. The predecessor project scattered these values across the character
 * controller, a "pure" step helper, the scene component, and the camera rig,
 * which meant re-theming was a fifteen-site search with no compiler help and
 * one stale constant could respawn the player every frame. Collecting them in
 * one shape makes a missing value a type error instead.
 *
 * Pure modules take the pieces they need as arguments rather than importing the
 * active config, so they stay testable against synthetic worlds.
 */

/** A point or direction in world space. */
export type Vec3 = readonly [x: number, y: number, z: number];

/** Chunk-unit radii, measured in Chebyshev (chessboard) distance. */
export interface ChunkRadii {
  /** Distance at which a chunk mounts. */
  readonly loadRadius: number;
  /** Distance at which a mounted chunk unmounts; must exceed `loadRadius`. */
  readonly unloadRadius: number;
  /** Distance within which a chunk contributes collision geometry. */
  readonly colliderRadius: number;
  /** Distance at which a chunk's file is warmed in the loader cache. */
  readonly prefetchRadius: number;
}

export interface WorldUnits {
  /** World units per square chunk cell. Matches the export grid. */
  readonly chunkSize: number;
  /** World units per metre, for authoring sanity rather than physics. */
  readonly unitsPerMetre: number;
}

export interface SpawnPoint {
  readonly position: Vec3;
  /** Facing at spawn, in radians. */
  readonly yaw: number;
}

/** The walkable rectangle, in world units. */
export interface WorldBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

export interface VerticalExtents {
  /** Lowest walkable surface in the world. */
  readonly groundMinY: number;
  /** Highest walkable surface in the world. */
  readonly groundMaxY: number;
  /**
   * Falling below this height returns the player to spawn. It must sit clearly
   * beneath `groundMinY`: a value left over from a differently-scaled world is
   * the classic way to respawn the player on every single frame.
   */
  readonly voidY: number;
  /** Hard ceiling for the camera and for flying actors. */
  readonly ceilingY: number;
}

export interface LocomotionConfig {
  readonly walkSpeed: number;
  readonly runSpeed: number;
  /** Ground acceleration, world units per second squared. */
  readonly accel: number;
  /** Ground deceleration applied when there is no input. */
  readonly friction: number;
  /** Share of `accel` available while airborne, 0..1. */
  readonly airControl: number;
  /** How quickly the body turns toward its travel direction. */
  readonly turnRate: number;

  readonly gravity: number;
  readonly jumpSpeed: number;
  /** Grace period after leaving ground during which a jump still fires. */
  readonly coyoteSec: number;
  /** How long a jump pressed before landing stays queued. */
  readonly jumpBufferSec: number;

  readonly playerRadius: number;
  readonly playerHeight: number;
  readonly eyeHeight: number;

  /**
   * Tallest rise the player may climb in one step. This is a contract with the
   * world's geometry, not a taste setting: the asset pipeline measures the
   * steepest stair riser it exports and fails the build if it exceeds this.
   */
  readonly maxStepHeight: number;
  /** Greatest drop followed on foot rather than by going airborne. */
  readonly maxStepDown: number;
  /** How far below the pre-step height a found surface may sit. */
  readonly stepDownTolerance: number;

  /** How far above the body the ground ray starts. */
  readonly groundRayAbove: number;
  /** How far the ground ray reaches. */
  readonly groundRayFar: number;

  /**
   * Heights at which forward rays test for walls, relative to the feet. A
   * single mid-body ray clips low kerbs and vaults railing tops; several
   * heights resolve against the nearest hit.
   */
  readonly wallCastHeights: readonly number[];
  /**
   * Surfaces whose normal has a larger vertical component than this count as
   * ground rather than wall.
   */
  readonly wallSlopeLimit: number;

  readonly footstepIntervalWalk: number;
  readonly footstepIntervalRun: number;
}

export interface CameraConfig {
  readonly fov: number;
  readonly near: number;
  readonly far: number;
  /** Height above the player's origin that the camera aims at. */
  readonly lookHeight: number;

  readonly distance: {
    readonly min: number;
    readonly max: number;
    readonly default: number;
  };
  readonly pitch: { readonly min: number; readonly max: number };
  readonly sensitivity: {
    readonly mouse: number;
    readonly touch: number;
    readonly zoom: number;
  };
  /** Behaviour when geometry comes between the camera and its subject. */
  readonly occlusion: {
    /** Closest the camera may be pulled in. */
    readonly nearMin: number;
    /** Gap left between the camera and the occluding surface. */
    readonly skin: number;
    /** Seconds taken to ease back out once the view clears. */
    readonly pushOutSec: number;
  };
  readonly spring: { readonly stiffness: number; readonly dampingRatio: number };
  /** Lead the camera takes from the player's velocity. */
  readonly lookAhead: { readonly scale: number; readonly maxDistance: number };
  /** Seconds taken to cross-fade between camera modes. */
  readonly blendSec: number;
}

export interface AtmosphereConfig {
  /** Distance fog, or null for a flat void with no horizon. */
  readonly fog: {
    readonly color: string;
    readonly near: number;
    readonly far: number;
  } | null;
  readonly background:
    | { readonly kind: "color"; readonly color: string }
    | { readonly kind: "cubemap"; readonly files: readonly string[] };
  /**
   * The key light. Its direction and colour must match the sun used to bake the
   * world, so that dynamically-lit objects sit in the same light as the baked
   * geometry instead of reading as stickers laid on top of it.
   */
  readonly sun: {
    readonly direction: Vec3;
    readonly color: string;
    readonly intensity: number;
  };
  readonly ambient: {
    readonly skyColor: string;
    readonly groundColor: string;
    readonly intensity: number;
  };
  /**
   * How much an island drifts, or null for a world that holds still.
   *
   * Small enough to read as breathing rather than as motion. That is the
   * whole effect: an island that visibly moves is a platforming hazard, and
   * one that is perfectly still looks printed rather than suspended.
   */
  readonly drift: {
    /** Vertical amplitude, in world units. */
    readonly rise: number;
    /** Lateral amplitude, in world units. */
    readonly sway: number;
    /** Roll amplitude, in radians. */
    readonly roll: number;
    /** Seconds for one full cycle. */
    readonly periodSec: number;
  } | null;
}

export interface InteractionConfig {
  /** Range within which walking up to something offers an interaction. */
  readonly proximityRange: number;
  /** Range within which clicking something interacts with it. */
  readonly pointerMaxRange: number;
}

export interface StreamingConfig {
  readonly radii: ChunkRadii;
  /** Tighter radii for touch devices, where fill rate is the ceiling. */
  readonly mobileRadii: ChunkRadii;
  /** Seconds between chunk-selection passes. */
  readonly selectIntervalSec: number;
}

export interface PlacementsConfig {
  /** Spatial hash cell size; a divisor of `chunkSize` keeps lookups aligned. */
  readonly cellSize: number;
  /** Ceiling on simultaneously live placements across the world. */
  readonly maxLive: number;
  /** Ceiling on live placements of any single catalog kind. */
  readonly maxPerKind: number;
  /** Seconds between rebuilds of the instanced draw batches. */
  readonly commitIntervalSec: number;
}

export interface WorldConfig {
  /** Stable identifier; namespaces this world's persisted state. */
  readonly id: string;
  /**
   * Layout revision. Bumping it re-epochs saved player state, so returning
   * visitors never resume inside geometry that has since moved.
   */
  readonly version: number;

  readonly units: WorldUnits;
  readonly spawn: SpawnPoint;
  readonly bounds: WorldBounds;
  readonly vertical: VerticalExtents;
  readonly locomotion: LocomotionConfig;
  readonly camera: CameraConfig;
  readonly atmosphere: AtmosphereConfig;
  readonly interaction: InteractionConfig;
  readonly streaming: StreamingConfig;
  readonly placements: PlacementsConfig;
}
