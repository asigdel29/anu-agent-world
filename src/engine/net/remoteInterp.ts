/**
 * Smoothing another body towards where the network last said it was.
 *
 * Frames arrive ten times a second and the screen redraws sixty, so five in
 * six frames have no new information. Drawing the last known transform on all
 * of them is what makes remote players look like they are teleporting; easing
 * towards it is what makes them look like they are walking.
 *
 * Kept free of three.js so the easing is unit-testable, and framerate
 * independent so a 120 Hz display and a struggling phone converge at the same
 * rate — otherwise the same world feels different on different hardware, and
 * the difference is not a matter of taste but of who arrives first.
 */

/** How quickly a body closes the gap to its latest known transform. */
export const LERP_SPEED = 8;

/**
 * The share of the remaining gap to close this frame.
 *
 * Exponential rather than linear, which is what makes it independent of the
 * frame rate: two half-length steps close the same fraction as one long one.
 * A linear `speed * dt` would not, and would overshoot on a long frame.
 */
export function dampFraction(speed: number, step: number): number {
  return 1 - Math.exp(-speed * step);
}

/**
 * Step an angle towards a target along the shortest path.
 *
 * Wrapping correctly across the seam is the whole reason this exists: a body
 * turning from just under a half turn to just over it should rotate a few
 * degrees, not spin most of the way round the other way.
 */
export function stepAngle(current: number, target: number, t: number): number {
  const diff = target - current;
  const shortest = Math.atan2(Math.sin(diff), Math.cos(diff));
  return current + shortest * Math.min(1, Math.max(0, t));
}
