import { useCallback } from "react";
import type { Object3D } from "three";

import type { ColliderLayer, ColliderRegistry } from "../../engine/collision/colliderRegistry";
import { greyboxConfig as CFG } from "./config";

/**
 * Geometry with known dimensions, built so that every movement threshold has
 * something to fail against.
 *
 * The step ceiling is bracketed rather than merely exercised: four ledges rise
 * by 0.3, 0.5, 0.6, and 0.7 against a limit of 0.65, so three must climb and
 * the fourth must refuse. A change that quietly loosens the rule shows up as
 * the tall ledge becoming climbable, which is obvious, instead of as a vague
 * sense that movement feels different, which is not.
 */

const STEP = CFG.locomotion.maxStepHeight;

/** Ledge heights either side of the step ceiling. */
const LEDGES = [STEP - 0.35, STEP - 0.15, STEP - 0.05, STEP + 0.05];

/** Ramp angles, in degrees. The steepest sits beyond the walkable slope. */
const RAMPS = [15, 30, 45];

/** The trench is wider than a walk but inside a running jump. */
const TRENCH_NEAR = 20;
const TRENCH_FAR = 24;

const PALETTE = {
  ground: "#cab1ad",
  ledge: "#a1bf79",
  ledgeRefused: "#e08a7a",
  ramp: "#c4b1a1",
  wall: "#98837f",
  platform: "#87ccfd",
};

interface Props {
  colliderRegistry: ColliderRegistry;
}

/** A box that participates in collision. */
function Solid({
  position,
  size,
  color,
  layer,
  rotation,
  registry,
}: {
  position: [number, number, number];
  size: [number, number, number];
  color: string;
  layer: ColliderLayer;
  // Defaulted rather than optional: under exactOptionalPropertyTypes an
  // explicit undefined is not the same as an absent property, and three's
  // props do not accept it.
  rotation?: [number, number, number] | undefined;
  registry: ColliderRegistry;
}) {
  // Registration happens through a ref callback, which React runs in the
  // commit phase — the only time the registry may be touched.
  const ref = useCallback(
    (object: Object3D | null) => {
      if (object) registry.add(object, layer);
      else return;
    },
    [registry, layer],
  );

  return (
    <mesh ref={ref} position={position} rotation={rotation ?? [0, 0, 0]}>
      <boxGeometry args={size} />
      <meshLambertMaterial color={color} />
    </mesh>
  );
}

export default function GreyBoxScene({ colliderRegistry }: Props) {
  const { sun, ambient } = CFG.atmosphere;

  return (
    <>
      <hemisphereLight
        args={[ambient.skyColor, ambient.groundColor, ambient.intensity]}
      />
      <directionalLight
        position={[-sun.direction[0] * 50, -sun.direction[1] * 50, -sun.direction[2] * 50]}
        color={sun.color}
        intensity={sun.intensity}
      />

      {/* Ground, split by a trench so there is somewhere to fall and
          somewhere to jump. */}
      <Solid
        registry={colliderRegistry}
        position={[0, -0.5, (TRENCH_NEAR - 96) / 2]}
        size={[192, 1, 96 + TRENCH_NEAR]}
        color={PALETTE.ground}
        layer="terrain"
      />
      <Solid
        registry={colliderRegistry}
        position={[0, -0.5, (96 + TRENCH_FAR) / 2]}
        size={[192, 1, 96 - TRENCH_FAR]}
        color={PALETTE.ground}
        layer="terrain"
      />

      {/* Ledges bracketing the step ceiling. */}
      {LEDGES.map((height, index) => (
        <Solid
          key={`ledge-${String(index)}`}
          registry={colliderRegistry}
          position={[-30 + index * 8, height / 2, 6]}
          size={[6, height, 6]}
          color={height <= STEP ? PALETTE.ledge : PALETTE.ledgeRefused}
          layer="terrain"
        />
      ))}

      {/* Ramps. The 45 degree one is beyond the walkable slope and should
          resist being walked up. */}
      {RAMPS.map((degrees, index) => {
        const radians = (degrees * Math.PI) / 180;
        return (
          <Solid
            key={`ramp-${String(degrees)}`}
            registry={colliderRegistry}
            position={[12 + index * 10, 1, 8]}
            size={[6, 0.5, 12]}
            rotation={[radians, 0, 0]}
            color={PALETTE.ramp}
            layer="terrain"
          />
        );
      })}

      {/* A short maze, for wall sliding and for the camera to be occluded by. */}
      {[
        { position: [-60, 1.5, 0] as [number, number, number], size: [1, 3, 16] as [number, number, number] },
        { position: [-52, 1.5, 8] as [number, number, number], size: [16, 3, 1] as [number, number, number] },
        { position: [-44, 1.5, 0] as [number, number, number], size: [1, 3, 16] as [number, number, number] },
        { position: [-52, 1.5, -8] as [number, number, number], size: [16, 3, 1] as [number, number, number] },
      ].map((wall, index) => (
        <Solid
          key={`wall-${String(index)}`}
          registry={colliderRegistry}
          position={wall.position}
          size={wall.size}
          color={PALETTE.wall}
          layer="structure"
        />
      ))}

      {/* A platform reachable only by jumping, past the trench. */}
      <Solid
        registry={colliderRegistry}
        position={[0, 2, 34]}
        size={[10, 0.5, 10]}
        color={PALETTE.platform}
        layer="terrain"
      />
    </>
  );
}
