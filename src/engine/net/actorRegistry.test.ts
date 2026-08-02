import { describe, expect, it } from "vitest";

import { CHAT_BUBBLE_MS, REMOTE_TTL_MS } from "../../../protocol/limits";
import type { ServerFrame } from "../../../protocol/messages";
import {
  applyFrame,
  clearActors,
  createActorRegistry,
  isSpeaking,
  pruneActors,
} from "./actorRegistry";

const NOW = 1_750_000_000_000;

const stateFrame = (id: string, pos: [number, number, number] = [1, 2, 3]): ServerFrame => ({
  type: "state",
  id,
  kind: "visitor",
  pos,
  yaw: 0.5,
  action: "walk",
  character: "a",
});

describe("applyFrame", () => {
  it("adds an actor on its first transform", () => {
    const registry = createActorRegistry();
    expect(applyFrame(registry, stateFrame("aaa"), NOW)).toBe(true);
    expect(registry.actors.get("aaa")).toMatchObject({ targetX: 1, targetZ: 3, kind: "visitor" });
  });

  it("places a new actor rather than easing it in", () => {
    // Otherwise everyone arriving slides in from the world origin.
    const registry = createActorRegistry();
    applyFrame(registry, stateFrame("aaa", [10, 0, 20]), NOW);
    expect(registry.actors.get("aaa")).toMatchObject({ x: 10, z: 20 });
  });

  it("eases an actor already present", () => {
    const registry = createActorRegistry();
    applyFrame(registry, stateFrame("aaa", [0, 0, 0]), NOW);
    applyFrame(registry, stateFrame("aaa", [10, 0, 20]), NOW + 100);
    // The target moved; the drawn position is the renderer's to advance.
    expect(registry.actors.get("aaa")).toMatchObject({ targetX: 10, x: 0 });
  });

  it("does not disturb the roster when an actor merely moves", () => {
    // The whole point of the split: motion must never reach React.
    const registry = createActorRegistry();
    applyFrame(registry, stateFrame("aaa"), NOW);
    const rev = registry.rosterRev;
    for (let i = 0; i < 100; i += 1) {
      expect(applyFrame(registry, stateFrame("aaa", [i, 0, 0]), NOW + i * 100)).toBe(false);
    }
    expect(registry.rosterRev).toBe(rev);
  });

  it("does not draw a body for a bare join", () => {
    // Announced but not yet placed; drawing now would stand them at the origin.
    const registry = createActorRegistry();
    expect(applyFrame(registry, { type: "join", id: "aaa", ts: NOW }, NOW)).toBe(false);
    expect(registry.actors.size).toBe(0);
  });

  it("removes an actor that leaves", () => {
    const registry = createActorRegistry();
    applyFrame(registry, stateFrame("aaa"), NOW);
    expect(applyFrame(registry, { type: "leave", id: "aaa", ts: NOW }, NOW)).toBe(true);
    expect(registry.actors.size).toBe(0);
  });

  it("ignores a leave for someone who was never here", () => {
    const registry = createActorRegistry();
    expect(applyFrame(registry, { type: "leave", id: "ghost", ts: NOW }, NOW)).toBe(false);
  });

  it("populates the world from a snapshot in one roster change", () => {
    const registry = createActorRegistry();
    const snapshot: ServerFrame = {
      type: "snapshot",
      actors: [
        { id: "aaa", kind: "visitor", pos: [1, 0, 1], yaw: 0, action: "idle", character: "a" },
        { id: "a-flora", kind: "agent", pos: [2, 0, 2], yaw: 0, action: "idle", character: "b" },
      ],
    };
    expect(applyFrame(registry, snapshot, NOW)).toBe(true);
    expect(registry.actors.size).toBe(2);
    expect(registry.actors.get("a-flora")?.kind).toBe("agent");
  });

  it("keeps an agent and a visitor apart", () => {
    // The renderer draws them the same way; only the label differs.
    const registry = createActorRegistry();
    applyFrame(registry, { ...stateFrame("a-flora"), kind: "agent" } as ServerFrame, NOW);
    expect(registry.actors.get("a-flora")?.kind).toBe("agent");
  });
});

