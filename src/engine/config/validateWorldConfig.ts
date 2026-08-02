import type { ChunkRadii, Vec3, WorldConfig } from "./types";

/**
 * Cross-field invariants a world must satisfy.
 *
 * These are the rules that a single scattered constant used to break silently.
 * The costliest example: a respawn floor left at a value suited to a world that
 * sat high above the origin will, in a world built at ground level, place the
 * entire map below the floor and return the player to spawn on every frame.
 * That reads as an unplayable stutter with no error anywhere. Checking it at
 * boot turns a baffling runtime symptom into one line of text.
 *
 * Returns a list of human-readable problems; empty means the world is coherent.
 */

/** Clearance required between the respawn floor and the lowest ground. */
const VOID_CLEARANCE = 5;

/** A step taller than this share of body height is a wall, not a stair. */
const MAX_STEP_SHARE_OF_HEIGHT = 0.5;

/** Fog must hide the streaming edge by this multiple of the load radius. */
const FOG_COVER_FACTOR = 1.5;

function isFinitePositive(n: number): boolean {
  return Number.isFinite(n) && n > 0;
}

function checkVec3(name: string, v: Vec3, out: string[]): void {
  for (let i = 0; i < 3; i += 1) {
    const component = v[i];
    if (component === undefined || !Number.isFinite(component)) {
      out.push(`${name}[${i}] must be a finite number`);
    }
  }
}

function checkRadii(name: string, r: ChunkRadii, out: string[]): void {
  if (r.unloadRadius <= r.loadRadius) {
    out.push(
      `${name}.unloadRadius (${r.unloadRadius}) must exceed loadRadius (${r.loadRadius}); ` +
        `without that gap, pacing a cell boundary thrashes chunks in and out`,
    );
  }
  if (r.colliderRadius > r.loadRadius) {
    out.push(
      `${name}.colliderRadius (${r.colliderRadius}) must not exceed loadRadius (${r.loadRadius}); ` +
        `collision cannot be registered for a chunk that is not mounted`,
    );
  }
  if (r.prefetchRadius < r.loadRadius) {
    out.push(
      `${name}.prefetchRadius (${r.prefetchRadius}) must be at least loadRadius (${r.loadRadius})`,
    );
  }
}

