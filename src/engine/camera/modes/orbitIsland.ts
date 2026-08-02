import type { CameraContext, CameraMode, CameraPose } from "../cameraDirector";

/**
 * The diorama view: the island seen whole, turning slowly, from outside.
 *
 * This is how a visitor arrives, and it is doing a specific job. A
 * third-person camera at ground level answers "where am I standing"; it
 * cannot answer "what is this". Someone landing straight into it sees a patch
 * of ground and their own back, and has to walk before the place means
 * anything. Opening on the whole island says what the world is in one frame,
 * and descending into it becomes a decision the visitor makes rather than the
 * only state there is.
 *
 * It turns on its own, slowly. Not for spectacle: a still frame of a
 * low-poly island reads as a picture, and the slow parallax is what tells the
 * eye it is a model in space. The rate is chosen to be below the speed at
 * which anyone would describe it as spinning — if a visitor notices the
 * rotation as motion, it is too fast.
 *
 * Pointer input still steers it, so a visitor who takes hold of the view is
 * immediately in control rather than fighting an animation. Dragging adds to
 * the automatic rotation rather than replacing it, which means letting go
 * resumes the drift from wherever they left it.
 */

export interface OrbitIslandOptions {
  /** Centre of the island, in world units. */
  readonly centreX: number;
  readonly centreY: number;
  readonly centreZ: number;
  /** How far out the camera sits. */
  readonly distance: number;
  /** How high above the centre, as a share of the distance. */
  readonly heightRatio: number;
  /** Radians per second of automatic turn. */
  readonly turnRate: number;
}

export const DEFAULT_ORBIT: Omit<OrbitIslandOptions, "centreX" | "centreY" | "centreZ"> = {
  distance: 42,
  heightRatio: 0.42,
  // A full turn in a little over three minutes: present but never noticed.
  turnRate: 0.032,
};

export function createOrbitIslandMode(
  options: OrbitIslandOptions,
  id = "orbitIsland",
  priority = 0,
): CameraMode {
  let angle = 0;

  return {
    id,
    priority,

    enter() {
      angle = 0;
    },

    sample(out: CameraPose, dt: number, ctx: CameraContext) {
      angle += options.turnRate * dt;

      // The visitor's own orbit input is added rather than substituted, so
      // taking hold of the view and letting go resumes the drift from there
      // instead of snapping back to where the animation had got to.
      const heading = angle + ctx.orbitYaw;
      const height = options.distance * options.heightRatio;

      out.px = options.centreX + Math.sin(heading) * options.distance;
      out.py = options.centreY + height;
      out.pz = options.centreZ + Math.cos(heading) * options.distance;

      out.tx = options.centreX;
      out.ty = options.centreY;
      out.tz = options.centreZ;
    },
  };
}

/**
 * Whether the visitor has asked to come down into the world.
 *
 * Movement is the signal, not a button. Someone who presses a direction has
 * already decided to be in the place rather than to look at it, and asking
 * them to press something else first would be a toll on the one action that
 * means they are engaged.
 */
export function wantsToDescend(moveX: number, moveZ: number, jumpQueued: boolean): boolean {
  return moveX !== 0 || moveZ !== 0 || jumpQueued;
}
