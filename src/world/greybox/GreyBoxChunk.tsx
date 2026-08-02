import type { ChunkSpec } from "../../engine/streaming/chunkGrid";
import { greyboxConfig as CFG } from "./config";

/**
 * The contents of one grey-box cell.
 *
 * Features are anchored by world position and drawn by whichever cell contains
 * them, so the layout is described once in world coordinates rather than
 * restated per chunk. Ledge heights come from the world configuration, so the
 * geometry and the movement rules that read it cannot drift apart.
 */
const SIZE = CFG.units.chunkSize;
const STEP = CFG.locomotion.maxStepHeight;

/** Ledge heights either side of the step ceiling: three climb, one refuses. */
const LEDGES = [STEP - 0.35, STEP - 0.15, STEP - 0.05, STEP + 0.05];

/** A gap wider than a walk and inside a running jump. */
const TRENCH_NEAR = 20;
const TRENCH_FAR = 24;

const PALETTE = {
  ground: "#cab1ad",
  groundAlt: "#c4b1a1",
  ledge: "#a1bf79",
  ledgeRefused: "#e08a7a",
  ramp: "#98837f",
  wall: "#7d7b79",
  platform: "#87ccfd",
};

interface Anchor {
  x: number;
  z: number;
}

function contains(spec: ChunkSpec, point: Anchor): boolean {
  const x0 = spec.cx * SIZE;
  const z0 = spec.cz * SIZE;
  return point.x >= x0 && point.x < x0 + SIZE && point.z >= z0 && point.z < z0 + SIZE;
}

function Box({
  position,
  size,
  color,
  rotation,
}: {
  position: [number, number, number];
  size: [number, number, number];
  color: string;
  rotation?: [number, number, number] | undefined;
}) {
  return (
    <mesh position={position} rotation={rotation ?? [0, 0, 0]}>
      <boxGeometry args={size} />
      <meshLambertMaterial color={color} />
    </mesh>
  );
}

/** Ground for a cell, cut where the trench crosses it. */
function Ground({ spec }: { spec: ChunkSpec }) {
  const x0 = spec.cx * SIZE;
  const z0 = spec.cz * SIZE;
  const z1 = z0 + SIZE;
  const centreX = x0 + SIZE / 2;
  const shade = (spec.cx + spec.cz) % 2 === 0 ? PALETTE.ground : PALETTE.groundAlt;

  const crossesTrench = z0 < TRENCH_FAR && z1 > TRENCH_NEAR;
  if (!crossesTrench) {
    return (
      <Box
        position={[centreX, -0.5, z0 + SIZE / 2]}
        size={[SIZE, 1, SIZE]}
        color={shade}
      />
    );
  }

  // Two slabs with the trench between them.
  const nearDepth = Math.max(0, TRENCH_NEAR - z0);
  const farDepth = Math.max(0, z1 - TRENCH_FAR);
  return (
    <>
      {nearDepth > 0 && (
        <Box
          position={[centreX, -0.5, z0 + nearDepth / 2]}
          size={[SIZE, 1, nearDepth]}
          color={shade}
        />
      )}
      {farDepth > 0 && (
        <Box
          position={[centreX, -0.5, TRENCH_FAR + farDepth / 2]}
          size={[SIZE, 1, farDepth]}
          color={shade}
        />
      )}
    </>
  );
}

export default function GreyBoxChunk({ spec }: { spec: ChunkSpec }) {
  return (
    <>
      <Ground spec={spec} />

      {LEDGES.map((height, index) => {
        const anchor = { x: -30 + index * 8, z: 6 };
        if (!contains(spec, anchor)) return null;
        return (
          <Box
            key={`ledge-${String(index)}`}
            position={[anchor.x, height / 2, anchor.z]}
            size={[6, height, 6]}
            color={height <= STEP ? PALETTE.ledge : PALETTE.ledgeRefused}
          />
        );
      })}

      {[15, 30, 45].map((degrees, index) => {
        const anchor = { x: 12 + index * 10, z: 8 };
        if (!contains(spec, anchor)) return null;
        return (
          <Box
            key={`ramp-${String(degrees)}`}
            position={[anchor.x, 1, anchor.z]}
            size={[6, 0.5, 12]}
            rotation={[(degrees * Math.PI) / 180, 0, 0]}
            color={PALETTE.ramp}
          />
        );
      })}

      {[
        { x: -60, z: 0, size: [1, 3, 16] as [number, number, number] },
        { x: -52, z: 8, size: [16, 3, 1] as [number, number, number] },
        { x: -44, z: 0, size: [1, 3, 16] as [number, number, number] },
        { x: -52, z: -8, size: [16, 3, 1] as [number, number, number] },
      ].map((wall, index) => {
        if (!contains(spec, wall)) return null;
        return (
          <Box
            key={`wall-${String(index)}`}
            position={[wall.x, 1.5, wall.z]}
            size={wall.size}
            color={PALETTE.wall}
          />
        );
      })}

      {contains(spec, { x: 0, z: 34 }) && (
        <Box position={[0, 2, 34]} size={[10, 0.5, 10]} color={PALETTE.platform} />
      )}
    </>
  );
}
