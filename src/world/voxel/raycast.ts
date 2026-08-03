/**
 * Which block you are looking at, and which of its faces.
 *
 * Building needs both. The block is what breaking removes; the face is where
 * placing puts the new one, and getting the face wrong is the difference
 * between building outward from a wall and burying a block inside it.
 *
 * **A grid walk, not a mesh raycast.** three.js could intersect the chunk
 * geometry and would answer the same question, but it would answer it by
 * testing triangles — tens of thousands of them per chunk, several chunks
 * deep, every frame the cursor moves. Walking the grid touches one cell per
 * block crossed, which for a five-block reach is at most about fifteen cells
 * regardless of how much geometry is on screen. It also works on blocks that
 * were never meshed, which matters because the block behind the one you are
 * breaking has no faces until you break it.
 *
 * The walk is the standard one: keep, per axis, the distance at which the ray
 * next crosses a boundary on that axis, step whichever is smallest, and
 * remember which axis it was — that axis, negated against the ray direction,
 * is the face entered through.
 */

export interface VoxelHit {
  /** The block the ray struck. */
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** The face it entered through, as a unit normal pointing back at the ray. */
  readonly nx: number;
  readonly ny: number;
  readonly nz: number;
}

/**
 * How far a boundary crossing is along the ray, per unit of direction.
 *
 * Guards a zero component: a ray travelling flat along an axis never crosses a
 * boundary on it, and dividing by zero to say so gives Infinity, which is the
 * right answer and the reason this reads as arithmetic rather than a branch.
 */
function stepSize(direction: number): number {
  return direction === 0 ? Infinity : Math.abs(1 / direction);
}

/** Distance to the first boundary on one axis. */
function firstBoundary(origin: number, direction: number, cell: number, size: number): number {
  if (direction === 0) return Infinity;
  const edge = direction > 0 ? cell + 1 - origin : origin - cell;
  return edge * size;
}

/**
 * Walk the grid until something solid is hit.
 *
 * `solid` is asked about world coordinates, so the caller decides what counts
 * — terrain, terrain plus edits, or terrain minus water. Water is the reason
 * this is a parameter rather than a lookup: you can stand in it and you must
 * be able to build through it, so it is solid to the mesher and not to this.
 */
export function castVoxel(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  maxDistance: number,
  solid: (x: number, y: number, z: number) => boolean,
): VoxelHit | null {
  const length = Math.hypot(dx, dy, dz);
  if (length === 0 || !Number.isFinite(length)) return null;
  const rx = dx / length;
  const ry = dy / length;
  const rz = dz / length;

  let x = Math.floor(ox);
  let y = Math.floor(oy);
  let z = Math.floor(oz);

  const stepX = Math.sign(rx);
  const stepY = Math.sign(ry);
  const stepZ = Math.sign(rz);

  const deltaX = stepSize(rx);
  const deltaY = stepSize(ry);
  const deltaZ = stepSize(rz);

  let nextX = firstBoundary(ox, rx, x, deltaX);
  let nextY = firstBoundary(oy, ry, y, deltaY);
  let nextZ = firstBoundary(oz, rz, z, deltaZ);

  // Declared without values: every branch of the walk sets all four before
  // anything reads them, and seeding them would be four assignments that are
  // never observed.
  let nx: number;
  let ny: number;
  let nz: number;
  let travelled: number;

  // Step first, then test — so the cell the ray starts in is never a
  // candidate. That is deliberate: the camera can clip into terrain, and a
  // click has to act on what is on screen rather than on whatever the camera
  // happens to be buried in.
  //
  // Bounded by distance rather than by iterations. A step always advances one
  // cell on one axis, so the walk terminates on its own; the counter is a cap
  // against a degenerate direction, not the exit.
  for (let guard = 0; guard < 512; guard += 1) {
    if (nextX <= nextY && nextX <= nextZ) {
      travelled = nextX;
      x += stepX;
      nextX += deltaX;
      nx = -stepX;
      ny = 0;
      nz = 0;
    } else if (nextY <= nextZ) {
      travelled = nextY;
      y += stepY;
      nextY += deltaY;
      nx = 0;
      ny = -stepY;
      nz = 0;
    } else {
      travelled = nextZ;
      z += stepZ;
      nextZ += deltaZ;
      nx = 0;
      ny = 0;
      nz = -stepZ;
    }

    // Distance before contents: a block one step past the reach limit is out
    // of reach, and testing it first would let it be broken from anywhere.
    if (travelled > maxDistance) return null;
    if (solid(x, y, z)) return { x, y, z, nx, ny, nz };
  }
  return null;
}

/** Where a block placed against a hit face would go. */
export function placementFor(hit: VoxelHit): { x: number; y: number; z: number } {
  return { x: hit.x + hit.nx, y: hit.y + hit.ny, z: hit.z + hit.nz };
}
