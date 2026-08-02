import { PERSIST_INTERVAL_MS, PLAYER_TTL_MS } from "../protocol/limits";
import { connectionId, isAgentId } from "../protocol/ids";
import type { ActorRecord, ServerFrame } from "../protocol/messages";
import { parseFrame, readClientFrame } from "../protocol/messages";
import type { Budget } from "./admission";
import { admit, openBudget } from "./admission";
import type { PlayerRecord } from "./storage";
import { NAMESPACE, keyFor, partitionFresh } from "./storage";

/**
 * The shared world, as one Durable Object.
 *
 * Sockets are accepted with hibernation, so an empty room holds no memory and
 * costs nothing while still being addressable. The consequence worth stating
 * is that **no in-memory field survives a wake**: anything that must outlive
 * an idle period lives in storage, and anything held in a field is an
 * optimisation whose loss must be harmless. The write throttle below is
 * exactly that — losing it costs one extra write, not correctness.
 *
 * Identity is assigned here and never read from a frame. A client says where
 * it is; the relay says who it is.
 */

export interface Env {
  readonly ROOM: DurableObjectNamespace;
  /**
   * Comma-separated origins permitted to open a socket. Unset permits every
   * origin, which is what local development and any non-browser client need.
   */
  readonly ALLOWED_ORIGINS?: string;
}

export class WorldRoom {
  private readonly state: DurableObjectState;

  /**
   * Wall-clock of the last persisted frame per connection.
   *
   * Deliberately in memory rather than storage: its whole purpose is to avoid
   * writes, so persisting it would defeat it.
   */
  private readonly lastPersist = new Map<string, number>();

  /**
   * What each connection is still allowed to send.
   *
   * Also in memory, and losing it on a wake is harmless for a reason worth
   * stating: an object only hibernates when it has been idle, and an idle
   * connection's bucket would have refilled to full anyway. A flooder never
   * lets the room go idle, so it never gets its budget reset.
   */
  private readonly budgets = new Map<string, Budget>();

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  /**
   * The identity of a socket, carried as its hibernation tag so it survives
   * the object sleeping without any stored state.
   */
  private idOf(ws: WebSocket): string {
    const tags = this.state.getTags(ws);
    return tags[0] ?? "";
  }

  private send(ws: WebSocket, frame: ServerFrame): void {
    try {
      ws.send(JSON.stringify(frame));
    } catch {
      // The socket is already gone; the close handler will clean up.
    }
  }

  private broadcast(frame: ServerFrame, exclude?: WebSocket): void {
    const encoded = JSON.stringify(frame);
    for (const ws of this.state.getWebSockets()) {
      if (ws === exclude) continue;
      try {
        ws.send(encoded);
      } catch {
        // As above.
      }
    }
  }

  /** Players still fresh enough to show a newcomer, expiring the rest. */
  private async freshActors(now: number): Promise<ActorRecord[]> {
    const stored = await this.state.storage.list<PlayerRecord>({
      prefix: NAMESPACE.player,
    });
    const { live, expired } = partitionFresh(stored, "player", now, PLAYER_TTL_MS);
    if (expired.length > 0) await this.state.storage.delete([...expired]);
    return live.map(({ id, record }) => ({
      id,
      kind: isAgentId(id) ? "agent" : "visitor",
      pos: record.pos,
      yaw: record.yaw,
      action: record.action,
      character: record.character,
    }));
  }

  async fetch(request: Request): Promise<Response> {
    const { 0: client, 1: server } = new WebSocketPair();
    const url = new URL(request.url);
    const id = connectionId(url.searchParams.get("pid"), () => crypto.randomUUID());

    this.state.acceptWebSocket(server, [id]);

    const now = Date.now();
    // Identity and the world's clock first: everything the client derives —
    // time of day, weather — is a function of server time, so a client that
    // rendered a frame before agreeing on it would show the wrong sky.
    this.send(server, { type: "hello", id, s: now });
    this.broadcast({ type: "join", id, ts: now }, server);
    const actors = (await this.freshActors(now)).filter((a) => a.id !== id);
    this.send(server, { type: "snapshot", actors });

    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): void {
    const id = this.idOf(ws);
    if (!id) return;
    const now = Date.now();

    // A frame that fails to parse or names a type no client may send is still
    // charged. Otherwise the cheapest way to flood the room would be to send
    // garbage, which is the one thing no budget was checking.
    const parsed = parseFrame(message);
    const frame = parsed ? readClientFrame(parsed) : null;
    if (!this.charge(ws, id, frame?.type ?? "unknown", now)) return;
    if (!frame) return;

    if (frame.type === "ping") {
      this.send(ws, { type: "pong", t: frame.t, s: now });
      return;
    }

    if (frame.type === "chat") {
      this.broadcast({ type: "chat", id, username: frame.username, text: frame.text }, ws);
      return;
    }

    // Every field is named. Nothing the client sent reaches another client
    // except through this object, so identity cannot be forged by ordering a
    // spread so that the sender's own `id` wins.
    this.broadcast(
      {
        type: "state",
        id,
        kind: isAgentId(id) ? "agent" : "visitor",
        pos: frame.pos,
        yaw: frame.yaw,
        action: frame.action,
        character: frame.character,
      },
      ws,
    );

    if (now - (this.lastPersist.get(id) ?? 0) < PERSIST_INTERVAL_MS) return;
    this.lastPersist.set(id, now);
    void this.state.storage.put<PlayerRecord>(keyFor("player", id), {
      pos: frame.pos,
      yaw: frame.yaw,
      action: frame.action,
      character: frame.character,
      ts: now,
    });
  }

  /**
   * Charge a frame, returning whether it may be acted on. A connection that
   * keeps overrunning is closed rather than merely ignored, because a socket
   * whose frames are all discarded is still costing the room a parse.
   */
  private charge(ws: WebSocket, id: string, frameType: string, now: number): boolean {
    const { budget, verdict } = admit(this.budgets.get(id) ?? openBudget(now), frameType, now);
    this.budgets.set(id, budget);
    if (verdict === "allow") return true;
    if (verdict === "close") {
      try {
        ws.close(1008, "rate limit");
      } catch {
        // Already gone.
      }
    }
    return false;
  }

  webSocketClose(ws: WebSocket): void {
    this.departed(ws);
  }

  webSocketError(ws: WebSocket): void {
    this.departed(ws);
  }

  private departed(ws: WebSocket): void {
    const id = this.idOf(ws);
    if (!id) return;
    this.lastPersist.delete(id);
    this.budgets.delete(id);
    this.broadcast({ type: "leave", id, ts: Date.now() });
  }
}
