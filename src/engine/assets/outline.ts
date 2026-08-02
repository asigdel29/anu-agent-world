/**
 * The thin warm line around everything.
 *
 * In this aesthetic the outline is not decoration. Shading has been flattened
 * to a few steps, which means shading is no longer what separates one object
 * from another — two flat fields of similar value meeting at an edge simply
 * merge. The outline is what puts the edge back, and it plays the same role
 * in the scene that the one-pixel hairline ring plays in the interface.
 *
 * **Technique: an inverted hull, sized rather than scaled.** A second copy of
 * each object is drawn slightly larger with its faces reversed, so it is
 * hidden wherever the object itself is in front and visible only around the
 * silhouette. The obvious way to make it larger is to multiply the scale,
 * and that is wrong: a scale factor makes the outline proportional to the
 * object, so a ground plane gets a thick band and a lantern gets a hairline.
 * Growing each axis by a fixed margin instead gives every object the same
 * line, which is what "one pixel" means in this look.
 *
 * The alternative — expanding vertices along their normals in a shader —
 * gives a genuinely constant *screen-space* width. It is the better answer
 * eventually and the wrong one to reach for now: it is a custom shader whose
 * failure mode is a scene that does not render at all, and that failure
 * cannot be detected without looking at it.
 */

/**
 * An outline is decoration and must be invisible to every query.
 *
 * This is not an optimisation. A chunk with no `colliders` subtree registers
 * whole, so anything added to its subtree becomes collision geometry — and a
 * hull is drawn with its faces reversed, which means a ray that passes
 * cleanly by the real object reports a hit on the inside of its shell. The
 * first version of this shipped without the guard and pulled the camera to
 * its occlusion minimum: the world was intact, correctly shaded, and framed
 * from two units away with no error anywhere.
 */
export const NEVER_RAYCAST = (): void => {};

/** The outline colour: warm near-black, never pure black. */
export const OUTLINE_INK = "#4e3c40";

/**
 * How far the hull stands off the surface, in world units.
 *
 * Read against a character 1.8 units tall, so this is roughly a centimetre —
 * about a pixel at the distances the follow camera holds.
 */
export const OUTLINE_MARGIN = 0.022;

/**
 * Per-axis scale that grows a capsule by a fixed margin all round.
 *
 * A single uniform factor is the tempting answer and is wrong for the same
 * reason a scale factor is wrong for boxes, only less obviously: it is even
 * around the waist and proportional along the length, so a body nearly two
 * metres tall gets a line at its ends around two and a half times the one at
 * its sides. Beside an outlined box the difference is plainly visible, and it
 * is the sort of inconsistency that reads as sloppiness without anyone being
 * able to say why.
 *
 * Note the radius is a *half* extent while a box size is a full one, so the
 * margin is divided by it once rather than twice.
 */
export function capsuleHullScale(
  radius: number,
  height: number,
  margin: number = OUTLINE_MARGIN,
): [number, number, number] {
  const girth = radius > 0 ? (radius + margin) / radius : 1;
  const length = height > 0 ? (height + margin * 2) / height : 1;
  return [girth, length, girth];
}

/**
 * Per-axis scale that grows a box by a fixed margin on every side.
 *
 * Exact for a box: an object `size` across becomes `size + 2 * margin`
 * across, whatever its proportions, so a flat slab and a tall post get the
 * same line rather than lines proportional to their bulk.
 *
 * A degenerate axis — a plane with no thickness — would divide by zero, so it
 * is left alone. An outline on an axis that does not exist is not meaningful.
 */
export function hullScale(
  size: readonly [number, number, number],
  margin: number = OUTLINE_MARGIN,
): [number, number, number] {
  return [
    size[0] > 0 ? (size[0] + margin * 2) / size[0] : 1,
    size[1] > 0 ? (size[1] + margin * 2) / size[1] : 1,
    size[2] > 0 ? (size[2] + margin * 2) / size[2] : 1,
  ];
}

/**
 * Dimensions of the hull for a box, as a size rather than a scale.
 *
 * Used where the hull is its own geometry — an instanced batch shares one
 * matrix buffer with the object it outlines, so the hull cannot be scaled
 * separately and must be built larger instead.
 */
export function hullSize(
  size: readonly [number, number, number],
  margin: number = OUTLINE_MARGIN,
): [number, number, number] {
  return [size[0] + margin * 2, size[1] + margin * 2, size[2] + margin * 2];
}
