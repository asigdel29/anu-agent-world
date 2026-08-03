import { BackSide } from "three";
import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type { Group } from "three";

import type { ColliderRegistry } from "./collision/colliderRegistry";
import { composeSurfaceQuery } from "./collision/placementCollision";
import { createSurfaceQuery } from "./collision/surfaceQuery";
import type { CameraContext } from "./camera/cameraDirector";
import { createCameraDirector, createCameraPose } from "./camera/cameraDirector";
import { createFollowMode } from "./camera/modes/follow";
import {
  DEFAULT_ORBIT,
  createOrbitIslandMode,
  orbitDistanceFor,
  wantsToDescend,
} from "./camera/modes/orbitIsland";
import { debugStats, isDebugEnabled } from "./debug/debugStats";
import { consumeInteract, consumeJump, inputState, resolveMoveDirection } from "./input/inputState";
import { chooseTarget, targets, useInteractionStore } from "./interaction/interactionStore";
import { orbitState } from "./input/usePointerOrbit";
import type { MoveIntent, MoveLimits } from "./locomotion/moveController";
import { MAX_STEP_SEC, createMoveState, stepLocomotion } from "./locomotion/moveController";
import { realtime } from "./net/useRealtime";
import { record } from "../analytics/analytics";
import type { PlacementSnapshot, PlacementStore } from "./placements/placementStore";
import { subjectPosition } from "./streaming/chunkStore";
import { world } from "./config/worldConfig";
import { toonRamp } from "./assets/toonRamp";
import { NEVER_RAYCAST, capsuleHullScale } from "./assets/outline";

/**
 * The character, and the one ordered pass over everything that moves.
 *
 * Order is the whole point of this component. Each concern owns exactly one
 * step, and the camera is placed last, after the character's position has
 * settled — otherwise the camera frames where the character was a frame ago,
 * which reads as the world lagging behind the controls.
 *
 * The predecessor project did all of this in one three-hundred-line callback
 * that also owned raycasting, camera maths, interaction scanning, footsteps,
 * and a branch for a second camera owner. Everything here delegates.
 */

/**
 * The stand-in body, until an avatar is chosen.
 *
 * Dark on a light world rather than coloured. A figure is the one thing on
 * screen that must never be mistaken for terrain, and in a world with no hue
 * the only way to say that is with value: everything else here is light, so
 * the person is dark.
 */
const AVATAR_INK = "#1c1c1c";
const AVATAR_EDGE = "#ffffff";

/** How often the world is searched for something within reach. */
const SCAN_INTERVAL_SEC = 0.15;

/** Read once: an overlay that appears mid-session is a distraction. */
const DEBUG = isDebugEnabled();

/** Per-instance values the frame loop mutates rather than reallocates. */
interface Scratch {
  state: ReturnType<typeof createMoveState>;
  intent: MoveIntent;
  direction: { x: number; z: number };
  ctx: CameraContext;
  pose: ReturnType<typeof createCameraPose>;
  /** Reused so broadcasting does not allocate ten objects a second. */
  wire: { pos: [number, number, number]; yaw: number; action: string; character: string };
  /** Which target is in reach, and when it was last looked for. */
  activeTargetId: string | null;
  nextScanAt: number;
  /** Whether the visitor has come down into the world yet. */
  descended: boolean;
}

interface Props {
  colliderRegistry: ColliderRegistry;
  placements: PlacementStore;
  /** Told when the built world changed, so the renderer can pick it up. */
  onWorldChanged: (snapshot: PlacementSnapshot) => void;
}

