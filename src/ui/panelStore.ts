import { create } from "zustand";

import { record } from "../analytics/analytics";

/**
 * The written content, and the rule that only one piece of it is up at once.
 *
 * A panel covers the world rather than replacing it. That is the whole point
 * of putting the writing in a world instead of on a page: closing a panel
 * should return the visitor to exactly where they were standing, not to a
 * reloaded scene, so the world keeps running underneath and the character
 * simply stops taking input.
 *
 * Which is the sharp edge here. Input is read from a mutable module object by
 * a frame loop that does not know a panel exists, so opening one must
 * explicitly stop movement. Forgetting leaves the character walking while
 * somebody reads, and they close the panel to find themselves somewhere else.
 */

export interface Panel {
  readonly id: string;
  readonly title: string;
  /** Paragraphs, rendered as text children and never as markup. */
  readonly body: readonly string[];
  /** An optional outbound link, shown as a single action. */
  readonly link?: { readonly href: string; readonly label: string } | undefined;
}

interface PanelStore {
  open: Panel | null;
  openPanel: (panel: Panel) => void;
  closePanel: () => void;
}

export const usePanelStore = create<PanelStore>((set) => ({
  open: null,
  openPanel: (panel) => {
    set({ open: panel });
  },
  closePanel: () => {
    set({ open: null });
  },
}));

/**
 * Open a panel from outside React.
 *
 * Interaction targets are registered by scene components and activated from
 * the frame loop, neither of which is a place a hook can be called.
 */
export function openPanel(panel: Panel): void {
  usePanelStore.getState().openPanel(panel);
  // The identifier, never the words: panel bodies will eventually carry text
  // a visitor or a model wrote.
  record("panel_opened", { panel_id: panel.id });
}

export function closePanel(): void {
  usePanelStore.getState().closePanel();
}

/** Whether a panel is up, for code that must not act while one is. */
export function isPanelOpen(): boolean {
  return usePanelStore.getState().open !== null;
}
