import { describe, expect, it } from "vitest";

import type { WorldEvent } from "./visitDiff";
import { greeting, summarise, surviving } from "./visitDiff";

const NOW = 1_750_000_000_000;
const HOUR = 60 * 60_000;

const event = (
  kind: WorldEvent["kind"],
  actorId: string,
  subject: string,
  detail?: string,
): WorldEvent => ({ kind, at: NOW, actorId, subject, ...(detail ? { detail } : {}) });

describe("surviving", () => {
  it("keeps what is still there", () => {
    const events = [event("built", "a-flora", "p1")];
    expect(surviving(events)).toHaveLength(1);
  });

  it("drops what was built and removed again while away", () => {
    // The visitor would have seen neither. Reporting both is a diff of the
    // log rather than of the world.
    const events = [event("built", "a-flora", "p1"), event("removed", "a-flora", "p1")];
    expect(surviving(events)).toEqual([]);
  });

  it("keeps the removal of something that was there before", () => {
    // This is real news: the visitor knew that object.
    const events = [event("removed", "a-mason", "old-bench")];
    expect(surviving(events)).toHaveLength(1);
  });

  it("keeps unrelated events either side of a cancelled pair", () => {
    const events = [
      event("built", "a-flora", "p1"),
      event("said", "a-flora", "s1", "the well is low"),
      event("removed", "a-flora", "p1"),
    ];
    expect(surviving(events).map((e) => e.kind)).toEqual(["said"]);
  });
});

describe("summarise", () => {
  it("says nothing about nothing", () => {
    expect(summarise([])).toEqual([]);
  });

  it("groups repeated work by its actor", () => {
    // "Flora built three things" is what happened; three lines is merely what
    // was recorded.
    const events = ["p1", "p2", "p3"].map((id) => event("built", "a-flora", id));
    const lines = summarise(events);
    expect(lines).toHaveLength(1);
    expect(lines[0]?.text).toBe("flora built 3 things");
  });

  it("counts one thing as one thing", () => {
    expect(summarise([event("built", "a-flora", "p1")])[0]?.text).toBe("flora built 1 thing");
  });

  it("keeps different actors apart", () => {
    const lines = summarise([
      event("built", "a-flora", "p1"),
      event("built", "a-mason", "p2"),
    ]);
    expect(lines).toHaveLength(2);
  });

  it("ranks buildings above passers-by", () => {
    // What a person notices first standing in the world.
    const events = [
      ...Array.from({ length: 30 }, (_, i) => event("visited", `v${i}`, `v${i}`)),
      event("built", "a-flora", "p1"),
    ];
    expect(summarise(events)[0]?.kind).toBe("built");
  });

  it("does not let a crowd outrank a building however large", () => {
    const events = [
      ...Array.from({ length: 500 }, (_, i) => event("visited", "v", `v${i}`)),
      event("built", "a-flora", "p1"),
    ];
    const lines = summarise(events);
    expect(lines[0]?.kind).toBe("built");
  });

  it("keeps only the few lines worth reading", () => {
    const events: WorldEvent[] = [];
    for (let i = 0; i < 12; i += 1) events.push(event("built", `a-${i}`, `p${i}`));
    expect(summarise(events)).toHaveLength(4);
    expect(summarise(events, 2)).toHaveLength(2);
  });

  it("quotes what was said when it has the words", () => {
    const line = summarise([event("said", "a-flora", "s1", "the well is low")])[0];
    expect(line?.text).toContain("the well is low");
  });

  it("still says something when it has no words", () => {
    const line = summarise([event("said", "a-flora", "s1")])[0];
    expect(line?.text).toContain("something to say");
  });

  it("drops the agent prefix, which is plumbing", () => {
    expect(summarise([event("built", "a-flora", "p1")])[0]?.text).not.toContain("a-");
  });

  it("names the weather rather than the beat", () => {
    const line = summarise([event("beat", "a-director", "b1", "rain")])[0];
    expect(line?.text).toBe("the weather turned to rain");
  });
});

describe("greeting", () => {
  it("says nothing when nothing happened", () => {
    // A world that greets every arrival with "nothing has changed" is worse
    // than one that greets them with silence: it draws attention to the
    // emptiness.
    expect(greeting([], 5 * HOUR)).toBe("");
  });

  it("says nothing when everything cancelled out", () => {
    const events = [event("built", "a-flora", "p1"), event("removed", "a-flora", "p1")];
    expect(greeting(events, 5 * HOUR)).toBe("");
  });

  it("reads as a sentence", () => {
    const events = [
      event("built", "a-flora", "p1"),
      event("built", "a-flora", "p2"),
      event("beat", "a-director", "b1", "fog"),
    ];
    const text = greeting(events, 3 * HOUR);
    expect(text).toBe("In the 3 hours you were away: flora built 2 things, the weather turned to fog.");
  });

  it("scales the phrasing to the absence", () => {
    const events = [event("built", "a-flora", "p1")];
    expect(greeting(events, 20 * 60_000)).toContain("While you were away");
    expect(greeting(events, 4 * HOUR)).toContain("4 hours");
    expect(greeting(events, 72 * HOUR)).toContain("3 days");
  });

  it("survives an absence of no time at all", () => {
    expect(greeting([event("built", "a-flora", "p1")], 0)).toContain("While you were away");
  });
});
