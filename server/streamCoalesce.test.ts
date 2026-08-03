import { describe, expect, it } from "vitest";

import {
  FLUSH_AFTER_CHARS,
  FLUSH_AFTER_MS,
  assembleCalls,
  createCoalescer,
  flush,
  parseEvent,
  push,
  splitEvents,
} from "./streamCoalesce";

const NOW = 1_750_000_000_000;

const contentEvent = (text: string) =>
  JSON.stringify({ choices: [{ delta: { content: text }, index: 0 }] });

/** A whole response, as the provider would send it down the wire. */
function wire(...events: string[]): string {
  return events.map((e) => `data: ${e}\n\n`).join("");
}

describe("parseEvent", () => {
  it("reads a content delta", () => {
    expect(parseEvent(contentEvent("hello"))?.content).toBe("hello");
  });

  it("returns null for the terminator and for keep-alives", () => {
    expect(parseEvent("[DONE]")).toBeNull();
    expect(parseEvent(" [DONE] ")).toBeNull();
    expect(parseEvent("")).toBeNull();
    expect(parseEvent("   ")).toBeNull();
  });

  it("returns null rather than throwing on malformed JSON", () => {
    // A provider that sends a bad frame should cost one fragment of speech,
    // not the whole turn -- and certainly not a throw inside an alarm that
    // Cloudflare will retry and re-bill.
    expect(parseEvent("{not json")).toBeNull();
    expect(parseEvent("null")).toBeNull();
    expect(parseEvent("[1,2,3]")).toBeNull();
  });

  it("survives a frame with no choices at all", () => {
    expect(parseEvent(JSON.stringify({}))?.content).toBe("");
    expect(parseEvent(JSON.stringify({ choices: [] }))?.content).toBe("");
  });

  it("reads the finish reason", () => {
    const event = JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] });
    expect(parseEvent(event)?.finish).toBe("stop");
  });

  it("reads usage, including the cached subset", () => {
    const event = JSON.stringify({
      choices: [{ delta: {} }],
      usage: {
        prompt_tokens: 1500,
        completion_tokens: 120,
        prompt_tokens_details: { cached_tokens: 1200 },
      },
    });
    expect(parseEvent(event)?.usage).toEqual({
      promptTokens: 1500,
      cachedTokens: 1200,
      completionTokens: 120,
    });
  });

  it("treats a missing cached count as none rather than as undefined", () => {
    const event = JSON.stringify({
      choices: [{ delta: {} }],
      usage: { prompt_tokens: 100, completion_tokens: 10 },
    });
    expect(parseEvent(event)?.usage?.cachedTokens).toBe(0);
  });

  it("reads a tool-call fragment", () => {
    const event = JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: [
              { index: 0, id: "call_1", function: { name: "place", arguments: '{"kind"' } },
            ],
          },
        },
      ],
    });
    expect(parseEvent(event)?.toolCalls[0]).toEqual({
      index: 0,
      id: "call_1",
      name: "place",
      argumentsFragment: '{"kind"',
    });
  });
});

describe("splitEvents", () => {
  it("finds complete events and keeps the remainder", () => {
    // The remainder is the point: a chunk boundary falls wherever the network
    // put it, routinely mid-JSON.
    const { events, rest } = splitEvents(`data: ${contentEvent("a")}\n\ndata: {"par`);
    expect(events).toHaveLength(1);
    expect(rest).toBe('data: {"par');
  });

  it("reassembles a payload split across chunks", () => {
    const whole = wire(contentEvent("hello"));
    let buffer = "";
    const seen: string[] = [];
    // One byte at a time, which is the worst case and the one that finds bugs.
    for (const ch of whole) {
      buffer += ch;
      const { events, rest } = splitEvents(buffer);
      buffer = rest;
      for (const event of events) {
        const delta = parseEvent(event);
        if (delta) seen.push(delta.content);
      }
    }
    expect(seen.join("")).toBe("hello");
  });

  it("returns nothing when no event has completed", () => {
    const { events, rest } = splitEvents("data: {partial");
    expect(events).toEqual([]);
    expect(rest).toBe("data: {partial");
  });

  it("ignores comment lines the provider uses to keep the connection warm", () => {
    const { events } = splitEvents(`: ping\n\ndata: ${contentEvent("x")}\n\n`);
    expect(events).toHaveLength(1);
  });

  it("handles several events in one chunk", () => {
    const { events } = splitEvents(wire(contentEvent("a"), contentEvent("b"), "[DONE]"));
    expect(events).toHaveLength(3);
  });
});

