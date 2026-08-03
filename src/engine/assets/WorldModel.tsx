import { useLayoutEffect, useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import type { Object3D } from "three";

import { applyMaterialPolicy } from "./materialPolicy";

/**
 * A piece of exported world, loaded and brought into the world's own look.
 *
 * The scene is cloned before it is touched. drei caches a loaded file by url
 * and hands back the same object graph to every caller, so converting the
 * original would mutate a shared thing — and mounting the same chunk twice,
 * which streaming does routinely at a boundary, would then have two places in
 * the scene graph fighting over one transform.
 *
 * Materials are converted in a layout effect rather than during render:
 * mutating the graph while React is rendering it is exactly the kind of thing
 * that works until it is inside a transition, and a chunk whose materials
 * change a frame after it appears would flash.
 */

interface Props {
  readonly url: string;
  /** Told what arrived, so a chunk can register its collision geometry. */
  readonly onReady?: ((root: Object3D) => void) | undefined;
}

export default function WorldModel({ url, onReady }: Props) {
  const gltf = useGLTF(url);

  // Cloned per mount. The cache is shared; a mounted instance is not.
  const scene = useMemo(() => gltf.scene.clone(true), [gltf]);

  useLayoutEffect(() => {
    applyMaterialPolicy(scene);
    onReady?.(scene);
  }, [scene, onReady]);

  return <primitive object={scene} />;
}
