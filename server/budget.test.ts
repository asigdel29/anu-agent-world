import { describe, expect, it } from "vitest";

import {
  DEFAULT_LIMITS,
  GLM_RATES,
  canSpend,
  costOf,
  createLedger,
  record,
  revive,
  rollWindow,
} from "./budget";

const NOW = 1_750_000_000_000;
const HOUR = 60 * 60_000;

const usage = (prompt: number, cached: number, completion: number) => ({
  promptTokens: prompt,
  cachedTokens: cached,
  completionTokens: completion,
});

describe("costOf", () => {
  it("charges nothing for nothing", () => {
    expect(costOf(usage(0, 0, 0))).toBe(0);
  });

  it("charges input and output at their own rates", () => {
    const cost = costOf(usage(1_000_000, 0, 1_000_000));
    expect(cost).toBeCloseTo(GLM_RATES.inputPerMillion + GLM_RATES.outputPerMillion, 9);
  });

  it("does not charge a cached token twice", () => {
    // The provider reports cached tokens as a subset of the prompt. Charging
    // them as fresh input as well would overstate every cached call and make
    // the cache look worthless.
    const cost = costOf(usage(1_000_000, 1_000_000, 0));
    expect(cost).toBeCloseTo(GLM_RATES.cachedInputPerMillion, 9);
  });

  it("makes a cached prefix substantially cheaper", () => {
    const cold = costOf(usage(4000, 0, 150));
    const warm = costOf(usage(4000, 3800, 150));
    expect(warm).toBeLessThan(cold * 0.6);
  });

  it("ignores impossible numbers rather than producing a negative bill", () => {
    expect(costOf(usage(100, 500, 0))).toBeGreaterThanOrEqual(0);
    expect(costOf(usage(-100, -50, -10))).toBe(0);
  });

  it("prices an ambient tick in fractions of a cent", () => {
    // The figure the whole cadence design rests on: a resident's routine must
    // be cheap enough that an occupied hour is pennies.
    const tick = costOf(usage(1500, 1200, 150));
    expect(tick).toBeLessThan(0.002);
  });
});

describe("canSpend", () => {
  it("allows a call within budget", () => {
    expect(canSpend(createLedger(NOW), 0.001, 0, NOW).allowed).toBe(true);
  });

  it("refuses once the hourly cap would be breached", () => {
    const ledger = { ...createLedger(NOW), spentUsd: DEFAULT_LIMITS.hourlyUsd - 0.001 };
    const decision = canSpend(ledger, 0.01, 0, NOW);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain("hourly");
  });

  it("refuses a third call in one wake", () => {
    const decision = canSpend(createLedger(NOW), 0.0001, DEFAULT_LIMITS.callsPerWake, NOW);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain("wake");
  });

  it("refuses everything once spending is switched off", () => {
    const killed = { ...createLedger(NOW), killed: true };
    expect(canSpend(killed, 0, 0, NOW).allowed).toBe(false);
  });

  it("does not charge the estimate to the ledger", () => {
    // Pre-charging an estimate would make the ledger a work of fiction. Only
    // what was actually spent is recorded.
    const before = createLedger(NOW);
    const after = canSpend(before, 0.2, 0, NOW).ledger;
    expect(after.spentUsd).toBe(0);
    expect(after.calls).toBe(0);
  });

  it("treats a negative estimate as free rather than as credit", () => {
    const ledger = { ...createLedger(NOW), spentUsd: DEFAULT_LIMITS.hourlyUsd * 0.9 };
    expect(canSpend(ledger, -100, 0, NOW).allowed).toBe(true);
    expect(canSpend({ ...ledger, spentUsd: DEFAULT_LIMITS.hourlyUsd }, -100, 0, NOW).allowed).toBe(
      false,
    );
  });

  it("refuses on a spent window whatever the estimate claims", () => {
    // Reaching the cap is disqualifying by itself. Testing only the sum lets
    // a call estimated at nothing through on a window that has spent
    // everything, and an estimate of nothing is exactly what a caller with no
    // idea would pass.
    const spent = { ...createLedger(NOW), spentUsd: DEFAULT_LIMITS.hourlyUsd };
    expect(canSpend(spent, 0, 0, NOW).allowed).toBe(false);
    expect(canSpend(spent, 0, 0, NOW).reason).toContain("spent");
  });
});

describe("windows", () => {
  it("keeps spending within the window", () => {
    const ledger = { ...createLedger(NOW), spentUsd: 0.3 };
    expect(rollWindow(ledger, NOW + HOUR / 2).spentUsd).toBe(0.3);
  });

  it("clears spending once the window has passed", () => {
    const ledger = { ...createLedger(NOW), spentUsd: 0.3, calls: 9 };
    const rolled = rollWindow(ledger, NOW + HOUR + 1);
    expect(rolled.spentUsd).toBe(0);
    expect(rolled.calls).toBe(0);
  });

  it("keeps the kill switch across the roll", () => {
    // A world that spent past its cap should stay quiet until somebody has
    // looked at why, rather than resuming on the hour and doing it again.
    const killed = { ...createLedger(NOW), spentUsd: 1, killed: true };
    expect(rollWindow(killed, NOW + HOUR * 5).killed).toBe(true);
  });
});

describe("record", () => {
  it("adds what a call actually cost", () => {
    const after = record(createLedger(NOW), usage(1000, 0, 100), NOW);
    expect(after.spentUsd).toBeCloseTo(costOf(usage(1000, 0, 100)), 12);
    expect(after.calls).toBe(1);
  });

  it("switches spending off when a call takes the window past its cap", () => {
    // An estimate can be wrong in the expensive direction: a model that
    // thought far longer than expected has already spent the money, and the
    // next call is the one worth stopping.
    const ledger = { ...createLedger(NOW), spentUsd: DEFAULT_LIMITS.hourlyUsd - 0.0001 };
    const after = record(ledger, usage(1_000_000, 0, 100_000), NOW);
    expect(after.killed).toBe(true);
  });

  it("leaves an ordinary call well clear of the switch", () => {
    let ledger = createLedger(NOW);
    for (let i = 0; i < 36; i += 1) ledger = record(ledger, usage(1500, 1200, 150), NOW);
    // Three residents on a five-minute cadence for an hour.
    expect(ledger.killed).toBe(false);
    expect(ledger.spentUsd).toBeLessThan(0.1);
  });

  it("goes quiet rather than running up a bill", () => {
    let ledger = createLedger(NOW);
    let allowed = 0;
    for (let i = 0; i < 5000; i += 1) {
      const decision = canSpend(ledger, 0.002, 0, NOW);
      ledger = decision.ledger;
      if (!decision.allowed) break;
      allowed += 1;
      ledger = record(ledger, usage(20_000, 0, 2000), NOW);
    }
    expect(ledger.spentUsd).toBeLessThanOrEqual(DEFAULT_LIMITS.hourlyUsd * 1.2);
    expect(allowed).toBeLessThan(5000);
  });
});

describe("revive", () => {
  it("is the only way back, and starts a fresh window", () => {
    const killed = { ...createLedger(NOW), spentUsd: 9, killed: true };
    const alive = revive(killed, NOW + 1000);
    expect(alive.killed).toBe(false);
    expect(alive.spentUsd).toBe(0);
    expect(alive.windowStart).toBe(NOW + 1000);
  });
});
