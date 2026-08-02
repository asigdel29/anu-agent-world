import { useEffect, useRef } from "react";
import { create } from "zustand";

import { SEND_INTERVAL_MS } from "../../../protocol/limits";
import type { ActorState, ServerFrame } from "../../../protocol/messages";
import { parseFrame, roomUrl, shouldSend } from "../../../protocol/messages";
import type { Sample } from "./clockSync";
import { addSample, bestOffset, sampleFrom } from "./clockSync";
import { applyFrame, clearActors, createActorRegistry, pruneActors } from "./actorRegistry";
import { retryDelay, shouldRetry } from "./reconnect";

/**
 * The socket, and nothing else.
 *
 * Everything this file could get wrong on its own has been moved out: how a
 * frame changes the world is in `actorRegistry`, what time it is in
 * `clockSync`, when to try again in `reconnect`, and what a frame may contain
 * in `protocol`. What is left is genuinely about the socket — opening it,
 * closing it, and not leaking a timer — which is the part that cannot be
 * unit-tested anyway.
 *
 * The property to preserve above all others is that **a dead relay degrades
 * to solo play**. No host configured, a refused connection, a relay that
 * restarts mid-session: each leaves a world that is still explorable and
 * merely empty. This is the predecessor's best behaviour and the easiest to
 * lose by accident, so nothing here throws and nothing here blocks a render.
 */

export type Status = "solo" | "connecting" | "connected";

interface RealtimeStore {
  status: Status;
  /** Who the relay says this client is, once it has said so. */
  selfId: string | null;
  /** Bumped when the set of actors changes, never when one moves. */
  rosterRev: number;
  set: (partial: Partial<RealtimeStore>) => void;
}

export const useRealtimeStore = create<RealtimeStore>((set) => ({
  status: "solo",
  selfId: null,
  rosterRev: 0,
  set: (partial) => {
    set(partial);
  },
}));

/** Everyone else, as mutable data the frame loop reads directly. */
export const actors = createActorRegistry();

/** How often the client re-measures the clock. */
const PING_INTERVAL_MS = 15_000;

/** How often departed actors are swept up. */
const PRUNE_INTERVAL_MS = 5_000;

/** The connection, as the frame loop needs to see it. */
export const realtime = {
  /** The relay's clock minus this client's, or null while running solo. */
  offset: null as number | null,
  /**
   * Send a transform, throttled to the protocol cadence.
   *
   * A no-op until a connection exists, and a no-op again the moment one is
   * lost. The frame loop calls this unconditionally and must never have to
   * ask whether anyone is listening.
   */
  sendState: (() => {}) as (state: ActorState, now: number) => void,
  /** Say something. Ignored while running solo. */
  say: (() => {}) as (text: string, username: string) => void,
};

export interface RealtimeOptions {
  /** Relay host. Absent means solo, which is a supported mode. */
  readonly host: string | undefined;
  /** Stable identity, so a reload returns to the same body. */
  readonly playerId: string;
}

/**
 * Keep a connection to the relay for as long as this component is mounted.
 */
export function useRealtime({ host, playerId }: RealtimeOptions): void {
  const store = useRealtimeStore((s) => s.set);
  // Held in a ref rather than closed over: the connection outlives any single
  // render, and a stale closure here would send through a dead socket.
  const socket = useRef<WebSocket | null>(null);

  useEffect(() => {
    const url = roomUrl(host, playerId);
    if (!url) {
      store({ status: "solo" });
      return undefined;
    }

    let disposed = false;
    let attempt = 0;
    let lastSent = -Infinity;
    let samples: Sample[] = [];
    let pingSentAt = 0;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    const send = (frame: unknown): void => {
      const ws = socket.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      try {
        ws.send(JSON.stringify(frame));
      } catch {
        // A socket that failed mid-send is about to close; the close handler
        // owns the recovery. Throwing here would take the frame loop with it.
      }
    };

    realtime.sendState = (state, now) => {
      if (!shouldSend(now, lastSent, SEND_INTERVAL_MS)) return;
      lastSent = now;
      send({ type: "state", ...state });
    };
    realtime.say = (text, username) => {
      send({ type: "chat", text, username });
    };

    const ingest = (frame: ServerFrame, now: number): void => {
      if (frame.type === "hello") {
        store({ selfId: frame.id, status: "connected" });
        // The first sample comes from the greeting itself, so the sky is
        // right on the first frame rather than fifteen seconds in.
        samples = addSample(samples, sampleFrom(pingSentAt || now, now, frame.s));
        realtime.offset = bestOffset(samples);
        return;
      }
      if (frame.type === "pong") {
        samples = addSample(samples, sampleFrom(frame.t, now, frame.s));
        realtime.offset = bestOffset(samples);
        return;
      }
      if (applyFrame(actors, frame, now)) {
        store({ rosterRev: actors.rosterRev });
      }
    };

    const connect = (): void => {
      if (disposed) return;
      store({ status: "connecting" });
      let ws: WebSocket;
      try {
        ws = new WebSocket(url);
      } catch {
        // A relay that cannot be reached is a quiet world, not a broken one.
        schedule();
        return;
      }
      socket.current = ws;

      ws.onopen = () => {
        attempt = 0;
        pingSentAt = Date.now();
        send({ type: "ping", t: pingSentAt });
      };

      ws.onmessage = (event: MessageEvent) => {
        const parsed = parseFrame(event.data);
        if (!parsed) return;
        ingest(parsed as unknown as ServerFrame, Date.now());
      };

      ws.onclose = (event: CloseEvent) => {
        socket.current = null;
        // Everyone drawn came from this connection, so none of them is still
        // there. Keeping them would leave a room of motionless strangers.
        if (clearActors(actors)) store({ rosterRev: actors.rosterRev });
        store({ status: "solo", selfId: null });
        realtime.offset = null;
        if (shouldRetry(event.code)) schedule();
      };

      ws.onerror = () => {
        // Always followed by a close, which owns the recovery.
      };
    };

    const schedule = (): void => {
      if (disposed) return;
      retryTimer = setTimeout(connect, retryDelay(attempt, Math.random));
      attempt += 1;
    };

    const pingTimer = setInterval(() => {
      pingSentAt = Date.now();
      send({ type: "ping", t: pingSentAt });
    }, PING_INTERVAL_MS);

    const pruneTimer = setInterval(() => {
      if (pruneActors(actors, Date.now())) store({ rosterRev: actors.rosterRev });
    }, PRUNE_INTERVAL_MS);

    connect();

    return () => {
      disposed = true;
      clearTimeout(retryTimer);
      clearInterval(pingTimer);
      clearInterval(pruneTimer);
      realtime.sendState = () => {};
      realtime.say = () => {};
      realtime.offset = null;
      // 1000 is a normal close, which the retry rule reads as "do not come
      // back" — correct here, since the component is going away.
      socket.current?.close(1000, "unmounted");
      socket.current = null;
      clearActors(actors);
      store({ status: "solo", selfId: null, rosterRev: actors.rosterRev });
    };
  }, [host, playerId, store]);
}
