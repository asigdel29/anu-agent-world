import { record } from "./analytics";

/**
 * One reading of how well the world is running, per session.
 *
 * Performance is the difference between a world and a slideshow on the
 * devices this is meant to reach, and it is invisible from a desk: the
 * machine building it is never the machine struggling. So a sample is
 * reported — but exactly one, taken after the world has settled.
 *
 * **Not a stream.** The obvious version reports every frame, or every second,
 * which turns a rendering loop into a network loop and buries the signal in
 * its own noise. One reading per session answers the question that actually
 * matters — what is it like on the machines people have — and answers it
 * across a population rather than across a timeline.
 *
 * **Taken late, not early.** The first seconds are chunk generation and asset
 * decode, which measure the loading screen rather than the world. Sampling
 * then would report every session as slow and be wrong about all of them.
 */

/** How long to let the world settle before believing the frame rate. */
export const SETTLE_MS = 12_000;

export interface FrameReading {
  readonly fps: number;
  readonly drawCalls: number;
  readonly triangles: number;
  readonly chunks: number;
}

/**
 * Arrange for a single reading once the world has settled.
 *
 * Returns the function that cancels it, so leaving before the sample is due
 * reports nothing rather than reporting a world nobody was in.
 */
export function scheduleFrameBudget(read: () => FrameReading): () => void {
  const timer = setTimeout(() => {
    const reading = read();
    // A world running at zero has not started rather than run badly, and
    // reporting it would drag every average towards a session that never was.
    if (reading.fps <= 0) return;
    record("frame_budget_sampled", {
      fps: Math.round(reading.fps),
      draw_calls: reading.drawCalls,
      triangles: reading.triangles,
      chunks: reading.chunks,
      // What kind of machine this is, without identifying it. Whether the
      // pointer is coarse separates a phone from a desk, which is the split
      // that actually predicts the number above.
      coarse_pointer:
        typeof window !== "undefined" && window.matchMedia
          ? window.matchMedia("(pointer: coarse)").matches
          : false,
      hardware_threads:
        typeof navigator === "undefined" ? 0 : (navigator.hardwareConcurrency ?? 0),
    });
  }, SETTLE_MS);

  return () => {
    clearTimeout(timer);
  };
}
