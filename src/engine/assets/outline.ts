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
