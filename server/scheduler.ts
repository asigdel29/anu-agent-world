/**
 * When the world wakes itself up.
 *
 * A Durable Object holds exactly one alarm, so everything the world does on a
 * timer — heartbeats, resident routines, the director's beats, sweeping up
 * expired objects — has to share it. That makes the schedule a table rather
 * than a set of timers, and the arithmetic over that table is the part most
 * worth getting right, so it lives here as a pure reducer and the object
 * merely performs the effects.
 *
 * **The rule that matters is what happens after a long sleep.** An empty room
 * hibernates; a wake may arrive hours after a timer was due. Rescheduling
 * from when it *was* due produces a backlog — six hours of a five-minute
 * timer is seventy-two firings, each one a model call, arriving in a burst
 * the moment somebody opens the page. Rescheduling from *now* collapses that
 * to one. A missed tick is not work owed; the world simply was not running.
 *
 * **An empty world costs nothing, but must not stop existing.** Cadences slow
 * down while nobody is watching and some disarm entirely, yet the schedule
 * always keeps at least one live timer, or the object would sleep with no
 * alarm set and never wake again. That is the failure the cron watchdog
 * exists to catch, and it is much better not to need it.
 */

export type TimerKind = "heartbeat" | "resident" | "director" | "gc";

export interface Timer {
  readonly kind: TimerKind;
  readonly dueAt: number;
  /** Consecutive firings with nobody present, which drives the backoff. */
  readonly idleRuns: number;
}

export interface Schedule {
  readonly timers: readonly Timer[];
}

export interface Cadence {
  /** Interval while somebody is in the world. */
  readonly occupiedMs: number;
  /** Interval while nobody is, or null to disarm until someone arrives. */
  readonly emptyMs: number | null;
  /** Whether the empty interval doubles on each idle firing. */
  readonly backsOff: boolean;
  /** Longest the empty interval may grow to. */
  readonly maxEmptyMs: number;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

export const CADENCES: Readonly<Record<TimerKind, Cadence>> = {
  /**
   * Keeps idle bodies alive. Disarmed when empty: with nobody watching there
   * is nothing to keep alive, and this is the one timer whose whole purpose
   * is an audience.
   */
  heartbeat: { occupiedMs: 30_000, emptyMs: null, backsOff: false, maxEmptyMs: 0 },

  /**
   * Residents going about their business. Backs off hard when empty, because
   * this is the timer that costs money and nobody is reading the result.
   */
  resident: { occupiedMs: 5 * MINUTE, emptyMs: 30 * MINUTE, backsOff: true, maxEmptyMs: 6 * HOUR },

  /**
   * World beats. The same either way: weather that only changes when someone
   * is looking is not weather, and a visitor arriving should find a world
   * that has been going on without them.
   */
  director: { occupiedMs: 6 * HOUR, emptyMs: 6 * HOUR, backsOff: false, maxEmptyMs: 6 * HOUR },

  /** Sweeping up what has expired. Cheap, and slows down when empty. */
  gc: { occupiedMs: 10 * MINUTE, emptyMs: 60 * MINUTE, backsOff: false, maxEmptyMs: 60 * MINUTE },
};

/** Every kind, in a fixed order so a schedule is comparable. */
export const TIMER_KINDS: readonly TimerKind[] = ["heartbeat", "resident", "director", "gc"];

/** The interval a timer should next use. */
export function intervalFor(kind: TimerKind, occupied: boolean, idleRuns: number): number | null {
  const cadence = CADENCES[kind];
  if (occupied) return cadence.occupiedMs;
  if (cadence.emptyMs === null) return null;
  if (!cadence.backsOff) return cadence.emptyMs;

  const grown = cadence.emptyMs * 2 ** Math.max(0, idleRuns);
  return Math.min(grown, cadence.maxEmptyMs);
}

/** A schedule with everything armed, as at a first deploy. */
export function createSchedule(now: number, occupied: boolean): Schedule {
  const timers: Timer[] = [];
  for (const kind of TIMER_KINDS) {
    const interval = intervalFor(kind, occupied, 0);
    if (interval === null) continue;
    timers.push({ kind, dueAt: now + interval, idleRuns: 0 });
  }
  return { timers };
}

export interface Advanced {
  readonly schedule: Schedule;
  /** What should run now, in the fixed kind order. */
  readonly due: readonly TimerKind[];
}

/**
 * Fire whatever is due and rebuild the table.
 *
 * Anything overdue fires exactly once however long the world was asleep, and
 * is rescheduled from `now` rather than from when it was due. Timers that
 * disarm while empty are dropped and re-armed the moment somebody arrives.
 */
export function advance(schedule: Schedule, now: number, occupied: boolean): Advanced {
  const held = new Map<TimerKind, Timer>();
  for (const timer of schedule.timers) held.set(timer.kind, timer);

  const due: TimerKind[] = [];
  const timers: Timer[] = [];

  for (const kind of TIMER_KINDS) {
    const existing = held.get(kind);
    const fires = existing !== undefined && existing.dueAt <= now;
    if (fires) due.push(kind);

    // Idle firings accumulate only while empty, and reset the moment somebody
    // is here — so a world that is visited daily never reaches the long
    // backoff, which is the behaviour worth having.
    const idleRuns = occupied ? 0 : (existing?.idleRuns ?? 0) + (fires ? 1 : 0);

    const interval = intervalFor(kind, occupied, idleRuns);
    if (interval === null) continue;

    // A timer that was disarmed, or that has just fired, is scheduled from
    // now. One still waiting takes whichever deadline is sooner, which is one
    // rule doing two jobs: a wake can never push back work that was nearly
    // due, and a visitor arriving into a world that had backed off to hours
    // pulls it straight back to the occupied cadence instead of leaving the
    // place sluggish for the rest of the backoff.
    const fresh = now + interval;
    const dueAt =
      existing === undefined || fires ? fresh : Math.min(existing.dueAt, fresh);
    timers.push({ kind, dueAt, idleRuns });
  }

  return { schedule: { timers }, due };
}

/**
 * When the object should ask to be woken, or null if nothing is armed.
 *
 * Null must be treated as a problem rather than as rest: an object that
 * sleeps without an alarm never wakes on its own again.
 */
export function nextWake(schedule: Schedule): number | null {
  let soonest: number | null = null;
  for (const timer of schedule.timers) {
    if (soonest === null || timer.dueAt < soonest) soonest = timer.dueAt;
  }
  return soonest;
}
