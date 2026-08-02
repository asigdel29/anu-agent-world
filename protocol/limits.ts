/**
 * Every bound the client and the relay must agree on.
 *
 * These are gathered in one file rather than scattered across the two sides
 * because each is a contract, not a preference. A cap the sender respects and
 * the receiver does not is a leak; a cap the receiver enforces and the sender
 * does not know about is a mysterious disconnect. Both sides import the same
 * number, so neither can drift.
 */

/** The single shared room every visitor joins. */
export const ROOM = "world";

/**
 * Where an agent writes to the world over HTTP.
 *
 * Here rather than in the Worker's entry module, because every named export
 * of that module is a contract with the runtime -- each must be a handler or
 * a Durable Object class, and a string constant among them stops the Worker
 * from starting at all.
 */
export const WRITE_PATH = "/world/ops";

/** Longest an identifier may be, as a URL parameter or a storage key. */
export const MAX_ID_LENGTH = 36;

/**
 * Least time between outbound state frames, giving roughly 10 Hz.
 *
 * This is also the relay's motion budget: agent movement piggybacks on the
 * cadence clients already sustain rather than adding a timer of its own.
 */
export const SEND_INTERVAL_MS = 100;

/**
 * Largest inbound frame the relay will parse.
 *
 * A state frame is around 120 bytes and a chat frame is bounded by the text
 * cap below, so this leaves generous headroom while making a megabyte of JSON
 * a rejection rather than a parse.
 */
export const MAX_FRAME_BYTES = 4096;

/** Longest chat message carried, in characters. */
export const MAX_CHAT_LENGTH = 120;

/** Longest display name carried, in characters. */
export const MAX_USERNAME_LENGTH = 24;

/**
 * How long the relay remembers a player after its last frame.
 *
 * Long enough that a visitor who reloads returns to a world still holding the
 * people they were standing with, short enough that the snapshot handed to a
 * newcomer describes the present rather than the day.
 */
export const PLAYER_TTL_MS = 5 * 60_000;

/** Least time between storage writes for one player. */
export const PERSIST_INTERVAL_MS = 1_000;

/**
 * How long the client keeps a remote actor after its last frame.
 *
 * Shorter than the relay's memory on purpose: the relay is answering "who was
 * here recently", the client is answering "who is here now".
 */
export const REMOTE_TTL_MS = 60_000;

/** How long a speech bubble stays up after the message that raised it. */
export const CHAT_BUBBLE_MS = 5_000;

/** How many activity entries are retained before the oldest are dropped. */
export const ACTIVITY_LOG_CAP = 50;
