/**
 * What the world reports about itself.
 *
 * One module owns the keys, the guard, and every event name, for a reason
 * specific to this project: analytics calls would otherwise end up scattered
 * through a frame loop, and a `capture` inside `useFrame` is sixty network
 * events a second that nobody notices until the bill or the profiler says so.
 * Everything here is called from an edge — a connection opening, a panel
 * opening, a first step — never from a per-frame path.
 *
 * **A missing key must not break the world, and must not be silent either.**
 * With nothing configured the whole module is a no-op, so the world runs
 * exactly as before; in development it says so once, loudly, because the
 * failure mode of silent analytics is discovering months later that you have
 * been measuring nothing.
 *
 * **Nothing here carries anything a person wrote.** Visitor and agent text is
 * the one genuinely sensitive thing this world holds, and it never appears in
 * a property — not the words on a sign, not what somebody asked an agent. The
 * events below count and time things; they do not quote anybody.
 *
 * **The library is loaded after the world, not before it.** Importing it
 * normally put seventy-three kilobytes of analytics in front of a world whose
 * entire terrain is eighty — measurement delaying the thing being measured,
 * and the bundle budget said so. It arrives on its own, late, and events
 * raised before it lands wait in a small queue rather than being lost: the
 * most interesting event of the session is how long the world took to become
 * stand-on-able, and that one is raised almost immediately.
 */

/** A minimal view of the parts of the SDK this module uses. */
interface PostHog {
  init(key: string, options: Record<string, unknown>): void;
  identify(id: string): void;
  capture(event: string, properties?: Record<string, unknown>): void;
  captureException(error: unknown, properties?: Record<string, unknown>): void;
}

let client: PostHog | null = null;

/**
 * Events raised before the library arrived.
 *
 * Bounded, because an unbounded queue in a world that may never load the
 * library is a leak that grows for as long as somebody plays.
 */
const QUEUE_LIMIT = 32;
const queued: { event: string; properties?: Record<string, unknown> }[] = [];

const KEY = import.meta.env.VITE_POSTHOG_KEY;
const HOST = import.meta.env.VITE_POSTHOG_HOST ?? "https://us.i.posthog.com";

let live = false;

/** Every event this world sends, named in one place so they cannot drift. */
export type WorldEventName =
  | "world_ready"
  | "world_entered"
  | "block_placed"
  | "block_removed"
  | "build_refused"
  | "panel_opened"
  | "relay_connected"
  | "relay_unavailable"
  | "frame_budget_sampled";

/**
 * Start reporting, if there is anywhere to report to.
 *
 * Called once at boot, before anything else here. The distinct id is the
 * world's own visitor identifier — a random slug already stored to bring
 * somebody back to the same body, which is exactly the identity that makes a
 * returning visit measurable. It is not an account and contains nothing about
 * a person.
 */
export function startAnalytics(visitorId: string): void {
  if (!KEY) {
    if (import.meta.env.DEV) {
      console.error(
        "VITE_POSTHOG_KEY variable required by PostHog is missing or un-configured, " +
          "this causes events to be silently missed. This error stops appearing once " +
          "VITE_POSTHOG_KEY is configured",
      );
    }
    return;
  }

  live = true;

  // Loaded on its own, after the world. The import is deliberately not
  // awaited by anything: nothing the visitor does should wait on analytics.
  void import("posthog-js")
    .then((module) => {
      const posthog = module.default as unknown as PostHog;
      posthog.init(KEY, {
        api_host: HOST,
        // The world is one page and its own router, so a single pageview at
        // boot is the honest count.
        capture_pageview: true,
        defaults: "2025-05-24",
      });
      posthog.identify(visitorId);
      client = posthog;

      for (const item of queued) posthog.capture(item.event, item.properties);
      queued.length = 0;
    })
    .catch(() => {
      // A blocked or failed analytics load is not a broken world. Stop
      // queueing so the events already waiting are released.
      live = false;
      queued.length = 0;
    });
}

/**
 * Record something that happened.
 *
 * Silently does nothing when analytics never started, which is the state a
 * contributor running the world locally with no key is in. That is the one
 * place silence is right: they were told at boot.
 */
export function record(event: WorldEventName, properties?: Record<string, unknown>): void {
  if (!live) return;
  if (client) {
    client.capture(event, properties);
    return;
  }
  if (queued.length < QUEUE_LIMIT) queued.push({ event, ...(properties ? { properties } : {}) });
}

/** Report a failure that the world absorbed rather than showed. */
export function recordProblem(error: unknown, where: string): void {
  client?.captureException(error, { where });
}

/** Whether reporting is switched on, for code that would otherwise compute properties. */
export function analyticsLive(): boolean {
  return live;
}
