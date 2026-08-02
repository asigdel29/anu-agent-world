import { useCallback, useEffect, useRef } from "react";
import type { Group } from "three";

import type { ColliderRegistry } from "../collision/colliderRegistry";
import type { ChunkSpec } from "./chunkGrid";

/**
 * One mounted piece of the world, and the owner of its collision registration.
 *
 * Collision follows a naming convention rather than a per-chunk configuration:
 * a subtree named `colliders` holds simplified proxy geometry, and it alone is
 * registered. The proxies are hidden from rendering, which costs nothing —
 * raycasting tests layers, not visibility, so an invisible proxy still catches
 * the ground and wall rays while the dense visual mesh is never traversed.
 *
 * A chunk without that subtree registers whole. That is the right default for
 * procedurally-built pieces, whose visual geometry is already simple enough to
 * raycast against directly.
 */
interface Props {
  spec: ChunkSpec;
  colliderRegistry: ColliderRegistry;
  /** Whether this chunk is close enough to contribute collision. */
  withColliders: boolean;
  /** Reports the first successful mount, so the manager can track readiness. */
  onReady?: ((id: string) => void) | undefined;
  children: React.ReactNode;
}

export default function Chunk({
  spec,
  colliderRegistry,
  withColliders,
  onReady,
  children,
}: Props) {
  const group = useRef<Group>(null);

  const ready = useCallback(() => {
    onReady?.(spec.id);
  }, [onReady, spec.id]);

  useEffect(ready, [ready]);

  // Runs after the chunk's content has committed, so the named subtree is
  // findable. Cleanup runs before the group's children are disposed, which
  // upholds the registry's rule that an entry is removed before its geometry
  // is freed — a stale entry is a crash on the next ray, not a leak.
  useEffect(() => {
    const root = group.current;
    if (!root) return undefined;

    const proxies = root.getObjectByName("colliders");
    if (proxies) proxies.visible = false;
    if (!withColliders) return undefined;

    const target = proxies ?? root;
    colliderRegistry.add(target, "terrain");
    return () => {
      colliderRegistry.remove(target);
    };
  }, [withColliders, colliderRegistry]);

  return <group ref={group}>{children}</group>;
}
