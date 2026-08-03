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
import ActorLayer from "./net/ActorLayer";
import { useRealtime, worldSink } from "./net/useRealtime";
import { visitorId } from "./net/visitorId";
import { world } from "./config/worldConfig";
import Player from "./Player";
import type { CatalogGeometry } from "./assets/catalogGeometry";
import type { PlacementOp } from "./placements/placementOps";

/** Read once, so the probe is either mounted for the session or never. */
const DEBUG = isDebugEnabled();

interface Props {
  /** The world's scene graph, given the registry to declare collision with. */
  children: (registry: ReturnType<typeof createColliderRegistry>) => React.ReactNode;
  /** The kinds this world allows to be built. */
  catalog: PropCatalog;
  /** What a placement in this world must satisfy. */
  placementLimits: PlacementLimits;
  /** Authored prop geometry, for a world that ships a catalogue file. */
  catalogGeometry?: CatalogGeometry | undefined;
  /**
   * Placements a world ships with. Applied through the same queue as
   * everything else, so nothing here is a path the rest of the system has to
   * know about.
   */
  seed?: readonly PlacementOp[] | undefined;
}

/**
 * The Canvas owner.
 *
 * Camera parameters and background come from the active world rather than
 * being written here, which is what keeps this component free of any
 * particular world's facts.
 */
export default function Engine({
  children,
  catalog,
  placementLimits,
  catalogGeometry,
  seed,
}: Props) {
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

  // Changes from the relay join the same pending queue the dev console uses,
  // so a crate placed by an agent and one typed at the console reach the
  // world through one path and are both applied by the commit phase.
  // Enqueued rather than applied: the commit phase at the top of the frame
  // owns every change to the world, and a seed written straight into the map
  // would be the one thing that arrived by a different route.
  useEffect(() => {
    if (seed && seed.length > 0) placements.enqueue(seed);
  }, [placements, seed]);

  useEffect(() => {
    worldSink.apply = (ops) => {
      placements.enqueue(ops);
    };
    return () => {
      worldSink.apply = () => {};
    };
  }, [placements]);

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
      <PlacementLayer catalog={catalog} snapshot={snapshot} geometry={catalogGeometry} />
      <ActorLayer
        height={cfg.locomotion.playerHeight}
        radius={cfg.locomotion.playerRadius}
      />
      <Player
        colliderRegistry={registry}
        placements={placements}
        onWorldChanged={setSnapshot}
      />
      {DEBUG && <DebugProbe colliderRegistry={registry} />}
    </Canvas>
  );
}
