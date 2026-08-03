import { useGLTF } from "@react-three/drei";

/**
 * Ask for a file before it is needed, so arriving at a chunk boundary is not
 * a wait.
 *
 * Its own module rather than sitting beside the component: a file that
 * exports both a component and a helper loses fast refresh, and losing fast
 * refresh on the component that draws the world is a bad trade for one
 * function.
 */
export function preloadWorldModel(url: string): void {
  useGLTF.preload(url);
}
