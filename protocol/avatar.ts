/**
 * What a visitor looks like, as a string short enough to send every frame.
 *
 * An avatar is a handful of independent choices — build, hair, outfit,
 * glasses — and each is an index into a fixed list. Encoded, that is one
 * character per choice, so the whole appearance fits in the `character` field
 * the state frame already carries. Nothing new goes on the wire, and no
 * separate request is needed to learn what somebody looks like: the first
 * transform that arrives for a stranger already describes them.
 *
 * **Decoding is total.** `decodeAvatar` accepts any string whatsoever and
 * returns a usable avatar. That is not defensive programming for its own
 * sake; it is the only workable rule here for two reasons. The field is
 * attacker-controlled text arriving over a socket, and — the case that will
 * actually happen — clients drift apart across deploys, so a visitor on a
 * newer build will send codes naming parts an older one has never heard of.
 * A decoder that rejected them would make strangers invisible, which is a far
 * worse failure than drawing somebody with the default hair.
 *
 * **The part tables are the single definition.** Encoding order, option
 * counts, and the labels the interface shows all read from `AVATAR_PARTS`, so
 * adding a part is one edit rather than four that must agree.
 */

/** The choices an avatar is made of, in the order they are encoded. */
export type AvatarSlot = "tone" | "build" | "hair" | "outfit" | "glasses";

export interface AvatarPart {
  readonly slot: AvatarSlot;
  /** What the interface calls it. */
  readonly label: string;
  /** What the interface calls each option. Its length is the option count. */
  readonly options: readonly string[];
}

/**
 * Every part, in encoding order.
 *
 * Kept small on purpose. The reference look is line art with a few variables,
 * not a character creator, and a monochrome world has no room for a hundred
 * combinations to read as distinct at fog distance anyway.
 */
export const AVATAR_PARTS: readonly AvatarPart[] = [
  {
    slot: "tone",
    label: "Tone",
    options: ["Light", "Mid", "Dark"],
  },
  {
    slot: "build",
    label: "Build",
    options: ["Slight", "Average", "Broad"],
  },
  {
    slot: "hair",
    label: "Hair",
    options: ["None", "Short", "Long", "Bun", "Cap"],
  },
  {
    slot: "outfit",
    label: "Outfit",
    options: ["Pale", "Mid", "Dark", "Banded"],
  },
  {
    slot: "glasses",
    label: "Glasses",
    options: ["None", "Round", "Square"],
  },
];

export type Avatar = Readonly<Record<AvatarSlot, number>>;

/** How many characters an encoded avatar occupies. */
export const AVATAR_CODE_LENGTH = AVATAR_PARTS.length;

/**
 * Base 36, so a part may grow to thirty-six options without the code changing
 * length — and a code stays one token, readable in a log without decoding.
 */
const DIGITS = "0123456789abcdefghijklmnopqrstuvwxyz";

/** The avatar every unreadable code falls back to. */
export const DEFAULT_AVATAR: Avatar = { tone: 1, build: 1, hair: 1, outfit: 1, glasses: 0 };

/** The part table entry for a slot, or undefined if there is no such slot. */
export function partFor(slot: AvatarSlot): AvatarPart | undefined {
  return AVATAR_PARTS.find((part) => part.slot === slot);
}

/**
 * Read one slot out of a code.
 *
 * Anything the slot cannot mean — a missing character, a character outside
 * base 36, an index past the end of the option list — yields the default for
 * that slot rather than a failure, per the note above.
 */
function readSlot(code: string, index: number, part: AvatarPart): number {
  const char = code[index];
  if (char === undefined) return DEFAULT_AVATAR[part.slot];
  const value = DIGITS.indexOf(char);
  if (value < 0 || value >= part.options.length) return DEFAULT_AVATAR[part.slot];
  return value;
}

/**
 * Turn any string into an avatar.
 *
 * Case-insensitive, because a code that survives a round trip through a
 * spreadsheet or a URL bar should still describe the same person.
 */
export function decodeAvatar(code: unknown): Avatar {
  const text = typeof code === "string" ? code.toLowerCase() : "";
  const avatar: Record<AvatarSlot, number> = { ...DEFAULT_AVATAR };
  AVATAR_PARTS.forEach((part, index) => {
    avatar[part.slot] = readSlot(text, index, part);
  });
  return avatar;
}

/**
 * Turn an avatar into a code.
 *
 * Clamps rather than trusting its argument, so a value assembled by hand or
 * carried over from an older shape cannot produce a code that decodes to
 * something else.
 */
export function encodeAvatar(avatar: Avatar): string {
  return AVATAR_PARTS.map((part) => {
    const raw = avatar[part.slot];
    const index =
      Number.isInteger(raw) && raw >= 0 && raw < part.options.length
        ? raw
        : DEFAULT_AVATAR[part.slot];
    return DIGITS[index] ?? "0";
  }).join("");
}

/**
 * A starting appearance derived from who somebody is.
 *
 * Deterministic, so the same visitor is recognisable across sessions before
 * they have chosen anything, and varied, so a room of people who never opened
 * the picker is still a room of people rather than a row of clones.
 */
export function avatarFromId(id: string): Avatar {
  // A small string hash: cheap, stable across engines, and good enough for a
  // value whose only requirement is that it differ between neighbours.
  let hash = 2166136261;
  for (let i = 0; i < id.length; i += 1) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  const avatar: Record<AvatarSlot, number> = { ...DEFAULT_AVATAR };
  for (const part of AVATAR_PARTS) {
    avatar[part.slot] = hash % part.options.length;
    hash = Math.floor(hash / part.options.length);
  }
  return avatar;
}
