/**
 * Who is allowed to write to the world from outside a browser.
 *
 * Agents do not hold a socket. They run on the server side of the world and
 * write over HTTP, which means there is exactly one secret standing between
 * the outside and a write path that visitors reach only through quotas. It is
 * worth being careful with.
 *
 * Two properties matter and both are easy to lose:
 *
 * **The comparison must not leak the answer through its duration.** A plain
 * `===` on strings returns as soon as it finds a difference, so the time it
 * takes reveals how many leading characters were right. That is enough to
 * recover a secret one character at a time. The comparison below always
 * examines every byte.
 *
 * **An absent secret must refuse, not admit.** The tempting shape — permit
 * everything when nothing is configured, as the Origin allowlist does — is
 * correct there and catastrophic here. Forgetting to set a variable would
 * silently publish the write path to the internet. The two defaults differ
 * because the Origin check is a courtesy and this is the only control.
 */

/**
 * Compare two strings in time that does not depend on where they differ.
 *
 * Lengths are compared too, which does leak the length; that is accepted and
 * unavoidable without hashing, and knowing the length of a secret is not
 * knowing the secret.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i += 1) {
    difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return difference === 0;
}

/** The token from an Authorization header, or "" if there is not one. */
export function bearerToken(header: string | null): string {
  if (!header) return "";
  const prefix = "Bearer ";
  return header.startsWith(prefix) ? header.slice(prefix.length).trim() : "";
}

/**
 * Whether a request may write to the world.
 *
 * Refuses when no secret is configured. See the note above: this is the
 * opposite of the Origin allowlist's default, on purpose.
 */
export function mayWrite(header: string | null, secret: string | undefined): boolean {
  if (!secret) return false;
  const token = bearerToken(header);
  if (!token) return false;
  return constantTimeEqual(token, secret);
}
