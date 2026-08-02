/**
 * An on-screen stick, as arithmetic.
 *
 * A thumb is not a key. It rests on the control while doing nothing, drifts
 * a few pixels without meaning to, and cannot be released precisely — so the
 * two ends of the range are the parts worth caring about.
 *
 * **The dead zone must not produce a step.** The obvious implementation
 * ignores anything inside the dead zone and otherwise reports
 * `distance / radius`, which means the instant a thumb crosses the boundary
 * the character jumps from standing still to a third of walking speed. The
 * ramp below starts at the dead zone edge instead, so movement begins at
 * nothing and grows.
 *
 * **The far end must be reachable.** A thumb dragged past the ring should
 * read as full speed rather than as an ever-larger number, and the direction
 * must survive the clamp — clamping the axes separately would turn a diagonal
 * into something faster than a straight line, which is the classic way a
 * character outruns itself along the diagonals.
 */

export interface Axes {
  x: number;
  y: number;
}

/** Share of the radius within which a resting thumb reads as still. */
export const DEAD_ZONE = 0.18;

export function createAxes(): Axes {
  return { x: 0, y: 0 };
}

/**
 * Turn a drag from the stick's centre into axes in [-1, 1], written into
 * `out` rather than returned, because this runs on every pointer move.
 */
export function stickAxes(
  dx: number,
  dy: number,
  radius: number,
  out: Axes,
  deadZone: number = DEAD_ZONE,
): Axes {
  const reach = radius > 0 ? radius : 1;
  const distance = Math.hypot(dx, dy);
  const dead = reach * Math.min(Math.max(deadZone, 0), 0.9);

  if (distance <= dead) {
    out.x = 0;
    out.y = 0;
    return out;
  }

  // Ramp from the dead-zone edge to the ring, so crossing the boundary starts
  // movement at nothing rather than at a third of walking speed.
  const magnitude = Math.min((distance - dead) / (reach - dead), 1);
  // Scale both axes by one factor: clamping them separately would let a
  // diagonal exceed a straight line.
  const scale = magnitude / distance;
  out.x = dx * scale;
  out.y = dy * scale;
  return out;
}

/** Where the visible knob should sit, kept inside its ring. */
export function knobOffset(dx: number, dy: number, radius: number, out: Axes): Axes {
  const distance = Math.hypot(dx, dy);
  if (distance <= radius || distance === 0) {
    out.x = dx;
    out.y = dy;
    return out;
  }
  out.x = (dx / distance) * radius;
  out.y = (dy / distance) * radius;
  return out;
}
