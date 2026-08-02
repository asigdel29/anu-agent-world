import { Canvas } from "@react-three/fiber";

// The Canvas owner. Camera parameters, background, and atmosphere are read from
// the active WorldConfig rather than hard-coded here; until that module lands
// (issue #3) this renders the empty warm-paper void the world floats in.
const BACKGROUND = "#f9f7f6";

export default function Engine() {
  return (
    <Canvas
      camera={{ fov: 45, near: 0.1, far: 2000, position: [0, 6, 14] }}
      dpr={[1, 2]}
    >
      <color attach="background" args={[BACKGROUND]} />
    </Canvas>
  );
}
