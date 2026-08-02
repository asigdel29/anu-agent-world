/**
 * The judgement calls behind stair climbing, kept free of three.js so the
 * movement rules can be tested without a live scene.
 *
 * Every threshold is a required argument. The predecessor project gave these
 * helpers default values, and one of those defaults — the maximum climbable
 * rise — was in truth a contract with a Blender file: change the stairs and
 * movement silently breaks, with the number that governs it sitting in a
 * module that looks like generic maths. Requiring the caller to supply it
 * means the world's geometry and the rules that read it cannot drift apart
 * without someone noticing.
 */

/**
 * Whether wall sliding shortened an intended move enough to suspect a
 * climbable obstacle rather than a wall.
 *
 * @param intendedLen  horizontal distance the character meant to travel
 * @param slidLen      distance left after sliding along whatever it hit
 * @param blockedRatio share of the intended distance that must survive for the
 *                     move to count as unobstructed, in (0, 1]
 */
export function isBlockedByObstacle(
  intendedLen: number,
  slidLen: number,
  blockedRatio: number,
): boolean {
  return slidLen < intendedLen * blockedRatio;
}

/**
 * Whether the ground found after a tentative step up is a real surface the
 * character may stand on.
 *
 * Three conditions: the ground exists, it is not higher than one step above
 * where the character started, and it is not so far below that the character
 * would be snapped down a drop it should have fallen off instead.
 *
 * @param groundY       height of the surface found, or null when none was hit
 * @param baseY         the character's height before the step was attempted
 * @param maxStepHeight tallest rise climbable in one step
 * @param dropTolerance how far below `baseY` a surface may sit and still count
 */
export function isClimbableStep(
  groundY: number | null,
  baseY: number,
  maxStepHeight: number,
  dropTolerance: number,
): boolean {
  if (groundY === null) return false;
  return groundY <= baseY + maxStepHeight && groundY >= baseY - dropTolerance;
}

/**
 * Whether a surface just beneath a walking, grounded character is close enough
 * to step down onto rather than fall from.
 *
 * This is what makes descending stairs read as walking down them instead of
 * launching off each lip and dropping to the floor below.
 *
 * @param currentY the character's height this frame
 * @param groundY  height of the surface beneath, or null when none was hit
 * @param maxDrop  greatest descent followed on foot in a single frame
 */
export function isWalkableStepDown(
  currentY: number,
  groundY: number | null,
  maxDrop: number,
): boolean {
  if (groundY === null) return false;
  return groundY < currentY && currentY - groundY <= maxDrop;
}
