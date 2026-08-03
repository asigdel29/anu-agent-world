import { AIR, BLOCK_BY_NAME } from "./blocks";

/**
 * The land, as a pure function of position and a seed.
 *
 * This is the same rule the clock and the weather already follow, applied to
 * the ground: **continuous state is a pure function of `(position, seed)`**.
 * Nothing is stored and nothing is transmitted. A chunk twenty minutes' walk
 * away costs nothing until somebody goes there, two visitors standing
 * together see identical hills because they computed them rather than
 * received them, and the server can answer a question about a chunk nobody
 * has ever loaded.
 *
 * It also means the terrain has no save file to corrupt and no migration to
 * write. What agents build *on top* is the discrete, stored half — an
 * append-only log of block changes — and keeping those two apart is what
 * lets the world be enormous and its storage tiny.
 */

const GRASS = BLOCK_BY_NAME.get("grass")!.id;
const SOIL = BLOCK_BY_NAME.get("soil")!.id;
const STONE = BLOCK_BY_NAME.get("stone")!.id;
const SAND = BLOCK_BY_NAME.get("sand")!.id;
const WATER = BLOCK_BY_NAME.get("water")!.id;
const WOOD = BLOCK_BY_NAME.get("wood")!.id;
const LEAVES = BLOCK_BY_NAME.get("leaves")!.id;

/** Height of a world column, in blocks. */
export const WORLD_HEIGHT = 64;

/** Sea level. Anything below it that is not solid is water. */
export const SEA_LEVEL = 22;

/** Ground never goes below this, so there is always something underfoot. */
export const BEDROCK = 1;

/** How far below the surface caves are allowed to begin. */
const CAVE_ROOF = 4;

/**
 * How much of the underground is hollow.
 *
 * Raised from a value that carved a fifth of everything: caves should be
 * something found rather than something the ground is made of.
 */
const CAVE_THRESHOLD = 0.76;

/**
 * A hash of three integers and a seed, uniform in [0, 1).
 *
 * Value noise rather than gradient noise: it is a few multiplies, it needs no
 * permutation table, and at one sample per block the difference is invisible
 * under a stepped light ramp. Choosing the cheaper one here is not a
 * compromise — it is the whole reason a chunk can be generated during a
 * frame without a hitch.
 */
