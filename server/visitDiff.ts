/**
 * What changed while you were away.
 *
 * This is the mechanism that gives a self-running world a reason to be
 * revisited. A world that runs unattended is only interesting if the running
 * is *legible* — an island that quietly filled in while nobody looked is
 * indistinguishable from one that was always like that, and the whole premise
 * is wasted unless someone returning is told.
 *
 * So the diff is not a changelog. A changelog answers "what events occurred";
 * this answers "what would you notice", and those are different questions
 * with different answers. Twenty crates placed one at a time is one sentence,
 * not twenty. A structure raised and removed again while you were gone is
 * nothing at all, because you would never have seen either.
 *
 * The ranking follows from the same idea: what a person would notice first
 * standing in the world, which is buildings before ornaments and people
 * before weather.
 */

export type EventKind =
  /** Something was built. */
  | "built"
  /** Something was removed. */
  | "removed"
  /** An agent said something worth keeping. */
  | "said"
  /** The director set a beat. */
  | "beat"
  /** A visitor arrived. */
  | "visited";

export interface WorldEvent {
  readonly kind: EventKind;
  readonly at: number;
  /** Who did it. */
  readonly actorId: string;
  /** What it was about: a placement id, a weather kind, a visitor id. */
  readonly subject: string;
  /** A human-readable detail, already filtered. */
  readonly detail?: string | undefined;
}

export interface DiffLine {
  readonly kind: EventKind;
  readonly text: string;
  /** Higher is more worth reading. */
  readonly weight: number;
}

/**
 * How much each kind is worth, before counting.
 *
 * Buildings outrank ornaments and people outrank weather, because that is the
 * order a person notices things in when they arrive somewhere.
 */
const WEIGHTS: Readonly<Record<EventKind, number>> = {
  built: 100,
  removed: 60,
  said: 40,
  beat: 30,
  visited: 20,
};

function plural(count: number, one: string, many: string): string {
  return count === 1 ? `1 ${one}` : `${count} ${many}`;
}

/**
 * Events that survived the visit.
 *
 * Anything built and then removed while the visitor was away is dropped
 * entirely: they would have seen neither, and reporting both is a diff of the
 * log rather than of the world.
 */
export function surviving(events: readonly WorldEvent[]): WorldEvent[] {
  const removed = new Set<string>();
  for (const event of events) {
    if (event.kind === "removed") removed.add(event.subject);
  }
  return events.filter((event) => {
    if (event.kind === "built" && removed.has(event.subject)) return false;
    if (event.kind === "removed" && !events.some((e) => e.kind === "built" && e.subject === event.subject)) {
      // A removal of something built before this visit is real news.
      return true;
    }
    return event.kind !== "removed" || !removed.has(event.subject);
  });
}

/**
 * Turn events into the few lines worth reading.
 *
 * Grouped by kind and actor before counting, because "Flora raised three
 * lanterns" is what happened and three separate lines is merely what was
 * recorded.
 */
export function summarise(events: readonly WorldEvent[], limit = 4): DiffLine[] {
  const live = surviving(events);
  if (live.length === 0) return [];

  const groups = new Map<string, { kind: EventKind; actorId: string; count: number; detail: string }>();
  for (const event of live) {
    const key = `${event.kind}:${event.actorId}`;
    const existing = groups.get(key);
    groups.set(key, {
      kind: event.kind,
      actorId: event.actorId,
      count: (existing?.count ?? 0) + 1,
      // The most recent detail, since an older one has been superseded.
      detail: event.detail ?? existing?.detail ?? "",
    });
  }

  const lines: DiffLine[] = [];
  for (const group of groups.values()) {
    const who = group.actorId.replace(/^a-/, "");
    let text: string;
    switch (group.kind) {
      case "built":
        text = `${who} built ${plural(group.count, "thing", "things")}`;
        break;
      case "removed":
        text = `${who} cleared ${plural(group.count, "thing", "things")} away`;
        break;
      case "said":
        text = group.detail ? `${who} said "${group.detail}"` : `${who} had something to say`;
        break;
      case "beat":
        text = group.detail ? `the weather turned to ${group.detail}` : "the weather turned";
        break;
      default:
        text = `${plural(group.count, "person", "people")} passed through`;
        break;
    }
    // Count raises a line's weight but never lets one kind overtake another,
    // or a hundred visitors would outrank a new building.
    const weight = WEIGHTS[group.kind] + Math.min(group.count, 9);
    lines.push({ kind: group.kind, text, weight });
  }

  return lines.sort((a, b) => b.weight - a.weight).slice(0, limit);
}

/**
 * The whole greeting, or "" when nothing worth reporting happened.
 *
 * Saying nothing is a real answer. A world that greets every arrival with
 * "nothing has changed" is worse than one that greets them with silence,
 * because it draws attention to the emptiness.
 */
export function greeting(events: readonly WorldEvent[], awayMs: number, limit = 4): string {
  const lines = summarise(events, limit);
  if (lines.length === 0) return "";

  const away =
    awayMs >= 48 * 60 * 60_000
      ? `In the ${Math.round(awayMs / (24 * 60 * 60_000))} days you were away`
      : awayMs >= 90 * 60_000
        ? `In the ${Math.round(awayMs / (60 * 60_000))} hours you were away`
        : "While you were away";

  return `${away}: ${lines.map((l) => l.text).join(", ")}.`;
}
