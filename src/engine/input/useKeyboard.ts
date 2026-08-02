import { useEffect } from "react";

import { clearInput, inputState } from "./inputState";

/**
 * Bind the keyboard to the shared input state.
 *
 * Writes straight into the module object rather than React state: the frame
 * loop is the only reader, and re-rendering the scene on every key press would
 * buy nothing.
 */

const HELD = new Set<string>();

/**
 * Whether the key event is destined for a text field.
 *
 * Without this, typing into the chat box walks the character across the world
 * one letter at a time — every "w" is also a step forward.
 */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}

function axesFromHeld(): void {
  const forward = HELD.has("KeyW") || HELD.has("ArrowUp") ? 1 : 0;
  const back = HELD.has("KeyS") || HELD.has("ArrowDown") ? 1 : 0;
  const left = HELD.has("KeyA") || HELD.has("ArrowLeft") ? 1 : 0;
  const right = HELD.has("KeyD") || HELD.has("ArrowRight") ? 1 : 0;

  inputState.moveZ = forward - back;
  inputState.moveX = right - left;
  inputState.run = HELD.has("ShiftLeft") || HELD.has("ShiftRight");
}

export function useKeyboard(): void {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (isTyping(event.target)) return;

      // Ignore auto-repeat: a held key must not queue a press every tick.
      if (!event.repeat) {
        switch (event.code) {
          case "Space":
            inputState.jumpQueued = true;
            break;
          case "KeyE":
            inputState.interactQueued = true;
            break;
          case "Tab":
            inputState.observeQueued = true;
            event.preventDefault();
            break;
          case "Escape":
            inputState.cancelQueued = true;
            break;
          default:
            break;
        }
      }

      HELD.add(event.code);
      axesFromHeld();
    }

    function onKeyUp(event: KeyboardEvent) {
      HELD.delete(event.code);
      axesFromHeld();
    }

    // A key held at the moment focus is lost never delivers its release.
    function onBlur() {
      HELD.clear();
      clearInput();
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      HELD.clear();
      clearInput();
    };
  }, []);
}
