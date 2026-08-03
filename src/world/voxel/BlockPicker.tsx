import { useEffect } from "react";

import { PLACEABLE } from "./blocks";
import { useBuildStore } from "./buildStore";
import styles from "./BlockPicker.module.scss";

/**
 * Which block a placement uses.
 *
 * A strip along the bottom rather than a panel, because it is not a thing you
 * open and close: it is the state of your hands, and it has to be readable
 * while you are building rather than instead of it.
 *
 * **Swatches, not names alone.** The world has no colour, so every block is a
 * value, and a list of words would make somebody read "clay" and then look at
 * a wall to find out what that means. The swatch is the block, at the value it
 * will actually be drawn — which is also the honest way to show that two of
 * them are nearly the same.
 *
 * **Number keys, because the strip is a row.** Reaching for a slot with the
 * mouse costs the aim you were holding, which in a world where the mouse is
 * also the camera means looking away from what you were building.
 */
export default function BlockPicker() {
  const selected = useBuildStore((s) => s.selected);
  const select = useBuildStore((s) => s.select);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      // Ignored while typing, whenever there is somewhere to type. Chat has
      // not landed yet and this costs one comparison now rather than a bug
      // report later.
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const slot = Number(event.key);
      if (!Number.isInteger(slot) || slot < 1 || slot > PLACEABLE.length) return;
      const kind = PLACEABLE[slot - 1];
      if (kind) select(kind.id);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [select]);

  return (
    <div className={styles.strip} role="group" aria-label="Block">
      {PLACEABLE.map((kind, index) => (
        <button
          key={kind.id}
          type="button"
          className={kind.id === selected ? styles.chosen : styles.slot}
          aria-pressed={kind.id === selected}
          title={`${kind.name} (${String(index + 1)})`}
          onClick={() => {
            select(kind.id);
          }}
        >
          <span className={styles.swatch} style={{ background: kind.color }} />
          <span className={styles.name}>{kind.name}</span>
        </button>
      ))}
      <span className={styles.hint}>click to break · right click to place</span>
    </div>
  );
}