describe("coalescing speech", () => {
  it("says nothing until there is something worth saying", () => {
    const c = createCoalescer();
    expect(push(c, "The", NOW)).toBe("");
    expect(push(c, " terraces", NOW + 10)).toBe("");
  });

  it("speaks at the end of a sentence", () => {
    const c = createCoalescer();
    push(c, "The terraces are", NOW);
    expect(push(c, " dry.", NOW + 20)).toBe("The terraces are dry.");
  });

  it("does not flood the room with a frame per token", () => {
    // The whole reason this exists: a bubble that rewrites itself thirty
    // times a second is worse than one that appears whole.
    const c = createCoalescer();
    const tokens = "The terraces are dry and the well is low but we manage well enough here".split(
      " ",
    );
    let said = 0;
    tokens.forEach((token, i) => {
      if (push(c, `${token} `, NOW + i * 30) !== "") said += 1;
    });
    flush(c);
    expect(said).toBeLessThan(tokens.length / 3);
  });

  it("gives up waiting rather than holding a fragment", () => {
    // A model that trails off mid-clause would otherwise leave text unsaid
    // until the stream ended.
    const c = createCoalescer();
    push(c, "well", NOW);
    expect(push(c, " then", NOW + FLUSH_AFTER_MS + 1)).toBe("well then");
  });

  it("speaks a long clause that never ends", () => {
    const c = createCoalescer();
    let said = "";
    for (let i = 0; i < 40; i += 1) said = push(c, "word ", NOW + i) || said;
    expect(said.length).toBeGreaterThan(0);
    expect(said.length).toBeLessThanOrEqual(FLUSH_AFTER_CHARS + 5);
  });

  it("treats a line break as a pause", () => {
    const c = createCoalescer();
    expect(push(c, "over here\n", NOW)).toBe("over here");
  });

  it("says what is left when the stream ends", () => {
    const c = createCoalescer();
    push(c, "and then", NOW);
    expect(flush(c)).toBe("and then");
    expect(flush(c)).toBe("");
  });

  it("ignores empty deltas", () => {
    const c = createCoalescer();
    expect(push(c, "", NOW)).toBe("");
    expect(c.pending).toBe("");
  });

  it("loses no text across a whole response", () => {
    const c = createCoalescer();
    const sentence = "The terraces are dry. The well is low. We manage. ";
    const said: string[] = [];
    for (const ch of sentence) {
      const out = push(c, ch, NOW);
      if (out) said.push(out);
    }
    const tail = flush(c);
    if (tail) said.push(tail);
    expect(said.join(" ").replace(/\s+/g, " ")).toBe(sentence.trim());
  });
});

describe("assembleCalls", () => {
  it("joins fragments into one call", () => {
    const calls = assembleCalls([
      { index: 0, id: "c1", name: "place", argumentsFragment: '{"kind":' },
      { index: 0, argumentsFragment: '"crate",' },
      { index: 0, argumentsFragment: '"x":3}' },
    ]);
    expect(calls).toEqual([{ id: "c1", name: "place", argumentsJson: '{"kind":"crate","x":3}' }]);
  });

  it("keeps two calls apart when their fragments interleave", () => {
    const calls = assembleCalls([
      { index: 0, id: "a", name: "place", argumentsFragment: '{"kind":' },
      { index: 1, id: "b", name: "say", argumentsFragment: '{"text":' },
      { index: 0, argumentsFragment: '"crate"}' },
      { index: 1, argumentsFragment: '"hello"}' },
    ]);
    expect(calls.map((c) => c.name)).toEqual(["place", "say"]);
    expect(calls[0]?.argumentsJson).toBe('{"kind":"crate"}');
    expect(calls[1]?.argumentsJson).toBe('{"text":"hello"}');
  });

  it("drops a call that never received a name", () => {
    expect(assembleCalls([{ index: 0, argumentsFragment: "{}" }])).toEqual([]);
  });

  it("returns nothing for no fragments", () => {
    expect(assembleCalls([])).toEqual([]);
  });

  it("leaves truncated arguments to the caller rather than guessing", () => {
    // A connection that died mid-call yields invalid JSON. Repairing it here
    // would be inventing what the model meant to ask for.
    const calls = assembleCalls([{ index: 0, id: "c", name: "place", argumentsFragment: '{"kin' }]);
    expect(calls[0]?.argumentsJson).toBe('{"kin');
  });
});
