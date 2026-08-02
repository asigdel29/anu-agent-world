import { useEffect, useRef } from "react";

import { inputState } from "../engine/input/inputState";
import { closePanel, usePanelStore } from "./panelStore";
import styles from "./Panel.module.scss";

/**
 * A panel of writing, over a world that keeps running.
 *
 * Three things it must get right, none of which are visual:
 *
 * **Movement stops.** Input lives in a mutable module object read by a frame
 * loop that has never heard of panels, so opening one must clear the axes
 * itself. Without this the character walks while somebody reads and they
 * close the panel somewhere else entirely.
 *
 * **Escape closes it.** Handled here rather than through the shared input
 * queue, because the frame loop consumes that queue and would race this. A
 * reader pressing escape is not sending the world a command.
 *
 * **The body is text children, never markup.** Some of this writing will
 * eventually come from a visitor or from a model, and the moment any of it
 * renders as HTML the whole world becomes a place to publish script tags.
 * Making it structurally impossible costs nothing here and cannot be
 * forgotten later.
 */
export default function Panel() {
  const panel = usePanelStore((s) => s.open);
  const close = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!panel) return undefined;

    // Stop the character where it stands. A key held when the panel opened
    // never delivers its release to the world, so the axis would stay set.
    inputState.moveX = 0;
    inputState.moveZ = 0;
    inputState.run = false;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closePanel();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    close.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [panel]);

  if (!panel) return null;

  return (
    <div className={styles.scrim} onPointerDown={closePanel}>
      <article
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="panel-title"
        // The world behind is deliberately still visible and still running;
        // a click inside must not reach the scrim and dismiss it.
        onPointerDown={(event) => {
          event.stopPropagation();
        }}
      >
        <header className={styles.header}>
          <h2 id="panel-title">{panel.title}</h2>
          <button ref={close} className={styles.close} onClick={closePanel} aria-label="Close">
            Esc
          </button>
        </header>
        {panel.body.map((paragraph, i) => (
          <p key={i}>{paragraph}</p>
        ))}
        {panel.link && (
          <a className={styles.link} href={panel.link.href} target="_blank" rel="noreferrer">
            {panel.link.label}
          </a>
        )}
      </article>
    </div>
  );
}
