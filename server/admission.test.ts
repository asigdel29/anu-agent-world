import { describe, expect, it } from "vitest";

import type { Budget, Policy } from "./admission";
import {
  DEFAULT_POLICY,
  admit,
  isAllowedOrigin,
  openBudget,
  parseAllowlist,
} from "./admission";

const NOW = 1_750_000_000_000;

/** Send `count` frames of one type back to back, returning the last verdict. */
function burst(budget: Budget, type: string, count: number, at = NOW, policy?: Policy) {
  let current = budget;
  let verdict = "allow";
  for (let i = 0; i < count; i += 1) {
    const result = admit(current, type, at, policy);
    current = result.budget;
    verdict = result.verdict;
  }
  return { budget: current, verdict };
}

describe("admit", () => {
  it("lets an ordinary state cadence through indefinitely", () => {
    // Ten frames a second is the design cadence, not an abuse of it.
    let budget = openBudget(NOW);
    for (let i = 0; i < 600; i += 1) {
      const result = admit(budget, "state", NOW + i * 100);
      expect(result.verdict).toBe("allow");
      budget = result.budget;
    }
  });

  it("admits a new connection immediately", () => {
    // A newcomer that had to wait to be heard would look like a broken world.
    expect(admit(openBudget(NOW), "state", NOW).verdict).toBe("allow");
  });

  it("drops a burst that outruns the bucket", () => {
    const { verdict } = burst(openBudget(NOW), "state", DEFAULT_POLICY.capacity + 1);
    expect(verdict).toBe("drop");
  });

  it("prices chat far above movement", () => {
    // A chat frame reaches every occupant's attention; a state frame moves a
    // model. They are not the same event and must not cost the same.
    const chat = DEFAULT_POLICY.cost["chat"] ?? 0;
    const state = DEFAULT_POLICY.cost["state"] ?? 0;
    expect(chat).toBeGreaterThan(state * 4);
  });

  it("refills over time", () => {
    const drained = burst(openBudget(NOW), "state", DEFAULT_POLICY.capacity).budget;
    expect(admit(drained, "state", NOW).verdict).toBe("drop");
    expect(admit(drained, "state", NOW + 1000).verdict).toBe("allow");
  });

  it("never refills beyond the burst allowance", () => {
    // An hour of silence must not buy an hour of flooding.
    const idle = admit(openBudget(NOW), "state", NOW + 3_600_000);
    expect(idle.budget.tokens).toBeLessThanOrEqual(DEFAULT_POLICY.capacity);
  });

  it("closes a connection that keeps overrunning", () => {
    const { verdict } = burst(
      openBudget(NOW),
      "state",
      DEFAULT_POLICY.capacity + DEFAULT_POLICY.strikeLimit,
    );
    expect(verdict).toBe("close");
  });

  it("forgives a client that recovers", () => {
    // A bad network and a bad actor produce the same number of refusals over
    // a minute. Only one produces them consecutively, which is why strikes
    // are counted rather than refusals.
    const drained = burst(openBudget(NOW), "state", DEFAULT_POLICY.capacity + 5).budget;
    expect(drained.strikes).toBeGreaterThan(0);
    const recovered = admit(drained, "state", NOW + 2000);
    expect(recovered.verdict).toBe("allow");
    expect(recovered.budget.strikes).toBe(0);
  });

  it("charges an unknown frame type at the default price", () => {
    // Garbage must not be the cheapest way to flood a room.
    const { verdict } = burst(openBudget(NOW), "unknown", 20);
    expect(verdict).not.toBe("allow");
  });

  it("does not let a clock that runs backwards mint tokens", () => {
    const drained = burst(openBudget(NOW), "state", DEFAULT_POLICY.capacity).budget;
    expect(admit(drained, "state", NOW - 60_000).verdict).toBe("drop");
  });

  it("honours a policy passed in", () => {
    const strict: Policy = { ...DEFAULT_POLICY, capacity: 2, strikeLimit: 1 };
    expect(burst(openBudget(NOW), "state", 3, NOW, strict).verdict).toBe("close");
  });
});

describe("isAllowedOrigin", () => {
  it("permits everything when no allowlist is configured", () => {
    // Deliberate: local development and every non-browser client need this.
    expect(isAllowedOrigin(null, [])).toBe(true);
    expect(isAllowedOrigin("https://elsewhere.example", [])).toBe(true);
  });

  it("permits a listed origin and refuses the rest", () => {
    const list = ["https://world.example"];
    expect(isAllowedOrigin("https://world.example", list)).toBe(true);
    expect(isAllowedOrigin("https://world.example.evil", list)).toBe(false);
    expect(isAllowedOrigin("https://evil/https://world.example", list)).toBe(false);
    expect(isAllowedOrigin(null, list)).toBe(false);
  });
});

describe("parseAllowlist", () => {
  it("reads a comma-separated variable", () => {
    expect(parseAllowlist("https://a.example, https://b.example")).toEqual([
      "https://a.example",
      "https://b.example",
    ]);
  });

  it("treats absent and empty as no allowlist", () => {
    expect(parseAllowlist(undefined)).toEqual([]);
    expect(parseAllowlist("")).toEqual([]);
    expect(parseAllowlist(" , ")).toEqual([]);
  });
});
