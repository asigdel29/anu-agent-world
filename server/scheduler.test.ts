import { describe, expect, it } from "vitest";

import type { Schedule } from "./scheduler";
import {
  CADENCES,
  TIMER_KINDS,
  advance,
  createSchedule,
  intervalFor,
  nextWake,
} from "./scheduler";

const NOW = 1_750_000_000_000;
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** Run the schedule forward, reporting every firing. */
function run(schedule: Schedule, from: number, to: number, occupied: boolean, step = MINUTE) {
  const fired: { at: number; kind: string }[] = [];
  let current = schedule;
  for (let t = from; t <= to; t += step) {
    const result = advance(current, t, occupied);
    current = result.schedule;
    for (const kind of result.due) fired.push({ at: t, kind });
  }
  return { schedule: current, fired };
}

describe("createSchedule", () => {
  it("arms everything that runs while occupied", () => {
    const schedule = createSchedule(NOW, true);
    expect(schedule.timers.map((t) => t.kind).sort()).toEqual([...TIMER_KINDS].sort());
  });

  it("leaves the heartbeat disarmed in an empty world", () => {
    // Its whole purpose is an audience: with nobody watching there is nothing
    // to keep alive.
    const schedule = createSchedule(NOW, false);
    expect(schedule.timers.some((t) => t.kind === "heartbeat")).toBe(false);
  });

  it("always leaves something armed", () => {
    // An object that sleeps with no alarm never wakes on its own again.
    for (const occupied of [true, false]) {
      expect(nextWake(createSchedule(NOW, occupied))).not.toBeNull();
    }
  });
});

