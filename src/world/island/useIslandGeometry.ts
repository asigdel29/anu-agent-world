import { useMemo } from "react";
import { useGLTF } from "@react-three/drei";

import type { CatalogGeometry } from "../../engine/assets/catalogGeometry";
import { collectCatalogGeometry } from "../../engine/assets/catalogGeometry";
import { applyMaterialPolicy } from "../../engine/assets/materialPolicy";
import { islandModelNames } from "./catalog";

/** Where the pipeline writes the props. */
const CATALOG_URL = "/models/catalog/catalog.glb";

/**
 * The authored geometry for every catalogue kind.
 *
 * One request for the whole catalogue rather than one per kind: the props are
 * twenty kilobytes together, and eight round trips to save nothing would be a
 * poor trade on the connection this world is meant to open on.
 *
 * Extracted once and memoised. The result is handed to the instanced renderer,
 * which uploads each kind's geometry a single time however many of that kind
 * end up in the world.
 */
export function useIslandGeometry(): CatalogGeometry {
  const gltf = useGLTF(CATALOG_URL);

  return useMemo(() => {
    // Materials are converted here as well, even though the instanced
    // renderer supplies its own: the policy is what decides a kind is unlit,
    // and leaving the loaded materials untouched would make that decision
    // depend on which path happened to draw first.
    applyMaterialPolicy(gltf.scene);
    return collectCatalogGeometry(gltf.scene, islandModelNames);
  }, [gltf]);
}
