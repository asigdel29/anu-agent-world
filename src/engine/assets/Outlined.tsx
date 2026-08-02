import { BackSide } from "three";

import { OUTLINE_INK, hullScale } from "./outline";
import { toonRamp } from "./toonRamp";

/**
 * A box drawn in flat steps with a warm line around it.
 *
 * The line is a second copy of the box, slightly larger, with its faces
 * reversed so it survives only where the box itself does not cover it. It is
 * unlit on purpose — an outline that responded to the sun would stop reading
 * as a drawn line and start reading as a rim light, which this look
 * explicitly does not have.
 */

interface Props {
  readonly position: [number, number, number];
  readonly size: [number, number, number];
  readonly color: string;
  readonly rotation?: [number, number, number] | undefined;
}

export default function OutlinedBox({ position, size, color, rotation }: Props) {
  return (
    <group position={position} rotation={rotation ?? [0, 0, 0]}>
      <mesh>
        <boxGeometry args={size} />
        <meshToonMaterial color={color} gradientMap={toonRamp()} />
      </mesh>
      <mesh scale={hullScale(size)}>
        <boxGeometry args={size} />
        {/* Depth writing off: the hull is behind its own object everywhere it
            matters, and writing depth would let one object's line punch a
            hole in the object standing behind it. */}
        <meshBasicMaterial color={OUTLINE_INK} side={BackSide} depthWrite={false} />
      </mesh>
    </group>
  );
}
