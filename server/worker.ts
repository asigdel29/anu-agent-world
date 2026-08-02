import { ROOM, WRITE_PATH } from "../protocol/limits";
import { isAllowedOrigin, parseAllowlist } from "./admission";
import { mayWrite } from "./auth";
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

    // Agents hold no socket: they run server-side and write over HTTP. The
    // request is checked at the door and then goes to the same object, so
    // there is one place where the world changes rather than two.
    if (url.pathname === WRITE_PATH) {
      if (request.method !== "POST") {
        return new Response("expected POST", { status: 405 });
      }
      if (!mayWrite(request.headers.get("Authorization"), env.WRITE_TOKEN)) {
        // Deliberately unspecific. Distinguishing "no token" from "wrong
        // token" tells a prober which half they got right.
        return new Response("unauthorised", { status: 401 });
      }
      return env.ROOM.get(env.ROOM.idFromName(ROOM)).fetch(request);
    }

    if (!url.pathname.startsWith("/party/")) {
      return new Response("agent world relay", { status: 200 });
    }
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("expected websocket", { status: 426 });
    }
    if (!isAllowedOrigin(request.headers.get("Origin"), parseAllowlist(env.ALLOWED_ORIGINS))) {
      return new Response("origin not allowed", { status: 403 });
    }

    const stub = env.ROOM.get(env.ROOM.idFromName(ROOM));
    return stub.fetch(request);
  },
};
