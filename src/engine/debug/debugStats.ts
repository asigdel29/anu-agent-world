/**
 * Engine telemetry, gathered into a module object the overlay reads.
 *
 * A manual check is only a check if the numbers are visible. "The world feels
 * fine" is not a claim anyone can act on; "colliders 14, draw calls 9, and the
 * chunk count is drifting upward as I walk" is. This exists so the in-browser
 * verification steps in the plan have something to read.
 *
 * Writers touch these fields every frame and the overlay samples them a few
 * times a second, so the cost of displaying them is not paid per frame.
 */
export interface DebugStats {
  fps: number;
  drawCalls: number;
  triangles: number;
  colliders: number;
  activeChunks: number;
  placements: number;

  x: number;
  y: number;
  z: number;
  speed: number;
  grounded: boolean;

  cameraMode: string;
  cameraBlend: number;
}

export const debugStats: DebugStats = {
  fps: 0,
  drawCalls: 0,
  triangles: 0,
  colliders: 0,
  activeChunks: 0,
  placements: 0,
  x: 0,
  y: 0,
  z: 0,
  speed: 0,
  grounded: false,
  cameraMode: "-",
  cameraBlend: 1,
};

/**
 * Whether the overlay is switched on.
 *
 * Read once rather than watched: a debug overlay that appears halfway through
 * a session is a distraction, and reading the query string per frame is waste.
 */
export function isDebugEnabled(search = globalThis.location?.search ?? ""): boolean {
  return new URLSearchParams(search).has("debug");
}

/**
 * Exponentially smoothed frame rate.
 *
 * A raw reciprocal of the frame time flickers too much to read. Smoothing
 * makes a sustained dip legible, which is the thing worth noticing, while
 * still moving quickly enough to catch one.
 */
const FPS_SMOOTHING = 0.1;

export function sampleFps(previous: number, dt: number): number {
  if (dt <= 0) return previous;
  const instant = 1 / dt;
  return previous === 0 ? instant : previous + (instant - previous) * FPS_SMOOTHING;
}
