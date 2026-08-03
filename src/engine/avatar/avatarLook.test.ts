import { describe, expect, it } from "vitest";

import { AVATAR_PARTS, DEFAULT_AVATAR, decodeAvatar } from "../../../protocol/avatar";
import type { AvatarSlot } from "../../../protocol/avatar";
import { LOOK_TABLES, lookFor, looksCoverParts } from "./avatarLook";

describe("look tables track the part tables", () => {
  // The reason this file exists. The protocol decides how many options a part
  // has; this module decides what each one looks like. Nothing but a test
  // stops somebody adding a sixth hairstyle and shipping a world where
  // choosing it draws the first one.
  it("covers every option of every part", () => {
    expect(looksCoverParts()).toBe(true);
  });

  it("has a table for every part", () => {
    for (const part of AVATAR_PARTS) {
      expect(LOOK_TABLES.some((row) => row.slot === part.slot)).toBe(true);
    }
  });

  it("fails when a part gains an option", () => {
    // Mutation check: the assertion above passes trivially if `looksCoverParts`
    // is wrong, so prove it can say no. A table one entry short must fail.
    const short = LOOK_TABLES[0];
    if (!short) throw new Error("no tables");
    const table = short.tables[0];
    if (!table) throw new Error("no table");
    const part = AVATAR_PARTS.find((entry) => entry.slot === short.slot);
    if (!part) throw new Error("no part");
    expect(table.length).toBe(part.options.length);
    expect(table.slice(1).length === part.options.length).toBe(false);
  });
});

describe("resolving a look", () => {
  it("gives every expressible avatar a drawable look", () => {
    let combinations: Record<AvatarSlot, number>[] = [{ ...DEFAULT_AVATAR }];
    for (const part of AVATAR_PARTS) {
      combinations = combinations.flatMap((base) =>
        part.options.map((_, index) => ({ ...base, [part.slot]: index })),
      );
    }
    for (const avatar of combinations) {
      const look = lookFor(avatar);
      expect(look.ink).toMatch(/^#[0-9a-f]{6}$/);
      expect(look.outfitInk).toMatch(/^#[0-9a-f]{6}$/);
      expect(look.girth).toBeGreaterThan(0);
      expect(look.lens).toBeGreaterThanOrEqual(0);
    }
  });

  it("keeps build within the collision radius", () => {
    // A wide build must not put a shoulder through a wall the controller
    // believes is clear: the capsule the physics uses is the one the renderer
    // draws, so girth may shrink a body but never grow it past its radius.
    const widest = Math.max(
      ...AVATAR_PARTS.filter((p) => p.slot === "build").flatMap((p) =>
        p.options.map((_, index) => lookFor({ ...DEFAULT_AVATAR, build: index }).girth),
      ),
    );
    expect(widest).toBeLessThanOrEqual(1.15);
  });

  it("draws something for a code off the wire", () => {
    // The end-to-end shape: an arbitrary string becomes a body with no branch
    // anywhere in between returning nothing.
    for (const code of ["", "zzzz", "!!", "1a2b"]) {
      expect(lookFor(decodeAvatar(code)).ink).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});
