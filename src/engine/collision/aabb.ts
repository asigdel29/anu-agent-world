/**
 * Axis-aligned box maths for placed objects.
 *
 * Placements are answered analytically rather than by raycasting scene
 * objects. Mounting an object per placement and registering it would grow
 * raycast cost linearly with how much has been built, churn React on every
 * network frame, and — because operations arrive in socket callbacks — mutate
 * the collider list outside the commit phase, which is precisely the rule the
 * registry exists to enforce. Boxes in a grid have none of those problems.
 */

export interface Aabb {
  readonly id: string;
  readonly minX: number;
  readonly minY: number;
  readonly minZ: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly maxZ: number;
  /** Whether the top face may be stood on. */
  readonly standable: boolean;
}

/** Build a world-space box from a placement's transform and its kind's box. */
export function boxFrom(
  id: string,
  x: number,
  y: number,
  z: number,
  scale: number,
  halfX: number,
  halfY: number,
  halfZ: number,
  offsetY: number,
  standable: boolean,
): Aabb {
  const centreY = y + offsetY * scale;
  return {
    id,
    minX: x - halfX * scale,
    maxX: x + halfX * scale,
    minY: centreY - halfY * scale,
    maxY: centreY + halfY * scale,
    minZ: z - halfZ * scale,
    maxZ: z + halfZ * scale,
    standable,
  };
}

/** Whether a point in the horizontal plane lies within a box's footprint. */
export function containsXZ(box: Aabb, x: number, z: number): boolean {
  return x >= box.minX && x <= box.maxX && z >= box.minZ && z <= box.maxZ;
}

/**
 * Height of a box's top face beneath a point, or null.
 *
 * Only surfaces at or below the query height count: a crate above the
 * character's head is not something to stand on, and treating it as ground
 * would teleport them onto it.
 */
export function topFaceBelow(box: Aabb, x: number, z: number, fromY: number): number | null {
  if (!box.standable) return null;
  if (!containsXZ(box, x, z)) return null;
  return box.maxY <= fromY ? box.maxY : null;
}

/**
 * Distance along a horizontal ray to a box, or null when it misses.
 *
 * The slab method, restricted to the horizontal plane and to the band of
 * heights the body occupies — a box entirely above or below the body is not
 * something the body can walk into.
 */
export function sweepXZ(
  box: Aabb,
  fromX: number,
  fromY: number,
  fromZ: number,
  dirX: number,
  dirZ: number,
  maxDistance: number,
  bodyHeight: number,
): number | null {
  if (box.maxY <= fromY || box.minY >= fromY + bodyHeight) return null;

  let near = 0;
  let far = maxDistance;

  // X slab.
  if (dirX === 0) {
    if (fromX < box.minX || fromX > box.maxX) return null;
  } else {
    const t1 = (box.minX - fromX) / dirX;
    const t2 = (box.maxX - fromX) / dirX;
    near = Math.max(near, Math.min(t1, t2));
    far = Math.min(far, Math.max(t1, t2));
    if (near > far) return null;
  }

  // Z slab.
  if (dirZ === 0) {
    if (fromZ < box.minZ || fromZ > box.maxZ) return null;
  } else {
    const t1 = (box.minZ - fromZ) / dirZ;
    const t2 = (box.maxZ - fromZ) / dirZ;
    near = Math.max(near, Math.min(t1, t2));
    far = Math.min(far, Math.max(t1, t2));
    if (near > far) return null;
  }

  return near <= maxDistance ? near : null;
}

/** Which horizontal face a hit landed on, as an outward normal. */
export function faceNormal(
  box: Aabb,
  hitX: number,
  hitZ: number,
  out: { x: number; z: number },
): void {
  const toMinX = Math.abs(hitX - box.minX);
  const toMaxX = Math.abs(hitX - box.maxX);
  const toMinZ = Math.abs(hitZ - box.minZ);
  const toMaxZ = Math.abs(hitZ - box.maxZ);
  const nearest = Math.min(toMinX, toMaxX, toMinZ, toMaxZ);

  if (nearest === toMinX) {
    out.x = -1;
    out.z = 0;
  } else if (nearest === toMaxX) {
    out.x = 1;
    out.z = 0;
  } else if (nearest === toMinZ) {
    out.x = 0;
    out.z = -1;
  } else {
    out.x = 0;
    out.z = 1;
  }
}
