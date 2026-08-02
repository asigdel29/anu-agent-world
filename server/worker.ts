import { ROOM } from "../protocol/limits";
import type { Env } from "./WorldRoom";

export { WorldRoom } from "./WorldRoom";

/**
 * The relay's entry point: route every socket for the shared world to one
 * Durable Object.
 *
 * The room name is fixed rather than taken from the path. The path segment is
 * kept because it reads well and leaves room to grow, but deriving an object
 * id from an untrusted URL would let anyone mint unbounded Durable Objects by
 * varying it — a cost attack that costs the attacker nothing.
 */
export default {
  fetch(request: Request, env: Env): Response | Promise<Response> {
    const url = new URL(request.url);

    if (!url.pathname.startsWith("/party/")) {
      return new Response("agent world relay", { status: 200 });
    }
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("expected websocket", { status: 426 });
    }

    const stub = env.ROOM.get(env.ROOM.idFromName(ROOM));
    return stub.fetch(request);
  },
};
