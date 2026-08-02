import type { WorldConfig } from "./types";
import { validateWorldConfig } from "./validateWorldConfig";

/**
 * The active world, held as a module-level singleton.
 *
 * This follows the same idiom as the per-frame input state: a plain module
 * object read directly inside the frame loop, never lifted into React state, so
 * that reading a tuning value costs a property access and causes no re-render.
 * Callers take the config once with `world()` and hold the reference.
 *
 * Pure helpers deliberately do *not* import this module — they receive the
 * slice of config they need as an argument, which keeps them testable against
 * synthetic worlds and keeps their dependencies honest.
 */
let active: WorldConfig | null = null;

/** Recursively freeze an object graph so a stray write fails loudly. */
function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  for (const key of Object.getOwnPropertyNames(value)) {
    deepFreeze((value as Record<string, unknown>)[key]);
  }
  return Object.freeze(value);
}

/**
 * Install the world the engine will run. Validation runs here rather than at
 * first use so that an inconsistent world fails at boot with a precise list of
 * problems, instead of manifesting later as a character falling through the
 * floor.
 *
 * @throws if the config violates any invariant in {@link validateWorldConfig}
 */
export function configureWorld(config: WorldConfig): void {
  const problems = validateWorldConfig(config);
  if (problems.length > 0) {
    throw new Error(
      `invalid WorldConfig "${config.id}":\n  - ${problems.join("\n  - ")}`,
    );
  }
  active = deepFreeze(config);
}

/**
 * The active world.
 *
 * @throws if called before {@link configureWorld}, which means a module read
 *   the world before the entry point installed it.
 */
export function world(): WorldConfig {
  if (active === null) {
    throw new Error("world() called before configureWorld()");
  }
  return active;
}

/** Whether a world has been installed. */
export function hasWorld(): boolean {
  return active !== null;
}

/** Clear the active world. Intended for tests. */
export function resetWorld(): void {
  active = null;
}
