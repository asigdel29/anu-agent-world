import { useFrame, useThree } from "@react-three/fiber";

import type { ColliderRegistry } from "../collision/colliderRegistry";
import { debugStats, sampleFps } from "./debugStats";

/**
 * Samples renderer counters from inside the Canvas.
 *
 * Draw calls and triangle counts live on the renderer, which only components
 * inside the Canvas can reach; the overlay that displays them is ordinary DOM
 * outside it. This is the bridge, and it is mounted only when the overlay is
 * switched on so that nothing is paid for in the normal case.
 */
interface Props {
  colliderRegistry: ColliderRegistry;
}

export default function DebugProbe({ colliderRegistry }: Props) {
  const gl = useThree((state) => state.gl);

  useFrame((_, dt) => {
    debugStats.fps = sampleFps(debugStats.fps, dt);
    debugStats.drawCalls = gl.info.render.calls;
    debugStats.triangles = gl.info.render.triangles;
    debugStats.colliders = colliderRegistry.size();
  });

  return null;
}