export function hash3(x: number, y: number, seed: number): number {
  let h = (x | 0) * 374761393 + (y | 0) * 668265263 + (seed | 0) * 1442695040;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Smoothly interpolated value noise at a point. */
export function valueNoise(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = smooth(x - x0);
  const fy = smooth(y - y0);

  const a = hash3(x0, y0, seed);
  const b = hash3(x0 + 1, y0, seed);
  const c = hash3(x0, y0 + 1, seed);
  const d = hash3(x0 + 1, y0 + 1, seed);

  const top = a + (b - a) * fx;
  const bottom = c + (d - c) * fx;
  return top + (bottom - top) * fy;
}

/**
 * Several octaves of noise, each finer and fainter than the last.
 *
 * One octave is rolling and featureless; four give a landscape that reads at
 * both the scale of a hill and the scale of a step. Beyond four the detail is
 * smaller than a block and only costs time.
 */
export function fractalNoise(x: number, y: number, seed: number, octaves = 4): number {
  let total = 0;
  let amplitude = 1;
  let frequency = 1;
  let sum = 0;

  for (let i = 0; i < octaves; i += 1) {
    total += valueNoise(x * frequency, y * frequency, seed + i * 1013) * amplitude;
    sum += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }

  return total / sum;
}

/** How high the ground stands at a column. */
export function heightAt(x: number, z: number, seed: number): number {
  // Two scales: a broad one that decides where the hills are, and a finer one
  // that gives their slopes something to say.
  const broad = fractalNoise(x / 96, z / 96, seed, 4);
  const fine = fractalNoise(x / 24, z / 24, seed + 7717, 3);
  // Averaging octaves narrows the distribution towards its middle, so a range
  // that looks generous on paper produces a landscape that never reaches
  // either end of it. The first version spanned 18 to 39 against a sea level
  // of 20 and generated no water anywhere -- a lake needs the low end of the
  // range to actually be reached, not merely to be available.
  const height = 2 + broad * 38 + fine * 7;
  return Math.max(BEDROCK + 1, Math.min(WORLD_HEIGHT - 8, Math.round(height)));
}

/**
 * Whether a point is hollowed out by a cave.
 *
 * Only below the surface, and never so close to it that a hillside becomes a
 * hole somebody falls into without warning.
 */
export function isCave(
  x: number,
  y: number,
  z: number,
  seed: number,
  surface: number = heightAt(x, z, seed),
): boolean {
  if (y < BEDROCK + 1) return false;
  // Never within a few blocks of the surface. A cave that breaks through a
  // hillside is a hole somebody walks into without warning, and it also
  // leaves whatever grew on that column standing on nothing. The first
  // version holed a quarter of all surfaces and left a quarter of the trees
  // floating -- the same quarter.
  if (y > surface - CAVE_ROOF) return false;
  const density = fractalNoise((x + y * 3) / 22, (z - y * 2) / 22, seed + 4441, 2);
  return density > CAVE_THRESHOLD;
}

/**
 * The block at a point.
 *
 * The single source of truth for what the land is. Everything else — chunk
 * generation, the ground the character stands on, what an agent sees when it
 * looks around — reads through this, so there is one definition of the world
 * rather than one per consumer.
 */
export function blockAt(x: number, y: number, z: number, seed: number): number {
  if (y < 0 || y >= WORLD_HEIGHT) return AIR;
  if (y <= BEDROCK) return STONE;

  const height = heightAt(x, z, seed);

  if (y > height) {
    // Above the ground: water up to sea level, air above it.
    return y <= SEA_LEVEL ? WATER : AIR;
  }

  if (isCave(x, y, z, seed, height)) return AIR;

  const depth = height - y;
  if (depth > 4) return STONE;

  // A shoreline is sand rather than grass, which is what makes water read as
  // a lake rather than as a flooded field.
  if (height <= SEA_LEVEL + 1) return depth === 0 ? SAND : SAND;
  return depth === 0 ? GRASS : SOIL;
}

/**
 * Whether a tree stands on this column, and how tall.
 *
 * Trees are part of the terrain function rather than scattered afterwards, so
 * they need no storage and appear identically for everyone. Returns zero
 * where there is no tree.
 */
export function treeAt(x: number, z: number, seed: number): number {
  const height = heightAt(x, z, seed);
  if (height <= SEA_LEVEL + 1) return 0;
  // Nothing grows on a hole. Caves no longer reach the surface, but a tree
  // standing on air is the kind of thing that comes back the moment somebody
  // tunes the cave threshold, so the check stays where the consequence is.
  if (blockAt(x, height, z, seed) === AIR) return 0;
  // Sparse, and never on a slope steep enough that a trunk would float.
  if (hash3(x, z, seed + 991) > 0.02) return 0;
  for (const [dx, dz] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const) {
    if (Math.abs(heightAt(x + dx, z + dz, seed) - height) > 1) return 0;
  }
  return 4 + Math.floor(hash3(x, z, seed + 313) * 3);
}

/**
 * The block at a point including whatever grows there.
 *
 * Kept apart from {@link blockAt} because collision and meshing want it, and
 * the height function does not: asking whether a column has a tree requires
 * looking at its neighbours, and doing that inside the ground query would
 * make every ground lookup five times the work.
 */
export function blockWithFoliage(x: number, y: number, z: number, seed: number): number {
  const ground = blockAt(x, y, z, seed);
  if (ground !== AIR) return ground;

  // A trunk on this column.
  const trunk = treeAt(x, z, seed);
  if (trunk > 0) {
    const base = heightAt(x, z, seed) + 1;
    if (y >= base && y < base + trunk) return WOOD;
  }

  // Leaves from this column or a neighbour's tree.
  for (let dx = -2; dx <= 2; dx += 1) {
    for (let dz = -2; dz <= 2; dz += 1) {
      const height = treeAt(x + dx, z + dz, seed);
      if (height === 0) continue;
      const base = heightAt(x + dx, z + dz, seed) + 1;
      const crown = base + height;
      if (y < crown - 2 || y > crown + 1) continue;
      const spread = Math.abs(dx) + Math.abs(dz);
      if (spread <= (y >= crown ? 1 : 2)) return LEAVES;
    }
  }

  return AIR;
}
