import { Suspense, lazy } from "react";

import { configureWorld } from "./engine/config/worldConfig";
import { isDebugEnabled } from "./engine/debug/debugStats";
import { greyboxCatalog, greyboxPlacementLimits } from "./world/greybox/catalog";
import { greyboxConfig } from "./world/greybox/config";
import { islandCatalog, islandPlacementLimits } from "./world/island/catalog";
import { islandConfig } from "./world/island/config";
import ControlsHint from "./ui/ControlsHint";
import InteractPrompt from "./ui/InteractPrompt";
import Panel from "./ui/Panel";
import RotateHint from "./ui/RotateHint";
import TouchControls from "./ui/TouchControls";
import LoadingScreen from "./ui/LoadingScreen";
import { useIslandGeometry } from "./world/island/useIslandGeometry";

// The 3D stack is the only lazy boundary in the app: the DOM overlay paints
// while three.js and the R3F vendor chunks download in parallel.
const Engine = lazy(() => import("./engine/Engine"));
const GreyBoxScene = lazy(() => import("./world/greybox/GreyBoxScene"));
const IslandScene = lazy(() => import("./world/island/IslandScene"));
const DebugHUD = lazy(() => import("./engine/debug/DebugHUD"));

// The world is installed before anything renders, so that a module reading it
// during the first frame finds it present and validated. An inconsistent world
// throws here rather than misbehaving later.
// The grey box stays reachable forever, not as scaffolding but as the
// engine's permanent test harness: when the art changes and movement starts
// misbehaving, it is somewhere to stand that has not changed.
const GREYBOX = new URLSearchParams(window.location.search).get("world") === "greybox";

configureWorld(GREYBOX ? greyboxConfig : islandConfig);

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
  return (
    <Engine
      catalog={islandCatalog}
      placementLimits={islandPlacementLimits}
      catalogGeometry={catalogGeometry}
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
        {GREYBOX ? (
          <Engine catalog={greyboxCatalog} placementLimits={greyboxPlacementLimits}>
            {(registry) => <GreyBoxScene colliderRegistry={registry} />}
          </Engine>
        ) : (
          <IslandWorld />
        )}
      </Suspense>
    </>
  );
}
