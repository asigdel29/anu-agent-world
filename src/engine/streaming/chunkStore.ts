import { create } from "zustand";

import { record } from "../../analytics/analytics";

/**
 * Whether the world is ready to be stood on.
 *
 * The spawn-eager chunks must be mounted and collidable before the character
 * is released, or the first frames are spent falling through a world that has
 * not finished arriving. The loading screen waits on this rather than on a
 * timer, so a slow connection delays the start instead of producing a fall.
 */
interface ChunkStore {
  eagerReady: boolean;
  setEagerReady: (ready: boolean) => void;
}

/** When the page began, so readiness can be reported as a duration. */
const BOOT = typeof performance === "undefined" ? 0 : performance.now();

export const useChunkStore = create<ChunkStore>((set, get) => ({
  eagerReady: false,
  setEagerReady: (eagerReady) => {
    // Reported once, on the transition. This is the number that decides
    // whether somebody stays: how long they waited before the world was
    // something they could stand on, rather than how long a file took.
    if (eagerReady && !get().eagerReady) {
      record("world_ready", {
        ready_ms: Math.round(
          (typeof performance === "undefined" ? 0 : performance.now()) - BOOT,
        ),
      });
    }
    set({ eagerReady });
  },
}));

/**
 * Where the thing the world streams around currently is.
 *
 * A mutable module object rather than React state, following the same reasoning
 * as the input axes: it changes every frame and only the streaming loop reads
 * it, so routing it through React would re-render the scene sixty times a
 * second to tell it something it already knows.
 */
export const subjectPosition = { x: 0, y: 0, z: 0 };
