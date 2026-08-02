import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group } from "three";

import type { DriftShape } from "./islandFloat";
import { createDrift, driftPhase, islandDrift } from "./islandFloat";

/**
 * An island, breathing.
 *
 * Everything belonging to the island goes inside — its geometry *and* its
 * collision proxies. That is the whole point: the surface query raycasts
 * against real objects using their world matrices, so colliders carried by
 * this group move with the visible surface and the character rides the
 * island rather than watching the ground drift away beneath them.
 *
 * The transform is written straight to the group each frame rather than
 * routed through state. Sixty renders a second to move something by a
 * centimetre would be an absurd price for an effect nobody consciously
 * notices.
 */

interface Props {
  /** Names the island, which fixes its phase. */
  readonly name: string;
  /** How it moves, or null to hold still. */
  readonly shape: DriftShape | null;
  readonly children: React.ReactNode;
}

export default function Drifting({ name, shape, children }: Props) {
  const group = useRef<Group>(null);
  const drift = useRef(createDrift());
  const phase = useRef(driftPhase(name));

  useFrame((state) => {
    const node = group.current;
    if (!node || !shape) return;
    const value = islandDrift(state.clock.elapsedTime, phase.current, shape, drift.current);
    node.position.set(value.x, value.y, 0);
    node.rotation.z = value.roll;
  });

  return <group ref={group}>{children}</group>;
}
