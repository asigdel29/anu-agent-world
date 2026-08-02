import type { Object3D } from "three";

/**
 * The set of objects the engine raycasts against.
 *
 * Two rules govern every entry, and both exist because breaking them produces
 * failures that are hard to attribute:
 *
 *  1. **Mutate only in the commit phase** — effects and ref callbacks, never
 *     inside a frame callback. Raycasting walks this list synchronously, so a
 *     mutation partway through a frame can let one ray see geometry that the
 *     next ray does not.
 *  2. **Remove before disposing** — an entry whose geometry has been freed is
 *     a crash waiting for the next ray, not a leak that resolves itself.
 *
 * Entries are tagged by layer so that queries can be selective. Camera
 * occlusion cares only about structures: pulling the camera in every time a
 * shrub passes between it and the character reads as a fault, not a feature.
 */
export type ColliderLayer = "terrain" | "structure";

export interface ColliderRegistry {
  /**
   * Register an object. Accepts `null` so it can be used directly as a React
   * ref callback, which is invoked with `null` on unmount. Registering the same
   * object twice is a no-op.
   */
  add(object: Object3D | null, layer?: ColliderLayer): void;

  /** Unregister an object. Unknown objects and `null` are ignored. */
  remove(object: Object3D | null): void;

  /**
   * Every registered object, as a live array suitable for passing straight to
   * `Raycaster.intersectObjects`. Callers must not mutate it.
   */
  all(): readonly Object3D[];

  /** Registered objects on one layer. Rebuilt only when membership changes. */
  layer(layer: ColliderLayer): readonly Object3D[];

  /** Number of registered objects, for the debug overlay. */
  size(): number;
}

export function createColliderRegistry(): ColliderRegistry {
  const objects: Object3D[] = [];
  const layers = new Map<Object3D, ColliderLayer>();

  // Per-layer views are cached and invalidated on membership change, so the
  // camera's occlusion query does not rebuild an array every frame.
  let cache: Map<ColliderLayer, Object3D[]> | null = null;

  const registry: ColliderRegistry = {
    add(object, layer = "terrain") {
      if (!object || objects.includes(object)) return;
      objects.push(object);
      layers.set(object, layer);
      cache = null;
    },

    remove(object) {
      if (!object) return;
      const index = objects.indexOf(object);
      if (index === -1) return;
      objects.splice(index, 1);
      layers.delete(object);
      cache = null;
    },

    all() {
      return objects;
    },

    layer(wanted) {
      if (cache === null) {
        cache = new Map();
        for (const object of objects) {
          const key = layers.get(object) ?? "terrain";
          const bucket = cache.get(key);
          if (bucket) bucket.push(object);
          else cache.set(key, [object]);
        }
      }
      return cache.get(wanted) ?? [];
    },

    size() {
      return objects.length;
    },
  };

  // Frozen so the identity is stable across renders: components hold this in
  // effect dependency lists, and a fresh object each render would unregister
  // and re-register every collider on every commit.
  return Object.freeze(registry);
}
