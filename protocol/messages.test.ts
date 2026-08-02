import { describe, expect, it } from "vitest";

import { MAX_CHAT_LENGTH, MAX_FRAME_BYTES, SEND_INTERVAL_MS } from "./limits";
import { clampText, parseFrame, readClientFrame, roomUrl, shouldSend } from "./messages";

const STATE = { type: "state", pos: [1, 2, 3], yaw: 0.5, action: "walk", character: "a" };

describe("parseFrame", () => {
  it("parses an object", () => {
    expect(parseFrame('{"type":"ping","t":1}')).toEqual({ type: "ping", t: 1 });
  });

  it("returns null for malformed JSON", () => {
    expect(parseFrame("{not json")).toBeNull();
  });

  it("returns null for a non-object", () => {
    for (const raw of ["7", '"text"', "null", "[1,2,3]"]) {
      expect(parseFrame(raw)).toBeNull();
    }
  });

  it("rejects an oversized frame without parsing it", () => {
    // Checked on the raw string, so a hostile payload is never expanded.
    const huge = `{"type":"chat","text":"${"x".repeat(MAX_FRAME_BYTES)}"}`;
    expect(parseFrame(huge)).toBeNull();
  });

  it("returns null for anything that is not a string", () => {
    expect(parseFrame(new ArrayBuffer(8))).toBeNull();
    expect(parseFrame(undefined)).toBeNull();
  });
});

describe("readClientFrame", () => {
  it("accepts a well-formed state frame", () => {
    expect(readClientFrame({ ...STATE })).toEqual(STATE);
  });

  it("rejects an unknown type", () => {
    expect(readClientFrame({ type: "admin" })).toBeNull();
    expect(readClientFrame({ type: "snapshot", actors: [] })).toBeNull();
  });

  it("rejects a frame with no type at all", () => {
    expect(readClientFrame({ pos: [0, 0, 0] })).toBeNull();
  });

  it("rejects a state frame missing a field", () => {
    for (const key of ["pos", "yaw", "action", "character"]) {
      const frame: Record<string, unknown> = { ...STATE };
      delete frame[key];
      expect(readClientFrame(frame)).toBeNull();
    }
  });

  it("rejects a position that is not three finite numbers", () => {
    for (const pos of [[1, 2], [1, 2, 3, 4], [1, 2, "3"], [1, 2, NaN], [1, 2, Infinity], "xyz"]) {
      expect(readClientFrame({ ...STATE, pos })).toBeNull();
    }
  });

  it("drops fields the client is not entitled to send", () => {
    // The relay stamps identity itself. A frame rebuilt from named fields
    // cannot smuggle one through, whatever the key order was.
    const forged = readClientFrame({ ...STATE, id: "a-flora", authority: true });
    expect(forged).not.toBeNull();
    expect(forged).not.toHaveProperty("id");
    expect(forged).not.toHaveProperty("authority");
  });

  it("caps chat text", () => {
    const frame = readClientFrame({ type: "chat", username: "anu", text: "x".repeat(500) });
    expect(frame).toEqual({ type: "chat", username: "anu", text: "x".repeat(MAX_CHAT_LENGTH) });
  });

  it("rejects an empty chat frame", () => {
    expect(readClientFrame({ type: "chat", username: "anu", text: "" })).toBeNull();
    expect(readClientFrame({ type: "chat", username: "anu", text: 7 })).toBeNull();
  });

  it("tolerates a missing username", () => {
    expect(readClientFrame({ type: "chat", text: "hello" })).toEqual({
      type: "chat",
      username: "",
      text: "hello",
    });
  });

  it("accepts a ping and rejects one without a timestamp", () => {
    expect(readClientFrame({ type: "ping", t: 42 })).toEqual({ type: "ping", t: 42 });
    expect(readClientFrame({ type: "ping" })).toBeNull();
    expect(readClientFrame({ type: "ping", t: "42" })).toBeNull();
  });

  it("survives arbitrary shapes without throwing", () => {
    const shapes: unknown[] = [
      { type: "state", pos: { 0: 1, 1: 2, 2: 3 } },
      { type: "chat", text: { toString: () => "x" } },
      { type: {} },
      { type: "state", pos: [1, 2, 3], yaw: 0, action: {}, character: [] },
    ];
    for (const shape of shapes) {
      expect(() => readClientFrame(shape as Record<string, unknown>)).not.toThrow();
    }
  });
});

describe("clampText", () => {
  it("caps and coerces", () => {
    expect(clampText("abcdef", 3)).toBe("abc");
    expect(clampText(7, 3)).toBe("");
    expect(clampText(null, 3)).toBe("");
  });
});

describe("roomUrl", () => {
  it("returns null with no host, so the client runs solo", () => {
    expect(roomUrl(undefined)).toBeNull();
    expect(roomUrl("")).toBeNull();
  });

  it("uses the insecure scheme only for a local relay", () => {
    expect(roomUrl("localhost:8787")).toBe("ws://localhost:8787/party/world");
    expect(roomUrl("127.0.0.1:8787")).toBe("ws://127.0.0.1:8787/party/world");
    expect(roomUrl("relay.example.workers.dev")).toBe("wss://relay.example.workers.dev/party/world");
  });

  it("carries a sanitised identifier", () => {
    expect(roomUrl("h", "AB-cd")).toBe("wss://h/party/world?pid=ab-cd");
  });

  it("omits the parameter when nothing usable remains", () => {
    expect(roomUrl("h", "!!!")).toBe("wss://h/party/world");
  });
});

describe("shouldSend", () => {
  it("gates on the interval", () => {
    expect(shouldSend(1000, 900, SEND_INTERVAL_MS)).toBe(true);
    expect(shouldSend(999, 900, SEND_INTERVAL_MS)).toBe(false);
  });

  it("sends immediately when nothing has been sent yet", () => {
    expect(shouldSend(0, -Infinity, SEND_INTERVAL_MS)).toBe(true);
  });
});
