import { useState } from "react";

import { AVATAR_PARTS } from "../../protocol/avatar";
import { useAvatarStore } from "../engine/avatar/avatarStore";
import { record } from "../analytics/analytics";
import styles from "./AvatarPicker.module.scss";

/**
 * Where a visitor chooses what they look like.
 *
 * **No preview, on purpose.** The world is third person, so the body being
 * edited is already on screen behind this panel — pressing an option changes
 * it in place. A preview would be a second renderer to keep in agreement with
 * the first, and it would be less convincing than the thing it depicts.
 *
 * **The panel does not take input away.** Unlike a written panel, this one is
 * a strip rather than a modal: it is small enough to leave the character
 * visible, and the character has to stay visible for the panel to work at
 * all. So movement is not stopped, and closing it is a click rather than an
 * escape from somewhere.
 *
 * Options are rendered from the shared part table, so a part added to the
 * protocol appears here without this file changing.
 */
export default function AvatarPicker() {
  const [open, setOpen] = useState(false);
  const avatar = useAvatarStore((s) => s.avatar);
  const setPart = useAvatarStore((s) => s.setPart);

  if (!open) {
    return (
      <button
        type="button"
        className={styles.launch}
        onClick={() => {
          setOpen(true);
          record("avatar_opened");
        }}
      >
        Appearance
      </button>
    );
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <h2>Appearance</h2>
        <button
          type="button"
          className={styles.close}
          onClick={() => {
            setOpen(false);
          }}
          aria-label="Close appearance"
        >
          Done
        </button>
      </div>

      {AVATAR_PARTS.map((part) => (
        <div key={part.slot} className={styles.row}>
          <span className={styles.label}>{part.label}</span>
          <div className={styles.options}>
            {part.options.map((option, index) => (
              <button
                key={option}
                type="button"
                className={index === avatar[part.slot] ? styles.chosen : styles.option}
                aria-pressed={index === avatar[part.slot]}
                onClick={() => {
                  setPart(part.slot, index);
                  record("avatar_changed", { part: part.slot });
                }}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      ))}

      <p className={styles.note}>Everyone in the world sees this.</p>
    </div>
  );
}
