import { MAX_ID_LENGTH } from "./limits";

/**
 * Identity, reduced to something safe to use as a key.
 *
 * An identifier arrives from a query parameter, which means it is attacker
 * controlled and will be used as a storage key, a hibernation tag, and a map
 * key. Rather than validating it and rejecting what fails, it is *reduced* to
 * the safe alphabet: whatever survives is usable everywhere, and nothing that
 * survives can traverse a prefix, collide with a namespace, or grow unbounded.
 */

/**
 * The prefix reserved for agents.
 *
 * Agents are rendered by the same path as visitors, which is what makes an
 * inhabited world cost nothing extra to draw. The consequence is that a
 * visitor able to claim an agent's identifier could speak as one, so the
 * prefix is refused at the door instead of being trusted downstream.
 */
export const AGENT_PREFIX = "a-";

/**
 * Reduce an untrusted identifier to lowercase letters, digits, and dashes,
 * bounded in length. Returns "" when nothing usable remains, which every
 * caller must treat as "no identifier supplied" rather than as an error.
 */
export function sanitizeId(raw: unknown, max: number = MAX_ID_LENGTH): string {
  if (typeof raw !== "string") return "";
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, max);
}

/** Whether an identifier names an agent rather than a visitor. */
export function isAgentId(id: string): boolean {
  return id.startsWith(AGENT_PREFIX);
}

/**
 * Whether a visitor may connect under this identifier.
 *
 * Checked against the *sanitised* form, because a raw identifier of "A-flora"
 * is not agent-prefixed but reduces to one that is.
 */
export function isReservedId(raw: unknown): boolean {
  return isAgentId(sanitizeId(raw));
}

/**
 * The identifier an agent writes under.
 *
 * The prefix is *forced* rather than required, which is the mirror image of
 * the door a visitor comes through: a socket may never claim an agent
 * identity, and an HTTP writer may never claim a visitor one. Neither side
 * can put words in the other's mouth, and the rule is enforced by
 * construction rather than by checking.
 */
export function agentId(raw: unknown): string {
  const clean = sanitizeId(raw);
  if (!clean) return "";
  return isAgentId(clean) ? clean : `${AGENT_PREFIX}${clean}`.slice(0, MAX_ID_LENGTH);
}

/**
 * The identifier a connection should be given: the sanitised request of the
 * client where that is allowed, and a fresh random one otherwise.
 *
 * Falling back rather than refusing is deliberate. A visitor with a corrupted
 * stored identifier loses their persisted position, which they will not
 * notice; being unable to enter the world is something they would.
 */
export function connectionId(raw: unknown, randomId: () => string): string {
  const clean = sanitizeId(raw);
  if (!clean || isAgentId(clean)) return sanitizeId(randomId());
  return clean;
}
