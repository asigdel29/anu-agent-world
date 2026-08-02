import { useEffect, useRef, useState } from "react";

import { inputState } from "../engine/input/inputState";
import { isCoarsePointer } from "../engine/input/orientation";
import { createAxes, knobOffset, stickAxes } from "../engine/input/touchStick";
import { usePanelStore } from "./panelStore";
import styles from "./TouchControls.module.scss";

/**
 * Movement for a device with no keyboard.
 *
 * Mounted only for a coarse pointer, asked of the device rather than inferred
 * from a user agent — a laptop with a touchscreen and a tablet with a
 * trackpad both defeat sniffing, and the question that matters is whether the
 * pointer is precise enough to hit a small target.
 *
 * The stick writes straight into the shared input object, so the frame loop
 * cannot tell a thumb from a key. That is what keeps the controller free of
 * any notion of input device, and it is why the only thing this component
 * holds in state is where to draw the knob.
 *
 * Pointer capture is the detail that makes it usable: without it, a thumb
 * that slides off the stick keeps the character walking with no way to stop,
 * because the element that would receive the release is no longer under the
 * finger.
 */

/** Radius of the stick's travel, matching the ring drawn in the stylesheet. */
const RADIUS = 56;

export default function TouchControls() {
  // Asked once, lazily, rather than in an effect: pointer type does not
  // change mid-session, and an effect would render the controls for one frame
  // on every device before removing them again.
  const [coarse] = useState(() => isCoarsePointer());
  const panelOpen = usePanelStore((s) => s.open !== null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });

  // A panel takes the controls away mid-drag, so the axes must be released or
  // the character walks on behind the reader. The knob's drawn position needs
  // no reset here because the controls are unmounted while a panel is up; it
  // is cleared on the next press.
  useEffect(() => {
    if (!panelOpen) return;
    origin.current = null;
    inputState.moveX = 0;
    inputState.moveZ = 0;
    inputState.run = false;
  }, [panelOpen]);

  if (!coarse || panelOpen) return null;

  const release = () => {
    origin.current = null;
    setKnob({ x: 0, y: 0 });
    inputState.moveX = 0;
    inputState.moveZ = 0;
  };

  const track = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = origin.current;
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;

    const value = stickAxes(dx, dy, RADIUS, createAxes());
    inputState.moveX = value.x;
    // Screen y grows downwards and forward is away from the viewer, so the
    // vertical axis is inverted exactly once, here.
    inputState.moveZ = -value.y;
    // Running is deflection rather than a second control: a thumb pushed to
    // the edge is asking to go faster, and a separate button would need a
    // second thumb nobody has spare.
    inputState.run = Math.hypot(value.x, value.y) > 0.85;

    const offset = knobOffset(dx, dy, RADIUS, createAxes());
    setKnob(offset);
  };

  return (
    <div className={styles.layer}>
      <div
        className={styles.stick}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          origin.current = { x: event.clientX, y: event.clientY };
          setKnob({ x: 0, y: 0 });
        }}
        onPointerMove={track}
        onPointerUp={release}
        onPointerCancel={release}
        aria-label="Move"
      >
        <span
          className={styles.knob}
          style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }}
        />
      </div>

      <div className={styles.buttons}>
        <button
          className={styles.button}
          onPointerDown={() => {
            inputState.interactQueued = true;
          }}
        >
          Use
        </button>
        <button
          className={styles.button}
          onPointerDown={() => {
            inputState.jumpQueued = true;
          }}
        >
          Jump
        </button>
      </div>
    </div>
  );
}
