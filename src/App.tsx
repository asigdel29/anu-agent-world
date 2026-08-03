import { Suspense, lazy, useMemo } from "react";

import { configureWorld } from "./engine/config/worldConfig";
import { isDebugEnabled } from "./engine/debug/debugStats";
import { greyboxCatalog, greyboxPlacementLimits } from "./world/greybox/catalog";
import { greyboxConfig } from "./world/greybox/config";
import { islandCatalog, islandPlacementLimits } from "./world/island/catalog";
import { islandConfig } from "./world/island/config";
import { islandSeed } from "./world/island/seed";
import { voxelConfig } from "./world/voxel/config";
import ControlsHint from "./ui/ControlsHint";
import InteractPrompt from "./ui/InteractPrompt";
import Panel from "./ui/Panel";
import RotateHint from "./ui/RotateHint";
import TouchControls from "./ui/TouchControls";
import LoadingScreen from "./ui/LoadingScreen";
import { useIslandGeometry } from "./world/island/useIslandGeometry";
import { startAnalytics } from "./analytics/analytics";
import { visitorId } from "./engine/net/visitorId";

// The 3D stack is the only lazy boundary in the app: the DOM overlay paints
// while three.js and the R3F vendor chunks download in parallel.
const Engine = lazy(() => import("./engine/Engine"));
const GreyBoxScene = lazy(() => import("./world/greybox/GreyBoxScene"));
const IslandScene = lazy(() => import("./world/island/IslandScene"));
const VoxelScene = lazy(() => import("./world/voxel/VoxelScene"));
const DebugHUD = lazy(() => import("./engine/debug/DebugHUD"));

// The world is installed before anything renders, so that a module reading it
// during the first frame finds it present and validated. An inconsistent world
// throws here rather than misbehaving later.
// The grey box stays reachable forever, not as scaffolding but as the
// engine's permanent test harness: when the art changes and movement starts
// misbehaving, it is somewhere to stand that has not changed.
// The voxel world is the world now. The grey box and the island stay
// reachable behind a parameter: the grey box because it is the engine's
// permanent test harness, and the island because it is the proof that the
// engine does not know what a world is.
const WORLD = new URLSearchParams(window.location.search).get("world") ?? "voxel";

configureWorld(
  WORLD === "greybox" ? greyboxConfig : WORLD === "island" ? islandConfig : voxelConfig,
);

// Started before anything can report, and given the identity the world
// already keeps to bring somebody back to the same body — which is exactly
// the identity that makes a returning visit measurable.
startAnalytics(visitorId());

const DEBUG = isDebugEnabled();

/**
 * The island, with its catalogue geometry loaded before the engine mounts.
 *
 * A component of its own because the geometry comes from a hook that
 * suspends, and suspending inside `Engine` would tear down the canvas rather
 * than waiting beside it.
 */
function IslandWorld() {
  const catalogGeometry = useIslandGeometry();
  // Derived once, and from nothing that changes. A seed rebuilt every render
  // would re-enqueue the same placements forever -- harmless to the reducer,
  // and still a queue that never empties.
  const seed = useMemo(() => islandSeed(islandConfig.placements.cellSize), []);
  return (
    <Engine
      catalog={islandCatalog}
      placementLimits={islandPlacementLimits}
      catalogGeometry={catalogGeometry}
      seed={seed}
    >
      {(registry) => <IslandScene colliderRegistry={registry} />}
    </Engine>
  );
}

export default function App() {
  return (
    <>
      {/* Overlays mount ahead of the world so the interface paints while the
          3D chunks are still downloading. */}
      <LoadingScreen />
      <ControlsHint />
      <InteractPrompt />
      <Panel />
      <TouchControls />
      <RotateHint />
      {DEBUG && (
        <Suspense fallback={null}>
          <DebugHUD />
        </Suspense>
      )}
      <Suspense fallback={null}>
        {WORLD === "greybox" ? (
          <Engine catalog={greyboxCatalog} placementLimits={greyboxPlacementLimits}>
            {(registry) => <GreyBoxScene colliderRegistry={registry} />}
          </Engine>
        ) : WORLD === "island" ? (
          <IslandWorld />
        ) : (
          <Engine catalog={greyboxCatalog} placementLimits={greyboxPlacementLimits}>
            {(registry) => <VoxelScene colliderRegistry={registry} />}
          </Engine>
        )}
      </Suspense>
    </>
  );
}
