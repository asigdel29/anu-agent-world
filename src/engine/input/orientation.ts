/**
 * Device shape, used to choose input affordances and streaming budgets.
 *
 * Pointer type is asked of the device rather than inferred from the user
 * agent: a laptop with a touchscreen and a tablet with a trackpad both defeat
 * user-agent sniffing, and the question that actually matters is whether the
 * pointer is precise enough to hit a small target.
 */

/** Whether the primary pointer is coarse, meaning touch rather than mouse. */
export function isCoarsePointer(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(pointer: coarse)").matches;
}

/** Whether the viewport is taller than it is wide. */
export function isPortrait(width: number, height: number): boolean {
  return height > width;
}

/**
 * Whether to prompt the visitor to rotate the device.
 *
 * Only on a coarse pointer held in portrait: a narrow desktop window is not
 * something the visitor should be nagged about, and cannot be rotated anyway.
 */
export function shouldPromptRotate(
  coarsePointer: boolean,
  width: number,
  height: number,
): boolean {
  return coarsePointer && isPortrait(width, height);
}
