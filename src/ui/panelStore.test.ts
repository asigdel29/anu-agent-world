import { beforeEach, describe, expect, it } from "vitest";

import type { Panel } from "./panelStore";
import { closePanel, isPanelOpen, openPanel, usePanelStore } from "./panelStore";

const NOTICE: Panel = { id: "notice", title: "Grey box", body: ["one", "two"] };
const OTHER: Panel = { id: "other", title: "Other", body: ["x"] };

beforeEach(() => {
  closePanel();
});

describe("panelStore", () => {
  it("starts with nothing open", () => {
    expect(usePanelStore.getState().open).toBeNull();
    expect(isPanelOpen()).toBe(false);
  });

  it("opens and closes", () => {
    openPanel(NOTICE);
    expect(usePanelStore.getState().open).toEqual(NOTICE);
    expect(isPanelOpen()).toBe(true);
    closePanel();
    expect(isPanelOpen()).toBe(false);
  });

  it("holds one panel at a time", () => {
    // Opening a second from inside the first must replace it rather than
    // stack, or closing returns the reader to a panel they never chose.
    openPanel(NOTICE);
    openPanel(OTHER);
    expect(usePanelStore.getState().open).toEqual(OTHER);
    closePanel();
    expect(isPanelOpen()).toBe(false);
  });

  it("can be closed when nothing is open", () => {
    expect(() => {
      closePanel();
    }).not.toThrow();
  });

  it("is reachable from outside React", () => {
    // Interaction targets are registered by scene components and activated
    // from the frame loop, neither of which can call a hook.
    openPanel(NOTICE);
    expect(isPanelOpen()).toBe(true);
  });
});
