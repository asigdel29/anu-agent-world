import { Suspense, lazy } from "react";

// The 3D stack is the only lazy boundary in the app: the DOM overlay paints
// while three.js and the R3F vendor chunks download in parallel.
const Engine = lazy(() => import("./engine/Engine"));

export default function App() {
  return (
    <Suspense fallback={null}>
      <Engine />
    </Suspense>
  );
}
