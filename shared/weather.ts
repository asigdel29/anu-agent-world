import { EPOCH, hash32, xorshift32 } from "./worldClock";

/**
 * Weather, derived from the clock and overridden by narrative beats.
 *
 * The baseline is a pure function of time and seed, so it costs nothing when
 * nobody is watching and needs no message to describe it. What the world's
 * director does is not *set* the weather but *override* it for a window: a
 * storm is a claim over an interval, not a state that must be kept in sync.
 *
 * The practical consequence is that the director can fail entirely — refuse,
 * time out, run out of budget — and the sky keeps changing. It is garnish over
 * something that already works, which is why it is the first thing that can be
 * switched off under cost pressure.
 */

/** How long one baseline weather period lasts. */
export const WEATHER_PERIOD_MS = 20 * 60_000;

export const WEATHER_KINDS = ["clear", "clear", "overcast", "rain", "fog", "clear"] as const;

export type WeatherKind = (typeof WEATHER_KINDS)[number];

/** A window during which the director has overridden the baseline. */
export interface Beat {
  readonly kind: WeatherKind;
  readonly startsAt: number;
  readonly endsAt: number;
}

export interface Weather {
  readonly kind: WeatherKind;
  /** How fully established it is, 0 to 1. */
  readonly intensity: number;
  /** Whether it came from the clock or from a beat. */
  readonly from: "derived" | "beat";
}

/** Share of a period spent ramping in and out. */
const RAMP = 0.05;

function ramp(progress: number): number {
  if (progress < RAMP) return progress / RAMP;
  if (progress > 1 - RAMP) return (1 - progress) / RAMP;
  return 1;
}

/** The baseline for a moment, with no beat applied. */
export function weatherFor(now: number, seed: string): Weather {
  const period = Math.floor((now - EPOCH) / WEATHER_PERIOD_MS);
  const roll = xorshift32(hash32(seed) ^ period);
  const kind = WEATHER_KINDS[roll % WEATHER_KINDS.length] ?? "clear";

  const elapsed = (((now - EPOCH) % WEATHER_PERIOD_MS) + WEATHER_PERIOD_MS) % WEATHER_PERIOD_MS;
  return { kind, intensity: ramp(elapsed / WEATHER_PERIOD_MS), from: "derived" };
}

/**
 * What the weather actually is: a beat where one is in force, the baseline
 * otherwise.
 */
export function effectiveWeather(now: number, seed: string, beat: Beat | null): Weather {
  if (beat && now >= beat.startsAt && now < beat.endsAt) {
    const span = Math.max(beat.endsAt - beat.startsAt, 1);
    return {
      kind: beat.kind,
      intensity: ramp((now - beat.startsAt) / span),
      from: "beat",
    };
  }
  return weatherFor(now, seed);
}
