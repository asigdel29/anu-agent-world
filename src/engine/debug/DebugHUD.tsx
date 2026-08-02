import { useEffect, useState } from "react";

import { debugStats } from "./debugStats";

/**
 * The numbers, as ordinary DOM over the canvas.
 *
 * Sampled a few times a second rather than every frame: at sixty hertz the
 * digits change too fast to read, and re-rendering React that often to display
 * a frame rate would itself cost frames.
 */
const SAMPLE_INTERVAL_MS = 250;

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: "1.5rem" }}>
      <span style={{ opacity: 0.6 }}>{label}</span>
      <span style={{ fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </div>
  );
}

export default function DebugHUD() {
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setTick((n) => n + 1);
    }, SAMPLE_INTERVAL_MS);
    return () => {
      clearInterval(id);
    };
  }, []);

  const s = debugStats;

  return (
    <div
      style={{
        position: "fixed",
        top: 12,
        left: 12,
        zIndex: 10,
        padding: "10px 12px",
        minWidth: 220,
        borderRadius: 5,
        background: "#f0edea",
        boxShadow: "0 0 0 1px rgb(0 0 0 / 7%), 0 7px 20px rgb(32 32 32 / 5%)",
        color: "#1a1a1a",
        font: "12px/1.5 ui-monospace, Menlo, Consolas, monospace",
        pointerEvents: "none",
      }}
    >
      <Row label="fps" value={s.fps.toFixed(0)} />
      <Row label="draw calls" value={String(s.drawCalls)} />
      <Row label="triangles" value={s.triangles.toLocaleString()} />
      <Row label="colliders" value={String(s.colliders)} />
      <Row label="chunks" value={String(s.activeChunks)} />
      <Row label="placements" value={String(s.placements)} />
      <Row
        label="position"
        value={`${s.x.toFixed(1)} ${s.y.toFixed(1)} ${s.z.toFixed(1)}`}
      />
      <Row label="speed" value={s.speed.toFixed(2)} />
      <Row label="grounded" value={s.grounded ? "yes" : "no"} />
      <Row
        label="camera"
        value={s.cameraBlend >= 1 ? s.cameraMode : `${s.cameraMode} ${s.cameraBlend.toFixed(2)}`}
      />
    </div>
  );
}
