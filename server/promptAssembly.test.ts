import { describe, expect, it } from "vitest";

import type { Persona, Situation } from "./promptAssembly";
import { assemble, quoteVisitor, systemBlock, volatileFragments } from "./promptAssembly";

const FLORA: Persona = {
  name: "Flora",
  character: "A gardener who has lived on this island since it was raised.",
  purpose: "You tend the terraces and talk to whoever passes.",
};

const TOOLS = ["look_around", "say", "walk_to"];

const SITUATION: Situation = {
  timeOfDay: "early evening",
  weather: "clear",
  occupants: 1,
  place: "the upper terrace",
};

describe("systemBlock", () => {
  it("names the agent and its tools", () => {
    const block = systemBlock(FLORA, TOOLS);
    expect(block).toContain("Flora");
    expect(block).toContain("look_around");
  });

  it("is byte-identical across calls", () => {
    // The whole cost model depends on this. If two calls for one agent
    // produce different prefixes, the cache never warms.
    expect(systemBlock(FLORA, TOOLS)).toBe(systemBlock(FLORA, TOOLS));
  });

  it("does not depend on the order tools were listed", () => {
    // A tool registry that iterates a map would otherwise reorder between
    // deploys and silently cost four times as much.
    expect(systemBlock(FLORA, ["say", "walk_to", "look_around"])).toBe(systemBlock(FLORA, TOOLS));
  });

  it("says so when there are no tools", () => {
    expect(systemBlock(FLORA, [])).toContain("no tools");
  });
});

describe("the cache prefix", () => {
  it("carries nothing that changes between calls", () => {
    // The mistake this guards against is invisible: everything still works,
    // the bill is just several times larger.
    const { messages, cacheBreak } = assemble({
      persona: FLORA,
      toolNames: TOOLS,
      situation: SITUATION,
      question: "what do you grow here?",
    });
    const prefix = messages.slice(0, cacheBreak).map((m) => m.content).join("\n");
    expect(volatileFragments(prefix)).toEqual([]);
  });

  it("is identical whatever the moment", () => {
    const morning = assemble({ persona: FLORA, toolNames: TOOLS, situation: SITUATION });
    const storm = assemble({
      persona: FLORA,
      toolNames: TOOLS,
      situation: { timeOfDay: "midnight", weather: "storm", occupants: 9, place: "the pier" },
      memories: ["somebody asked about the terraces"],
      question: "hello?",
    });
    expect(morning.messages.slice(0, morning.cacheBreak)).toEqual(
      storm.messages.slice(0, storm.cacheBreak),
    );
  });

  it("puts the whole persona and tool list inside it", () => {
    // Splitting by volatility rather than by topic is what makes the prefix
    // worth caching: everything durable must be before the break.
    const { messages, cacheBreak } = assemble({
      persona: FLORA,
      toolNames: TOOLS,
      situation: SITUATION,
    });
    const prefix = messages.slice(0, cacheBreak).map((m) => m.content).join("\n");
    for (const tool of TOOLS) expect(prefix).toContain(tool);
    expect(prefix).toContain(FLORA.character);
  });

  it("begins with the system role", () => {
    const { messages } = assemble({ persona: FLORA, toolNames: TOOLS, situation: SITUATION });
    expect(messages[0]?.role).toBe("system");
  });
});

describe("assemble", () => {
  it("puts the situation after the break", () => {
    const { messages, cacheBreak } = assemble({
      persona: FLORA,
      toolNames: TOOLS,
      situation: SITUATION,
    });
    const suffix = messages.slice(cacheBreak).map((m) => m.content).join("\n");
    expect(suffix).toContain("early evening");
    expect(suffix).toContain("clear");
    expect(suffix).toContain("the upper terrace");
  });

  it("counts company in words rather than as a number alone", () => {
    const alone = assemble({
      persona: FLORA,
      toolNames: TOOLS,
      situation: { ...SITUATION, occupants: 0 },
    });
    expect(alone.messages.at(-1)?.content).toContain("alone");
    const crowd = assemble({
      persona: FLORA,
      toolNames: TOOLS,
      situation: { ...SITUATION, occupants: 4 },
    });
    expect(crowd.messages.at(-1)?.content).toContain("4 people");
  });

  it("omits the question when nobody asked one", () => {
    const ambient = assemble({ persona: FLORA, toolNames: TOOLS, situation: SITUATION });
    expect(ambient.messages).toHaveLength(2);
  });

  it("includes a visitor's question as their own words", () => {
    const asked = assemble({
      persona: FLORA,
      toolNames: TOOLS,
      situation: SITUATION,
      question: "what do you grow here?",
    });
    expect(asked.messages.at(-1)?.content).toContain("what do you grow here?");
    expect(asked.messages.at(-1)?.content).toContain("visitor");
  });

  it("includes memories, and drops empty ones", () => {
    const withMemory = assemble({
      persona: FLORA,
      toolNames: TOOLS,
      situation: SITUATION,
      memories: ["the pier flooded last week", "", "   "],
    });
    const body = withMemory.messages.map((m) => m.content).join("\n");
    expect(body).toContain("the pier flooded last week");
    expect(body.match(/- /g)).toHaveLength(1);
  });
});

describe("quoteVisitor", () => {
  it("caps length", () => {
    expect(quoteVisitor("x".repeat(1000)).length).toBeLessThanOrEqual(120);
  });

  it("returns nothing for anything that is not a string", () => {
    for (const value of [null, undefined, 7, {}, []]) expect(quoteVisitor(value)).toBe("");
  });

  it("strips control characters", () => {
    // Written as escapes rather than as literal bytes: a control character
    // embedded in a source file is invisible to a reviewer and easily mangled
    // by whatever touches the file next.
    expect(quoteVisitor("hello\u0000\u001bworld")).toBe("helloworld");
  });

  it("keeps the spaces between words", () => {
    // The neighbouring check: a strip that reached one code point further
    // would silently run every visitor's words together, and the control
    // character test alone would not notice.
    expect(quoteVisitor("hello world")).toBe("hello world");
    expect(quoteVisitor("  padded  ")).toBe("padded");
  });

  it("keeps ordinary punctuation and other languages", () => {
    expect(quoteVisitor("¿qué cultivas aquí?")).toBe("¿qué cultivas aquí?");
  });
});

describe("volatileFragments", () => {
  it("finds a timestamp", () => {
    expect(volatileFragments("as of 1750000000000 you are here")).toContain("1750000000000");
  });

  it("finds a clock time and a date", () => {
    expect(volatileFragments("it is 19:45")).toContain("19:45");
    expect(volatileFragments("on 2026-08-02")).toContain("2026-08-02");
  });

  it("passes ordinary prose", () => {
    expect(volatileFragments(systemBlock(FLORA, TOOLS))).toEqual([]);
  });

  it("is not confused by small numbers", () => {
    expect(volatileFragments("you have 3 terraces and 12 beds")).toEqual([]);
  });
});
