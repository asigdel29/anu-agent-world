/**
 * What the world is allowed to spend, checked before a call and recorded
 * after it.
 *
 * The failure this exists to prevent is not a large bill but a *surprising*
 * one. A world that runs unattended, wakes on a timer, and calls a model has
 * no natural ceiling: a retry loop, a busy day, or an agent that finds a
 * reason to think for a long time all cost money at a rate nobody is
 * watching. So the rule is deliberately blunt — **prefer a world that goes
 * quiet over a bill you did not expect** — and going quiet is safe precisely
 * because every agent falls back to a scripted routine that looks the same.
 *
 * Two gates rather than one, because they catch different things. The
 * pre-flight gate refuses work whose *estimated* cost would breach the cap,
 * which stops a burst before it starts. The post-flight ledger records what
 * was *actually* spent, which is the only number that matters and is always
 * different from the estimate. Estimating alone would drift; recording alone
 * would notice too late.
 */

/** What a model charges, per million tokens. */
export interface Rates {
  readonly inputPerMillion: number;
  readonly cachedInputPerMillion: number;
  readonly outputPerMillion: number;
}

/**
 * Published rates for the pinned model.
 *
 * Cached input is a quarter of fresh input, which is what makes a stable
 * system prefix worth caring about: the persona and tool list are re-sent on
 * every call and would otherwise be the largest line on the bill.
 */
export const GLM_RATES: Rates = {
  inputPerMillion: 1.45,
  cachedInputPerMillion: 0.3625,
  outputPerMillion: 4.5,
};

/** What one call consumed, as the provider reported it. */
export interface Usage {
  readonly promptTokens: number;
  readonly cachedTokens: number;
  readonly completionTokens: number;
}

export interface Ledger {
  /** Start of the hour this ledger covers. */
  readonly windowStart: number;
  readonly spentUsd: number;
  readonly calls: number;
  /** Set once the cap has been breached, and never cleared automatically. */
  readonly killed: boolean;
}

export interface Limits {
  /** Most that may be spent within one window. */
  readonly hourlyUsd: number;
  /** Length of a window. */
  readonly windowMs: number;
  /** Most calls one wake may make, whatever they cost. */
  readonly callsPerWake: number;
}

export const DEFAULT_LIMITS: Limits = {
  hourlyUsd: 0.5,
  windowMs: 60 * 60_000,
  callsPerWake: 2,
};

export function createLedger(now: number): Ledger {
  return { windowStart: now, spentUsd: 0, calls: 0, killed: false };
}

/**
 * What a call cost.
 *
 * Cached tokens are charged at the cached rate and are *not* also charged as
 * fresh input — the provider reports them as a subset of the prompt, so
 * counting both would overstate every cached call and make the cache look
 * worthless.
 */
export function costOf(usage: Usage, rates: Rates = GLM_RATES): number {
  const cached = Math.max(0, Math.min(usage.cachedTokens, usage.promptTokens));
  const fresh = Math.max(0, usage.promptTokens - cached);
  return (
    (fresh * rates.inputPerMillion) / 1e6 +
    (cached * rates.cachedInputPerMillion) / 1e6 +
    (Math.max(0, usage.completionTokens) * rates.outputPerMillion) / 1e6
  );
}

/**
 * Roll the window forward if it has expired.
 *
 * The kill switch deliberately survives the roll. A world that spent its way
 * past the cap should stay quiet until somebody has looked at why, rather
 * than resuming by itself on the hour and spending again.
 */
export function rollWindow(ledger: Ledger, now: number, limits: Limits = DEFAULT_LIMITS): Ledger {
  if (now - ledger.windowStart < limits.windowMs) return ledger;
  return { windowStart: now, spentUsd: 0, calls: 0, killed: ledger.killed };
}

export interface Decision {
  readonly ledger: Ledger;
  readonly allowed: boolean;
  readonly reason: string | null;
}

/**
 * Whether a call may be made, given what it is expected to cost.
 *
 * The estimate is charged against the cap but not against the ledger: only
 * what was actually spent is recorded, and pre-charging an estimate would
 * make the ledger a work of fiction.
 */
export function canSpend(
  ledger: Ledger,
  estimateUsd: number,
  callsThisWake: number,
  now: number,
  limits: Limits = DEFAULT_LIMITS,
): Decision {
  const rolled = rollWindow(ledger, now, limits);

  if (rolled.killed) {
    return { ledger: rolled, allowed: false, reason: "spending is switched off" };
  }
  if (callsThisWake >= limits.callsPerWake) {
    return { ledger: rolled, allowed: false, reason: "call budget for this wake is used up" };
  }
  // Reaching the cap is itself disqualifying, separately from what the next
  // call is expected to cost. Testing only the sum lets a call estimated at
  // nothing through on a window that has already spent everything — and an
  // estimate of nothing is exactly what a caller with no idea would pass.
  if (rolled.spentUsd >= limits.hourlyUsd) {
    return { ledger: rolled, allowed: false, reason: "hourly budget is spent" };
  }
  if (rolled.spentUsd + Math.max(0, estimateUsd) > limits.hourlyUsd) {
    return { ledger: rolled, allowed: false, reason: "hourly budget would be exceeded" };
  }
  return { ledger: rolled, allowed: true, reason: null };
}

/**
 * Record what a call actually cost, switching spending off if that took the
 * window past its cap.
 *
 * The switch is thrown here rather than only in the gate because an estimate
 * can be wrong in the expensive direction — a model that thought for far
 * longer than expected has already spent the money, and the next call is the
 * one worth stopping.
 */
export function record(
  ledger: Ledger,
  usage: Usage,
  now: number,
  limits: Limits = DEFAULT_LIMITS,
  rates: Rates = GLM_RATES,
): Ledger {
  const rolled = rollWindow(ledger, now, limits);
  const spentUsd = rolled.spentUsd + costOf(usage, rates);
  return {
    windowStart: rolled.windowStart,
    spentUsd,
    calls: rolled.calls + 1,
    killed: rolled.killed || spentUsd >= limits.hourlyUsd,
  };
}

/** Turn spending back on, which is deliberately a human act. */
export function revive(ledger: Ledger, now: number): Ledger {
  return { windowStart: now, spentUsd: 0, calls: 0, killed: false };
}
