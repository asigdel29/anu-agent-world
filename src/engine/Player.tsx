import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type { Group } from "three";

import type { ColliderRegistry } from "./collision/colliderRegistry";
import { createSurfaceQuery } from "./collision/surfaceQuery";
import type { CameraContext } from "./camera/cameraDirector";
import { createCameraDirector, createCameraPose } from "./camera/cameraDirector";
import { createFollowMode } from "./camera/modes/follow";
import { debugStats, isDebugEnabled } from "./debug/debugStats";
import { consumeJump, inputState, resolveMoveDirection } from "./input/inputState";
import { orbitState } from "./input/usePointerOrbit";
import type { MoveIntent, MoveLimits } from "./locomotion/moveController";
import { createMoveState, stepLocomotion } from "./locomotion/moveController";
import { world } from "./config/worldConfig";

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

/** Longest frame the simulation will integrate in one go. */
const MAX_STEP_SEC = 1 / 20;

/** Read once: an overlay that appears mid-session is a distraction. */
const DEBUG = isDebugEnabled();

/** Per-instance values the frame loop mutates rather than reallocates. */
interface Scratch {
  state: ReturnType<typeof createMoveState>;
  intent: MoveIntent;
  direction: { x: number; z: number };
  ctx: CameraContext;
  pose: ReturnType<typeof createCameraPose>;
}

interface Props {
  colliderRegistry: ColliderRegistry;
}

export default function Player({ colliderRegistry }: Props) {
  const cfg = useMemo(() => world(), []);
  const camera = useThree((state) => state.camera);
  const group = useRef<Group>(null);

  const query = useMemo(() => createSurfaceQuery(colliderRegistry), [colliderRegistry]);
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
  };

  useFrame((_, rawDelta) => {
    const working = scratch.current;
    if (!working) return;
    const { state, intent, direction, ctx, pose } = working;

    // A long frame — a tab restored from the background, a slow asset decode —
    // must not be integrated whole, or the character teleports through walls
    // in a single step.
    const dt = Math.min(rawDelta, MAX_STEP_SEC);
    if (director.activeId() === null) director.push(createFollowMode(), ctx);

    // 1. Resolve input against where the camera is looking, so "forward" means
    //    away from the viewer rather than along a fixed world axis.
    resolveMoveDirection(inputState, orbitState.yaw, direction);
    intent.moveX = direction.x;
    intent.moveZ = direction.z;
    intent.run = inputState.run;
    intent.jumpPressed = consumeJump(inputState);

    // 2. Advance the character.
    stepLocomotion(state, intent, cfg.locomotion, limits, query, dt);

    // 3. Write the transform.
    if (group.current) {
      group.current.position.set(state.x, state.y, state.z);
      group.current.rotation.y = state.yaw;
    }

    // 4. Publish what the camera needs, then let the director place it. Last,
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
        <meshLambertMaterial color="#ff4f38" />
      </mesh>
      {/* A nose, so facing is readable while there is no model. */}
      <mesh position={[0, height * 0.7, radius + 0.1]}>
        <boxGeometry args={[0.12, 0.12, 0.3]} />
        <meshLambertMaterial color="#1a1a1a" />
      </mesh>
    </group>
  );
}