export default function Player({ colliderRegistry, placements, onWorldChanged }: Props) {
  const cfg = useMemo(() => world(), []);
  const camera = useThree((state) => state.camera);
  const group = useRef<Group>(null);

  // Terrain and placements answer as one oracle, so movement never learns
  // that placements exist. The hash is read through a callback rather than
  // captured, so this survives every commit.
  const query = useMemo(
    () =>
      composeSurfaceQuery(createSurfaceQuery(colliderRegistry), () =>
        placements.snapshot().hash,
      ),
    [colliderRegistry, placements],
  );
  const director = useMemo(() => createCameraDirector(), []);

  const limits = useMemo<MoveLimits>(
    () => ({
      bounds: cfg.bounds,
      voidY: cfg.vertical.voidY,
      spawnX: cfg.spawn.position[0],
      spawnY: cfg.spawn.position[1],
      spawnZ: cfg.spawn.position[2],
    }),
    [cfg],
  );

  // Per-frame working values live behind a ref rather than a memo. They are
  // mutated every frame on purpose — reallocating them sixty times a second is
  // how a frame-time graph acquires a sawtooth — and a ref is the container
  // React sanctions for mutable instance state.
  const scratch = useRef<Scratch | null>(null);
  scratch.current ??= {
    state: createMoveState(
      cfg.spawn.position[0],
      cfg.spawn.position[1],
      cfg.spawn.position[2],
      cfg.spawn.yaw,
    ),
    intent: { moveX: 0, moveZ: 0, run: false, jumpPressed: false },
    direction: { x: 0, z: 0 },
    ctx: {
      subjectX: 0,
      subjectY: 0,
      subjectZ: 0,
      subjectYaw: 0,
      velocityX: 0,
      velocityZ: 0,
      orbitYaw: 0,
      orbitPitch: 0,
      orbitDistance: 0,
      cfg: cfg.camera,
      query,
    },
    pose: createCameraPose(),
    wire: { pos: [0, 0, 0], yaw: 0, action: "idle", character: "default" },
    activeTargetId: null,
    nextScanAt: 0,
    descended: false,
  };

  useFrame((_, rawDelta) => {
    const working = scratch.current;
    if (!working) return;
    const { state, intent, direction, ctx, pose, wire } = working;

    // A long frame — a tab restored from the background, a slow asset decode —
    // must not be integrated whole, or the character teleports through walls
    // in a single step.
    const dt = Math.min(rawDelta, MAX_STEP_SEC);

    // A visitor arrives looking at the island rather than standing on it. A
    // third-person camera answers "where am I standing"; it cannot answer
    // "what is this", and someone dropped straight into one sees a patch of
    // ground and their own back.
    if (director.activeId() === null && cfg.camera.opening === "follow") {
      // A world with no outside is entered rather than surveyed. Marked as
      // descended so the movement gate below does not hold the character
      // still waiting for an arrival that already happened.
      working.descended = true;
      director.push(createFollowMode(), ctx);
    } else if (director.activeId() === null) {
      director.push(
        createOrbitIslandMode({
          ...DEFAULT_ORBIT,
          // Sized to the world rather than fixed, so a larger island is seen
          // whole and a smaller one is not a speck.
          distance: orbitDistanceFor(
            Math.max(
              cfg.bounds.maxX - cfg.bounds.minX,
              cfg.bounds.maxZ - cfg.bounds.minZ,
            ),
            cfg.camera.fov,
          ),
          centreX: (cfg.bounds.minX + cfg.bounds.maxX) / 2,
          // The height people stand at, not the lowest geometry. On a world
          // measured by the pipeline those are far apart: an island's
          // `groundMinY` is the bottom of its keel, several units below the
          // surface, and framing that aims the camera underneath the island
          // and shows its top edge-on.
          centreY: cfg.spawn.position[1],
          centreZ: (cfg.bounds.minZ + cfg.bounds.maxZ) / 2,
        }),
        ctx,
      );
    }

    // 0. Apply anything that arrived since the last frame, before a single ray
    //    is cast. Everything below reads one unchanging world.
    if (placements.commitPending(Date.now())) onWorldChanged(placements.snapshot());

    // 1. Resolve input against where the camera is looking, so "forward" means
    //    away from the viewer rather than along a fixed world axis.
    resolveMoveDirection(inputState, orbitState.yaw, direction);
    intent.moveX = direction.x;
    intent.moveZ = direction.z;
    intent.run = inputState.run;
    intent.jumpPressed = consumeJump(inputState);

    // 2. Come down into the world the moment the visitor asks to move. The
    //    director cross-fades, so this reads as descending rather than
    //    cutting, and it happens once.
    if (!working.descended && wantsToDescend(intent.moveX, intent.moveZ, intent.jumpPressed)) {
      working.descended = true;
      director.push(createFollowMode(), ctx);
      // The one moment in the frame loop worth reporting, and it happens
      // exactly once: the visitor decided to be in the world rather than to
      // look at it. Everything else here runs sixty times a second.
      record("world_entered");
    }

    // 3. Advance the character. Movement is held until the descent, so the
    //    character cannot wander off-screen while the island is being looked
    //    at, and the first step happens under the follow camera.
    if (working.descended) {
      stepLocomotion(state, intent, cfg.locomotion, limits, query, dt);
    }

    // 4. Write the transform, and publish the position the world streams
    //    around. Streaming reads this rather than subscribing, so a moving
    //    character does not re-render the scene sixty times a second.
    if (group.current) {
      group.current.position.set(state.x, state.y, state.z);
      group.current.rotation.y = state.yaw;
    }
    subjectPosition.x = state.x;
    subjectPosition.y = state.y;
    subjectPosition.z = state.z;

    // 5. Tell the relay where the character is. Throttled inside, so this is
    //    called every frame and sends ten times a second; and a no-op while
    //    running solo, so the loop never has to ask whether anyone is there.
    wire.pos[0] = state.x;
    wire.pos[1] = state.y;
    wire.pos[2] = state.z;
    wire.yaw = state.yaw;
    wire.action = state.grounded ? (Math.hypot(state.vx, state.vz) > 0.1 ? "walk" : "idle") : "air";
    realtime.sendState(wire, Date.now());

    // 6. Look for something to walk up to. Several times a second rather than
    //    every frame: a visitor cannot arrive at a sign between two frames,
    //    and the scan is the only part of this loop whose cost grows with how
    //    much the world contains.
    working.nextScanAt -= dt;
    if (working.nextScanAt <= 0) {
      working.nextScanAt = SCAN_INTERVAL_SEC;
      const found = chooseTarget(
        targets,
        state.x,
        state.y,
        state.z,
        cfg.interaction.proximityRange,
        working.activeTargetId,
      );
      const foundId = found?.id ?? null;
      // Only when it changes: this is the one place in the frame loop allowed
      // to touch React, and doing it every scan would re-render the overlay
      // several times a second to say the same thing.
      if (foundId !== working.activeTargetId) {
        working.activeTargetId = foundId;
        useInteractionStore.getState().offer(foundId, found?.prompt ?? "");
      }
    }

    if (consumeInteract(inputState)) {
      // Re-read rather than trusting the scan: the target may have gone in
      // the interval, and activating something that no longer exists is how
      // a modal opens onto a deleted panel.
      const target = targets.find((t) => t.id === working.activeTargetId);
      target?.activate();
    }

    // 7. Publish what the camera needs, then let the director place it. Last,
    //    so the camera frames this frame's position rather than the previous.
    ctx.subjectX = state.x;
    ctx.subjectY = state.y;
    ctx.subjectZ = state.z;
    ctx.subjectYaw = state.yaw;
    ctx.velocityX = state.vx;
    ctx.velocityZ = state.vz;
    ctx.orbitYaw = orbitState.yaw;
    ctx.orbitPitch = orbitState.pitch;
    ctx.orbitDistance = orbitState.distance;

    director.sample(pose, dt, ctx);
    camera.position.set(pose.px, pose.py, pose.pz);
    camera.lookAt(pose.tx, pose.ty, pose.tz);

    if (DEBUG) {
      debugStats.x = state.x;
      debugStats.y = state.y;
      debugStats.z = state.z;
      debugStats.speed = Math.hypot(state.vx, state.vz);
      debugStats.grounded = state.grounded;
      debugStats.cameraMode = director.activeId() ?? "-";
      debugStats.cameraBlend = director.blendWeight();
    }
  });

  const height = cfg.locomotion.playerHeight;
  const radius = cfg.locomotion.playerRadius;

  return (
    <group ref={group}>
      {/* A stand-in body. The proportions matter — they are what the collision
          constants describe — but the styling does not, yet. */}
      <mesh position={[0, height / 2, 0]}>
        <capsuleGeometry args={[radius, height - radius * 2, 4, 12]} />
        <meshToonMaterial color={AVATAR_INK} gradientMap={toonRamp()} />
      </mesh>
      {/* The line. A capsule grows uniformly rather than per axis: its radius
          already governs both dimensions, so one factor keeps the margin even. */}
      <mesh
        position={[0, height / 2, 0]}
        scale={capsuleHullScale(radius, height)}
        raycast={NEVER_RAYCAST}
      >
        <capsuleGeometry args={[radius, height - radius * 2, 4, 12]} />
        <meshBasicMaterial color={AVATAR_EDGE} side={BackSide} depthWrite={false} />
      </mesh>
      {/* A nose, so facing is readable while there is no model. */}
      <mesh position={[0, height * 0.7, radius + 0.1]}>
        <boxGeometry args={[0.12, 0.12, 0.3]} />
        {/* Flat and unlit: the facing marker belongs to the outline
            language rather than to the lit surfaces. */}
        <meshBasicMaterial color="#4e3c40" />
      </mesh>
    </group>
  );
}
