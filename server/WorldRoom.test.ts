import { beforeEach, describe, expect, it, vi } from "vitest";

import { keyFor } from "./storage";
import { WorldRoom } from "./WorldRoom";
import { FakeDurableObjectState, FakeWebSocket } from "./fakeDurableObject";

const NOW = 1_750_000_000_000;

const STATE_FRAME = JSON.stringify({
  type: "state",
  pos: [1, 2, 3],
  yaw: 0.5,
  action: "walk",
  character: "a",
});

/** A room over a fake platform, with the real WorldRoom under test. */
function makeRoom() {
  const state = new FakeDurableObjectState();
  const room = new WorldRoom(state as unknown as DurableObjectState);
  const join = async (pid: unknown) => {
    const ws = new FakeWebSocket();
    await room.welcome(ws as unknown as WebSocket, pid);
    return ws;
  };
  const say = (ws: FakeWebSocket, raw: string) =>
    room.webSocketMessage(ws as unknown as WebSocket, raw);
  return { state, room, join, say };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

describe("welcome", () => {
  it("tells a newcomer who it is and what time the world thinks it is", () => {
    // Both are needed before the first rendered frame: the sky is derived
    // from server time, so a client that guessed would show the wrong one.
    return makeRoom()
      .join("b7f2c1a9")
      .then((ws) => {
        const hello = ws.frames()[0];
        expect(hello).toEqual({ type: "hello", id: "b7f2c1a9", s: NOW });
      });
  });

  it("sends hello before anything a client could render from", async () => {
    const { join } = makeRoom();
    const ws = await join("b7f2c1a9");
    const types = ws.frames().map((f) => f["type"]);
    expect(types[0]).toBe("hello");
    expect(types).toContain("snapshot");
  });

  it("refuses to hand a visitor an agent identity", async () => {
    const { join } = makeRoom();
    const ws = await join("a-flora");
    expect(ws.frames()[0]?.["id"]).not.toBe("a-flora");
  });

  it("announces a newcomer to the room but not to itself", async () => {
    const { join } = makeRoom();
    const first = await join("aaa");
    const second = await join("bbb");
    expect(first.framesOf("join").map((f) => f["id"])).toEqual(["bbb"]);
    expect(second.framesOf("join")).toEqual([]);
  });

  it("never puts a newcomer in its own snapshot", async () => {
    // Otherwise a returning visitor arrives to find itself already standing
    // there as a second body that nothing is driving.
    const { state, join } = makeRoom();
    await state.storage.put(keyFor("player", "aaa"), {
      pos: [0, 0, 0],
      yaw: 0,
      action: "idle",
      character: "a",
      ts: NOW,
    });
    const ws = await join("aaa");
    const snapshot = ws.framesOf("snapshot")[0];
    expect(snapshot?.["actors"]).toEqual([]);
  });

  it("shows a newcomer who was here recently", async () => {
    const { state, join } = makeRoom();
    await state.storage.put(keyFor("player", "aaa"), {
      pos: [4, 0, 5],
      yaw: 1,
      action: "idle",
      character: "a",
      ts: NOW - 1000,
    });
    const ws = await join("bbb");
    expect(ws.framesOf("snapshot")[0]?.["actors"]).toEqual([
      { id: "aaa", kind: "visitor", pos: [4, 0, 5], yaw: 1, action: "idle", character: "a" },
    ]);
  });

  it("leaves records in other namespaces alone while sweeping", async () => {
    const { state, join } = makeRoom();
    await state.storage.put(keyFor("sim", "weather"), { kind: "rain" });
    await state.storage.put(keyFor("player", "old"), { pos: [0, 0, 0], ts: NOW - 999_999 });
    await join("bbb");
    expect(state.storage.entries.has(keyFor("sim", "weather"))).toBe(true);
    expect(state.storage.entries.has(keyFor("player", "old"))).toBe(false);
  });
});

describe("webSocketMessage", () => {
  it("stamps a frame with the sender's identity", async () => {
    const { join, say } = makeRoom();
    const sender = await join("aaa");
    const peer = await join("bbb");
    say(sender, STATE_FRAME);
    const relayed = peer.framesOf("state")[0];
    expect(relayed?.["id"]).toBe("aaa");
    expect(relayed?.["pos"]).toEqual([1, 2, 3]);
  });

  it("does not let a client speak as a peer", async () => {
    // The property the whole design rests on. It used to hold only because
    // `{...payload, id}` happened to spread in the right order.
    const { join, say } = makeRoom();
    const sender = await join("aaa");
    const peer = await join("bbb");
    say(sender, JSON.stringify({ ...JSON.parse(STATE_FRAME), id: "bbb" }));
    expect(peer.framesOf("state")[0]?.["id"]).toBe("aaa");
  });

  it("does not let a client speak as an agent", async () => {
    const { join, say } = makeRoom();
    const sender = await join("aaa");
    const peer = await join("bbb");
    say(sender, JSON.stringify({ type: "chat", id: "a-flora", username: "flora", text: "hi" }));
    const chat = peer.framesOf("chat")[0];
    expect(chat?.["id"]).toBe("aaa");
    expect(chat?.["kind"]).toBeUndefined();
  });

  it("never echoes a frame back to its sender", async () => {
    const { join, say } = makeRoom();
    const sender = await join("aaa");
    await join("bbb");
    say(sender, STATE_FRAME);
    expect(sender.framesOf("state")).toEqual([]);
  });

  it("answers a ping with the world's clock", async () => {
    const { join, say } = makeRoom();
    const ws = await join("aaa");
    say(ws, JSON.stringify({ type: "ping", t: 42 }));
    expect(ws.framesOf("pong")[0]).toEqual({ type: "pong", t: 42, s: NOW });
  });

  it("does not broadcast a ping", async () => {
    const { join, say } = makeRoom();
    const sender = await join("aaa");
    const peer = await join("bbb");
    say(sender, JSON.stringify({ type: "ping", t: 42 }));
    expect(peer.framesOf("pong")).toEqual([]);
    expect(peer.framesOf("ping")).toEqual([]);
  });

  it("drops a malformed frame without disturbing the room", async () => {
    const { join, say } = makeRoom();
    const sender = await join("aaa");
    const peer = await join("bbb");
    const before = peer.sent.length;
    for (const raw of ["{not json", "[1,2,3]", '{"type":"admin"}', '{"type":"state"}']) {
      expect(() => say(sender, raw)).not.toThrow();
    }
    expect(peer.sent.length).toBe(before);
  });

  it("persists a sender's transform under its own key", async () => {
    const { state, join, say } = makeRoom();
    const sender = await join("aaa");
    say(sender, STATE_FRAME);
    expect(state.storage.entries.get(keyFor("player", "aaa"))).toMatchObject({
      pos: [1, 2, 3],
      ts: NOW,
    });
  });

  it("throttles writes rather than writing every frame", async () => {
    const { state, join, say } = makeRoom();
    const sender = await join("aaa");
    say(sender, STATE_FRAME);
    vi.setSystemTime(NOW + 50);
    say(sender, JSON.stringify({ ...JSON.parse(STATE_FRAME), pos: [9, 9, 9] }));
    expect(state.storage.entries.get(keyFor("player", "aaa"))).toMatchObject({ pos: [1, 2, 3] });
    vi.setSystemTime(NOW + 1200);
    say(sender, JSON.stringify({ ...JSON.parse(STATE_FRAME), pos: [9, 9, 9] }));
    expect(state.storage.entries.get(keyFor("player", "aaa"))).toMatchObject({ pos: [9, 9, 9] });
  });

  it("closes a connection that will not stop", async () => {
    const { join, say } = makeRoom();
    const sender = await join("aaa");
    for (let i = 0; i < 200 && sender.closed === null; i += 1) say(sender, STATE_FRAME);
    expect(sender.closed?.code).toBe(1008);
  });

  it("keeps serving the room after closing one connection", async () => {
    const { join, say } = makeRoom();
    const flooder = await join("aaa");
    const peer = await join("bbb");
    for (let i = 0; i < 200 && flooder.closed === null; i += 1) say(flooder, STATE_FRAME);
    const quiet = await join("ccc");
    expect(quiet.framesOf("hello")).toHaveLength(1);
    expect(peer.closed).toBeNull();
  });
});

describe("departure", () => {
  it("tells the room when someone leaves", async () => {
    const { room, state, join } = makeRoom();
    const leaver = await join("aaa");
    const peer = await join("bbb");
    room.webSocketClose(leaver as unknown as WebSocket);
    state.forget(leaver);
    expect(peer.framesOf("leave").map((f) => f["id"])).toEqual(["aaa"]);
  });

  it("reports a broken connection the same as a clean one", async () => {
    // A visitor whose network died is gone. Distinguishing the two would
    // leave a motionless body standing in the world.
    const { room, state, join } = makeRoom();
    const leaver = await join("aaa");
    const peer = await join("bbb");
    room.webSocketError(leaver as unknown as WebSocket);
    state.forget(leaver);
    expect(peer.framesOf("leave").map((f) => f["id"])).toEqual(["aaa"]);
  });
});
