import { useEffect } from "react";
import { useThree } from "@react-three/fiber";

import { analyticsLive } from "./analytics";
import { SETTLE_MS, scheduleFrameBudget } from "./frameBudget";

/**
 * Takes the session's one performance reading.
 *
 * Costs nothing until it fires. The debug overlay samples the frame rate on
 * every frame because somebody is watching the number change; this is not
 * that, and paying a per-frame price for a value read once would be the wrong
 * trade in the one loop where the trade matters most.
 *
 * So the frame rate is measured only at the moment it is wanted: count frames
 * for a second, read what the renderer has been doing, report, stop. Nothing
 * is running before or after.
 */

/** How long to count frames for once the world has settled. */
const WINDOW_MS = 1000;

export default function FrameBudgetProbe() {
  const gl = useThree((state) => state.gl);

  useEffect(() => {
    if (!analyticsLive()) return undefined;

    let cancelled = false;
    let raf = 0;

    const cancelSample = scheduleFrameBudget(() => ({
      // Filled by the counting pass below; the scheduler only decides when.
      fps: measured,
      drawCalls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
      chunks: chunkCount,
    }));

    let measured = 0;
    let chunkCount = 0;

    // Start counting a second before the reading is due, so the number
    // reported is the frame rate at that moment rather than an average over
    // the whole session including its loading screen.
    const startCounting = setTimeout(() => {
      let frames = 0;
      const began = performance.now();
      const tick = () => {
        if (cancelled) return;
        frames += 1;
        const elapsed = performance.now() - began;
        if (elapsed >= WINDOW_MS) {
          measured = (frames / elapsed) * 1000;
          chunkCount = gl.info.memory.geometries;
          return;
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, Math.max(0, SETTLE_MS - WINDOW_MS));

    return () => {
      cancelled = true;
      clearTimeout(startCounting);
      cancelAnimationFrame(raf);
      cancelSample();
    };
  }, [gl]);

  return null;
}
