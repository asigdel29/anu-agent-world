/**
 * What people changed, on top of what the world generated.
 *
 * The terrain is a pure function of position and seed, which is what makes it
 * free: an infinite world costs nothing to store because nothing about it is
 * stored. Building has to leave that property intact, so a placed or broken
 * block is not a change to the terrain — it is an entry in a sparse overlay
 * consulted after the generator has spoken.
 *
 * This is the same split the rest of the design runs on. Continuous state is
 * derived; discrete state is a log. A visitor arriving later needs the seed
 * and the edits, and the edits are the only part that grows.
 *
 * **Bucketed by chunk, because the reader is a chunk.** A single flat map
 * would be simpler and would make chunk generation scan every edit in the
 * world to find the handful inside its own volume. Edits are grouped by the
 * cell they fall in, so generating a chunk consults nine small maps rather
 * than one large one, and a chunk knows whether anything it draws has changed
 * by comparing one number.
 *
 * **Breaking is an edit, not a deletion.** Removing a block writes air rather
 * than dropping the entry, because the absence of an entry already means
 * "whatever the generator said" — and what the generator said there was
 * stone. Only undo drops entries.
 */

/** A block coordinate triple, packed into one string key. */
function blockKey(x: number, y: number, z: number): string {
  return `${String(x)},${String(y)},${String(z)}`;
}

/** Which cell a world column belongs to. Cells are chunk-sized by definition. */
export function cellOf(x: number, size: number): number {
  return Math.floor(x / size);
}

function cellKey(cx: number, cz: number): string {
  return `${String(cx)},${String(cz)}`;
}

export interface Cell {
  /** Block key to block id. Air is a value, not an absence. */
  readonly blocks: Map<string, number>;
  /** Bumped on every change, so a chunk can tell whether to rebuild. */
  rev: number;
}

export interface EditStore {
  readonly cells: Map<string, Cell>;
  /** The size of a cell, fixed when the store is made. */
  readonly size: number;
  /** Bumped on every change anywhere. */
  rev: number;
}

export function createEdits(size: number): EditStore {
  return { cells: new Map(), size, rev: 0 };
}

function cellFor(store: EditStore, x: number, z: number, make: boolean): Cell | undefined {
  const key = cellKey(cellOf(x, store.size), cellOf(z, store.size));
  const found = store.cells.get(key);
  if (found || !make) return found;
  const fresh: Cell = { blocks: new Map(), rev: 0 };
  store.cells.set(key, fresh);
  return fresh;
}

/**
 * Record that a block is now something else.
 *
 * Returns whether anything actually changed, so a caller can skip the rebuild
 * when somebody places the block that was already there.
 */
export function setEdit(store: EditStore, x: number, y: number, z: number, block: number): boolean {
  const cell = cellFor(store, x, z, true);
  if (!cell) return false;
  const key = blockKey(x, y, z);
  if (cell.blocks.get(key) === block) return false;
  cell.blocks.set(key, block);
  cell.rev += 1;
  store.rev += 1;
  return true;
}

/**
 * Forget an edit, returning that block to whatever the generator says.
 *
 * This is undo, and it is not the same as placing air: air is a decision that
 * the block is gone, and this is the absence of any decision at all.
 */
export function clearEdit(store: EditStore, x: number, y: number, z: number): boolean {
  const cell = cellFor(store, x, z, false);
  if (!cell?.blocks.delete(blockKey(x, y, z))) return false;
  cell.rev += 1;
  store.rev += 1;
  return true;
}

/** What was decided about this block, or undefined if nothing was. */
export function editAt(
  store: EditStore,
  x: number,
  y: number,
  z: number,
): number | undefined {
  return cellFor(store, x, z, false)?.blocks.get(blockKey(x, y, z));
}

/**
 * The combined revision of every cell a chunk draws from.
 *
 * A chunk reads its own cell and, through its margin, the eight around it, so
 * an edit just over a boundary changes which faces it must draw. Summing all
 * nine means a chunk rebuilds when its neighbour's edge changes and stays put
 * when a distant one does.
 */
export function editRevAround(store: EditStore, cx: number, cz: number): number {
  let total = 0;
  for (let dx = -1; dx <= 1; dx += 1) {
    for (let dz = -1; dz <= 1; dz += 1) {
      total += store.cells.get(cellKey(cx + dx, cz + dz))?.rev ?? 0;
    }
  }
  return total;
}

/** Every edit in the nine cells around a chunk, as world coordinates. */
export function editsAround(
  store: EditStore,
  cx: number,
  cz: number,
): { x: number; y: number; z: number; block: number }[] {
  const out: { x: number; y: number; z: number; block: number }[] = [];
  for (let dx = -1; dx <= 1; dx += 1) {
    for (let dz = -1; dz <= 1; dz += 1) {
      const cell = store.cells.get(cellKey(cx + dx, cz + dz));
      if (!cell) continue;
      for (const [key, block] of cell.blocks) {
        const parts = key.split(",");
        const x = Number(parts[0]);
        const y = Number(parts[1]);
        const z = Number(parts[2]);
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
        out.push({ x, y, z, block });
      }
    }
  }
  return out;
}

/** How many edits exist, for a budget or a debug readout. */
export function editCount(store: EditStore): number {
  let total = 0;
  for (const cell of store.cells.values()) total += cell.blocks.size;
  return total;
}
