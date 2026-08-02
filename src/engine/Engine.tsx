import { useEffect, useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";

import { createColliderRegistry } from "./collision/colliderRegistry";
import type { PropCatalog } from "./placements/catalogTypes";
import PlacementLayer from "./placements/PlacementLayer";
import type { PlacementLimits } from "./placements/placementOps";
import { createPlacementStore } from "./placements/placementStore";
import DebugProbe from "./debug/DebugProbe";
import { attachDevConsole } from "./debug/devConsole";
import { isDebugEnabled } from "./debug/debugStats";
import { useKeyboard } from "./input/useKeyboard";
import { usePointerOrbit } from "./input/usePointerOrbit";
import { useRealtime } from "./net/useRealtime";
import { visitorId } from "./net/visitorId";
import { world } from "./config/worldConfig";
import Player from "./Player";

/** Read once, so the probe is either mounted for the session or never. */
const DEBUG = isDebugEnabled();

interface Props {
  /** The world's scene graph, given the registry to declare collision with. */
  children: (registry: ReturnType<typeof createColliderRegistry>) => React.ReactNode;
  /** The kinds this world allows to be built. */
  catalog: PropCatalog;
  /** What a placement in this world must satisfy. */
  placementLimits: PlacementLimits;
}

/**
 * The Canvas owner.
 *
 * Camera parameters and background come from the active world rather than
 * being written here, which is what keeps this component free of any
 * particular world's facts.
 */
export default function Engine({ children, catalog, placementLimits }: Props) {
  const cfg = useMemo(() => world(), []);
  const registry = useMemo(() => createColliderRegistry(), []);
  const placements = useMemo(
    () => createPlacementStore(catalog, placementLimits, cfg.placements.cellSize),
    [catalog, placementLimits, cfg],
  );
  const [snapshot, setSnapshot] = useState(() => placements.snapshot());

  useKeyboard();
  usePointerOrbit(cfg.camera);
  // No relay host configured is a supported mode, not a misconfiguration:
  // the world stays fully explorable and merely empty.
  const playerId = useMemo(() => visitorId(), []);
  useRealtime({ host: import.meta.env.VITE_RELAY_HOST, playerId });

  // The network path does not exist yet, but the world already accepts
  // changes; there is no reason to wait for a socket to find out whether a
  // placed crate is something a character can climb.
  useEffect(() => {
    if (!DEBUG) return undefined;
    return attachDevConsole(placements, catalog);
  }, [placements, catalog]);

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
      <PlacementLayer catalog={catalog} snapshot={snapshot} />
      <Player
        colliderRegistry={registry}
        placements={placements}
        onWorldChanged={setSnapshot}
      />
      {DEBUG && <DebugProbe colliderRegistry={registry} />}
    </Canvas>
  );
}
