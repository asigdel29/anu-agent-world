import { create } from "zustand";

import { AIR, BLOCK_BY_NAME, PLACEABLE, isSolid } from "./blocks";
import { createEdits, editAt, editCount, setEdit } from "./edits";
import { blockWithFoliage } from "./terrain";
import { VOXEL_SEED, voxelConfig } from "./config";
import type { VoxelHit } from "./raycast";

/**
 * What the world is now, once people have had a go at it.
 *
 * One store, module-level, because the terrain is one world: a chunk asks it
 * what to draw, the ray asks it what is solid, and both have to get the same
 * answer or a block will be visible and not clickable, or clickable and not
 * visible.
 *
 * **React learns about edits through a counter, not through the data.** The
 * edits themselves are a mutable map read during generation; what reaches
 * React is a single number that moves when anything changes. Every mounted
 * chunk re-renders on that number, which sounds wasteful and is not: each one
 * keys its expensive work on its *own* cells' revision, so all but the chunk
 * that changed do nothing but return the geometry they already had. The
 * alternative — subscribing each chunk to its own slice — is a subscription
 * per chunk to save a few hundred microseconds of reconciliation.
 */

const CHUNK = voxelConfig.units.chunkSize;

/** Everything anybody has changed. Read during chunk generation. */
export const voxelEdits = createEdits(CHUNK);

/** How far a visitor can reach to build, in blocks. */
export const BUILD_REACH = 5;

interface BuildStore {
  /** Moves whenever any block anywhere changes. */
  rev: number;
  /** The block a placement would use. */
  selected: number;
  select: (block: number) => void;
}

export const useBuildStore = create<BuildStore>((set) => ({
  rev: 0,
  selected: BLOCK_BY_NAME.get("plank")?.id ?? PLACEABLE[0]?.id ?? AIR,
  select: (block) => {
    // Only from the catalogue. The picker is built from the same list, so a
    // value outside it means a bug rather than a choice, and clamping would
    // hide it by silently selecting a neighbour.
    if (!PLACEABLE.some((kind) => kind.id === block)) return;
    set({ selected: block });
  },
}));

/** What is at a block, edits winning over the generator. */
export function blockAtNow(x: number, y: number, z: number): number {
  const edited = editAt(voxelEdits, x, y, z);
  return edited ?? blockWithFoliage(x, y, z, VOXEL_SEED);
}

/**
 * Whether a ray should stop at a block.
 *
 * Water is drawn but not solid, so it neither blocks the ray nor stops a build
 * — you can stand in it, and being unable to build through it would mean
 * looking at a lake and being told there is nothing there.
 */
export function solidNow(x: number, y: number, z: number): boolean {
  return isSolid(blockAtNow(x, y, z));
}

/** Whether a build is inside the world's vertical range. */
function inRange(y: number): boolean {
  // Bedrock is not removable: a hole through the floor of the world is a fall
  // with nothing to land on, and the respawn that follows reads as a crash.
  return y > 1 && y < voxelConfig.vertical.ceilingY;
}

/**
 * Break a block, returning whether anything happened.
 *
 * Breaking writes air rather than dropping the entry — see `edits.ts` for why
 * the two are different acts.
 */
export function breakBlock(x: number, y: number, z: number): boolean {
  if (!inRange(y) || !solidNow(x, y, z)) return false;
  if (!setEdit(voxelEdits, x, y, z, AIR)) return false;
  useBuildStore.setState((s) => ({ rev: s.rev + 1 }));
  return true;
}

/** Place a block, returning whether anything happened. */
export function placeBlock(x: number, y: number, z: number, block: number): boolean {
  if (!inRange(y)) return false;
  if (!PLACEABLE.some((kind) => kind.id === block)) return false;
  // Placing into something solid would bury the block invisibly. The face
  // normal already prevents it; this is the check rather than the intention.
  if (solidNow(x, y, z)) return false;
  if (!setEdit(voxelEdits, x, y, z, block)) return false;
  useBuildStore.setState((s) => ({ rev: s.rev + 1 }));
  return true;
}

/**
 * Whether a placement would land inside the person making it.
 *
 * Standing still and building at your own feet is how somebody entombs
 * themselves, and the world has no way out of a solid block. Checked against
 * the body's own column rather than a collision sweep, because at block
 * resolution that is the same answer for a fraction of the work.
 */
export function wouldTrap(
  x: number,
  y: number,
  z: number,
  px: number,
  py: number,
  pz: number,
  height: number,
): boolean {
  if (Math.floor(px) !== x || Math.floor(pz) !== z) return false;
  const feet = Math.floor(py);
  const head = Math.floor(py + height - 0.01);
  return y >= feet && y <= head;
}

/** How much has been built, for a debug readout. */
export function builtCount(): number {
  return editCount(voxelEdits);
}

/** The block a hit refers to, and the empty space in front of its face. */
export function facesOf(hit: VoxelHit): {
  target: { x: number; y: number; z: number };
  against: { x: number; y: number; z: number };
} {
  return {
    target: { x: hit.x, y: hit.y, z: hit.z },
    against: { x: hit.x + hit.nx, y: hit.y + hit.ny, z: hit.z + hit.nz },
  };
}
