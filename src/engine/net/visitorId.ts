import { sanitizeId } from "../../../protocol/ids";

/**
 * A stable identity for this browser.
 *
 * Stored so a reload returns to the same body rather than arriving as a
 * stranger standing beside the one it just left. It is not an account and
 * proves nothing: the relay treats it as a hint about which saved position to
 * restore, never as authority, which is why it is safe for it to be a value
 * the visitor could edit.
 */

const KEY = "world:visitor";

function randomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Read this browser's identity, minting one on first visit.
 *
 * Falls back to a fresh identity when storage is unavailable — a private
 * window, or a browser with storage disabled. Such a visitor loses continuity
 * across reloads, which is a far smaller cost than being unable to enter.
 */
export function visitorId(): string {
  try {
    const stored = sanitizeId(localStorage.getItem(KEY));
    if (stored) return stored;
    const minted = sanitizeId(randomId());
    localStorage.setItem(KEY, minted);
    return minted;
  } catch {
    return sanitizeId(randomId());
  }
}