describe("advance", () => {
  it("fires nothing before anything is due", () => {
    const schedule = createSchedule(NOW, true);
    expect(advance(schedule, NOW + 1000, true).due).toEqual([]);
  });

  it("fires a timer once it comes due", () => {
    const schedule = createSchedule(NOW, true);
    const { due } = advance(schedule, NOW + 31_000, true);
    expect(due).toContain("heartbeat");
  });

  it("fires a timer due during a long sleep exactly once", () => {
    // The rule the whole design rests on. Six hours of a five-minute timer is
    // seventy-two firings if they are rescheduled from when they were due --
    // each one a model call, arriving in a burst the moment somebody opens
    // the page. A missed tick is not work owed.
    const schedule = createSchedule(NOW, true);
    const { due } = advance(schedule, NOW + 6 * HOUR, true);
    expect(due.filter((k) => k === "resident")).toHaveLength(1);
    expect(due.filter((k) => k === "heartbeat")).toHaveLength(1);
  });

  it("reschedules from now rather than from when it was due", () => {
    const schedule = createSchedule(NOW, true);
    const woke = NOW + 6 * HOUR;
    const { schedule: next } = advance(schedule, woke, true);
    for (const timer of next.timers) {
      expect(timer.dueAt).toBeGreaterThan(woke);
    }
  });

  it("does not push back a timer that was nearly due", () => {
    // Otherwise an arrival, or any other wake, repeatedly defers work.
    const schedule = createSchedule(NOW, true);
    const before = schedule.timers.find((t) => t.kind === "resident")?.dueAt;
    const { schedule: next } = advance(schedule, NOW + 31_000, true);
    expect(next.timers.find((t) => t.kind === "resident")?.dueAt).toBe(before);
  });

  it("keeps a steady cadence while occupied", () => {
    const { fired } = run(createSchedule(NOW, true), NOW, NOW + 60 * MINUTE, true);
    const residents = fired.filter((f) => f.kind === "resident");
    expect(residents).toHaveLength(12);
  });

  it("slows right down in an empty world", () => {
    const { fired } = run(createSchedule(NOW, false), NOW, NOW + 12 * HOUR, false, 5 * MINUTE);
    const residents = fired.filter((f) => f.kind === "resident");
    // Half-hourly, then doubling to a six-hour ceiling: far fewer than the
    // 144 an occupied world would have run.
    expect(residents.length).toBeGreaterThan(0);
    expect(residents.length).toBeLessThan(10);
  });

  it("never lets the backoff exceed its ceiling", () => {
    let schedule = createSchedule(NOW, false);
    for (let i = 0; i < 40; i += 1) {
      const wake = nextWake(schedule);
      expect(wake).not.toBeNull();
      schedule = advance(schedule, wake!, false).schedule;
      const resident = schedule.timers.find((t) => t.kind === "resident");
      expect((resident?.dueAt ?? 0) - wake!).toBeLessThanOrEqual(CADENCES.resident.maxEmptyMs);
    }
  });

  it("comes back to full speed the moment somebody arrives", () => {
    // A world visited daily should never sit in the long backoff.
    let schedule = createSchedule(NOW, false);
    let t = NOW;
    for (let i = 0; i < 10; i += 1) {
      t = nextWake(schedule)!;
      schedule = advance(schedule, t, false).schedule;
    }
    const arrival = advance(schedule, t + 1000, true);
    const resident = arrival.schedule.timers.find((r) => r.kind === "resident");
    expect(resident?.idleRuns).toBe(0);
    expect((resident?.dueAt ?? 0) - (t + 1000)).toBeLessThanOrEqual(CADENCES.resident.occupiedMs);
  });

  it("re-arms the heartbeat when somebody arrives", () => {
    const empty = createSchedule(NOW, false);
    expect(empty.timers.some((t) => t.kind === "heartbeat")).toBe(false);
    const arrived = advance(empty, NOW + 1000, true).schedule;
    expect(arrived.timers.some((t) => t.kind === "heartbeat")).toBe(true);
  });

  it("drops the heartbeat when the last visitor leaves", () => {
    const busy = createSchedule(NOW, true);
    const emptied = advance(busy, NOW + 1000, false).schedule;
    expect(emptied.timers.some((t) => t.kind === "heartbeat")).toBe(false);
  });

  it("keeps the director running whether or not anyone is watching", () => {
    // Weather that only changes when someone is looking is not weather.
    const occupied = intervalFor("director", true, 0);
    const empty = intervalFor("director", false, 20);
    expect(empty).toBe(occupied);
  });

  it("always leaves something armed, whatever it is handed", () => {
    let schedule = createSchedule(NOW, false);
    let t = NOW;
    for (let i = 0; i < 50; i += 1) {
      const occupied = i % 7 === 0;
      t += 11 * MINUTE;
      schedule = advance(schedule, t, occupied).schedule;
      expect(nextWake(schedule)).not.toBeNull();
    }
  });

  it("survives an empty schedule", () => {
    const result = advance({ timers: [] }, NOW, true);
    expect(result.due).toEqual([]);
    expect(nextWake(result.schedule)).not.toBeNull();
  });

  it("survives a clock that jumps backwards", () => {
    const schedule = createSchedule(NOW, true);
    const back = advance(schedule, NOW - HOUR, true);
    expect(back.due).toEqual([]);
    expect(nextWake(back.schedule)).not.toBeNull();
  });

  it("reports what is due in a fixed order", () => {
    const schedule = createSchedule(NOW, true);
    const { due } = advance(schedule, NOW + 12 * HOUR, true);
    expect(due).toEqual([...TIMER_KINDS].filter((k) => due.includes(k)));
  });
});

describe("intervalFor", () => {
  it("doubles the resident interval while empty", () => {
    const base = CADENCES.resident.emptyMs ?? 0;
    expect(intervalFor("resident", false, 0)).toBe(base);
    expect(intervalFor("resident", false, 1)).toBe(base * 2);
    expect(intervalFor("resident", false, 2)).toBe(base * 4);
  });

  it("caps the doubling", () => {
    expect(intervalFor("resident", false, 99)).toBe(CADENCES.resident.maxEmptyMs);
  });

  it("disarms the heartbeat when empty", () => {
    expect(intervalFor("heartbeat", false, 0)).toBeNull();
  });
});

describe("nextWake", () => {
  it("picks the soonest", () => {
    const schedule = createSchedule(NOW, true);
    expect(nextWake(schedule)).toBe(NOW + CADENCES.heartbeat.occupiedMs);
  });

  it("returns null only when nothing is armed", () => {
    expect(nextWake({ timers: [] })).toBeNull();
  });
});
