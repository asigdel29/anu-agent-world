import { Suspense, lazy } from "react";

import { configureWorld } from "./engine/config/worldConfig";
import { greyboxConfig } from "./world/greybox/config";

// The 3D stack is the only lazy boundary in the app: the DOM overlay paints
// while three.js and the R3F vendor chunks download in parallel.
const Engine = lazy(() => import("./engine/Engine"));
const GreyBoxScene = lazy(() => import("./world/greybox/GreyBoxScene"));

// The world is installed before anything renders, so that a module reading it
// during the first frame finds it present and validated. An inconsistent world
// throws here rather than misbehaving later.
configureWorld(greyboxConfig);

export default function App() {
  return (
    <Suspense fallback={null}>
      <Engine>
        {(registry) => <GreyBoxScene colliderRegistry={registry} />}
      </Engine>
    </Suspense>
  );
}
