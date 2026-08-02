/**
 * What a connection is allowed to send, and what happens when it does not
 * stop.
 *
 * The relay's job is to forward one client's frames to every other client,
 * which means the cost of a frame is multiplied by the size of the room. A
 * single socket sending as fast as it can is therefore not a nuisance but a
 * denial of service against everyone present, and the room has no way to shed
 * that load once it has accepted the frame.
 *
 * So the budget is charged per frame *type*, not per byte. A state frame is
 * ordinary — clients legitimately send ten a second, and the cadence is part
 * of how the world moves. A chat frame is rare, is seen by every occupant,
 * and reaches a human's attention, so it costs much more. Pricing by what a
 * frame *does* is the only version of this that survives someone reading the
 * source.
 *
 * Pure, with the clock passed in, so every rule here is testable without a
 * socket or a timer.
 */

/** What the relay should do with a frame. */
export type Verdict =
  /** Forward it. */
  | "allow"
  /** Silently discard it; the sender is over budget but not yet hostile. */
  | "drop"
  /** Close the connection. */
  | "close";

export interface Policy {
  /** Most tokens a connection may hold, which is its burst allowance. */
  readonly capacity: number;
  /** Tokens restored per second. */
  readonly refillPerSecond: number;
  /** What each frame type costs. */
  readonly cost: Readonly<Record<string, number>>;
  /** Cost charged for a frame type with no price, which should not happen. */
  readonly defaultCost: number;
  /** Refused frames tolerated before the connection is closed. */
  readonly strikeLimit: number;
}

/**
 * The default policy.
 *
 * The capacity is a little over one second of legitimate traffic: enough to
 * absorb a tab that was backgrounded and flushed a few frames at once,
 * nowhere near enough to flood a room.
 */
export const DEFAULT_POLICY: Policy = {
  capacity: 20,
  refillPerSecond: 12,
  cost: { state: 1, ping: 1, chat: 6 },
  defaultCost: 4,
  strikeLimit: 12,
};

export interface Budget {
  readonly tokens: number;
  /** When the tokens were last brought up to date. */
  readonly updatedAt: number;
  readonly strikes: number;
}

/**
 * A connection's opening budget: full.
 *
 * Starting full rather than empty is deliberate. The first thing a client
 * does on connect is announce itself, and a new arrival that had to wait to
 * be heard would look like a broken world rather than a protected one.
 */
export function openBudget(now: number): Budget {
  return { tokens: DEFAULT_POLICY.capacity, updatedAt: now, strikes: 0 };
}

/** Bring a budget up to date without spending from it. */
function refill(budget: Budget, now: number, policy: Policy): Budget {
  const elapsed = Math.max(0, now - budget.updatedAt) / 1000;
  const tokens = Math.min(policy.capacity, budget.tokens + elapsed * policy.refillPerSecond);
  return { tokens, updatedAt: now, strikes: budget.strikes };
}

export interface Admission {
  readonly budget: Budget;
  readonly verdict: Verdict;
}

/**
 * Charge a frame against a connection's budget.
 *
 * A refused frame earns a strike and a forgiven one clears them, so a client
 * that occasionally overruns is never disconnected while one that ignores the
 * limit always is. Counting strikes rather than refusals is what separates
 * those two cases: a bad network and a bad actor produce the same number of
 * refusals over a minute, but only one produces them consecutively.
 */
export function admit(
  budget: Budget,
  frameType: string,
  now: number,
  policy: Policy = DEFAULT_POLICY,
): Admission {
  const filled = refill(budget, now, policy);
  const cost = policy.cost[frameType] ?? policy.defaultCost;

  if (filled.tokens < cost) {
    const strikes = filled.strikes + 1;
    return {
      budget: { tokens: filled.tokens, updatedAt: filled.updatedAt, strikes },
      verdict: strikes >= policy.strikeLimit ? "close" : "drop",
    };
  }

  return {
    budget: { tokens: filled.tokens - cost, updatedAt: filled.updatedAt, strikes: 0 },
    verdict: "allow",
  };
}

/**
 * Whether a connection's Origin is acceptable.
 *
 * An empty allowlist permits everything, which is what a local `wrangler dev`
 * session and a `curl` against the deployed relay both need. That is a
 * deliberate default rather than an oversight: the relay's security rests on
 * what a frame is permitted to *do*, and an Origin header is a courtesy from
 * a browser, not a control. Treating it as one would give false confidence
 * while breaking every non-browser client the design depends on.
 */
export function isAllowedOrigin(origin: string | null, allowlist: readonly string[]): boolean {
  if (allowlist.length === 0) return true;
  if (!origin) return false;
  return allowlist.includes(origin);
}

/** Read an allowlist from a comma-separated environment variable. */
export function parseAllowlist(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}
