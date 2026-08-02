/**
 * Live input, held as a mutable module object.
 *
 * The frame loop reads this every frame. Routing it through React state would
 * re-render the scene on every key press for no benefit — nothing in the tree
 * needs to know which direction is held, only the controller does — so input
 * deliberately lives outside React and is read directly.
 *
 * Continuous controls are axes; momentary ones are queued edges that a
 * consumer clears. A queue rather than a held boolean means a press cannot be
 * missed between frames, and cannot be acted on twice.
 */
export interface InputState {
  /** Strafe axis in camera space, -1 (left) to 1 (right). */
  moveX: number;
  /** Forward axis in camera space, -1 (back) to 1 (forward). */
  moveZ: number;
  run: boolean;
  /** Set on the press edge, cleared by {@link consumeJump}. */
  jumpQueued: boolean;
  /** Set on the press edge, cleared by {@link consumeInteract}. */
  interactQueued: boolean;
  /** Set on the press edge, cleared by {@link consumeObserve}. */
  observeQueued: boolean;
  /** Set on the press edge, cleared by {@link consumeCancel}. */
  cancelQueued: boolean;
}

export const inputState: InputState = {
  moveX: 0,
  moveZ: 0,
  run: false,
  jumpQueued: false,
  interactQueued: false,
  observeQueued: false,
  cancelQueued: false,
};

/** Read and clear the queued jump. */
export function consumeJump(state: InputState = inputState): boolean {
  const queued = state.jumpQueued;
  state.jumpQueued = false;
  return queued;
}

/** Read and clear the queued interaction. */
export function consumeInteract(state: InputState = inputState): boolean {
  const queued = state.interactQueued;
  state.interactQueued = false;
  return queued;
}

/** Read and clear the queued observe request. */
export function consumeObserve(state: InputState = inputState): boolean {
  const queued = state.observeQueued;
  state.observeQueued = false;
  return queued;
}

/** Read and clear the queued cancel. */
export function consumeCancel(state: InputState = inputState): boolean {
  const queued = state.cancelQueued;
  state.cancelQueued = false;
  return queued;
}

/**
 * Clear every control.
 *
 * Called when the window loses focus. Without it a key held at the moment of
 * blur never receives its release event, and the character walks off on its
 * own until the key is pressed and released again.
 */
export function clearInput(state: InputState = inputState): void {
  state.moveX = 0;
  state.moveZ = 0;
  state.run = false;
  state.jumpQueued = false;
  state.interactQueued = false;
  state.observeQueued = false;
  state.cancelQueued = false;
}

/**
 * Resolve the camera-space movement axes into world space.
 *
 * Movement is expressed relative to where the camera looks, which is what
 * makes "forward" mean "away from the viewer" rather than "along world +z".
 * Writes into `out` to avoid allocating inside the frame loop.
 */
export function resolveMoveDirection(
  state: InputState,
  cameraYaw: number,
  out: { x: number; z: number },
): void {
  const sin = Math.sin(cameraYaw);
  const cos = Math.cos(cameraYaw);
  out.x = state.moveX * cos + state.moveZ * sin;
  out.z = state.moveZ * cos - state.moveX * sin;
}
