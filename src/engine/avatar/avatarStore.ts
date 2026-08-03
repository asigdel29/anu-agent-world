import { create } from "zustand";

import { AVATAR_PARTS, avatarFromId, decodeAvatar, encodeAvatar } from "../../../protocol/avatar";
import type { Avatar, AvatarSlot } from "../../../protocol/avatar";
import { visitorId } from "../net/visitorId";

/**
 * What this visitor looks like.
 *
 * Two readers with opposite needs, which is why there are two shapes of the
 * same value. The picker is React and must re-render when a choice changes;
 * the frame loop writes the code into an outbound state frame sixty times a
 * second and must not call into a store to do it. So the store is the single
 * source and `localAvatar` is a mirror kept current by a subscription — one
 * writer, no chance of the two disagreeing.
 *
 * **The key is not versioned with the world.** Saved *positions* are keyed by
 * world version, because a layout change can put a remembered position inside
 * a wall. An appearance is a fact about the person rather than about the
 * terrain, so it survives a world version bump on purpose.
 */

const KEY = "world:avatar:v1";

/** The mirror the frame loop reads. Never assigned from outside this module. */
export const localAvatar = { code: "" };

function load(): Avatar {
  try {
    const stored = localStorage.getItem(KEY);
    // A stored code is decoded rather than trusted: it is the same untrusted
    // text as one off the wire, and it may have been written by a build that
    // knew about parts this one does not.
    if (stored !== null) return decodeAvatar(stored);
  } catch {
    /* storage unavailable — fall through to a derived appearance */
  }
  return avatarFromId(visitorId());
}

function save(code: string): void {
  try {
    localStorage.setItem(KEY, code);
  } catch {
    // A visitor in a private window keeps their appearance for this session
    // and loses it on reload, which is the same bargain their identity makes.
  }
}

interface AvatarStore {
  avatar: Avatar;
  /** The encoded form, kept beside the avatar so nothing re-encodes per frame. */
  code: string;
  setPart: (slot: AvatarSlot, index: number) => void;
}

export const useAvatarStore = create<AvatarStore>((set) => {
  const avatar = load();
  return {
    avatar,
    code: encodeAvatar(avatar),
    setPart: (slot, index) => {
      set((state) => {
        const part = AVATAR_PARTS.find((entry) => entry.slot === slot);
        // An index no part offers is ignored rather than clamped. Clamping
        // would silently select a neighbour, and the only caller is a button
        // built from the same table, so a miss means a bug worth not hiding.
        if (!part || !Number.isInteger(index) || index < 0 || index >= part.options.length) {
          return state;
        }
        const next = { ...state.avatar, [slot]: index };
        const code = encodeAvatar(next);
        save(code);
        return { avatar: next, code };
      });
    },
  };
});

localAvatar.code = useAvatarStore.getState().code;
useAvatarStore.subscribe((state) => {
  localAvatar.code = state.code;
});
