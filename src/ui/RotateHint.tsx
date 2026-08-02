import { useEffect, useState } from "react";

import { isCoarsePointer, shouldPromptRotate } from "../engine/input/orientation";
import styles from "./RotateHint.module.scss";

/**
 * Ask for the phone sideways.
 *
 * A third-person camera in portrait shows a tall slice of world with almost
 * no horizon, and the on-screen controls then take a third of what is left.
 * Turning the device is the difference between a world and a corridor.
 *
 * It asks rather than blocks. A visitor who wants to stay in portrait is
 * choosing a worse view, not doing something the world cannot handle, and a
 * hard block would be the one interaction that cannot be dismissed.
 */
export default function RotateHint() {
  const [prompt, setPrompt] = useState(false);

  useEffect(() => {
    const coarse = isCoarsePointer();
    const check = () => {
      setPrompt(shouldPromptRotate(coarse, window.innerWidth, window.innerHeight));
    };
    check();
    window.addEventListener("resize", check);
    // Resize alone is unreliable for rotation on iOS, where the viewport is
    // still mid-change when it fires.
    window.addEventListener("orientationchange", check);
    return () => {
      window.removeEventListener("resize", check);
      window.removeEventListener("orientationchange", check);
    };
  }, []);

  if (!prompt) return null;

  return (
    <div className={styles.hint} role="status">
      <span className={styles.glyph} aria-hidden="true" />
      <p>Turn your phone sideways for a wider view.</p>
    </div>
  );
}
