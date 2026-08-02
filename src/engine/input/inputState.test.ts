import { beforeEach, describe, expect, it } from "vitest";

import type { InputState } from "./inputState";
import {
  clearInput,
  consumeCancel,
  consumeInteract,
  consumeJump,
  consumeObserve,
  resolveMoveDirection,
} from "./inputState";

function freshState(): InputState {
  return {
    moveX: 0,
    moveZ: 0,
    run: false,
    jumpQueued: false,
    interactQueued: false,
    observeQueued: false,
    cancelQueued: false,
  };
}

describe("queued controls", () => {
  let state: InputState;

  beforeEach(() => {
    state = freshState();
  });

  it("reports nothing when no press has happened", () => {
    expect(consumeJump(state)).toBe(false);
  });

  it("reports a queued press exactly once", () => {
    // A momentary control acted on twice is a double jump nobody asked for.
    state.jumpQueued = true;
    expect(consumeJump(state)).toBe(true);
    expect(consumeJump(state)).toBe(false);
  });

  it("keeps each momentary control independent", () => {
    state.interactQueued = true;
    expect(consumeJump(state)).toBe(false);
    expect(consumeInteract(state)).toBe(true);
  });

  it("queues observe and cancel separately", () => {
    state.observeQueued = true;
    state.cancelQueued = true;
    expect(consumeObserve(state)).toBe(true);
    expect(consumeCancel(state)).toBe(true);
    expect(consumeObserve(state)).toBe(false);
    expect(consumeCancel(state)).toBe(false);
  });
});

describe("clearInput", () => {
  it("releases everything", () => {
    // A key held when the window loses focus never receives its release, and
    // the character would otherwise walk off unattended.
    const state = freshState();
    state.moveX = 1;
    state.moveZ = -1;
    state.run = true;
    state.jumpQueued = true;

    clearInput(state);

    expect(state).toEqual(freshState());
  });
});

describe("resolveMoveDirection", () => {
  const out = { x: 0, z: 0 };

  it("maps forward to world +z when the camera looks along +z", () => {
    const state = freshState();
    state.moveZ = 1;
    resolveMoveDirection(state, 0, out);
    expect(out.x).toBeCloseTo(0, 6);
    expect(out.z).toBeCloseTo(1, 6);
  });

  it("rotates forward with the camera", () => {
    const state = freshState();
    state.moveZ = 1;
    resolveMoveDirection(state, Math.PI / 2, out);
    expect(out.x).toBeCloseTo(1, 6);
    expect(out.z).toBeCloseTo(0, 6);
  });

  it("rotates strafing with the camera", () => {
    const state = freshState();
    state.moveX = 1;
    resolveMoveDirection(state, Math.PI / 2, out);
    expect(out.x).toBeCloseTo(0, 6);
    expect(out.z).toBeCloseTo(-1, 6);
  });

  it("preserves magnitude through rotation", () => {
    const state = freshState();
    state.moveX = 1;
    state.moveZ = 1;
    resolveMoveDirection(state, 0.7, out);
    expect(Math.hypot(out.x, out.z)).toBeCloseTo(Math.SQRT2, 6);
  });

  it("resolves no input to no direction", () => {
    resolveMoveDirection(freshState(), 1.234, out);
    expect(out.x).toBeCloseTo(0, 6);
    expect(out.z).toBeCloseTo(0, 6);
  });
});
