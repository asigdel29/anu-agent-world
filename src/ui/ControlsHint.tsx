import { useEffect, useState } from "react";

import { inputState } from "../engine/input/inputState";
import { useChunkStore } from "../engine/streaming/chunkStore";
import styles from "./ControlsHint.module.scss";

/**
 * Tells a visitor how to move, then gets out of the way.
 *
 * It retires on evidence rather than on a timer: once the character has
 * actually moved, the hint has done its job. A timed dismissal is wrong in
 * both directions — it nags someone who understood immediately, and it
 * abandons someone who was still reading.
 */
const POLL_MS = 200;
const LINGER_MS = 900;

export default function ControlsHint() {
  const ready = useChunkStore((s) => s.eagerReady);
  const [moved, setMoved] = useState(false);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    if (!ready || moved) return undefined;
    const id = setInterval(() => {
      if (inputState.moveX !== 0 || inputState.moveZ !== 0) setMoved(true);
    }, POLL_MS);
    return () => {
      clearInterval(id);
    };
  }, [ready, moved]);

  useEffect(() => {
    if (!moved) return undefined;
    const id = setTimeout(() => {
      setGone(true);
    }, LINGER_MS);
    return () => {
      clearTimeout(id);
    };
  }, [moved]);

  if (!ready || gone) return null;

  return (
    <div className={moved ? `${styles.hint} ${styles.leaving}` : styles.hint}>
      <span>
        <kbd>W</kbd>
        <kbd>A</kbd>
        <kbd>S</kbd>
        <kbd>D</kbd> to move
      </span>
      <span className={styles.divider} />
      <span>
        <kbd>Space</kbd> to jump
      </span>
      <span className={styles.divider} />
      <span>drag to look</span>
    </div>
  );
}
