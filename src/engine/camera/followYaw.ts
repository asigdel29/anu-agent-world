/**
 * Whether and how fast the camera swings itself behind the character.
 *
 * Auto-following is a comfort, not a rule: it should happen when the player is
 * clearly travelling somewhere and stay out of the way otherwise. Two gates,
 * because either alone misbehaves. Alignment alone re-centres the camera when
 * the character shuffles a step to line up with a door; speed alone re-centres
 * it when the character is running sideways past the camera, which is exactly
 * when the player wants to keep looking where they are looking.
 */

/** Shortest signed angular difference, wrapping correctly across the seam. */
export function angleDelta(from: number, to: number): number {
  const diff = to - from;
  return Math.atan2(Math.sin(diff), Math.cos(diff));
}

/**
 * Step an angle toward a target along the shortest path.
 *
 * @param t fraction of the remaining difference to close, capped at 1 so a
 *          large step snaps rather than overshooting
 */
export function stepAngle(current: number, target: number, t: number): number {
  return current + angleDelta(current, target) * Math.min(1, t);
}

/**
 * Whether the camera should swing behind the character this frame.
 *
 * @param alignment      dot product of travel direction and camera forward,
 *                       -1 (running at the camera) to 1 (running away from it)
 * @param speed          current horizontal speed
 * @param walkSpeed      the world's walking speed, used as the scale
 * @param minAlignment   how far from sideways travel must be
 * @param minSpeedRatio  share of walking speed that counts as travelling
 */
export function shouldAutoFollow(
  alignment: number,
  speed: number,
  walkSpeed: number,
  minAlignment: number,
  minSpeedRatio: number,
): boolean {
  return alignment >= minAlignment && speed >= walkSpeed * minSpeedRatio;
}
