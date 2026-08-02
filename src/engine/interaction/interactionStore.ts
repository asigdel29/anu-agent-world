import { create } from "zustand";

/**
 * Things in the world worth walking up to.
 *
 * Registration lives in a plain module array rather than in React state, and
 * the reason is the same one that keeps input out of React: a scene mounting
 * forty targets would otherwise re-render every consumer forty times to tell
 * them something none of them display. Only the *result* of the scan — which
 * single target is in reach — is state, because that is the only part any
 * component draws.
 *
 * The scan itself is a pure function so the rules can be tested without a
 * scene, and it is deliberately not a raycast: what a visitor can interact
 * with should be what they are standing near, not what a ray happens to hit.
 * Aiming is a skill, and needing it to read a sign is a bad trade.
 */

export interface InteractionTarget {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** How close is close enough, overriding the world's default. */
  readonly range?: number | undefined;
  /** What the prompt says, already phrased for a person. */
  readonly prompt: string;
  readonly activate: () => void;
}

/** Every registered target. Read by the scan, never rendered. */
export const targets: InteractionTarget[] = [];

/**
 * Register a target, returning the function that removes it.
 *
 * Returning the remover rather than exposing a `remove(id)` makes the pairing
 * structural: a caller cannot unregister the wrong one, and a component that
 * returns this from an effect cannot forget.
 */
export function registerTarget(target: InteractionTarget): () => void {
  targets.push(target);
  return () => {
    const at = targets.indexOf(target);
    if (at >= 0) targets.splice(at, 1);
  };
}

/** For tests and for a world teardown. */
export function clearTargets(): void {
  targets.length = 0;
}

interface InteractionStore {
  /** The target in reach, or null. */
  activeId: string | null;
  prompt: string;
  offer: (id: string | null, prompt: string) => void;
}

export const useInteractionStore = create<InteractionStore>((set) => ({
  activeId: null,
  prompt: "",
  offer: (activeId, prompt) => {
    set({ activeId, prompt });
  },
}));

/**
 * How much further than its range a target may be before it is given up.
 *
 * The same idea as the streaming hysteresis, for the same reason: standing
 * exactly at the edge of a prompt should not flicker it on and off. Without
 * this, the one position a visitor is most likely to occupy — right at the
 * boundary, having just walked up — is the worst behaved.
 */
export const RANGE_HYSTERESIS = 0.25;

function distanceSquared(t: InteractionTarget, x: number, y: number, z: number): number {
  const dx = t.x - x;
  const dy = t.y - y;
  const dz = t.z - z;
  return dx * dx + dy * dy + dz * dz;
}

/**
 * Which target is in reach, given where the visitor is and what was in reach
 * a moment ago.
 *
 * The one already active keeps its claim until the visitor is clearly past
 * it, so walking between two nearby targets does not swap the prompt back and
 * forth on every step.
 */
export function chooseTarget(
  all: readonly InteractionTarget[],
  x: number,
  y: number,
  z: number,
  defaultRange: number,
  activeId: string | null,
  hysteresis: number = RANGE_HYSTERESIS,
): InteractionTarget | null {
  let best: InteractionTarget | null = null;
  let bestDistance = Infinity;

  for (const target of all) {
    const range = target.range ?? defaultRange;
    const held = target.id === activeId;
    const reach = held ? range * (1 + hysteresis) : range;
    const distance = distanceSquared(target, x, y, z);
    if (distance > reach * reach) continue;

    // A target already in reach outranks a nearer one, or the prompt would
    // change under a visitor who has not moved towards anything.
    if (held) return target;
    if (distance < bestDistance) {
      best = target;
      bestDistance = distance;
    }
  }

  return best;
}
