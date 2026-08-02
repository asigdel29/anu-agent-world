import { useEffect, useState } from "react";

import { useChunkStore } from "../engine/streaming/chunkStore";
import styles from "./LoadingScreen.module.scss";

/**
 * Covers the world until it is safe to stand on.
 *
 * The condition is not "assets have downloaded" but "the chunks around spawn
 * are mounted and collidable". Those are different moments, and revealing the
 * world at the first would start a session with the character falling through
 * ground that has not arrived — which reads as a broken site rather than a
 * slow one.
 *
 * It fades rather than cutting, and unmounts only once faded, so the canvas
 * behind it is never briefly visible through a half-transparent panel.
 */
const FADE_MS = 500;

export default function LoadingScreen() {
  const ready = useChunkStore((s) => s.eagerReady);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    if (!ready) return undefined;
    const id = setTimeout(() => {
      setGone(true);
    }, FADE_MS);
    return () => {
      clearTimeout(id);
    };
  }, [ready]);

  if (gone) return null;

  return (
    <div className={ready ? `${styles.screen} ${styles.leaving}` : styles.screen}>
      <div className={styles.card}>
        <p className={styles.title}>Arriving</p>
        <p className={styles.subtitle}>Putting the ground down first.</p>
      </div>
    </div>
  );
}
