import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group, Mesh } from "three";

import { isAgentId } from "../../../protocol/ids";
import { isSpeaking } from "./actorRegistry";
import { LERP_SPEED, dampFraction, stepAngle } from "./remoteInterp";
import { actors } from "./useRealtime";
import { toonRamp } from "../assets/toonRamp";

/**
 * One other body in the world.
 *
 * A visitor and an agent are the same thing here, differing only in colour.
 * That is not a shortcut but the finding the whole agent design rests on: if
 * the renderer cannot tell them apart, then broadcasting a transform from the
 * server is all it takes to make the world inhabited, and an agent whose mind
 * has failed is visually indistinguishable from one that is working.
 *
 * Nothing in this component subscribes to anything. It reads mutable registry
 * data each frame and writes straight to the transform, so a room of twenty
 * costs twenty transform writes rather than twenty React renders per network
 * frame.
 */

/** Agents are marked, so a visitor can tell who is not a person. */
const VISITOR_COLOUR = "#6a885d";
const AGENT_COLOUR = "#ff4f38";

interface Props {
  readonly id: string;
  readonly height: number;
  readonly radius: number;
}

export default function Actor({ id, height, radius }: Props) {
  const group = useRef<Group>(null);
  const bubble = useRef<Mesh>(null);
  // Derived from the identifier rather than from the frame, because it is
  // fixed for the life of the body: the relay reserves the agent prefix, so
  // an id that names an agent always will. Reading it from a frame would mean
  // a value that changes during a useFrame and never reaches the material.
  const colour = isAgentId(id) ? AGENT_COLOUR : VISITOR_COLOUR;

  useFrame((_, dt) => {
    const actor = actors.actors.get(id);
    const node = group.current;
    if (!actor || !node) return;

    // Frames arrive ten times a second and the screen redraws sixty, so most
    // frames carry no new information. Easing towards the last known
    // transform is the difference between walking and teleporting.
    const t = dampFraction(LERP_SPEED, dt);
    actor.x += (actor.targetX - actor.x) * t;
    actor.y += (actor.targetY - actor.y) * t;
    actor.z += (actor.targetZ - actor.z) * t;
    actor.yaw = stepAngle(actor.yaw, actor.targetYaw, t);

    node.position.set(actor.x, actor.y, actor.z);
    node.rotation.y = actor.yaw;

    // Speech is a deadline checked here rather than state checked in a
    // render, which is why it expires for a body that never moves again.
    if (bubble.current) bubble.current.visible = isSpeaking(actor, Date.now());
  });

  return (
    <group ref={group}>
      <mesh position={[0, height / 2, 0]}>
        <capsuleGeometry args={[radius, height - radius * 2, 4, 12]} />
        <meshToonMaterial color={colour} gradientMap={toonRamp()} />
      </mesh>
      {/* A nose, so facing is readable while there is no model. */}
      <mesh position={[0, height * 0.7, radius + 0.1]}>
        <boxGeometry args={[0.12, 0.12, 0.3]} />
        {/* Flat and unlit: the facing marker belongs to the outline
            language rather than to the lit surfaces. */}
        <meshBasicMaterial color="#4e3c40" />
      </mesh>
      {/* Speech is marked here and read here; the words themselves are drawn
          by the overlay, which can lay out text without shipping a font into
          the scene or fetching one from a third party. */}
      <mesh ref={bubble} position={[0, height + 0.35, 0]} visible={false}>
        <sphereGeometry args={[0.12, 8, 6]} />
        <meshBasicMaterial color="#f9f7f6" />
      </mesh>
    </group>
  );
}
