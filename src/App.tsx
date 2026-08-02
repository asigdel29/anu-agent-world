import { Suspense, lazy } from "react";

import { configureWorld } from "./engine/config/worldConfig";
import { isDebugEnabled } from "./engine/debug/debugStats";
import { greyboxCatalog, greyboxPlacementLimits } from "./world/greybox/catalog";
import { greyboxConfig } from "./world/greybox/config";
import ControlsHint from "./ui/ControlsHint";
import InteractPrompt from "./ui/InteractPrompt";
import Panel from "./ui/Panel";
import RotateHint from "./ui/RotateHint";
import TouchControls from "./ui/TouchControls";
import LoadingScreen from "./ui/LoadingScreen";

// The 3D stack is the only lazy boundary in the app: the DOM overlay paints
// while three.js and the R3F vendor chunks download in parallel.
const Engine = lazy(() => import("./engine/Engine"));
const GreyBoxScene = lazy(() => import("./world/greybox/GreyBoxScene"));
const DebugHUD = lazy(() => import("./engine/debug/DebugHUD"));

// The world is installed before anything renders, so that a module reading it
// during the first frame finds it present and validated. An inconsistent world
// throws here rather than misbehaving later.
configureWorld(greyboxConfig);

const DEBUG = isDebugEnabled();

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
        <Engine catalog={greyboxCatalog} placementLimits={greyboxPlacementLimits}>
          {(registry) => <GreyBoxScene colliderRegistry={registry} />}
        </Engine>
      </Suspense>
    </>
  );
}
