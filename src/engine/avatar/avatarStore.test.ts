import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AVATAR_PARTS, decodeAvatar, encodeAvatar } from "../../../protocol/avatar";

const KEY = "world:avatar:v1";

/**
 * Loaded fresh each time, because what this module does at import — read
 * storage, seed the mirror, subscribe — is most of its behaviour, and a shared
 * instance would test none of it.
 */
async function freshStore() {
  vi.resetModules();
  return import("./avatarStore");
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("choosing", () => {
  it("moves avatar and code together", async () => {
    const { useAvatarStore } = await freshStore();
    const part = AVATAR_PARTS[1];
    if (!part) throw new Error("needs a second part");
    useAvatarStore.getState().setPart(part.slot, part.options.length - 1);
    const { avatar, code } = useAvatarStore.getState();
    expect(avatar[part.slot]).toBe(part.options.length - 1);
    expect(code).toBe(encodeAvatar(avatar));
  });

  it("ignores an index no part offers", async () => {
    const { useAvatarStore } = await freshStore();
    const before = useAvatarStore.getState().code;
    const part = AVATAR_PARTS[0];
    if (!part) throw new Error("needs a part");
    useAvatarStore.getState().setPart(part.slot, part.options.length);
    useAvatarStore.getState().setPart(part.slot, -1);
    useAvatarStore.getState().setPart(part.slot, 1.5);
    expect(useAvatarStore.getState().code).toBe(before);
  });
});

describe("the mirror the frame loop reads", () => {
  it("is seeded before anything happens", async () => {
    const { localAvatar, useAvatarStore } = await freshStore();
    expect(localAvatar.code).toBe(useAvatarStore.getState().code);
  });

  it("follows every change", async () => {
    const { localAvatar, useAvatarStore } = await freshStore();
    for (const part of AVATAR_PARTS) {
      for (let index = 0; index < part.options.length; index += 1) {
        useAvatarStore.getState().setPart(part.slot, index);
        expect(localAvatar.code).toBe(useAvatarStore.getState().code);
      }
    }
  });
});

describe("persistence", () => {
  it("restores a saved appearance", async () => {
    const first = await freshStore();
    const part = AVATAR_PARTS[2];
    if (!part) throw new Error("needs a third part");
    first.useAvatarStore.getState().setPart(part.slot, part.options.length - 1);
    const saved = first.useAvatarStore.getState().code;

    const second = await freshStore();
    expect(second.useAvatarStore.getState().code).toBe(saved);
  });

  it("decodes what it stored rather than trusting it", async () => {
    // A stored code is the same untrusted text as one off the wire: it may
    // have been hand-edited, or written by a build that knew parts this one
    // does not. It is decoded on the way in, so it cannot smuggle a value the
    // renderer has no entry for.
    localStorage.setItem(KEY, "!!!!!!!!!!");
    const { useAvatarStore } = await freshStore();
    const { avatar } = useAvatarStore.getState();
    for (const part of AVATAR_PARTS) {
      expect(avatar[part.slot]).toBeLessThan(part.options.length);
      expect(avatar[part.slot]).toBeGreaterThanOrEqual(0);
    }
    expect(decodeAvatar(useAvatarStore.getState().code)).toEqual(avatar);
  });

  it("works when storage is unavailable", async () => {
    // A private window. Losing an appearance on reload is the same bargain
    // the visitor's identity already makes, and is far cheaper than throwing
    // on the way into the world.
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    const { useAvatarStore } = await freshStore();
    const part = AVATAR_PARTS[0];
    if (!part) throw new Error("needs a part");
    expect(() => {
      useAvatarStore.getState().setPart(part.slot, 0);
    }).not.toThrow();
    expect(useAvatarStore.getState().avatar[part.slot]).toBe(0);
  });
});