describe("speech", () => {
  it("shows a message for a bounded time", () => {
    const registry = createActorRegistry();
    applyFrame(registry, stateFrame("aaa"), NOW);
    applyFrame(registry, { type: "chat", id: "aaa", username: "anu", text: "hello" }, NOW);
    const actor = registry.actors.get("aaa");
    expect(actor).toBeDefined();
    expect(isSpeaking(actor!, NOW + 1000)).toBe(true);
    expect(isSpeaking(actor!, NOW + CHAT_BUBBLE_MS + 1)).toBe(false);
  });

  it("retires a bubble for an actor that never moves again", () => {
    // The defect this design replaces: expiry was computed in the render
    // body, so an entity that stopped sending frames stopped re-rendering
    // and its bubble stayed up forever. Idle agents made it permanent.
    const registry = createActorRegistry();
    applyFrame(registry, stateFrame("a-flora"), NOW);
    applyFrame(registry, { type: "chat", id: "a-flora", username: "flora", text: "hm" }, NOW);
    const actor = registry.actors.get("a-flora");
    expect(actor).toBeDefined();
    // Not one further frame arrives, and nothing re-renders.
    expect(isSpeaking(actor!, NOW + CHAT_BUBBLE_MS + 60_000)).toBe(false);
  });

  it("does not keep a departed actor alive", () => {
    const registry = createActorRegistry();
    expect(
      applyFrame(registry, { type: "chat", id: "ghost", username: "g", text: "hi" }, NOW),
    ).toBe(false);
    expect(registry.actors.size).toBe(0);
  });

  it("does not treat speech as presence", () => {
    // A chat frame must not extend a stale actor's life past the prune.
    const registry = createActorRegistry();
    applyFrame(registry, stateFrame("aaa"), NOW);
    const late = NOW + REMOTE_TTL_MS + 1;
    applyFrame(registry, { type: "chat", id: "aaa", username: "a", text: "hi" }, late);
    expect(pruneActors(registry, late)).toBe(true);
    expect(registry.actors.size).toBe(0);
  });
});

describe("pruneActors", () => {
  it("drops an actor that has gone quiet", () => {
    // A socket that dies without closing sends no leave frame, so without
    // this the world fills with motionless bodies.
    const registry = createActorRegistry();
    applyFrame(registry, stateFrame("aaa"), NOW);
    expect(pruneActors(registry, NOW + REMOTE_TTL_MS)).toBe(false);
    expect(pruneActors(registry, NOW + REMOTE_TTL_MS + 1)).toBe(true);
    expect(registry.actors.size).toBe(0);
  });

  it("keeps an actor that is still sending", () => {
    const registry = createActorRegistry();
    for (let t = 0; t <= REMOTE_TTL_MS * 3; t += 1000) {
      applyFrame(registry, stateFrame("aaa"), NOW + t);
      pruneActors(registry, NOW + t);
    }
    expect(registry.actors.size).toBe(1);
  });

  it("reports a single roster change for many departures", () => {
    const registry = createActorRegistry();
    for (const id of ["a", "b", "c"]) applyFrame(registry, stateFrame(id), NOW);
    expect(pruneActors(registry, NOW + REMOTE_TTL_MS + 1)).toBe(true);
    expect(registry.actors.size).toBe(0);
  });
});

describe("clearActors", () => {
  it("empties the world when a connection is lost", () => {
    const registry = createActorRegistry();
    applyFrame(registry, stateFrame("aaa"), NOW);
    expect(clearActors(registry)).toBe(true);
    expect(registry.actors.size).toBe(0);
  });

  it("reports no change when there was nobody", () => {
    expect(clearActors(createActorRegistry())).toBe(false);
  });
});
