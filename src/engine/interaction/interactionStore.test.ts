import { afterEach, describe, expect, it, vi } from "vitest";

import type { InteractionTarget } from "./interactionStore";
import {
  RANGE_HYSTERESIS,
  chooseTarget,
  clearTargets,
  registerTarget,
  targets,
} from "./interactionStore";

const RANGE = 3;

function make(id: string, x: number, z: number, over: Partial<InteractionTarget> = {}) {
  return { id, x, y: 0, z, prompt: `read ${id}`, activate: () => {}, ...over };
}

afterEach(() => {
  clearTargets();
});

describe("registerTarget", () => {
  it("adds a target and hands back its removal", () => {
    const remove = registerTarget(make("sign", 0, 0));
    expect(targets).toHaveLength(1);
    remove();
    expect(targets).toHaveLength(0);
  });

  it("removes only its own, even among identical-looking targets", () => {
    // Returning the remover rather than exposing remove(id) is what makes
    // this structural: a caller cannot unregister somebody else's target.
    const a = make("sign", 0, 0);
    const b = make("sign", 0, 0);
    const removeA = registerTarget(a);
    registerTarget(b);
    removeA();
    expect(targets).toEqual([b]);
  });

  it("survives being removed twice", () => {
    const remove = registerTarget(make("sign", 0, 0));
    remove();
    expect(() => {
      remove();
    }).not.toThrow();
    expect(targets).toHaveLength(0);
  });

  it("does not disturb the others when one unmounts mid-list", () => {
    const removers = ["a", "b", "c"].map((id) => registerTarget(make(id, 0, 0)));
    removers[1]?.();
    expect(targets.map((t) => t.id)).toEqual(["a", "c"]);
  });
});

describe("chooseTarget", () => {
  it("finds nothing when there is nothing", () => {
    expect(chooseTarget([], 0, 0, 0, RANGE, null)).toBeNull();
  });

  it("offers a target within range", () => {
    const sign = make("sign", 2, 0);
    expect(chooseTarget([sign], 0, 0, 0, RANGE, null)).toBe(sign);
  });

  it("ignores one out of range", () => {
    expect(chooseTarget([make("sign", 10, 0)], 0, 0, 0, RANGE, null)).toBeNull();
  });

  it("measures in three dimensions", () => {
    // A sign on a balcony directly overhead is not something to walk up to.
    const above = make("sign", 0, 0, { y: 10 });
    expect(chooseTarget([above], 0, 0, 0, RANGE, null)).toBeNull();
  });

  it("prefers the nearest when several are in reach", () => {
    const near = make("near", 1, 0);
    const far = make("far", 2.5, 0);
    expect(chooseTarget([far, near], 0, 0, 0, RANGE, null)).toBe(near);
  });

  it("honours a target's own range", () => {
    const wide = make("wide", 8, 0, { range: 12 });
    expect(chooseTarget([wide], 0, 0, 0, RANGE, null)).toBe(wide);
  });

  it("holds on past the edge once offered", () => {
    // The position a visitor is most likely to occupy is right at the
    // boundary, having just walked up. Without hysteresis that is the worst
    // behaved place to stand.
    const sign = make("sign", 0, 0);
    const justOutside = RANGE * (1 + RANGE_HYSTERESIS * 0.5);
    expect(chooseTarget([sign], justOutside, 0, 0, RANGE, null)).toBeNull();
    expect(chooseTarget([sign], justOutside, 0, 0, RANGE, "sign")).toBe(sign);
  });

  it("lets go once clearly past", () => {
    const sign = make("sign", 0, 0);
    const wellOutside = RANGE * (1 + RANGE_HYSTERESIS) + 0.1;
    expect(chooseTarget([sign], wellOutside, 0, 0, RANGE, "sign")).toBeNull();
  });

  it("does not swap between two targets under the visitor's feet", () => {
    // Walking between two close signs must not flick the prompt back and
    // forth on every step.
    const a = make("a", -0.5, 0);
    const b = make("b", 0.5, 0);
    let active: string | null = null;
    const seen: (string | null)[] = [];
    for (let i = 0; i <= 20; i += 1) {
      const x = -0.5 + i * 0.05;
      active = chooseTarget([a, b], x, 0, 0, RANGE, active)?.id ?? null;
      seen.push(active);
    }
    const changes = seen.filter((id, i) => i > 0 && id !== seen[i - 1]).length;
    expect(changes).toBeLessThanOrEqual(1);
  });

  it("gives up an active target that has been unregistered", () => {
    expect(chooseTarget([], 0, 0, 0, RANGE, "gone")).toBeNull();
  });

  it("does not hold a target that has moved away", () => {
    const moving = make("lift", 40, 0);
    expect(chooseTarget([moving], 0, 0, 0, RANGE, "lift")).toBeNull();
  });
});

describe("activation", () => {
  it("calls the target's own handler", () => {
    const activate = vi.fn();
    const sign = make("sign", 1, 0, { activate });
    chooseTarget([sign], 0, 0, 0, RANGE, null)?.activate();
    expect(activate).toHaveBeenCalledOnce();
  });
});
