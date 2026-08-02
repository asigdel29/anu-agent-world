import { create } from "zustand";

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

export const useChunkStore = create<ChunkStore>((set) => ({
  eagerReady: false,
  setEagerReady: (eagerReady) => {
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