export function validateWorldConfig(cfg: WorldConfig): string[] {
  const out: string[] = [];

  if (cfg.id.trim() === "") out.push("id must not be empty");
  if (!Number.isInteger(cfg.version) || cfg.version < 1) {
    out.push("version must be a positive integer");
  }

  const { units, spawn, bounds, vertical, locomotion, camera, streaming, placements } = cfg;

  if (!isFinitePositive(units.chunkSize)) {
    out.push("units.chunkSize must be a positive number");
  }

  // ---- extents -----------------------------------------------------------
  if (bounds.maxX <= bounds.minX) out.push("bounds.maxX must exceed bounds.minX");
  if (bounds.maxZ <= bounds.minZ) out.push("bounds.maxZ must exceed bounds.minZ");

  if (vertical.groundMaxY <= vertical.groundMinY) {
    out.push("vertical.groundMaxY must exceed vertical.groundMinY");
  }
  if (vertical.ceilingY <= vertical.groundMaxY) {
    out.push("vertical.ceilingY must sit above vertical.groundMaxY");
  }
  if (vertical.voidY >= vertical.groundMinY - VOID_CLEARANCE) {
    out.push(
      `vertical.voidY (${vertical.voidY}) must sit at least ${VOID_CLEARANCE} below ` +
        `groundMinY (${vertical.groundMinY}); otherwise walkable ground is under the ` +
        `respawn floor and the player is returned to spawn every frame`,
    );
  }

  // ---- spawn -------------------------------------------------------------
  checkVec3("spawn.position", spawn.position, out);
  const [sx, sy, sz] = spawn.position;
  if (sx < bounds.minX || sx > bounds.maxX || sz < bounds.minZ || sz > bounds.maxZ) {
    out.push(
      `spawn.position (${sx}, ${sz}) lies outside bounds ` +
        `x[${bounds.minX}, ${bounds.maxX}] z[${bounds.minZ}, ${bounds.maxZ}]`,
    );
  }
  if (sy <= vertical.voidY) {
    out.push(
      `spawn.position.y (${sy}) is at or below vertical.voidY (${vertical.voidY}); ` +
        `the player would respawn immediately on spawning`,
    );
  }
  if (!Number.isFinite(spawn.yaw)) out.push("spawn.yaw must be a finite number");

  // ---- locomotion --------------------------------------------------------
  const maxClimbable = locomotion.playerHeight * MAX_STEP_SHARE_OF_HEIGHT;
  if (locomotion.maxStepHeight >= maxClimbable) {
    out.push(
      `locomotion.maxStepHeight (${locomotion.maxStepHeight}) must be below half the ` +
        `player height (${maxClimbable}); a taller rise is a wall, not a stair`,
    );
  }
  if (locomotion.maxStepDown > locomotion.groundRayFar) {
    out.push(
      `locomotion.maxStepDown (${locomotion.maxStepDown}) exceeds groundRayFar ` +
        `(${locomotion.groundRayFar}); the ray cannot reach the surface it must follow`,
    );
  }
  if (locomotion.groundRayAbove <= locomotion.maxStepHeight) {
    out.push(
      `locomotion.groundRayAbove (${locomotion.groundRayAbove}) must exceed maxStepHeight ` +
        `(${locomotion.maxStepHeight}); the ray must start above the step it tests`,
    );
  }
  if (locomotion.runSpeed < locomotion.walkSpeed) {
    out.push("locomotion.runSpeed must be at least walkSpeed");
  }
  if (locomotion.gravity >= 0) {
    out.push("locomotion.gravity must be negative");
  }
  if (locomotion.airControl < 0 || locomotion.airControl > 1) {
    out.push("locomotion.airControl must lie in [0, 1]");
  }
  if (locomotion.wallSlopeLimit <= 0 || locomotion.wallSlopeLimit >= 1) {
    out.push("locomotion.wallSlopeLimit must lie in (0, 1)");
  }
  if (locomotion.wallCastHeights.length === 0) {
    out.push("locomotion.wallCastHeights must list at least one height");
  }
  for (const h of locomotion.wallCastHeights) {
    if (h < 0 || h > locomotion.playerHeight) {
      out.push(
        `locomotion.wallCastHeights entry ${h} lies outside the body ` +
          `(0..${locomotion.playerHeight})`,
      );
    }
  }
  if (!isFinitePositive(locomotion.playerRadius)) {
    out.push("locomotion.playerRadius must be a positive number");
  }

  // ---- camera ------------------------------------------------------------
  const d = camera.distance;
  if (d.min > d.default || d.default > d.max) {
    out.push(
      `camera.distance.default (${d.default}) must lie between min (${d.min}) and max (${d.max})`,
    );
  }
  if (camera.pitch.min >= camera.pitch.max) {
    out.push("camera.pitch.min must be below camera.pitch.max");
  }
  if (camera.occlusion.nearMin >= d.min) {
    out.push(
      `camera.occlusion.nearMin (${camera.occlusion.nearMin}) must be below ` +
        `camera.distance.min (${d.min})`,
    );
  }
  if (camera.near >= camera.far) out.push("camera.near must be below camera.far");
  if (d.max > camera.far) {
    out.push(
      `camera.distance.max (${d.max}) exceeds the far plane (${camera.far})`,
    );
  }

  // ---- atmosphere --------------------------------------------------------
  const fog = cfg.atmosphere.fog;
  if (fog !== null) {
    if (fog.far <= fog.near) out.push("atmosphere.fog.far must exceed fog.near");
    if (d.max >= fog.far) {
      out.push(
        `camera.distance.max (${d.max}) reaches into fully-fogged space ` +
          `(fog.far ${fog.far}); the subject would be invisible when zoomed out`,
      );
    }
    const streamingEdge = streaming.radii.loadRadius * units.chunkSize;
    if (fog.far < streamingEdge * FOG_COVER_FACTOR) {
      out.push(
        `atmosphere.fog.far (${fog.far}) is too near to hide the streaming edge ` +
          `(${streamingEdge} units); chunks would visibly pop into clear air`,
      );
    }
  }
  checkVec3("atmosphere.sun.direction", cfg.atmosphere.sun.direction, out);

  // ---- streaming and placements -----------------------------------------
  checkRadii("streaming.radii", streaming.radii, out);
  checkRadii("streaming.mobileRadii", streaming.mobileRadii, out);
  if (!isFinitePositive(streaming.selectIntervalSec)) {
    out.push("streaming.selectIntervalSec must be a positive number");
  }

  if (!isFinitePositive(placements.cellSize)) {
    out.push("placements.cellSize must be a positive number");
  } else if (units.chunkSize % placements.cellSize !== 0) {
    out.push(
      `placements.cellSize (${placements.cellSize}) must divide units.chunkSize ` +
        `(${units.chunkSize}) so hash cells align with chunk boundaries`,
    );
  }
  if (placements.maxPerKind > placements.maxLive) {
    out.push("placements.maxPerKind must not exceed placements.maxLive");
  }

  return out;
}
