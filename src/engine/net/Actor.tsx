import { useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group, Mesh } from "three";

import { isAgentId } from "../../../protocol/ids";
import { isSpeaking } from "./actorRegistry";
import { LERP_SPEED, dampFraction, stepAngle } from "./remoteInterp";
import { actors } from "./useRealtime";
import AvatarBody from "../avatar/AvatarBody";

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

/**
 * Agents are marked, so a visitor can tell who is not a person.
 *
 * By value rather than by hue, like everything else here: an agent is the
 * darkest thing in the world, which survives both the monochrome palette and
 * being seen at a distance through fog. A visitor's value is theirs to
 * choose; an agent's is not, which is the point of overriding it.
 */
const AGENT_COLOUR = "#000000";

interface Props {
  readonly id: string;
  readonly height: number;
  readonly radius: number;
}

export default function Actor({ id, height, radius }: Props) {
  const group = useRef<Group>(null);
  const bubble = useRef<Mesh>(null);
  // Whether this is an agent is derived from the identifier rather than from
  // a frame, because it is fixed for the life of the body: the relay reserves
  // the agent prefix, so an id that names an agent always will.
  const agent = isAgentId(id);
  // The appearance arrives on every transform frame but changes about never,
  // so it is compared before it is committed. Without the comparison a body
  // would re-render ten times a second to say what it already said.
  const [code, setCode] = useState("");

  useFrame((_, dt) => {
    const actor = actors.actors.get(id);
    const node = group.current;
    if (!actor || !node) return;
    if (actor.character !== code) setCode(actor.character);

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
      {/* An agent is drawn from the same component as a visitor, overridden to
          one flat value. Marking it by value rather than by hue is what makes
          it still legible at fog distance in a world with no colour. */}
      <AvatarBody
        code={code}
        height={height}
        radius={radius}
        {...(agent ? { ink: AGENT_COLOUR } : {})}
      />
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
