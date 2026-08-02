import { useMemo } from "react";
import { Canvas } from "@react-three/fiber";

import { createColliderRegistry } from "./collision/colliderRegistry";
import { useKeyboard } from "./input/useKeyboard";
import { usePointerOrbit } from "./input/usePointerOrbit";
import { world } from "./config/worldConfig";
import Player from "./Player";

interface Props {
  /** The world's scene graph, given the registry to declare collision with. */
  children: (registry: ReturnType<typeof createColliderRegistry>) => React.ReactNode;
}

/**
 * The Canvas owner.
 *
 * Camera parameters and background come from the active world rather than
 * being written here, which is what keeps this component free of any
 * particular world's facts.
 */
export default function Engine({ children }: Props) {
  const cfg = useMemo(() => world(), []);
  const registry = useMemo(() => createColliderRegistry(), []);

  useKeyboard();
  usePointerOrbit(cfg.camera);

  const background =
    cfg.atmosphere.background.kind === "color"
      ? cfg.atmosphere.background.color
      : "#f9f7f6";

  return (
    <Canvas
      camera={{
        fov: cfg.camera.fov,
        near: cfg.camera.near,
        far: cfg.camera.far,
      }}
      dpr={[1, 2]}
    >
      <color attach="background" args={[background]} />
      {cfg.atmosphere.fog && (
        <fog
          attach="fog"
          args={[
            cfg.atmosphere.fog.color,
            cfg.atmosphere.fog.near,
            cfg.atmosphere.fog.far,
          ]}
        />
      )}

      {children(registry)}
      <Player colliderRegistry={registry} />
    </Canvas>
  );
}
