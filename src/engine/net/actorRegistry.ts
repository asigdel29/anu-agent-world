import { CHAT_BUBBLE_MS, REMOTE_TTL_MS } from "../../../protocol/limits";
import type { ActorKind, ServerFrame } from "../../../protocol/messages";

/**
 * Everyone else in the world.
 *
 * Two kinds of change arrive over the same socket and they are not alike.
 * *Membership* changes rarely and must reach React, because someone arriving
 * has to be mounted and someone leaving has to be unmounted. *Motion* changes
 * ten times a second per actor and must not reach React at all, or a busy
 * room re-renders the scene hundreds of times a second to say what a mutable
 * field could have carried.
 *
 * So an actor's transform is mutable data read by the frame loop, and only
 * the roster is versioned for React.
 *
 * This split also fixes a real defect in the relay this replaces. There, a
 * speech bubble's five-second expiry was evaluated in the render body, so an
 * entity that stopped sending frames stopped re-rendering and its bubble
 * stayed up forever — most visibly on an idle agent, which is exactly the
 * case the new world has more of. Here expiry is a deadline compared against
 * the clock by whoever draws it, so nothing has to re-render for a bubble to
 * go away.
 */

export interface RemoteActor {
  readonly id: string;
  kind: ActorKind;
  /** Latest transform received: what the renderer eases towards. */
  targetX: number;
  targetY: number;
  targetZ: number;
  targetYaw: number;
  /** Transform currently drawn. Owned by the renderer, not by the network. */
  x: number;
  y: number;
  z: number;
  yaw: number;
  action: string;
  character: string;
  /** When a frame for this actor last arrived. */
  lastSeen: number;
  /** Current speech, and the instant it stops being shown. */
  chatText: string;
  chatUntil: number;
}

export interface ActorRegistry {
  readonly actors: Map<string, RemoteActor>;
  /**
   * Bumped whenever the set of actors changes, never when one merely moves.
   * React subscribes to this; the frame loop ignores it.
   */
  rosterRev: number;
}

export function createActorRegistry(): ActorRegistry {
  return { actors: new Map(), rosterRev: 0 };
}

function spawn(
  registry: ActorRegistry,
  id: string,
  kind: ActorKind,
  now: number,
): RemoteActor {
  const actor: RemoteActor = {
    id,
    kind,
    targetX: 0,
    targetY: 0,
    targetZ: 0,
    targetYaw: 0,
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    action: "idle",
    character: "",
    lastSeen: now,
    chatText: "",
    chatUntil: 0,
  };
  registry.actors.set(id, actor);
  registry.rosterRev += 1;
  return actor;
}

/**
 * Take on a transform.
 *
 * An actor seen for the first time is placed *at* its target rather than
 * eased towards it, or every arrival slides in from the world origin.
 */
function place(
  actor: RemoteActor,
  pos: readonly [number, number, number],
  yaw: number,
  fresh: boolean,
): void {
  actor.targetX = pos[0];
  actor.targetY = pos[1];
  actor.targetZ = pos[2];
  actor.targetYaw = yaw;
  if (!fresh) return;
  actor.x = pos[0];
  actor.y = pos[1];
  actor.z = pos[2];
  actor.yaw = yaw;
}

/**
 * Fold an inbound frame into the registry, returning whether the roster
 * changed — which is the only condition under which React must be told.
 */
export function applyFrame(registry: ActorRegistry, frame: ServerFrame, now: number): boolean {
  const before = registry.rosterRev;

  switch (frame.type) {
    case "join":
      // Announced but not yet placed. A body is not drawn until a transform
      // arrives, so a joiner does not appear standing at the origin.
      break;

    case "leave":
      if (registry.actors.delete(frame.id)) registry.rosterRev += 1;
      break;

    case "state": {
      const existing = registry.actors.get(frame.id);
      const actor = existing ?? spawn(registry, frame.id, frame.kind, now);
      actor.kind = frame.kind;
      place(actor, frame.pos, frame.yaw, existing === undefined);
      actor.action = frame.action;
      actor.character = frame.character;
      actor.lastSeen = now;
      break;
    }

    case "snapshot":
      for (const record of frame.actors) {
        const existing = registry.actors.get(record.id);
        const actor = existing ?? spawn(registry, record.id, record.kind, now);
        actor.kind = record.kind;
        place(actor, record.pos, record.yaw, existing === undefined);
        actor.action = record.action;
        actor.character = record.character;
        actor.lastSeen = now;
      }
      break;

    case "chat": {
      const actor = registry.actors.get(frame.id);
      if (!actor) break;
      actor.chatText = frame.text;
      actor.chatUntil = now + CHAT_BUBBLE_MS;
      // Speech is not presence: it must not keep a departed actor alive.
      break;
    }

    default:
      break;
  }

  return registry.rosterRev !== before;
}

/**
 * Drop actors that have gone quiet, returning whether the roster changed.
 *
 * Needed because a socket that dies without closing sends no `leave`, and a
 * snapshot may name someone who has since gone. Without this, the world
 * slowly fills with motionless bodies.
 */
export function pruneActors(
  registry: ActorRegistry,
  now: number,
  ttlMs: number = REMOTE_TTL_MS,
): boolean {
  const before = registry.rosterRev;
  for (const [id, actor] of registry.actors) {
    if (now - actor.lastSeen > ttlMs) {
      registry.actors.delete(id);
      registry.rosterRev += 1;
    }
  }
  return registry.rosterRev !== before;
}

/** Whether an actor's speech should still be drawn. */
export function isSpeaking(actor: RemoteActor, now: number): boolean {
  return actor.chatText !== "" && now < actor.chatUntil;
}

/** Forget everyone, as when a connection is lost. */
export function clearActors(registry: ActorRegistry): boolean {
  if (registry.actors.size === 0) return false;
  registry.actors.clear();
  registry.rosterRev += 1;
  return true;
}
