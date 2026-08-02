/**
 * The drift that makes an island look suspended rather than printed.
 *
 * The reference aesthetic floats each diorama by a few pixels vertically, a
 * couple laterally, and rolls it by about a tenth of a degree, on a period of
 * roughly six and a half seconds. Translated into world units those numbers
 * are tiny — a centimetre or two against a character nearly two metres tall.
 * That is deliberate: the effect should register as breathing, not as motion.
 *
 * **The thing that makes this harder than the reference.** Their dioramas are
 * looked at; ours are stood on. If the visible mesh drifts and the collision
 * geometry does not, the ground walks out from under the character — slowly,
 * intermittently, and in a way that would be maddening to diagnose. So the
 * drift is applied to a group containing *both*, and the character rides the
 * island the way they would ride a very slow lift.
 *
 * That places a real constraint on the amplitudes, which is why they live in
 * the world's configuration and are checked at boot: the vertical speed this
 * produces must stay far below what the ground resolve absorbs each frame. At
 * a centimetre or two over six seconds it is around four centimetres per
 * second, against a step tolerance of ten. There is a great deal of room, but
 * it is room somebody could spend by making the islands "more lively".
 *
 * An island drifts on its own phase, so an archipelago breathes raggedly
 * rather than in unison — which is the difference between a group of floating
 * objects and one object cut into pieces.
 */

export interface Drift {
  x: number;
  y: number;
  /** Roll about the forward axis, radians. */
  roll: number;
}

export interface DriftShape {
  readonly rise: number;
  readonly sway: number;
  readonly roll: number;
  readonly periodSec: number;
}

export function createDrift(): Drift {
  return { x: 0, y: 0, roll: 0 };
}

/**
 * Where an island sits at a moment, written into `out` rather than returned,
 * because this runs every frame for every island.
 *
 * The three components run at deliberately different rates — the sway at
 * three quarters of the rise, the roll at half — so the motion never repeats
 * exactly and never looks like a single sine wave driving everything.
 */
export function islandDrift(
  nowSec: number,
  phase: number,
  shape: DriftShape,
  out: Drift,
): Drift {
  const period = shape.periodSec > 0 ? shape.periodSec : 1;
  const t = (nowSec / period) * Math.PI * 2 + phase;
  out.y = Math.sin(t) * shape.rise;
  out.x = Math.sin(t * 0.75 + 1.7) * shape.sway;
  out.roll = Math.sin(t * 0.5 + 0.4) * shape.roll;
  return out;
}

/**
 * A stable phase offset for an island, from its name.
 *
 * Derived rather than random so an island breathes identically on every
 * client. Two visitors standing on the same island watching it move
 * differently would be worse than it not moving at all.
 */
export function driftPhase(name: string): number {
  let hash = 2166136261;
  for (let i = 0; i < name.length; i += 1) {
    hash ^= name.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) / 0x1_0000_0000) * Math.PI * 2;
}

/**
 * The fastest the drift ever moves an island vertically, in units per second.
 *
 * Exposed so the world validator can compare it against what the character
 * controller absorbs, rather than leaving the relationship as a comment
 * somebody has to remember.
 */
export function peakRiseSpeed(shape: DriftShape): number {
  const period = shape.periodSec > 0 ? shape.periodSec : 1;
  return (Math.abs(shape.rise) * Math.PI * 2) / period;
}
